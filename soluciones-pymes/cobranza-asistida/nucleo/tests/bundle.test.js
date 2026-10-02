'use strict';
/* El paquete que va a n8n (n8n/dist/nucleo-bundle.js) es el único código que se ejecuta de verdad: estas pruebas lo
   ejecutan en el mismo entorno restringido que los módulos (sin red, archivos, reloj ni azar) y comprueban:
   · que está al día con las fuentes (huella SHA-256 de cada una en su encabezado);
   · que es texto ASCII simple (se copia sin pérdidas) y tiene las partes esperadas;
   · que la parte propia de n8n (recorrer los elementos de entrada) responde a cada uno, en orden.
   El comportamiento de las operaciones (igual que los módulos, errores solo con código…) se prueba en envoltorio.test.js,
   contra las fuentes y contra este mismo paquete. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { crearContexto, plano } = require('./cargar');
const { ORDEN, partesDe, sha256 } = require('../n8n/generar');
const { config, CONTROL_ON, AHORA } = require('./casos-nucleo');

const RAIZ = path.join(__dirname, '..');
const PAQUETE = fs.readFileSync(path.join(RAIZ, 'n8n', 'dist', 'nucleo-bundle.js'), 'utf8');

/* ------------------------------------------------------------ el archivo */

test('el paquete está al día: lleva la huella SHA-256 de cada fuente actual', () => {
  const encabezado = PAQUETE.slice(0, PAQUETE.indexOf('*/'));
  for (const nombre of ORDEN) {
    const fuente = fs.readFileSync(path.join(RAIZ, 'src', nombre + '.js'), 'utf8');
    const m = new RegExp('^   ' + nombre + '\\s+([0-9a-f]{64})$', 'm').exec(encabezado);
    assert.ok(m, nombre + ' no figura en el encabezado del paquete');
    assert.equal(m[1], sha256(fuente), nombre + ' cambió después de generar el paquete: ejecutar «node n8n/generar.js»');
  }
});

test('el flujo del SDK de n8n lleva incrustado exactamente este paquete', () => {
  const flujo = fs.readFileSync(path.join(RAIZ, 'n8n', 'dist', 'nucleo-puro.workflow.ts'), 'utf8');
  const inicio = flujo.indexOf('jsCode: `') + 'jsCode: `'.length;
  const fin = flujo.indexOf('`\n    },\n    position: [540, 300]');
  assert.ok(inicio > 10 && fin > inicio);
  const literal = flujo.slice(inicio, fin);
  assert.equal(vm.runInNewContext('`' + literal + '`', Object.create(null)), PAQUETE);
});

test('el paquete es texto ASCII simple, con saltos de línea \\n, sin tabuladores y con salto final', () => {
  assert.equal(/[^\x00-\x7f]/.test(PAQUETE), false, 'hay caracteres no ASCII');
  assert.equal(/\t/.test(PAQUETE), false);
  assert.equal(PAQUETE.includes('\r'), false);
  assert.ok(PAQUETE.endsWith('\n'));
  assert.ok(PAQUETE.length < 150000, 'pesa ' + PAQUETE.length);
});

test('tiene las partes esperadas, en orden, y cada una compila por separado', () => {
  const partes = partesDe(PAQUETE);
  assert.deepEqual(partes.map((p) => p.nombre), [...ORDEN.map((n) => n + '.js'), 'entrada-n8n']);
  for (const p of partes.slice(0, -1)) assert.doesNotThrow(() => new vm.Script(p.codigo, { filename: p.nombre }), p.nombre);
  assert.ok(partes[partes.length - 1].codigo.startsWith('return $input.all()'));
});

test('el paquete no tiene comentarios de código salvo el encabezado y las marcas de parte', () => {
  const sinEncabezado = PAQUETE.slice(PAQUETE.indexOf('*/') + 2).replace(/^\/\/ ===== [a-z0-9.-]+ =====$/gm, '');
  assert.equal(/\/\*[\s\S]*?\*\//.test(sinEncabezado), false, 'quedan comentarios de bloque');
  assert.equal(/^\s*\/\/(?!\s*=====)/m.test(sinEncabezado), false, 'quedan comentarios de línea');
});

/* ---------------------------------------------------- la entrada propia de n8n */

function correrEntradaN8n(items) {
  const ctx = crearContexto();
  const fn = vm.runInContext('(function ($input) {\n' + PAQUETE + '\n})', ctx, { filename: 'nucleo-bundle.js' });
  return plano(fn({ all: () => items }));
}

test('n8n: responde a cada elemento de entrada, en orden, con {json: {ok…}}', () => {
  const items = [
    { json: { op: 'decidir_aviso', entrada: { config: config(), fecha_corte: '2026-10-07', filas_libro: [] } } },
    { json: { op: 'nada', entrada: {} } },
    { json: {} },
    { json: { op: 'iniciar', entrada: { config: config(), filas_control: [CONTROL_ON], filas_bloqueo: [], ahora_utc: AHORA } } },
    { json: { op: 'iniciar', entrada: 'no es un objeto' } }
  ];
  const salida = correrEntradaN8n(items);
  assert.equal(salida.length, items.length);
  assert.ok(salida.every((s) => Object.keys(s).join() === 'json'));
  assert.deepEqual(salida[0].json, { ok: true, op: 'decidir_aviso', resultado: { decision: 'avisar', clave: 'demo-01|2026-W41|' + '0'.repeat(64) } });
  assert.deepEqual(salida[1].json, { ok: false, op: 'nada', codigo: 'E_OPERACION_DESCONOCIDA' });
  assert.deepEqual(salida[2].json, { ok: false, op: 'desconocida', codigo: 'E_OPERACION_DESCONOCIDA' });
  assert.equal(salida[3].json.ok, true);
  assert.equal(salida[3].json.resultado.accion, 'continuar');
  assert.deepEqual(salida[3].json.resultado.bloqueo_nuevo, { cliente_id: 'demo-01', expira_utc: '2026-10-05T12:00:00Z' });
  assert.deepEqual(salida[4].json, { ok: false, op: 'iniciar', codigo: 'E_ENTRADA_INVALIDA' });
});

test('n8n: sin elementos de entrada no devuelve nada, y el entorno no ofrece nada fuera de lo previsto', () => {
  assert.deepEqual(correrEntradaN8n([]), []);
  const ctx = crearContexto();
  for (const g of ['require', 'process', 'fetch', 'XMLHttpRequest', 'setTimeout', 'Buffer']) assert.equal(vm.runInContext('typeof ' + g, ctx), 'undefined', g);
  assert.equal(vm.runInContext('(function () { try { return eval("1 + 1"); } catch (e) { return "bloqueado"; } })()', ctx), 'bloqueado'); // eval existe, pero no puede evaluar texto
});
