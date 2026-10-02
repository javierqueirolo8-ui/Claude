#!/usr/bin/env node
'use strict';
/* Pruebas de mutación de los generadores de los flujos de n8n (Etapa 2).

   Igual que mutaciones.js pero sobre lo que genera los flujos: se estropea a propósito, de a una, una pieza de los generadores
   (se quita una salida de error, se afloja el filtro con que se libera un bloqueo, se deja pasar un cliente que no es de prueba…),
   se corre tests/n8n-flujos.test.js contra esa copia y la avería tiene que hacerlo fallar («muerta»). Si alguna pasa
   inadvertida («sobreviviente») falta una prueba y el script sale con error.

   Trabaja sobre una copia temporal de todo nucleo/: no toca nada de este árbol.
   Uso:   node n8n/mutaciones-flujos.js          todas
          node n8n/mutaciones-flujos.js F0,F3    solo las que empiezan con esos prefijos */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const PRUEBA = path.join('tests', 'n8n-flujos.test.js');

// { id, archivo, buscar (aparece UNA vez), poner, que }
const MUTACIONES = [
  /* ---- shell */
  { id: 'F01', archivo: 'n8n/generar-shell.js', buscar: "conectar('escribirLibro', { siguiente: 'soltarBloqueo', error: 'codTablaEscribir' });", poner: "conectar('escribirLibro', { siguiente: 'soltarBloqueo' });", que: 'la escritura del libro pierde su salida de error: un fallo se perdería en silencio' },
  { id: 'F02', archivo: 'n8n/generar-shell.js', buscar: "conectar('hayDestino', { ramas: ['prepararCorreoOperador', 'finError'] });", poner: "conectar('hayDestino', { ramas: ['prepararCorreoOperador', 'finSinEnvio'] });", que: 'un fallo sin a quién avisar termina como un día normal sin envío' },
  { id: 'F03', archivo: 'n8n/generar-shell.js', buscar: "if (r.ok !== true) throw new Error('E_NUCLEO_FALLO');\nconst sano = r.resultado.alerta.sano;", poner: "const sano = r.ok === true ? r.resultado.alerta.sano : { codigo: 'E_NUCLEO_FALLO', nodo: 'Núcleo' };", que: 'si falla también el manejo del error, el día termina «bien» y en silencio' },
  { id: 'F04', archivo: 'n8n/generar-shell.js', buscar: "const ENTRADA = '$(\"' + N.entrada + '\").first(0).json';", poner: "const ENTRADA = '$(\"' + N.entrada + '\").first().json';", que: 'las referencias al nodo de entrada pierden el índice explícito' },
  { id: 'F05', archivo: 'n8n/generar-shell.js', buscar: ",\n  ['expira_utc', expr('$(\"' + N.nucleoIniciar + '\").isExecuted ? ($(\"' + N.nucleoIniciar + '\").first(0).json.resultado?.bloqueo_nuevo?.expira_utc ?? \"SIN-BLOQUEO\") : \"SIN-BLOQUEO\"')]\n];", poner: "\n];", que: 'se libera cualquier bloqueo del cliente, también el de otra ejecución' },
  { id: 'F06', archivo: 'n8n/generar-shell.js', buscar: "return def(v, Object.assign({ tipo: 'exec', nombre, op, onError: 'continueErrorOutput',", poner: "return def(v, Object.assign({ tipo: 'exec', nombre, op, onError: 'continueRegularOutput',", que: 'las llamadas al núcleo siguen adelante con el error en vez de ir al camino de fallo' },
  { id: 'F07', archivo: 'n8n/generar-shell.js', buscar: "trigger: [\"'n8n-nodes-base.manualTrigger'\", 1]", poner: "trigger: [\"'n8n-nodes-base.scheduleTrigger'\", 1]", que: 'el flujo de pruebas se dispararía solo' },
  { id: 'F08', archivo: 'n8n/generar-shell.js', buscar: "const ID_NUCLEO = 'UEhnlNWjhmIa7l1D';", poner: "const ID_NUCLEO = 'OtroSubflujoDistinto';", que: 'el flujo llama a otro subflujo que no es el núcleo conocido' },
  /* ---- utilidades */
  { id: 'F10', archivo: 'n8n/generar-utilidades.js', buscar: "!/^esc-[a-z0-9-]{1,30}$/.test(p.cliente_id)", poner: "!/^[a-z0-9-]{1,30}$/.test(p.cliente_id)", que: 'las utilidades aceptan limpiar un cliente que no es de prueba' },
  { id: 'F11', archivo: 'n8n/generar-utilidades.js', buscar: "const POR_CLIENTE = [['cliente_id', 'eq', CLIENTE]];", poner: "const POR_CLIENTE = [['interruptor', 'neq', q('__ninguno__')]];", que: 'limpiar un cliente borra las tablas enteras' },
  { id: 'F12', archivo: 'n8n/generar-utilidades.js', buscar: "p.filas.length > 3", poner: "p.filas.length > 300", que: 'la tabla de control acepta cualquier cantidad de filas' },
  { id: 'F13', archivo: 'n8n/generar-utilidades.js', buscar: "if (e.hash !== j.hash || e.n !== j.n)", poner: "if (e.hash !== j.hash)", que: 'la comparación ignora la cantidad de filas' },
  { id: 'F14', archivo: 'n8n/generar-utilidades.js', buscar: ".filter(function (j) { return j.id !== undefined; })", poner: ".filter(function (j) { return true; })", que: 'la fila vacía que n8n inventa cuenta como dato' },
  { id: 'F15', archivo: 'n8n/generar-utilidades.js', buscar: " || !/^[0-9a-f]{64}$/.test(e.hash)", poner: "", que: 'se acepta cualquier cosa como huella esperada' },
  /* ---- forma canónica */
  { id: 'F20', archivo: 'n8n/canonico.js', buscar: ".sort().join('\\n')", poner: ".join('\\n')", que: 'el orden de las filas cambia la huella' },
  { id: 'F21', archivo: 'n8n/canonico.js', buscar: ".replace(/\\nEjecución: [^\\n]*/g, '\\nEjecución: #')", poner: "", que: 'el número de ejecución del aviso entra en la comparación' },
  { id: 'F22', archivo: 'n8n/canonico.js', buscar: "f[c] !== undefined && f[c] !== '' ?", poner: "f[c] !== undefined ?", que: 'texto vacío y ausencia de valor dejan de ser lo mismo' },
  /* ---- escenarios */
  { id: 'F30', archivo: 'n8n/escenarios.js', buscar: "const rotura = (cliente, roto, original) => '={{ ' + CLIENTE_ACTUAL + \" === '\" + cliente + \"' ? '\" + roto + \"' : '\" + original + \"' }}\";", poner: "const rotura = (cliente, roto, original) => \"={{ '\" + roto + \"' }}\";", que: 'una rotura vale para todos los clientes de prueba, no solo para el suyo' },
  { id: 'F31', archivo: 'n8n/escenarios.js', buscar: "const TABLA_INEXISTENTE = 'cob_dev_no_existe';", poner: "const TABLA_INEXISTENTE = '';", que: 'la rotura de una tabla deja un valor vacío en vez de un nombre que no existe' }
];

// Con la avería puesta se vuelve a generar dist/ en la copia: así la prueba de «está al día» no mata sola a toda avería de los
// generadores y lo que la mata es la prueba que corresponde a esa regla.
function regenerar(copia) {
  let bien = true;
  for (const g of ['generar-shell.js', 'generar-utilidades.js']) {
    const r = spawnSync(process.execPath, [path.join('n8n', g)], { cwd: copia, encoding: 'utf8' });
    if (r.status !== 0) bien = false;
  }
  return bien;
}

function copiar(origen, destino) {
  fs.cpSync(origen, destino, { recursive: true, filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src) });
}

function main() {
  const filtro = (process.argv[2] || '').split(',').filter(Boolean);
  const lista = MUTACIONES.filter((m) => !filtro.length || filtro.some((f) => m.id.startsWith(f)));
  const base = fs.mkdtempSync(path.join(process.env.MUT_TMP || os.tmpdir(), 'mut-flujos-'));
  const copia = path.join(base, 'nucleo');
  const sobrevivientes = [];
  try {
    copiar(RAIZ, copia);
    // sin avería, la prueba tiene que pasar en la copia (si no, nada de lo que sigue vale)
    const limpio = spawnSync(process.execPath, ['--test', PRUEBA], { cwd: copia, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (limpio.status !== 0) { console.error('✗ la prueba falla sin ninguna avería:\n' + limpio.stdout.split('\n').filter((l) => /^not ok/.test(l)).join('\n')); process.exit(1); }
    for (const m of lista) {
      const ruta = path.join(copia, m.archivo);
      const original = fs.readFileSync(ruta, 'utf8');
      const veces = original.split(m.buscar).length - 1;
      if (veces !== 1) { console.error('✗ ' + m.id + ': el texto a romper aparece ' + veces + ' veces en ' + m.archivo + ' (debe ser 1)'); process.exit(1); }
      fs.writeFileSync(ruta, original.replace(m.buscar, () => m.poner));
      const generaBien = regenerar(copia);
      const r = generaBien ? spawnSync(process.execPath, ['--test', PRUEBA], { cwd: copia, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) : { status: 1 };
      const falla = generaBien ? (r.stdout.split('\n').filter((l) => /^not ok/.test(l)).map((l) => l.replace(/^not ok \d+ - /, '')).slice(0, 1)[0] || 'la prueba no carga') : 'el generador se niega';
      fs.writeFileSync(ruta, original);
      regenerar(copia);
      const muerta = r.status !== 0;
      console.log('  ' + (muerta ? 'ok ' : 'XX ') + ' ' + m.id.padEnd(4) + ' ' + (muerta ? 'muerta     ' : 'SOBREVIVE  ') + m.que + (muerta ? '\n' + ' '.repeat(22) + '↳ ' + falla.slice(0, 110) : ''));
      if (!muerta) sobrevivientes.push(m);
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  console.log('\n' + (lista.length - sobrevivientes.length) + ' de ' + lista.length + ' averías detectadas');
  if (sobrevivientes.length) { console.error('✗ sobreviven: ' + sobrevivientes.map((m) => m.id).join(', ')); process.exit(1); }
}

if (require.main === module) main();
module.exports = { MUTACIONES };
