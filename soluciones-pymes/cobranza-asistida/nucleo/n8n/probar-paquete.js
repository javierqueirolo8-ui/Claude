#!/usr/bin/env node
'use strict';
/* Prueba el paquete que va a n8n con TODA la batería, no solo con sus pruebas propias.

   1. Comprueba que n8n/dist/nucleo-bundle.js está al día con las fuentes (huellas SHA-256 del encabezado).
   2. Separa el paquete en sus partes (util, M0 a M7, pipeline, envoltorio) y ejecuta todas las pruebas contra ESE código
      (NUCLEO_SRC): si quitar comentarios y escapar caracteres hubiera cambiado algo, alguna prueba lo vería.
      Quedan fuera las que leen el TEXTO de las fuentes (guardarraíles: formato, comentarios, literales) y la del propio paquete.
   3. Ejecuta la batería de extremo a extremo (simulador del flujo diario, con fallos inyectados) mandando cada pedido al
      envoltorio del paquete como lo hará n8n: {op, entrada} → {ok, resultado} | {ok:false, codigo}.

   Uso:   node n8n/probar-paquete.js          (segundos; no usa red ni esbuild)
   Variable: TZ (por defecto America/Montevideo) */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ORDEN, partesDe, sha256 } = require('./generar');

const RAIZ = path.join(__dirname, '..');
const PAQUETE = fs.readFileSync(path.join(__dirname, 'dist', 'nucleo-bundle.js'), 'utf8');
const EXCLUIDAS = ['guardarrailes.test.js', 'bundle.test.js']; // inspeccionan el texto de las fuentes / el propio paquete

function fallar(mensaje) { console.error('✗ ' + mensaje); process.exit(1); }

// 1. al día
const encabezado = PAQUETE.slice(0, PAQUETE.indexOf('*/'));
for (const nombre of ORDEN) {
  const fuente = fs.readFileSync(path.join(RAIZ, 'src', nombre + '.js'), 'utf8');
  const m = new RegExp('^   ' + nombre + '\\s+([0-9a-f]{64})$', 'm').exec(encabezado);
  if (!m || m[1] !== sha256(fuente)) fallar('el paquete está desactualizado respecto de src/' + nombre + '.js: ejecutar «node n8n/generar.js»');
}
console.log('  ✓ paquete al día con las ' + ORDEN.length + ' fuentes');

// 2. toda la batería contra el código del paquete
const partes = partesDe(PAQUETE).filter((p) => p.nombre !== 'entrada-n8n');
const dir = fs.mkdtempSync(path.join(process.env.MUT_TMP || os.tmpdir(), 'paquete-'));
const TZ = process.env.TZ || 'America/Montevideo';
try {
  for (const p of partes) fs.writeFileSync(path.join(dir, p.nombre), p.codigo);
  const pruebas = fs.readdirSync(path.join(RAIZ, 'tests')).filter((f) => f.endsWith('.test.js') && !EXCLUIDAS.includes(f)).map((f) => path.join('tests', f));
  const r = spawnSync(process.execPath, ['--test', ...pruebas], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NUCLEO_SRC: dir, TZ } });
  const pasan = (/^# pass (\d+)/m.exec(r.stdout) || [])[1];
  if (r.status !== 0) {
    console.error(r.stdout.split('\n').filter((l) => /^not ok|^# (tests|pass|fail)/.test(l)).slice(0, 30).join('\n'));
    fallar('la batería falla contra el código del paquete');
  }
  console.log('  ✓ ' + pasan + ' pruebas pasan contra el código del paquete (' + pruebas.length + ' archivos de prueba, sin ' + EXCLUIDAS.length + ' que miran el texto)');

  // 3. extremo a extremo por el envoltorio
  const e2e = spawnSync(process.execPath, ['--test', path.join('tests', 'e2e.test.js')], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NUCLEO_VIA_PAQUETE: '1', TZ } });
  const pasanE2e = (/^# pass (\d+)/m.exec(e2e.stdout) || [])[1];
  if (e2e.status !== 0) {
    console.error(e2e.stdout.split('\n').filter((l) => /^not ok|^# (tests|pass|fail)/.test(l)).slice(0, 30).join('\n'));
    fallar('el flujo diario simulado falla al hablar con el núcleo por el envoltorio del paquete');
  }
  console.log('  ✓ ' + pasanE2e + ' escenarios del flujo diario pasan hablando con el núcleo por el envoltorio ({op, entrada} → {ok, resultado})');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
