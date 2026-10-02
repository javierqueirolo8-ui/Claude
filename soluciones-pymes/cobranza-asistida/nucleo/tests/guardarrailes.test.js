'use strict';
/* Guardarraíles: pruebas sobre el PROPIO código y sus documentos, no sobre lo que hace.
   Vigilan las reglas que no se pueden olvidar aunque nadie las mencione en una revisión:
   nada invisible en el código, nada de red, reloj ni azar, todo error con código, catálogo de códigos al día. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cargar, SRC, plano } = require('./cargar');

const RAIZ = path.join(__dirname, '..');
const leer = (p) => fs.readFileSync(p, 'utf8');
const modulos = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
const fuente = (f) => leer(path.join(SRC, f));

function archivos(dir, ext, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, ext, salida);
    else if (ext.some((x) => e.name.endsWith(x))) salida.push(p);
  }
  return salida;
}

/* ------------------------------------------------------------ caracteres */

// Controles, ancho cero, marcas bidireccionales y separadores de línea Unicode. Las expresiones se construyen con
// fromCharCode: este archivo tampoco puede contenerlos.
const RANGOS_PROHIBIDOS = [[0, 8], [11, 12], [14, 31], [127, 159], [0x200B, 0x200F], [0x2028, 0x202E], [0x2060, 0x2069], [0xFEFF, 0xFEFF], [0xFFF9, 0xFFFB]];
const PROHIBIDOS_RE = new RegExp('[' + RANGOS_PROHIBIDOS.map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']');
const ESPACIOS_RAROS_RE = new RegExp('[' + [0xA0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x202F, 0x205F, 0x3000]
  .map((c) => String.fromCharCode(c)).join('') + ']');

test('ningún archivo del proyecto contiene caracteres invisibles, de control ni bidireccionales («Trojan Source»)', () => {
  const todos = archivos(RAIZ, ['.js', '.html', '.md', '.sh', '.json', '.csv', '.tsv']);
  assert.ok(todos.length > 20, 'hay archivos que revisar');
  for (const f of todos) {
    let t = leer(f);
    // una exportación de Excel puede llevar una marca de orden de bytes al principio (U+FEFF): solo ahí y solo en datos
    if (/\.(csv|tsv)$/.test(f) && t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    const m = PROHIBIDOS_RE.exec(t);
    assert.equal(m, null, path.relative(RAIZ, f) + ' contiene U+' + (m ? m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') : '') + ' en la posición ' + (m ? m.index : ''));
    assert.equal(ESPACIOS_RAROS_RE.test(t), false, path.relative(RAIZ, f) + ' contiene un espacio especial (¿no rompiente?)');
  }
});

test('el código fuente termina con un salto de línea y no usa tabuladores', () => {
  for (const f of modulos) {
    const t = fuente(f);
    assert.ok(t.endsWith('\n'), f + ' no termina con salto de línea');
    assert.equal(/\t/.test(t), false, f + ' tiene tabuladores');
  }
});

/* ---------------------------------------------------------------- pureza */

const PROHIBIDO_EN_MODULOS = [
  [/\brequire\s*\(/, 'require'], [/\bimport\s*\(|^\s*import\s/m, 'import'], [/\bprocess\b/, 'process'], [/\bfetch\s*\(/, 'fetch'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'], [/\bWebSocket\b/, 'WebSocket'], [/\bsetTimeout\b|\bsetInterval\b|\bsetImmediate\b/, 'temporizadores'],
  [/\beval\s*\(/, 'eval'], [/\bnew\s+Function\b|\bFunction\s*\(/, 'Function'], [/\bglobalThis\b|\bwindow\b|\bdocument\b|\blocalStorage\b|\bsessionStorage\b/, 'globales del navegador'],
  [/\bMath\.random\b/, 'Math.random'], [/\bDate\.now\b/, 'Date.now'], [/\bnew\s+Date\s*\(\s*\)/, 'new Date() sin argumentos'], [/\bperformance\.now\b/, 'performance.now'],
  [/\bconsole\./, 'console'], [/\bdebugger\b/, 'debugger'], [/\bTODO\b|\bFIXME\b|\bXXX\b|\bHACK\b/, 'marcas de trabajo pendiente'],
  [/\$env\b|\bprocess\.env\b/, 'variables de entorno'], [/\bBuffer\b/, 'Buffer'], [/\bcrypto\b/, 'crypto'], [/\bfs\./, 'fs'], [/\bchild_process\b/, 'child_process']
];

test('los módulos no usan red, archivos, reloj, azar, eval, entorno ni consola', () => {
  for (const f of modulos) {
    const t = fuente(f);
    for (const [re, nombre] of PROHIBIDO_EN_MODULOS) assert.equal(re.test(t), false, f + ' usa ' + nombre);
  }
});

const DEPENDENCIAS = {
  'util.js': [], 'm0-guardias.js': [], 'm1-normalizar.js': [], 'm2-antiguedad.js': [], 'm3-borradores.js': [], 'm4-informe.js': [],
  'm5-guardia-envio.js': [], 'm6-registro.js': [], 'm7-ingesta.js': [],
  'pipeline.js': ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'],
  'envoltorio.js': []
};

test('cada módulo depende solo de Util (el pipeline, de todos los módulos; el envoltorio, del pipeline): se puede pegar en un nodo de n8n', () => {
  assert.deepEqual(modulos.sort(), Object.keys(DEPENDENCIAS).sort(), 'un módulo nuevo debe declararse aquí');
  for (const f of modulos) {
    const t = fuente(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); // sin comentarios
    const usados = [...new Set([...t.matchAll(/\b(M[0-7])\b\./g)].map((m) => m[1]))].sort();
    const propio = (/^var (M[0-7]) = /m.exec(t) || [])[1];
    assert.deepEqual(usados.filter((u) => u !== propio), DEPENDENCIAS[f], f);
    if (f !== 'util.js') assert.ok(/\bUtil\./.test(t) || f === 'pipeline.js', f + ' debería usar Util');
  }
});

test('cada módulo se carga por sí solo con Util y expone lo que promete (independencia)', () => {
  const esperados = {
    'm0-guardias.js': ['M0', ['evaluarGuardias', 'validarConfigCliente']],
    'm1-normalizar.js': ['M1', ['validarConfig', 'leerCSV', 'normalizarTabla', 'normalizarObjetos', 'normalizarCSV']],
    'm2-antiguedad.js': ['M2', ['calcularAntiguedad', 'validarTramos', 'validarEscalones']],
    'm3-borradores.js': ['M3', ['generarBorradores', 'validarPlantillas', 'validarEmpresa', 'renderizar']],
    'm4-informe.js': ['M4', ['armarInforme', 'armarCorreoConEnlace', 'armarAvisoIncidencia', 'armarAvisoSinArchivo']],
    'm5-guardia-envio.js': ['M5', ['guardiaEnvio', 'esEnvioReal']],
    'm6-registro.js': ['M6', ['sanearError', 'textoAlerta', 'claveEjecucion', 'filaLibro', 'estadoBloqueo', 'decidirEjecucion', 'bloqueoVigente', 'yaResuelto', 'filaBloqueo']],
    'm7-ingesta.js': ['M7', ['elegirArchivo', 'verificarDescarga', 'diaDeSemanaISO', 'decidirSinArchivo']]
  };
  for (const [archivo, [nombre, funciones]] of Object.entries(esperados)) {
    const ctx = cargar('util', archivo.replace(/\.js$/, ''));
    assert.equal(typeof ctx[nombre], 'object', archivo);
    for (const fn of funciones) assert.equal(typeof ctx[nombre][fn], 'function', nombre + '.' + fn);
  }
});

test('cada archivo define un único módulo en el ámbito superior y en modo estricto', () => {
  for (const f of modulos) {
    const t = fuente(f);
    const tops = t.match(/^var [A-Za-z0-9]+ = \(function \(\) \{$/gm) || [];
    assert.equal(tops.length, 1, f + ' debe definir exactamente un módulo con «var X = (function () {»');
    assert.ok(/^\s*'use strict';$/m.test(t), f + ' sin modo estricto');
    assert.ok(/^\}\)\(\);\n$/m.test(t.slice(-8)) || t.trimEnd().endsWith('})();'), f + ' no cierra el módulo con «})();»');
  }
});

test('el tamaño de cada módulo permite pegarlo en un nodo de código (menos de 60 KB)', () => {
  for (const f of modulos) assert.ok(fuente(f).length < 60000, f + ' pesa ' + fuente(f).length);
});

/* ---------------------------------------------------------------- errores */

const CODIGO_RE = /^E_[A-Z0-9_]{2,40}$/;

test('nada se lanza con texto libre: solo Util.fallar con un código, y solo Util.fallar lanza', () => {
  for (const f of modulos) {
    const t = fuente(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const throws = t.match(/\bthrow\b/g) || [];
    const nuevos = t.match(/\bnew\s+(?:Error|TypeError|RangeError)\b/g) || [];
    if (f === 'util.js') {
      assert.equal(throws.length, 1, 'util.js lanza en un único lugar (fallar)');
      assert.equal(nuevos.length, 1);
    } else {
      assert.equal(throws.length, 0, f + ' lanza directamente');
      assert.equal(nuevos.length, 0, f + ' crea errores directamente');
    }
  }
});

// Argumentos de fallar() que no son un literal: cada uno es una expresión revisada que solo produce códigos.
const FALLAR_DINAMICOS = new Set(["pa", "pc", "'E_ENVIO_' + envio.motivos[0]"]);

test('todo Util.fallar() recibe un literal con forma de código, o una de las pocas expresiones revisadas', () => {
  let total = 0;
  for (const f of modulos) {
    const t = fuente(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of t.matchAll(/\bfallar\(([^)]*)\)/g)) {
      const arg = m[1].trim();
      if (f === 'util.js' && arg === 'codigo') continue; // la definición
      total++;
      const lit = /^'([^']*)'$/.exec(arg);
      if (lit) assert.match(lit[1], CODIGO_RE, f + ': ' + arg);
      else assert.ok(FALLAR_DINAMICOS.has(arg), f + ': fallar(' + arg + ') no es un literal ni una expresión revisada');
    }
  }
  assert.ok(total > 60, 'se revisaron ' + total + ' llamadas');
});

test('las expresiones dinámicas de fallar() solo producen códigos válidos', () => {
  const { M3 } = cargar('util', 'm3-borradores');
  // E_ENVIO_<motivo>: todos los motivos de M5 forman códigos válidos
  const motivos = [...fuente('m5-guardia-envio.js').matchAll(/noEnviar\('([A-Z_]+)'/g)].map((m) => m[1]);
  assert.ok(motivos.length >= 6);
  motivos.forEach((mo) => assert.match('E_ENVIO_' + mo, CODIGO_RE));
  // problemaDePlantilla devuelve solo códigos
  const codigos = [...fuente('m3-borradores.js').matchAll(/return '(E_[A-Z_]+)'/g)].map((m) => m[1]);
  assert.ok(codigos.length >= 6);
  codigos.forEach((c) => assert.match(c, CODIGO_RE));
  assert.equal(typeof M3.validarPlantillas, 'function');
});

/* ---------------------------------------------------------------- enlaces */

test('el código solo conoce dos servidores: el de WhatsApp (enlaces que abre una persona) y Google Drive (enlace de salida)', () => {
  const PERMITIDOS = ['https://api.whatsapp.com/send?phone='];
  for (const f of modulos) {
    const t = fuente(f);
    for (const m of t.matchAll(/https?:\/\/[^\s'"`)<]+/g)) {
      const url = m[0];
      assert.ok(PERMITIDOS.some((p) => url.startsWith(p)), f + ' menciona ' + url);
    }
    // en expresiones regulares aparecen escapadas: solo whatsapp y drive/docs
    for (const m of t.matchAll(/https?:\\\/\\\/([a-z.\\()|?:-]+)/g)) {
      assert.ok(/whatsapp|drive|docs|google/.test(m[1]), f + ' regex con ' + m[1]);
    }
  }
});

/* --------------------------------------------------------------- catálogo */

// Palabras con forma de código que aparecen en el código pero no son códigos que se lancen ni se devuelvan
// (prefijos de armado, claves internas de conteo, patrones de documentación).
const NO_SON_CODIGOS = new Set(['E_CFG_', 'E_ENVIO_', 'E_DISPUTA_NO_ENTENDIDA', 'E_EMISION_INVALIDA', 'E_MAIL_INVALIDO', 'E_TEL_FIJO', 'E_TEL_INVALIDO',
  'E_VENCIMIENTO_ANTERIOR_EMISION']);
const DEL_SHELL = new Set(['E_DRIVE_LISTAR', 'E_DRIVE_DESCARGAR', 'E_DRIVE_SUBIR', 'E_CORREO_ENVIAR', 'E_ARCHIVO_AMBIGUO', 'E_BLOQUEO_VENCIDO',
  'E_TABLA_LEER', 'E_TABLA_ESCRIBIR', 'E_HUELLA', 'E_NUCLEO_FALLO', 'E_FLUJO_FALLO']);

test('el catálogo de códigos (CODIGOS.md) coincide con los códigos del código fuente', () => {
  const catalogo = new Set([...leer(path.join(RAIZ, 'CODIGOS.md')).matchAll(/`([EA]_[A-Z][A-Z0-9_]{1,39})`/g)].map((m) => m[1]));
  const enFuente = new Set();
  for (const f of modulos) for (const m of fuente(f).matchAll(/\b([EA]_[A-Z][A-Z0-9_]{1,39})\b/g)) if (!NO_SON_CODIGOS.has(m[1])) enFuente.add(m[1]);
  // los E_ENVIO_<motivo> se arman en tiempo de ejecución
  for (const m of fuente('m5-guardia-envio.js').matchAll(/noEnviar\('([A-Z_]+)'/g)) enFuente.add('E_ENVIO_' + m[1]);

  const sinCatalogar = [...enFuente].filter((c) => !catalogo.has(c)).sort();
  assert.deepEqual(sinCatalogar, [], 'códigos que faltan en CODIGOS.md: ' + sinCatalogar.join(', '));
  const sobrantes = [...catalogo].filter((c) => !enFuente.has(c) && !DEL_SHELL.has(c)).sort();
  assert.deepEqual(sobrantes, [], 'códigos de CODIGOS.md que ya no existen: ' + sobrantes.join(', '));
  for (const c of DEL_SHELL) assert.ok(catalogo.has(c), c);
  for (const c of catalogo) assert.match(c, /^[EA]_[A-Z0-9_]{2,40}$/);
});

test('el saneador reconoce como código todo lo que el catálogo dice que lo es', () => {
  const { Util } = cargar('util');
  const catalogo = [...leer(path.join(RAIZ, 'CODIGOS.md')).matchAll(/`(E_[A-Z][A-Z0-9_]{1,39})`/g)].map((m) => m[1]);
  for (const c of catalogo) assert.equal(Util.codigoDe(Object.assign(new Error('x'), { codigo: c })), c);
});

/* ------------------------------------------------ datos ficticios y repositorio */

test('los datos de ejemplo son inequívocamente ficticios: correos en «.example», teléfonos de ejemplo y nada de RUT', () => {
  const { Util } = cargar('util');
  const dirs = ['datos-ficticios', 'demo'].map((d) => path.join(RAIZ, d)).filter((d) => fs.existsSync(d));
  const ejemplo = new Set(plano(Util.NUMEROS_EJEMPLO));
  for (const f of dirs.flatMap((d) => archivos(d, ['.js', '.csv', '.tsv', '.html', '.md', '.json']))) {
    const t = leer(f);
    for (const m of t.matchAll(/[A-Za-z0-9._+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)) {
      assert.match(m[1], /\.example$/, path.relative(RAIZ, f) + ' tiene un correo que no es de ejemplo: ' + m[0]);
    }
    // móviles uruguayos «09x xxx xxx» o «+598 9x xxx xxx» solo si son los reservados de ejemplo (099 000 001 a 010)
    for (const m of t.matchAll(/(?<![\d])(?:\+?598[ -]?|0)(9\d)[ -]?(\d{3})[ -]?(\d{3})(?![\d])/g)) {
      assert.ok(ejemplo.has('598' + m[1] + m[2] + m[3]), path.relative(RAIZ, f) + ' tiene un teléfono que no es de ejemplo: ' + m[0]);
    }
    assert.equal(/\bRUT\b\s*[:#]?\s*\d{6,}/i.test(t), false, path.relative(RAIZ, f) + ' parece contener un RUT');
    assert.equal(/\b\d{12}\b/.test(t.replace(/\b598\d{8,}\b/g, '')), false, path.relative(RAIZ, f) + ' contiene un número largo (¿RUT o cuenta?)');
  }
});

test('el repositorio bloquea los datos reales: .gitignore de la raíz cubre carpetas y nombres de datos reales', () => {
  let dir = RAIZ;
  let gi = null;
  for (let i = 0; i < 6 && !gi; i++) { const p = path.join(dir, '.gitignore'); if (fs.existsSync(p)) gi = leer(p); dir = path.dirname(dir); }
  assert.ok(gi, 'hay un .gitignore');
  for (const patron of ['soluciones-pymes/**/datos-reales/', '*.real.*', '*-real.*']) assert.ok(gi.includes(patron), 'falta ' + patron);
});

test('no hay exportaciones, hojas de cálculo ni correos guardados fuera de la carpeta de datos ficticios', () => {
  const sospechosos = archivos(RAIZ, ['.csv', '.tsv', '.xlsx', '.xls', '.eml', '.msg', '.pst', '.sqlite', '.db', '.pem', '.key']);
  for (const f of sospechosos) assert.ok(path.relative(RAIZ, f).startsWith('datos-ficticios' + path.sep), path.relative(RAIZ, f) + ' fuera de datos-ficticios/');
});

test('ningún archivo del núcleo contiene credenciales, claves ni direcciones de servidores propios', () => {
  const patrones = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/, /\bsk-[A-Za-z0-9]{20,}\b/, /\bghp_[A-Za-z0-9]{30,}\b/, /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    /\bAIza[0-9A-Za-z_-]{35}\b/, /\bya29\.[0-9A-Za-z_-]{20,}\b/, /password\s*[:=]\s*['"][^'"]{4,}['"]/i, /\b(?:\d{1,3}\.){3}\d{1,3}\b(?=:\d{2,5}\b)/];
  for (const f of archivos(RAIZ, ['.js', '.html', '.md', '.sh', '.json'])) {
    if (f.endsWith('guardarrailes.test.js')) continue;
    const t = leer(f);
    for (const re of patrones) assert.equal(re.test(t), false, path.relative(RAIZ, f) + ' coincide con ' + re);
  }
});
