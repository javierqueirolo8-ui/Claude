#!/usr/bin/env node
'use strict';
/* Generador del flujo «[COB-DEV] Utilidades de prueba» para n8n (Etapa 2).

   Es una herramienta del BANCO DE PRUEBAS, no del servicio: n8n no ofrece por API borrar ni cambiar filas de una tabla de datos,
   y las pruebas del flujo principal lo necesitan. Se dispara a mano (con datos fijados) y hace UNA de cuatro cosas:

     poner_control     reemplaza el contenido de la tabla de control global (cob_dev_config_global) por las filas indicadas
                       (ninguna, una o varias: las anomalías también se prueban)
     limpiar_cliente   borra todo lo de UN cliente de prueba (bloqueos, libro, carpeta de entrada, carpeta de salida y correos)
     limpiar_bloqueos  borra solo los bloqueos de UN cliente de prueba (lo que haría Javier a mano tras un bloqueo vencido)
     verificar         lee lo que dejó un cliente de prueba, lo pasa a su forma canónica (n8n/canonico.js), calcula la huella
                       SHA-256 de cada tabla y falla con el detalle si no coincide con la esperada (la del simulador)

   Seguridad: los clientes aceptados son SOLO los que empiezan por «esc-» (nada más se puede borrar), las filas de control se
   validan y no hay ninguna red ni credencial. No se publica ni se activa.

   Este script escribe dist/utilidades.workflow.ts (código del SDK de n8n).
   Uso:   node n8n/generar-utilidades.js               escribe dist/
          node n8n/generar-utilidades.js --verificar   no escribe: sale con error si dist/ no coincide con lo que se generaría */

const fs = require('node:fs');
const path = require('node:path');
const { paraPlantilla } = require('./generar');
const { fuente } = require('./canonico');

const DIST = path.join(__dirname, 'dist');
const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const TABLA = (n) => "{ __rl: true, mode: 'name', value: " + q(n) + ' }';
const CLIENTE = "expr('{{ $(\"Pedido\").first().json.cliente_id }}')";

const PEDIDO = `const p = $input.first().json || {};
const ACCIONES = ['poner_control', 'limpiar_cliente', 'limpiar_bloqueos', 'verificar'];
if (ACCIONES.indexOf(p.accion) < 0) throw new Error('ACCION_DESCONOCIDA');
if (p.accion === 'poner_control') {
  if (!Array.isArray(p.filas) || p.filas.length > 3) throw new Error('CONTROL_INVALIDO');
  p.filas.forEach(function (f) {
    if (!f || typeof f !== 'object' || typeof f.interruptor !== 'string' || typeof f.dry_run !== 'string' || f.interruptor.length > 20 || f.dry_run.length > 20) throw new Error('CONTROL_INVALIDO');
  });
} else if (typeof p.cliente_id !== 'string' || !/^esc-[a-z0-9-]{1,30}$/.test(p.cliente_id)) {
  // solo clientes de prueba: nunca se toca nada que no empiece por «esc-»
  throw new Error('CLIENTE_NO_PERMITIDO');
}
if (p.accion === 'verificar') {
  ['correos', 'libro', 'salida', 'bloqueos'].forEach(function (t) {
    const e = p.esperado && p.esperado[t];
    if (!e || typeof e.hash !== 'string' || !/^[0-9a-f]{64}$/.test(e.hash) || !Number.isInteger(e.n)) throw new Error('ESPERADO_INVALIDO');
  });
}
return [{ json: p }];
`;

const EXPANDIR = `const p = $("Pedido").first().json;
return p.filas.map(function (f) { return { json: { interruptor: f.interruptor, dry_run: f.dry_run, actualizado_utc: typeof f.actualizado_utc === 'string' ? f.actualizado_utc : '' } }; });
`;

const CANONIZAR = () => fuente() + `
const filas = function (nodo) { return $(nodo).all().map(function (i) { return i.json; }).filter(function (j) { return j.id !== undefined; }); };
const tablas = { correos: filas('Leer correos'), libro: filas('Leer libro'), salida: filas('Leer carpeta de salida'), bloqueos: filas('Leer bloqueos') };
const c = canonico(tablas);
return ['correos', 'libro', 'salida', 'bloqueos'].map(function (t) { return { json: { tabla: t, n: tablas[t].length, texto: c[t] } }; });
`;

const COMPARAR = `const esperado = $("Pedido").first().json.esperado;
const dif = [];
const resumen = {};
$input.all().forEach(function (i) {
  const j = i.json;
  const e = esperado[j.tabla];
  resumen[j.tabla] = { n: j.n, hash: j.hash };
  if (e.hash !== j.hash || e.n !== j.n) dif.push(j.tabla + ': n=' + j.n + ' (esperado ' + e.n + '), huella ' + j.hash.slice(0, 12) + ' (esperada ' + e.hash.slice(0, 12) + ')');
});
if (dif.length) throw new Error('DIFERENTE · ' + dif.join(' | '));
return [{ json: { igual: true, tablas: resumen } }];
`;

function codigo(v, nombre, js, x, y, muestra) {
  return 'const ' + v + " = node({\n  type: 'n8n-nodes-base.code',\n  version: 2,\n  config: { name: " + q(nombre) + ", parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `" + paraPlantilla(js) +
    '` }, position: [' + x + ', ' + y + '] },\n  output: [' + muestra + ']\n});\n';
}

function filtros(lista) {
  return "matchType: 'allConditions', filters: { conditions: [" + lista.map(([col, cond, val]) => '{ keyName: ' + q(col) + ', condition: ' + q(cond) + ', keyValue: ' + val + ' }').join(', ') + '] }';
}

function tablaLeer(v, nombre, tabla, x, y) {
  return 'const ' + v + " = node({\n  type: 'n8n-nodes-base.dataTable',\n  version: 1.1,\n  config: { name: " + q(nombre) + ', executeOnce: true, alwaysOutputData: true, parameters: { resource: \'row\', operation: \'get\', dataTableId: ' + TABLA(tabla) +
    ', ' + filtros([['cliente_id', 'eq', CLIENTE]]) + ', returnAll: true }, position: [' + x + ', ' + y + '] },\n  output: [{ id: 1 }]\n});\n';
}

function tablaBorrar(v, nombre, tabla, lista, x, y) {
  return 'const ' + v + " = node({\n  type: 'n8n-nodes-base.dataTable',\n  version: 1.1,\n  config: { name: " + q(nombre) + ', alwaysOutputData: true, parameters: { resource: \'row\', operation: \'deleteRows\', dataTableId: ' + TABLA(tabla) +
    ', ' + filtros(lista) + ' }, position: [' + x + ', ' + y + '] },\n  output: [{ id: 1 }]\n});\n';
}

const POR_CLIENTE = [['cliente_id', 'eq', CLIENTE]];

function regla(clave, valor) {
  return "        { outputKey: " + q(clave) + ", renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.accion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: " + q(valor) + " }], combinator: 'and' } }";
}

function generar() {
  const p = [];
  p.push("import { workflow, node, trigger, switchCase, sticky, expr } from '@n8n/workflow-sdk';\n");
  p.push("const disparador = trigger({\n  type: 'n8n-nodes-base.manualTrigger',\n  version: 1,\n  config: { name: 'Disparador manual', position: [240, 160] },\n  output: [{}]\n});\n");
  p.push(codigo('pedido', 'Pedido', PEDIDO, 520, 160, "{ accion: 'verificar', cliente_id: 'esc-01', esperado: {} }"));
  p.push("const ruta = switchCase({\n  version: 3.4,\n  config: { name: '¿Qué hay que hacer?', parameters: { mode: 'rules', rules: { values: [\n" +
    [['poner control', 'poner_control'], ['limpiar cliente', 'limpiar_cliente'], ['limpiar bloqueos', 'limpiar_bloqueos'], ['verificar', 'verificar']].map(([k, v]) => regla(k, v)).join(',\n') +
    "\n      ] }, options: {} }, position: [800, 160] },\n  output: [{ accion: 'verificar' }]\n});\n");

  // poner_control
  p.push(tablaBorrar('borrarControl', 'Borrar control', 'cob_dev_config_global', [['interruptor', 'neq', q('__ninguno__')]], 1080, 0));
  p.push(codigo('expandirControl', 'Expandir control', EXPANDIR, 1360, 0, "{ interruptor: 'off', dry_run: 'true', actualizado_utc: '' }"));
  p.push("const escribirControl = node({\n  type: 'n8n-nodes-base.dataTable',\n  version: 1.1,\n  config: { name: 'Escribir control', parameters: { resource: 'row', operation: 'insert', dataTableId: " + TABLA('cob_dev_config_global') + ",\n" +
    "      columns: {\n        mappingMode: 'defineBelow',\n        value: {\n          interruptor: expr('{{ $json.interruptor }}'),\n          dry_run: expr('{{ $json.dry_run }}'),\n          actualizado_utc: expr('{{ $json.actualizado_utc }}')\n        },\n        schema: [\n" +
    ['interruptor', 'dry_run', 'actualizado_utc'].map((c) => "          { id: " + q(c) + ", displayName: " + q(c) + ", required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }").join(',\n') +
    "\n        ]\n      } }, position: [1640, 0] },\n  output: [{ id: 1 }]\n});\n");

  // limpiar_cliente
  p.push(tablaBorrar('borrarBloqueos', 'Borrar bloqueos', 'cob_dev_bloqueos', POR_CLIENTE, 1080, 160));
  p.push(tablaBorrar('borrarLibro', 'Borrar libro', 'cob_dev_ejecuciones', POR_CLIENTE, 1360, 160));
  p.push(tablaBorrar('borrarEntrada', 'Borrar carpeta de entrada', 'cob_dev_drive_entrada', POR_CLIENTE, 1640, 160));
  p.push(tablaBorrar('borrarSalida', 'Borrar carpeta de salida', 'cob_dev_drive_salida', POR_CLIENTE, 1920, 160));
  p.push(tablaBorrar('borrarCorreos', 'Borrar correos', 'cob_dev_correos', POR_CLIENTE, 2200, 160));

  // limpiar_bloqueos
  p.push(tablaBorrar('borrarSoloBloqueos', 'Borrar solo bloqueos', 'cob_dev_bloqueos', POR_CLIENTE, 1080, 320));

  // verificar
  p.push(tablaLeer('leerCorreos', 'Leer correos', 'cob_dev_correos', 1080, 480));
  p.push(tablaLeer('leerLibro', 'Leer libro', 'cob_dev_ejecuciones', 1360, 480));
  p.push(tablaLeer('leerSalida', 'Leer carpeta de salida', 'cob_dev_drive_salida', 1640, 480));
  p.push(tablaLeer('leerBloqueos', 'Leer bloqueos', 'cob_dev_bloqueos', 1920, 480));
  p.push(codigo('canonizar', 'Canonizar', CANONIZAR(), 2200, 480, "{ tabla: 'correos', n: 0, texto: '' }"));
  p.push("const huella = node({\n  type: 'n8n-nodes-base.crypto',\n  version: 2,\n  config: { name: 'Huella', parameters: { action: 'hash', type: 'SHA256', value: expr('{{ $json.texto }}'), dataPropertyName: 'hash', encoding: 'hex' }, position: [2480, 480] },\n  output: [{ tabla: 'correos', n: 0, texto: '', hash: '' }]\n});\n");
  p.push(codigo('comparar', 'Comparar', COMPARAR, 2760, 480, '{ igual: true, tablas: {} }'));

  p.push("const nota = sticky('[COB-DEV] Utilidades de prueba. Herramienta del banco de pruebas (datos ficticios): fija la tabla de control, limpia un cliente de prueba «esc-…» y compara lo que dejó una corrida con lo que dejó el simulador. No se publica.', [pedido], { color: 4 });\n");
  p.push("export default workflow('cob-dev-utilidades-prueba', '[COB-DEV] Utilidades de prueba')\n  .add(disparador)\n  .to(pedido\n    .to(ruta\n" +
    "      .onCase(0, borrarControl\n        .to(expandirControl\n          .to(escribirControl)))\n" +
    "      .onCase(1, borrarBloqueos\n        .to(borrarLibro\n          .to(borrarEntrada\n            .to(borrarSalida\n              .to(borrarCorreos)))))\n" +
    "      .onCase(2, borrarSoloBloqueos)\n" +
    "      .onCase(3, leerCorreos\n        .to(leerLibro\n          .to(leerSalida\n            .to(leerBloqueos\n              .to(canonizar\n                .to(huella\n                  .to(comparar)))))))))\n  .add(nota);\n");
  return p.join('\n');
}

function main() {
  const verificar = process.argv.includes('--verificar');
  const sdk = generar();
  const ruta = path.join(DIST, 'utilidades.workflow.ts');
  const actual = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : null;
  if (actual === sdk) { console.log('  igual      dist/utilidades.workflow.ts  (' + sdk.length + ' caracteres)'); return; }
  if (verificar) { console.error('  DIFERENTE  dist/utilidades.workflow.ts\n\nDesactualizado: ejecutar «node n8n/generar-utilidades.js».'); process.exit(1); }
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(ruta, sdk);
  console.log('  escrito    dist/utilidades.workflow.ts  (' + sdk.length + ' caracteres)');
}

if (require.main === module) main();
module.exports = { generar };
