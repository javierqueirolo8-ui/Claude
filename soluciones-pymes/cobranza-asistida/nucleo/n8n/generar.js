#!/usr/bin/env node
'use strict';
/* Generador del paquete de código para el nodo de código de n8n (Etapa 2).

   Toma los módulos de src/ (util, M0 a M7, pipeline y envoltorio), les quita los comentarios y escapa todo carácter no
   ASCII (así se puede copiar sin pérdidas) y los junta en UN archivo:

     dist/nucleo-bundle.js            el código exacto que va en el único nodo de código del subflujo «Núcleo (puro)»
     dist/nucleo-puro.workflow.ts     el flujo completo (código del SDK de n8n) con ese paquete incrustado

   El paquete no se edita a mano: se regenera, y la prueba tests/bundle.test.js falla si alguna fuente cambió sin
   regenerarlo (el encabezado lleva la huella SHA-256 de cada fuente). Además, la batería completa de pruebas se
   ejecuta contra ESTE código (n8n/probar-paquete.js): se prueba lo que se ejecuta, no solo lo que se escribió.

   Uso:   node n8n/generar.js               escribe dist/
          node n8n/generar.js --verificar   no escribe: sale con error si dist/ no coincide con lo que se generaría
   Requiere esbuild SOLO para generar (no para probar ni para usar el paquete):
          npm i --no-save esbuild@0.28.2   (en una carpeta temporal) y NODE_PATH=<esa carpeta>/node_modules
   No usa red, no lee datos reales y no toca n8n. */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const RAIZ = path.join(__dirname, '..');
const SRC = path.join(RAIZ, 'src');
const DIST = path.join(__dirname, 'dist');
const VERSION_ESBUILD = '0.28.2';

// El orden importa: cada módulo usa a los anteriores.
const ORDEN = ['util', 'm0-guardias', 'm1-normalizar', 'm2-antiguedad', 'm3-borradores', 'm4-informe', 'm5-guardia-envio', 'm6-registro', 'm7-ingesta', 'pipeline', 'envoltorio'];

// Lo único específico de n8n: recorre los elementos de entrada y responde a cada uno. Todo lo demás es el núcleo.
const ENTRADA_N8N = `return $input.all().map(function (item) {
  var datos = item.json;
  return { json: Envoltorio.operar(datos && datos.op, datos && datos.entrada) };
});
`;

const MARCA = /^\/\/ ===== ([a-z0-9-]+(?:\.js)?) =====$/gm;

function sha256(texto) { return crypto.createHash('sha256').update(texto, 'utf8').digest('hex'); }
function leerFuente(nombre) { return fs.readFileSync(path.join(SRC, nombre + '.js'), 'utf8'); }

function cargarEsbuild() {
  let esbuild;
  try { esbuild = require('esbuild'); } catch (e) {
    console.error('Falta esbuild ' + VERSION_ESBUILD + ' (hace falta solo para GENERAR el paquete, no para probarlo ni usarlo).\n' +
      '  Instalación en una carpeta temporal:  npm i --no-save esbuild@' + VERSION_ESBUILD + '\n' +
      '  y luego:  NODE_PATH=<esa carpeta>/node_modules node n8n/generar.js');
    process.exit(2);
  }
  if (esbuild.version !== VERSION_ESBUILD) {
    console.error('esbuild ' + esbuild.version + ' no es la versión fijada (' + VERSION_ESBUILD + '): el paquete no sería reproducible.');
    process.exit(2);
  }
  return esbuild;
}

// Tras esbuild solo pueden quedar caracteres no ASCII dentro de expresiones regulares; se escapan (valen lo mismo).
// Las fuentes ya los escriben como \uXXXX: esto es una red de seguridad, y el resultado se exige 100 % ASCII.
// El tabulador que esbuild deja dentro de un texto o de una expresión regular también se escribe como \t (vale lo mismo, y se ve).
function soloAscii(codigo) {
  return codigo.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).replace(/\t/g, '\\t');
}

function transformar(esbuild, nombre) {
  const fuente = leerFuente(nombre);
  const r = esbuild.transformSync(fuente, { loader: 'js', charset: 'ascii', legalComments: 'none', sourcefile: nombre + '.js' });
  if (r.warnings.length) throw new Error(nombre + ': esbuild avisa de ' + r.warnings.length + ' problema(s)');
  const codigo = soloAscii(r.code);
  if (/[^\x00-\x7f]/.test(codigo)) throw new Error(nombre + ': quedan caracteres no ASCII');
  new vm.Script(codigo, { filename: nombre + '.js' }); // debe compilar por sí solo
  return { nombre, fuente, sha: sha256(fuente), codigo: codigo.endsWith('\n') ? codigo : codigo + '\n' };
}

function encabezado(partes) {
  return '/* Nucleo de cobranza asistida - paquete para el nodo de codigo de n8n\n' +
    '   Generado por n8n/generar.js con esbuild ' + VERSION_ESBUILD + ' (solo quita comentarios y escapa caracteres no ASCII). NO EDITAR A MANO.\n' +
    '   Huella SHA-256 de cada fuente:\n' +
    partes.map((p) => '   ' + p.nombre.padEnd(18) + p.sha).join('\n') + '\n*/\n';
}

function armarPaquete(esbuild) {
  const partes = ORDEN.map((n) => transformar(esbuild, n));
  return encabezado(partes) + partes.map((p) => '// ===== ' + p.nombre + '.js =====\n' + p.codigo).join('') + '// ===== entrada-n8n =====\n' + ENTRADA_N8N;
}

// Texto para un literal de plantilla del SDK de n8n: solo hay que proteger la barra, el acento grave y «${».
function paraPlantilla(codigo) {
  return codigo.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function armarFlujo(paquete) {
  const literal = paraPlantilla(paquete);
  // Comprobación: el literal, evaluado como lo hará el SDK, devuelve EXACTAMENTE el paquete.
  const vuelta = vm.runInNewContext('`' + literal + '`', Object.create(null));
  if (vuelta !== paquete) throw new Error('el literal de plantilla no reproduce el paquete');
  return `import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const entradaNucleo = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'Entrada del núcleo',
    parameters: { inputSource: 'passthrough' },
    position: [240, 300]
  },
  output: [{ op: 'iniciar', entrada: {} }]
});

const nucleoPuro = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Núcleo puro',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: \`${literal}\`
    },
    position: [540, 300]
  },
  output: [{ ok: true, op: 'iniciar', resultado: {} }]
});

const notaNucleo = sticky('Núcleo puro [COB-DEV]. Un solo nodo de código con todos los módulos probados (sin red, sin credenciales, sin reloj). Recibe {op, entrada} y devuelve {ok, resultado} o {ok:false, codigo}. Código generado por n8n/generar.js: no se edita a mano.', [nucleoPuro], { color: 4 });

export default workflow('cob-dev-nucleo', '[COB-DEV] Núcleo (puro)')
  .add(entradaNucleo)
  .to(nucleoPuro)
  .add(notaNucleo);
`;
}

// Las partes del paquete, por nombre (las usan las pruebas para cargar y probar exactamente este código).
function partesDe(paquete) {
  const marcas = [...paquete.matchAll(MARCA)];
  return marcas.map((m, i) => ({ nombre: m[1], codigo: paquete.slice(m.index + m[0].length + 1, i + 1 < marcas.length ? marcas[i + 1].index : paquete.length) }));
}

function main() {
  const verificar = process.argv.includes('--verificar');
  const esbuild = cargarEsbuild();
  const paquete = armarPaquete(esbuild);
  const archivos = {
    'nucleo-bundle.js': paquete,
    'nucleo-puro.workflow.ts': armarFlujo(paquete)
  };
  let distintos = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const ruta = path.join(DIST, nombre);
    const actual = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : null;
    if (actual === contenido) { console.log('  igual      dist/' + nombre + '  (' + contenido.length + ' caracteres)'); continue; }
    distintos++;
    if (verificar) { console.log('  DIFERENTE  dist/' + nombre); continue; }
    fs.mkdirSync(DIST, { recursive: true });
    fs.writeFileSync(ruta, contenido);
    console.log('  escrito    dist/' + nombre + '  (' + contenido.length + ' caracteres)');
  }
  if (verificar && distintos) { console.error('\n' + distintos + ' archivo(s) desactualizados: ejecutar «node n8n/generar.js».'); process.exit(1); }
}

if (require.main === module) main();
module.exports = { ORDEN, ENTRADA_N8N, MARCA, sha256, partesDe, paraPlantilla, VERSION_ESBUILD };
