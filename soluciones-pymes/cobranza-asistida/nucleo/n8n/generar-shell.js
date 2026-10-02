#!/usr/bin/env node
'use strict';
/* Generador del flujo de pruebas «[COB-DEV] Shell demo-01» para n8n (Etapa 2).

   El shell es la parte del servicio que SÍ toca el mundo: lee y escribe las tablas de datos de n8n, «lista la carpeta del
   cliente», «envía el correo». Todo lo que decide lo decide el núcleo puro (subflujo «[COB-DEV] Núcleo (puro)»): el shell
   le manda {op, entrada}, recibe {ok, resultado} y obedece. En este banco de pruebas la carpeta de entrada, la carpeta de
   salida y el correo son TABLAS (cob_dev_drive_entrada, cob_dev_drive_salida, cob_dev_correos): ningún dato sale de n8n y
   el resultado de cada ejecución se puede leer. Las tablas de control, bloqueos y libro son las reales del diseño.

   Este script escribe:
     dist/shell-demo.workflow.ts   el flujo completo (código del SDK de n8n)
     dist/shell-demo.spec.json     nodos y conexiones, para comprobar contra n8n que el flujo creado es el previsto

   Uso:   node n8n/generar-shell.js               escribe dist/
          node n8n/generar-shell.js --verificar   no escribe: sale con error si dist/ no coincide con lo que se generaría
   No usa red ni esbuild, no lee datos reales y no toca n8n. */

const fs = require('node:fs');
const path = require('node:path');
const { configEjemplo } = require('../datos-ficticios/config-ejemplo');
const { paraPlantilla } = require('./generar');

const DIST = path.join(__dirname, 'dist');
const ID_NUCLEO = 'UEhnlNWjhmIa7l1D'; // subflujo «[COB-DEV] Núcleo (puro)» en el n8n de pruebas

/* ---------------------------------------------------------------- nombres */

const N = {
  disparador: 'Disparador manual',
  entrada: 'DEV · Entrada',
  leerInterruptor: 'Leer interruptor general',
  leerBloqueos: 'Leer bloqueos del cliente',
  prepararInicio: 'Preparar inicio',
  nucleoIniciar: 'Núcleo · iniciar',
  rutaDia: '¿Cómo sigue el día?',
  escribirBloqueo: 'Escribir bloqueo',
  leerLibro: 'Leer libro del cliente',
  leerCarpeta: 'Drive · leer carpeta (simulado)',
  prepararEleccion: 'Preparar elección de archivo',
  nucleoElegir: 'Núcleo · elegir archivo',
  rutaCarpeta: '¿Qué hay en la carpeta?',
  descargar: 'Drive · descargar (simulado)',
  huella: 'Huella SHA-256',
  prepararDecision: 'Preparar decisión',
  nucleoDecidir: 'Núcleo · decidir procesado',
  rutaProcesar: '¿Procesar este archivo?',
  prepararInforme: 'Preparar informe',
  nucleoPreparar: 'Núcleo · preparar',
  rutaEntrega: '¿Cómo se entrega?',
  prepararSubida: 'Preparar subida del informe',
  subirInforme: 'Drive · subir informe (simulado)',
  prepararArmado: 'Preparar armado del envío',
  nucleoArmar: 'Núcleo · armar envío',
  envioArmado: '¿Envío armado?',
  prepararCorreo: 'Preparar correo',
  enviarCorreo: 'Correo · enviar (simulado)',
  prepararLibro: 'Preparar libro',
  escribirLibro: 'Escribir libro',
  soltarBloqueo: 'Soltar bloqueo',
  finEnvio: 'Fin · envío',
  prepararAviso: 'Preparar aviso de «no llegó»',
  nucleoAviso: 'Núcleo · decidir aviso',
  rutaAviso: '¿Avisar?',
  prepararArmadoAviso: 'Preparar armado del aviso',
  soltarSinEnvio: 'Soltar bloqueo (sin envío)',
  finSinEnvio: 'Fin · sin envío',
  finSinTrabajo: 'Fin · sin trabajo',
  prepararAvisoSinLibro: 'Preparar aviso sin libro',
  nucleoAvisoOperador: 'Núcleo · aviso',
  hayDestinoAviso: '¿Hay a quién avisar? (aviso)',
  prepararCorreoAviso: 'Preparar correo de aviso',
  enviarCorreoAviso: 'Correo · avisar a Javier (aviso)',
  finAviso: 'Fin · aviso',
  codTablaLeer: 'Código · tabla (leer)',
  codTablaEscribir: 'Código · tabla (escribir)',
  codCarpetaListar: 'Código · carpeta (listar)',
  codCarpetaDescargar: 'Código · carpeta (descargar)',
  codCarpetaSubir: 'Código · carpeta (subir)',
  codCorreo: 'Código · correo',
  codHuella: 'Código · huella',
  codNucleo: 'Código · núcleo',
  codFlujo: 'Código · flujo',
  codResultado: 'Código · resultado del núcleo',
  codAmbiguo: 'Código · archivo ambiguo',
  prepararError: 'Preparar manejo del error',
  nucleoError: 'Núcleo · error',
  hayFila: '¿Hay fila de libro?',
  escribirLibroError: 'Escribir libro (error)',
  soltarError: 'Soltar bloqueo (error)',
  hayDestino: '¿Hay a quién avisar?',
  prepararCorreoOperador: 'Preparar correo al operador',
  enviarCorreoOperador: 'Correo · avisar a Javier',
  finError: 'Fin · error'
};

/* ---------------------------------------------------- piezas de texto del SDK */

// Texto de un literal de cadena del SDK entre comillas simples.
function q(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"; }
function expr(contenido) { return 'expr(' + q('{{ ' + contenido + ' }}') + ')'; }
// Toda referencia a un nodo anterior dice QUÉ salida lee (la 0, la normal). Sin eso n8n elige la salida por el primer camino que
// encuentra en el grafo hacia el nodo de origen, y en el tramo de errores (adonde se llega por muchos caminos) puede elegir la de
// error, que está vacía: «.first()» daría undefined. Comprobado contra n8n (escenario esc-06b).
const ENTRADA = '$("' + N.entrada + '").first(0).json';
const SALIDA = (nodo) => '$("' + nodo + '").first(0).json';

function condicion(izquierda, operacion, derecha, tipo) {
  const d = typeof derecha === 'string' ? q(derecha) : String(derecha);
  return '{ options: { caseSensitive: true, leftValue: \'\', typeValidation: \'loose\' }, conditions: [{ leftValue: ' + expr(izquierda) + ', operator: { type: ' + q(tipo || 'string') + ', operation: ' + q(operacion) + ' }, rightValue: ' + d + ' }], combinator: \'and\' }';
}
function condiciones(lista) {
  return '{ options: { caseSensitive: true, leftValue: \'\', typeValidation: \'loose\' }, conditions: [' +
    lista.map(([i, op, d, t]) => '{ leftValue: ' + expr(i) + ', operator: { type: ' + q(t || 'string') + ', operation: ' + q(op) + ' }, rightValue: ' + (typeof d === 'string' ? q(d) : String(d)) + ' }').join(', ') + '], combinator: \'and\' }';
}

const TABLA = (n) => '{ __rl: true, mode: \'name\', value: ' + q(n) + ' }';

function esquema(cols) {
  return '[' + cols.map(([c, t]) => '{ id: ' + q(c) + ', displayName: ' + q(c) + ', required: false, defaultMatch: false, display: true, type: ' + q(t) + ', canBeUsedToMatch: true }').join(', ') + ']';
}

/* ---------------------------------------------------------- tipos de nodo */

const CLIENTE = ENTRADA + '.config.cliente_id';
const COLUMNAS = {
  cob_dev_bloqueos: [['cliente_id', 'string'], ['expira_utc', 'string']],
  cob_dev_ejecuciones: [['clave', 'string'], ['cliente_id', 'string'], ['semana_iso', 'string'], ['hash_archivo', 'string'], ['estado', 'string'], ['iniciada_utc', 'string'],
    ['terminada_utc', 'string'], ['n_filas', 'number'], ['n_vencidas', 'number'], ['n_apartadas', 'number'], ['codigo_error', 'string'], ['modo', 'string']],
  cob_dev_drive_salida: [['cliente_id', 'string'], ['archivo_id', 'string'], ['nombre', 'string'], ['contenido', 'string'], ['creado_utc', 'string']],
  cob_dev_correos: [['tipo', 'string'], ['cliente_id', 'string'], ['para', 'string'], ['asunto', 'string'], ['cuerpo_texto', 'string'], ['adjunto_nombre', 'string'], ['adjunto_bytes', 'number'], ['creado_utc', 'string']]
};

const nodos = {}; // variable → definición
const orden = [];
function def(v, d) { if (nodos[v]) throw new Error('variable repetida ' + v); nodos[v] = Object.assign({ v }, d); orden.push(v); return v; }

function flagsDe(d) {
  const f = [];
  if (d.onError) f.push('onError: ' + q(d.onError));
  if (d.executeOnce) f.push('executeOnce: true');
  if (d.alwaysOutputData) f.push('alwaysOutputData: true');
  return f;
}

function codigo(v, nombre, js, opts) {
  return def(v, Object.assign({ tipo: 'code', nombre, js: js.trim() + '\n', muestra: '{ ok: true }' }, opts || {}));
}
function tablaLeer(v, nombre, tabla, filtro, opts) {
  return def(v, Object.assign({ tipo: 'dtGet', nombre, tabla, filtro, muestra: '{ id: 1 }', alwaysOutputData: true, executeOnce: true }, opts || {}));
}
function tablaInsertar(v, nombre, tabla, mapa, opts) {
  return def(v, Object.assign({ tipo: 'dtInsert', nombre, tabla, mapa, muestra: '{ id: 1 }' }, opts || {}));
}
function tablaBorrar(v, nombre, tabla, filtros, opts) {
  return def(v, Object.assign({ tipo: 'dtDelete', nombre, tabla, filtros, muestra: '{ id: 1 }', alwaysOutputData: true }, opts || {}));
}
function nucleo(v, nombre, op, opts) {
  return def(v, Object.assign({ tipo: 'exec', nombre, op, onError: 'continueErrorOutput', muestra: '{ ok: true, op: ' + q(op) + ', resultado: {} }' }, opts || {}));
}
function codigoFijo(v, nombre, cod, donde) {
  return def(v, { tipo: 'set', nombre, asignaciones: [['codigo', q(cod), 'string'], ['nodo', q(donde), 'string']], muestra: '{ codigo: ' + q(cod) + ', nodo: ' + q(donde) + ' }' });
}
function decision(v, nombre, cond, opts) { return def(v, Object.assign({ tipo: 'if', nombre, cond }, opts || {})); }
function ruta(v, nombre, reglas, fallback, muestra) { return def(v, { tipo: 'switch', nombre, reglas, fallback, muestra: muestra || '{ ok: true }' }); }

/* --------------------------------------------------------------- el código */

const LEER_FILAS = (nodo) => "$('" + nodo + "').all(0).map(function (i) { return i.json; }).filter(function (j) { return j.id !== undefined; })";
const GUARDIAS_INI = "{ permitido: ini.guardias.permitido, dry_run: ini.guardias.dry_run }";

def('disparador', { tipo: 'trigger', nombre: N.disparador, muestra: '{}' });

codigo('entrada', N.entrada, `
// Solo para el banco de pruebas: la configuración del cliente ficticio y el reloj llegan en el pedido de la prueba.
// En producción la configuración la fija Javier en este nodo y el reloj es el del servidor.
const pedido = $input.first().json || {};
const base = ${JSON.stringify(configEjemplo())};
const config = Object.assign({}, base, pedido.config || {});
const ahora = typeof pedido.ahora_utc === 'string' ? pedido.ahora_utc : new Date().toISOString().replace(/\\.\\d{3}Z$/, 'Z');
return [{ json: {
  config: config,
  ahora_utc: ahora,
  fallos: Array.isArray(pedido.fallos) ? pedido.fallos : [],
  operador: typeof pedido.operador === 'string' ? pedido.operador : 'javier@ejemplo.example',
  workflow: $workflow.name,
  ejecucion_id: String($execution.id)
} }];
`, { muestra: '{ config: {}, ahora_utc: \'2026-10-05T11:30:00Z\', fallos: [], operador: \'javier@ejemplo.example\', workflow: \'[COB-DEV] Shell demo-01\', ejecucion_id: \'1\' }' });

tablaLeer('leerInterruptor', N.leerInterruptor, 'cob_dev_config_global', null, { onError: 'continueErrorOutput' });
tablaLeer('leerBloqueos', N.leerBloqueos, 'cob_dev_bloqueos', ['cliente_id', expr(CLIENTE)], { onError: 'continueErrorOutput' });

codigo('prepararInicio', N.prepararInicio, `
const ctx = ${ENTRADA};
const filas = function (nodo) { return $(nodo).all(0).map(function (i) { return i.json; }).filter(function (j) { return j.id !== undefined; }); };
return [{ json: { op: 'iniciar', entrada: { config: ctx.config, filas_control: filas(${q(N.leerInterruptor)}), filas_bloqueo: filas(${q(N.leerBloqueos)}), ahora_utc: ctx.ahora_utc } } }];
`, { onError: 'continueErrorOutput', muestra: "{ op: 'iniciar', entrada: {} }" });

nucleo('nucleoIniciar', N.nucleoIniciar, 'iniciar');

ruta('rutaDia', N.rutaDia, [
  ['núcleo con error', [['String($json.ok)', 'notEquals', 'true']]],
  ['continuar', [['$json.resultado?.accion ?? ""', 'equals', 'continuar']]],
  ['error al arrancar', [['$json.resultado?.accion ?? ""', 'equals', 'error']]],
  ['avisar sin libro', [['$json.resultado?.codigo ?? ""', 'notEquals', '']]]
], 'sin trabajo', '{ ok: true, op: \'iniciar\', resultado: { accion: \'continuar\' } }');

tablaInsertar('escribirBloqueo', N.escribirBloqueo, 'cob_dev_bloqueos', {
  cliente_id: expr('$json.resultado.bloqueo_nuevo.cliente_id'),
  expira_utc: expr('$json.resultado.bloqueo_nuevo.expira_utc')
}, { onError: 'continueErrorOutput' });

tablaLeer('leerLibro', N.leerLibro, 'cob_dev_ejecuciones', ['cliente_id', expr(CLIENTE)], { onError: 'continueErrorOutput' });
tablaLeer('leerCarpeta', N.leerCarpeta, 'cob_dev_drive_entrada', ['cliente_id', expr(CLIENTE)], { onError: 'continueErrorOutput' });

codigo('prepararEleccion', N.prepararEleccion, `
const ctx = ${ENTRADA};
if (ctx.fallos.indexOf('listar') >= 0) throw new Error('E_DRIVE_LISTAR');
const ini = ${SALIDA(N.nucleoIniciar)}.resultado;
const archivos = ${LEER_FILAS(N.leerCarpeta)}.map(function (f) {
  return { id: f.archivo_id, name: f.nombre, mimeType: f.mime_type, size: f.tamano, modifiedTime: f.modificado };
});
return [{ json: { op: 'elegir_archivo', entrada: { config: ctx.config, archivos: archivos, fecha_corte: ini.fecha_corte } } }];
`, { onError: 'continueErrorOutput', muestra: "{ op: 'elegir_archivo', entrada: {} }" });

nucleo('nucleoElegir', N.nucleoElegir, 'elegir_archivo');

ruta('rutaCarpeta', N.rutaCarpeta, [
  ['núcleo con error', [['String($json.ok)', 'notEquals', 'true']]],
  ['elegido', [['$json.resultado?.estado ?? ""', 'equals', 'elegido']]],
  ['sin archivo', [['$json.resultado?.estado ?? ""', 'equals', 'sin_archivo']]],
  ['ambiguo', [['$json.resultado?.estado ?? ""', 'equals', 'ambiguo']]]
], 'estado desconocido', '{ ok: true, op: \'elegir_archivo\', resultado: { estado: \'elegido\' } }');

codigo('descargar', N.descargar, `
const ctx = ${ENTRADA};
if (ctx.fallos.indexOf('descargar') >= 0) throw new Error('E_DRIVE_DESCARGAR');
const elegido = ${SALIDA(N.nucleoElegir)}.resultado.archivo;
const filas = ${LEER_FILAS(N.leerCarpeta)}.filter(function (f) { return f.archivo_id === elegido.id; });
if (filas.length !== 1) throw new Error('E_DRIVE_DESCARGAR');
const f = filas[0];
let texto = '';
let paraHuella = '';
let recibido = 0;
let filasXlsx = null;
if (elegido.formato === 'xlsx') {
  // una hoja de cálculo llega ya leída (filas); su tamaño original no se puede medir aquí: se da por entero
  paraHuella = String(f.contenido || '');
  filasXlsx = JSON.parse(String(f.filas_json || '[]'));
  recibido = elegido.bytes;
} else {
  const completo = String(f.contenido || '');
  const bytes = Buffer.from(completo, 'utf8');
  const corte = typeof f.corte_bytes === 'number' && f.corte_bytes >= 0 && f.corte_bytes < bytes.length ? f.corte_bytes : null;
  texto = corte !== null ? bytes.subarray(0, corte).toString('utf8') : completo;
  paraHuella = texto;
  recibido = corte !== null ? corte : bytes.length;
}
return [{ json: { formato: elegido.formato, texto: texto, filas: filasXlsx, para_huella: paraHuella, recibido_bytes: recibido } }];
`, { onError: 'continueErrorOutput', muestra: "{ formato: 'csv', texto: '', filas: null, para_huella: '', recibido_bytes: 0 }" });

def('huella', { tipo: 'crypto', nombre: N.huella, onError: 'continueErrorOutput', muestra: '{ hash: \'\' }' });

codigo('prepararDecision', N.prepararDecision, `
const ctx = ${ENTRADA};
const elegido = ${SALIDA(N.nucleoElegir)}.resultado.archivo;
const descarga = ${SALIDA(N.descargar)};
const hash = ${SALIDA(N.huella)}.hash;
return [{ json: { op: 'decidir_procesado', entrada: {
  cliente_id: ctx.config.cliente_id, fecha_exportacion: elegido.modificado_fecha, hash_archivo: hash,
  esperado_bytes: elegido.bytes, recibido_bytes: descarga.recibido_bytes, filas_libro: ${LEER_FILAS(N.leerLibro)}
} } }];
`, { onError: 'continueErrorOutput', muestra: "{ op: 'decidir_procesado', entrada: {} }" });

nucleo('nucleoDecidir', N.nucleoDecidir, 'decidir_procesado');

ruta('rutaProcesar', N.rutaProcesar, [
  ['núcleo con error', [['String($json.ok)', 'notEquals', 'true']]],
  ['procesar', [['$json.resultado?.decision ?? ""', 'equals', 'procesar']]],
  ['ya procesado', [['$json.resultado?.decision ?? ""', 'equals', 'omitir_ya_procesado']]]
], 'decisión desconocida', '{ ok: true, op: \'decidir_procesado\', resultado: { decision: \'procesar\' } }');

codigo('prepararInforme', N.prepararInforme, `
const ctx = ${ENTRADA};
const ini = ${SALIDA(N.nucleoIniciar)}.resultado;
const descarga = ${SALIDA(N.descargar)};
const contenido = descarga.formato === 'xlsx' ? { formato: 'filas', filas: descarga.filas } : { formato: 'csv', texto: descarga.texto };
return [{ json: { op: 'preparar', entrada: { config: ctx.config, guardias: ${GUARDIAS_INI}, fecha_corte: ini.fecha_corte, contenido: contenido } } }];
`, { onError: 'continueErrorOutput', muestra: "{ op: 'preparar', entrada: {} }" });

nucleo('nucleoPreparar', N.nucleoPreparar, 'preparar');

ruta('rutaEntrega', N.rutaEntrega, [
  ['núcleo con error', [['String($json.ok)', 'notEquals', 'true']]],
  ['informe por enlace', [['$json.resultado?.tipo ?? ""', 'equals', 'informe'], [ENTRADA + '.config.entrega', 'equals', 'enlace_salida']]]
], 'directo', '{ ok: true, op: \'preparar\', resultado: { tipo: \'informe\' } }');

codigo('prepararSubida', N.prepararSubida, `
const ctx = ${ENTRADA};
if (ctx.fallos.indexOf('subir') >= 0) throw new Error('E_DRIVE_SUBIR');
const informe = ${SALIDA(N.nucleoPreparar)}.resultado.informe;
const id = 'InformeSim' + ctx.config.cliente_id.replace(/[^A-Za-z0-9]/g, '') + ctx.ejecucion_id;
return [{ json: { cliente_id: ctx.config.cliente_id, archivo_id: id, nombre: informe.nombre_archivo, contenido: informe.html_completo, creado_utc: ctx.ahora_utc } }];
`, { onError: 'continueErrorOutput', muestra: "{ cliente_id: 'demo-01', archivo_id: 'InformeSim1', nombre: 'informe.html', contenido: '', creado_utc: '2026-10-05T11:30:00Z' }" });

tablaInsertar('subirInforme', N.subirInforme, 'cob_dev_drive_salida', {
  cliente_id: expr('$json.cliente_id'), archivo_id: expr('$json.archivo_id'), nombre: expr('$json.nombre'), contenido: expr('$json.contenido'), creado_utc: expr('$json.creado_utc')
}, { onError: 'continueErrorOutput' });

codigo('prepararArmado', N.prepararArmado, `
const ctx = ${ENTRADA};
const ini = ${SALIDA(N.nucleoIniciar)}.resultado;
const elegido = ${SALIDA(N.nucleoElegir)}.resultado.archivo;
const preparado = ${SALIDA(N.nucleoPreparar)}.resultado;
const hash = ${SALIDA(N.huella)}.hash;
let enlace;
if ($('${N.subirInforme}').isExecuted) enlace = 'https://drive.google.com/file/d/' + $('${N.subirInforme}').first(0).json.archivo_id + '/view';
return [{ json: { op: 'armar_envio', entrada: {
  config: ctx.config, guardias: ${GUARDIAS_INI}, fecha_corte: ini.fecha_corte, fecha_exportacion: elegido.modificado_fecha, tipo: preparado.tipo,
  preparado: preparado, enlace_informe: enlace, hash_archivo: hash, iniciada_utc: ctx.ahora_utc, terminada_utc: ctx.ahora_utc
} } }];
`, { onError: 'continueErrorOutput', muestra: "{ op: 'armar_envio', entrada: {} }" });

nucleo('nucleoArmar', N.nucleoArmar, 'armar_envio');

decision('envioArmado', N.envioArmado, condicion('String($json.ok)', 'equals', 'true'));

codigo('prepararCorreo', N.prepararCorreo, `
const ctx = ${ENTRADA};
if (ctx.fallos.indexOf('enviar') >= 0) throw new Error('E_CORREO_ENVIAR');
const r = ${SALIDA(N.nucleoArmar)}.resultado;
const adjunto = r.correo.adjunto;
return r.envio.destinatarios.map(function (para) {
  return { json: {
    tipo: 'dueno', cliente_id: ctx.config.cliente_id, para: para, asunto: r.correo.asunto, cuerpo_texto: r.correo.cuerpo_texto,
    adjunto_nombre: adjunto ? adjunto.nombre : '', adjunto_bytes: adjunto ? Buffer.byteLength(adjunto.contenido, 'utf8') : 0, creado_utc: ctx.ahora_utc
  } };
});
`, { onError: 'continueErrorOutput', muestra: "{ tipo: 'dueno', cliente_id: 'demo-01', para: 'a@b.example', asunto: '', cuerpo_texto: '', adjunto_nombre: '', adjunto_bytes: 0, creado_utc: '2026-10-05T11:30:00Z' }" });

const MAPA_CORREO = {
  tipo: expr('$json.tipo'), cliente_id: expr('$json.cliente_id'), para: expr('$json.para'), asunto: expr('$json.asunto'), cuerpo_texto: expr('$json.cuerpo_texto'),
  adjunto_nombre: expr('$json.adjunto_nombre'), adjunto_bytes: expr('$json.adjunto_bytes'), creado_utc: expr('$json.creado_utc')
};
tablaInsertar('enviarCorreo', N.enviarCorreo, 'cob_dev_correos', MAPA_CORREO, { onError: 'continueErrorOutput' });

codigo('prepararLibro', N.prepararLibro, `
return [{ json: ${SALIDA(N.nucleoArmar)}.resultado.libro }];
`, { onError: 'continueErrorOutput', muestra: "{ clave: 'demo-01|2026-W41|0', cliente_id: 'demo-01' }" });

const MAPA_LIBRO = {
  clave: expr('$json.clave'), cliente_id: expr('$json.cliente_id'), semana_iso: expr('$json.semana_iso'), hash_archivo: expr('$json.hash_archivo'), estado: expr('$json.estado'),
  iniciada_utc: expr('$json.iniciada_utc'), terminada_utc: expr('$json.terminada_utc'), n_filas: expr('$json.n_filas'), n_vencidas: expr('$json.n_vencidas'),
  n_apartadas: expr('$json.n_apartadas'), codigo_error: expr('$json.codigo_error'), modo: expr('$json.modo')
};
tablaInsertar('escribirLibro', N.escribirLibro, 'cob_dev_ejecuciones', MAPA_LIBRO, { onError: 'continueErrorOutput' });

// Libera SOLO el bloqueo que tomó esta ejecución (mismo cliente y misma caducidad): el de otra ejecución no se toca nunca.
const FILTRO_SOLTAR = [
  ['cliente_id', expr(CLIENTE)],
  ['expira_utc', expr('$("' + N.nucleoIniciar + '").isExecuted ? ($("' + N.nucleoIniciar + '").first(0).json.resultado?.bloqueo_nuevo?.expira_utc ?? "SIN-BLOQUEO") : "SIN-BLOQUEO"')]
];
tablaBorrar('soltarBloqueo', N.soltarBloqueo, 'cob_dev_bloqueos', FILTRO_SOLTAR, { onError: 'continueErrorOutput' });

codigo('finEnvio', N.finEnvio, `
const ini = ${SALIDA(N.nucleoIniciar)}.resultado;
const r = ${SALIDA(N.nucleoArmar)}.resultado;
const libro = r.libro;
let estado = 'incidencia_enviada';
if (libro.codigo_error === 'E_SIN_ARCHIVO') estado = 'aviso_sin_archivo';
else if (libro.estado === 'ok') estado = 'informe_enviado';
const salida = { estado: estado, fecha_corte: ini.fecha_corte, envio: r.envio.accion };
if (estado !== 'aviso_sin_archivo') salida.hash = libro.hash_archivo;
return [{ json: salida }];
`, { muestra: "{ estado: 'informe_enviado', fecha_corte: '2026-10-05', envio: 'redirigir_ensayo', hash: '' }" });

/* --- «no llegó la exportación» */

codigo('prepararAviso', N.prepararAviso, `
const ctx = ${ENTRADA};
const ini = ${SALIDA(N.nucleoIniciar)}.resultado;
return [{ json: { op: 'decidir_aviso', entrada: { config: ctx.config, fecha_corte: ini.fecha_corte, filas_libro: ${LEER_FILAS(N.leerLibro)} } } }];
`, { onError: 'continueErrorOutput', muestra: "{ op: 'decidir_aviso', entrada: {} }" });

nucleo('nucleoAviso', N.nucleoAviso, 'decidir_aviso');

ruta('rutaAviso', N.rutaAviso, [
  ['núcleo con error', [['String($json.ok)', 'notEquals', 'true']]],
  ['avisar', [['$json.resultado?.decision ?? ""', 'equals', 'avisar']]]
], 'sin aviso', '{ ok: true, op: \'decidir_aviso\', resultado: { decision: \'avisar\' } }');

codigo('prepararArmadoAviso', N.prepararArmadoAviso, `
const ctx = ${ENTRADA};
const ini = ${SALIDA(N.nucleoIniciar)}.resultado;
return [{ json: { op: 'armar_envio', entrada: {
  config: ctx.config, guardias: ${GUARDIAS_INI}, fecha_corte: ini.fecha_corte, tipo: 'sin_archivo', iniciada_utc: ctx.ahora_utc, terminada_utc: ctx.ahora_utc
} } }];
`, { onError: 'continueErrorOutput', muestra: "{ op: 'armar_envio', entrada: {} }" });

tablaBorrar('soltarSinEnvio', N.soltarSinEnvio, 'cob_dev_bloqueos', FILTRO_SOLTAR, { onError: 'continueErrorOutput' });

codigo('finSinEnvio', N.finSinEnvio, `
const ini = ${SALIDA(N.nucleoIniciar)}.resultado;
const estado = $('${N.nucleoDecidir}').isExecuted ? 'ya_procesado' : 'sin_archivo_' + ${SALIDA(N.nucleoAviso)}.resultado.decision;
return [{ json: { estado: estado, fecha_corte: ini.fecha_corte } }];
`, { muestra: "{ estado: 'ya_procesado', fecha_corte: '2026-10-05' }" });

/* --- el día termina sin trabajo, o solo con un aviso a Javier */

codigo('finSinTrabajo', N.finSinTrabajo, `
const r = ${SALIDA(N.nucleoIniciar)}.resultado;
return [{ json: r.accion === 'omitir_en_curso' ? { estado: 'omitida_en_curso', fecha_corte: r.fecha_corte } : { estado: 'detenida', motivo: r.motivo, fecha_corte: r.fecha_corte } }];
`, { muestra: "{ estado: 'detenida', motivo: 'INTERRUPTOR_APAGADO', fecha_corte: '2026-10-05' }" });

codigo('prepararAvisoSinLibro', N.prepararAvisoSinLibro, `
const ctx = ${ENTRADA};
const r = ${SALIDA(N.nucleoIniciar)}.resultado;
return [{ json: { op: 'error', entrada: {
  codigo: r.codigo,
  contexto: { cliente_id: ctx.config.cliente_id, workflow: ctx.workflow, nodo: r.accion === 'alertar_bloqueo_vencido' ? 'Bloqueo' : 'Arranque', ejecucion_id: ctx.ejecucion_id },
  operador: ctx.operador, problemas: r.problemas
} } }];
`, { onError: 'continueErrorOutput', muestra: "{ op: 'error', entrada: {} }" });

nucleo('nucleoAvisoOperador', N.nucleoAvisoOperador, 'error', { onError: 'continueRegularOutput' });

decision('hayDestinoAviso', N.hayDestinoAviso, condicion('$("' + N.nucleoAvisoOperador + '").first(0).json.resultado?.alerta?.envio?.accion ?? "no_enviar"', 'notEquals', 'no_enviar'));

const CORREO_OPERADOR = (nodoNucleo) => `
const ctx = ${ENTRADA};
const a = ${SALIDA(nodoNucleo)}.resultado.alerta;
const base = { cliente_id: ctx.config.cliente_id, asunto: a.texto.asunto, cuerpo_texto: a.texto.cuerpo_texto, adjunto_nombre: '', adjunto_bytes: 0, creado_utc: ctx.ahora_utc };
// con el correo caído el aviso no sale: queda anotado el intento fallido
if (ctx.fallos.indexOf('enviar') >= 0) return [{ json: Object.assign({ tipo: 'operador_fallido', para: a.envio.destinatarios.join(',') }, base) }];
return a.envio.destinatarios.map(function (para) { return { json: Object.assign({ tipo: 'operador', para: para }, base) }; });
`;
codigo('prepararCorreoAviso', N.prepararCorreoAviso, CORREO_OPERADOR(N.nucleoAvisoOperador), { muestra: "{ tipo: 'operador', cliente_id: 'demo-01', para: 'javier@ejemplo.example', asunto: '', cuerpo_texto: '', adjunto_nombre: '', adjunto_bytes: 0, creado_utc: '2026-10-05T11:30:00Z' }" });
tablaInsertar('enviarCorreoAviso', N.enviarCorreoAviso, 'cob_dev_correos', MAPA_CORREO, { onError: 'continueRegularOutput' });

codigo('finAviso', N.finAviso, `
const r = ${SALIDA(N.nucleoIniciar)}.resultado;
return [{ json: r.accion === 'alertar_bloqueo_vencido' ? { estado: 'bloqueo_vencido', fecha_corte: r.fecha_corte } : { estado: 'detenida', motivo: r.motivo, fecha_corte: r.fecha_corte } }];
`, { muestra: "{ estado: 'detenida', motivo: 'CONFIG_INVALIDA', fecha_corte: '2026-10-05' }" });

/* --- cuando algo falla: todo pasa por aquí y de aquí solo salen códigos */

codigoFijo('codTablaLeer', N.codTablaLeer, 'E_TABLA_LEER', 'Tablas');
codigoFijo('codTablaEscribir', N.codTablaEscribir, 'E_TABLA_ESCRIBIR', 'Tablas');
codigoFijo('codCarpetaListar', N.codCarpetaListar, 'E_DRIVE_LISTAR', 'Carpeta de entrada');
codigoFijo('codCarpetaDescargar', N.codCarpetaDescargar, 'E_DRIVE_DESCARGAR', 'Carpeta de entrada');
codigoFijo('codCarpetaSubir', N.codCarpetaSubir, 'E_DRIVE_SUBIR', 'Carpeta de salida');
codigoFijo('codCorreo', N.codCorreo, 'E_CORREO_ENVIAR', 'Correo');
codigoFijo('codHuella', N.codHuella, 'E_HUELLA', 'Huella');
codigoFijo('codNucleo', N.codNucleo, 'E_NUCLEO_FALLO', 'Núcleo');
codigoFijo('codFlujo', N.codFlujo, 'E_FLUJO_FALLO', 'Flujo');
codigoFijo('codAmbiguo', N.codAmbiguo, 'E_ARCHIVO_AMBIGUO', 'Carpeta de entrada');
def('codResultado', {
  tipo: 'set', nombre: N.codResultado,
  asignaciones: [['codigo', expr('$json.codigo ?? $json.resultado?.codigo ?? "E_DESCONOCIDO"'), 'string'], ['nodo', q('Núcleo'), 'string']],
  muestra: "{ codigo: 'E_DESCONOCIDO', nodo: 'Núcleo' }"
});

codigo('prepararError', N.prepararError, `
const ctx = ${ENTRADA};
const ini = $('${N.nucleoIniciar}').isExecuted ? ${SALIDA(N.nucleoIniciar)} : null;
const r = ini && ini.ok ? ini.resultado : null;
const hash = $('${N.huella}').isExecuted ? ${SALIDA(N.huella)}.hash : undefined;
return [{ json: { op: 'error', entrada: {
  codigo: $json.codigo,
  contexto: { cliente_id: ctx.config.cliente_id, workflow: ctx.workflow, nodo: $json.nodo, ejecucion_id: ctx.ejecucion_id },
  operador: ctx.operador, cliente_id: ctx.config.cliente_id, fecha_corte: r ? r.fecha_corte : undefined, hash_archivo: hash,
  iniciada_utc: ctx.ahora_utc, terminada_utc: ctx.ahora_utc, guardias: r ? r.guardias : null, modo_cliente: ctx.config.modo
} } }];
`, { muestra: "{ op: 'error', entrada: {} }" });

nucleo('nucleoError', N.nucleoError, 'error', { onError: 'continueRegularOutput' });

decision('hayFila', N.hayFila, condicion('$json.resultado?.fila ? "si" : "no"', 'equals', 'si'));

const MAPA_LIBRO_ERROR = {};
Object.keys(MAPA_LIBRO).forEach((k) => { MAPA_LIBRO_ERROR[k] = expr('$json.resultado.fila.' + k); });
tablaInsertar('escribirLibroError', N.escribirLibroError, 'cob_dev_ejecuciones', MAPA_LIBRO_ERROR, { onError: 'continueRegularOutput' });
tablaBorrar('soltarError', N.soltarError, 'cob_dev_bloqueos', FILTRO_SOLTAR, { onError: 'continueRegularOutput' });

decision('hayDestino', N.hayDestino, condicion('$("' + N.nucleoError + '").first(0).json.resultado?.alerta?.envio?.accion ?? "no_enviar"', 'notEquals', 'no_enviar'));
codigo('prepararCorreoOperador', N.prepararCorreoOperador, CORREO_OPERADOR(N.nucleoError), { muestra: "{ tipo: 'operador', cliente_id: 'demo-01', para: 'javier@ejemplo.example', asunto: '', cuerpo_texto: '', adjunto_nombre: '', adjunto_bytes: 0, creado_utc: '2026-10-05T11:30:00Z' }" });
tablaInsertar('enviarCorreoOperador', N.enviarCorreoOperador, 'cob_dev_correos', MAPA_CORREO, { onError: 'continueRegularOutput' });

codigo('finError', N.finError, `
const r = ${SALIDA(N.nucleoError)};
const ini = $('${N.nucleoIniciar}').isExecuted ? ${SALIDA(N.nucleoIniciar)} : null;
if (r.ok !== true) throw new Error('E_NUCLEO_FALLO');
const sano = r.resultado.alerta.sano;
return [{ json: { estado: 'error', codigo: sano.codigo, nodo: sano.nodo, fecha_corte: ini && ini.ok === true ? ini.resultado.fecha_corte : null } }];
`, { muestra: "{ estado: 'error', codigo: 'E_DRIVE_LISTAR', nodo: 'Carpeta de entrada', fecha_corte: '2026-10-05' }" });

/* ------------------------------------------------------------- conexiones */
/* siguiente: nodo al que va la salida normal · error: nodo al que va la salida de error ·
   ramas (IF): [verdadero, falso] · casos (Switch): índice → nodo (el último índice es el «resto») */

function conectar(v, c) { Object.assign(nodos[v], c); }

conectar('disparador', { siguiente: 'entrada' });
conectar('entrada', { siguiente: 'leerInterruptor' });
conectar('leerInterruptor', { siguiente: 'leerBloqueos', error: 'codTablaLeer' });
conectar('leerBloqueos', { siguiente: 'prepararInicio', error: 'codTablaLeer' });
conectar('prepararInicio', { siguiente: 'nucleoIniciar', error: 'codFlujo' });
conectar('nucleoIniciar', { siguiente: 'rutaDia', error: 'codNucleo' });
conectar('rutaDia', { casos: ['codResultado', 'escribirBloqueo', 'codResultado', 'prepararAvisoSinLibro', 'finSinTrabajo'] });
conectar('escribirBloqueo', { siguiente: 'leerLibro', error: 'codTablaEscribir' });
conectar('leerLibro', { siguiente: 'leerCarpeta', error: 'codTablaLeer' });
conectar('leerCarpeta', { siguiente: 'prepararEleccion', error: 'codTablaLeer' });
conectar('prepararEleccion', { siguiente: 'nucleoElegir', error: 'codCarpetaListar' });
conectar('nucleoElegir', { siguiente: 'rutaCarpeta', error: 'codNucleo' });
conectar('rutaCarpeta', { casos: ['codResultado', 'descargar', 'prepararAviso', 'codAmbiguo', 'codNucleo'] });
conectar('descargar', { siguiente: 'huella', error: 'codCarpetaDescargar' });
conectar('huella', { siguiente: 'prepararDecision', error: 'codHuella' });
conectar('prepararDecision', { siguiente: 'nucleoDecidir', error: 'codFlujo' });
conectar('nucleoDecidir', { siguiente: 'rutaProcesar', error: 'codNucleo' });
conectar('rutaProcesar', { casos: ['codResultado', 'prepararInforme', 'soltarSinEnvio', 'codNucleo'] });
conectar('prepararInforme', { siguiente: 'nucleoPreparar', error: 'codFlujo' });
conectar('nucleoPreparar', { siguiente: 'rutaEntrega', error: 'codNucleo' });
conectar('rutaEntrega', { casos: ['codResultado', 'prepararSubida', 'prepararArmado'] });
conectar('prepararSubida', { siguiente: 'subirInforme', error: 'codCarpetaSubir' });
conectar('subirInforme', { siguiente: 'prepararArmado', error: 'codCarpetaSubir' });
conectar('prepararArmado', { siguiente: 'nucleoArmar', error: 'codFlujo' });
conectar('nucleoArmar', { siguiente: 'envioArmado', error: 'codNucleo' });
conectar('envioArmado', { ramas: ['prepararCorreo', 'codResultado'] });
conectar('prepararCorreo', { siguiente: 'enviarCorreo', error: 'codCorreo' });
conectar('enviarCorreo', { siguiente: 'prepararLibro', error: 'codCorreo' });
conectar('prepararLibro', { siguiente: 'escribirLibro', error: 'codFlujo' });
conectar('escribirLibro', { siguiente: 'soltarBloqueo', error: 'codTablaEscribir' });
conectar('soltarBloqueo', { siguiente: 'finEnvio', error: 'codTablaEscribir' });
conectar('prepararAviso', { siguiente: 'nucleoAviso', error: 'codFlujo' });
conectar('nucleoAviso', { siguiente: 'rutaAviso', error: 'codNucleo' });
conectar('rutaAviso', { casos: ['codResultado', 'prepararArmadoAviso', 'soltarSinEnvio'] });
conectar('prepararArmadoAviso', { siguiente: 'nucleoArmar', error: 'codFlujo' });
conectar('soltarSinEnvio', { siguiente: 'finSinEnvio', error: 'codTablaEscribir' });
conectar('prepararAvisoSinLibro', { siguiente: 'nucleoAvisoOperador', error: 'codFlujo' });
conectar('nucleoAvisoOperador', { siguiente: 'hayDestinoAviso' });
conectar('hayDestinoAviso', { ramas: ['prepararCorreoAviso', 'finAviso'] });
conectar('prepararCorreoAviso', { siguiente: 'enviarCorreoAviso' });
conectar('enviarCorreoAviso', { siguiente: 'finAviso' });
['codTablaLeer', 'codTablaEscribir', 'codCarpetaListar', 'codCarpetaDescargar', 'codCarpetaSubir', 'codCorreo', 'codHuella', 'codNucleo', 'codFlujo', 'codAmbiguo', 'codResultado']
  .forEach((v) => conectar(v, { siguiente: 'prepararError' }));
conectar('prepararError', { siguiente: 'nucleoError' });
conectar('nucleoError', { siguiente: 'hayFila' });
conectar('hayFila', { ramas: ['escribirLibroError', 'soltarError'] });
conectar('escribirLibroError', { siguiente: 'soltarError' });
conectar('soltarError', { siguiente: 'hayDestino' });
conectar('hayDestino', { ramas: ['prepararCorreoOperador', 'finError'] });
conectar('prepararCorreoOperador', { siguiente: 'enviarCorreoOperador' });
conectar('enviarCorreoOperador', { siguiente: 'finError' });

/* ---------------------------------------------------------------- render */

function posiciones() {
  // capas por distancia desde el disparador; dentro de cada capa, una fila por nodo
  const capa = { disparador: 0 };
  const cola = ['disparador'];
  const destinos = (n) => [].concat(n.siguiente || [], n.error || [], n.ramas || [], n.casos || []);
  while (cola.length) {
    const v = cola.shift();
    destinos(nodos[v]).forEach((d) => { if (capa[d] === undefined) { capa[d] = capa[v] + 1; cola.push(d); } });
  }
  const porCapa = {};
  const pos = {};
  orden.forEach((v) => {
    const c = capa[v] === undefined ? 0 : capa[v];
    porCapa[c] = (porCapa[c] || 0) + 1;
    pos[v] = [240 + c * 280, 120 + (porCapa[c] - 1) * 170];
  });
  return pos;
}

function parametros(n) {
  switch (n.tipo) {
    case 'code':
      return '{ mode: \'runOnceForAllItems\', language: \'javaScript\', jsCode: `' + paraPlantilla(n.js) + '` }';
    case 'set':
      return '{ mode: \'manual\', includeOtherFields: false, assignments: { assignments: [' +
        n.asignaciones.map(([nombre, valor, tipo], i) => '{ id: ' + q(n.v + '-' + (i + 1)) + ', name: ' + q(nombre) + ', value: ' + valor + ', type: ' + q(tipo) + ' }').join(', ') + '] } }';
    case 'dtGet': {
      const base = 'resource: \'row\', operation: \'get\', dataTableId: ' + TABLA(n.tabla);
      const filtro = n.filtro ? ', matchType: \'allConditions\', filters: { conditions: [{ keyName: ' + q(n.filtro[0]) + ', condition: \'eq\', keyValue: ' + n.filtro[1] + ' }] }' : '';
      return '{ ' + base + filtro + ', returnAll: true }';
    }
    case 'dtInsert': {
      const cols = COLUMNAS[n.tabla];
      return '{ resource: \'row\', operation: \'insert\', dataTableId: ' + TABLA(n.tabla) + ',\n      columns: {\n        mappingMode: \'defineBelow\',\n        value: {\n' +
        cols.map(([c]) => '          ' + c + ': ' + n.mapa[c]).join(',\n') + '\n        },\n        schema: [\n' +
        cols.map(([c, t]) => '          { id: ' + q(c) + ', displayName: ' + q(c) + ', required: false, defaultMatch: false, display: true, type: ' + q(t) + ', canBeUsedToMatch: true }').join(',\n') + '\n        ]\n      } }';
    }
    case 'dtDelete':
      return '{ resource: \'row\', operation: \'deleteRows\', dataTableId: ' + TABLA(n.tabla) + ', matchType: \'allConditions\', filters: { conditions: [' +
        n.filtros.map(([c, val]) => '{ keyName: ' + q(c) + ', condition: \'eq\', keyValue: ' + val + ' }').join(', ') + '] } }';
    case 'exec':
      return '{ mode: \'once\', source: \'database\', workflowId: { __rl: true, mode: \'id\', value: ' + q(ID_NUCLEO) + ' }, options: { waitForSubWorkflow: true } }';
    case 'crypto':
      return '{ action: \'hash\', type: \'SHA256\', value: ' + expr('$json.para_huella') + ', dataPropertyName: \'hash\', encoding: \'hex\' }';
    case 'switch':
      return '{ mode: \'rules\', rules: { values: [\n' + n.reglas.map(([clave, conds]) => '        { outputKey: ' + q(clave) + ', renameOutput: true, conditions: ' + condiciones(conds.map(([i, op, d]) => [i, op, d])) + ' }').join(',\n') +
        '\n      ] }, options: { fallbackOutput: \'extra\', renameFallbackOutput: ' + q(n.fallback) + ' } }';
    case 'if':
      return '{ conditions: ' + n.cond + ' }';
    default:
      return '{}';
  }
}

const TIPO_NODO = {
  code: ["'n8n-nodes-base.code'", 2], set: ["'n8n-nodes-base.set'", 3.5], dtGet: ["'n8n-nodes-base.dataTable'", 1.1], dtInsert: ["'n8n-nodes-base.dataTable'", 1.1], dtDelete: ["'n8n-nodes-base.dataTable'", 1.1],
  exec: ["'n8n-nodes-base.executeWorkflow'", 1.3], crypto: ["'n8n-nodes-base.crypto'", 2], switch: ["'n8n-nodes-base.switch'", 3.4], if: ["'n8n-nodes-base.if'", 2.3], trigger: ["'n8n-nodes-base.manualTrigger'", 1]
};

function declaracion(n, pos) {
  const [tipo, version] = TIPO_NODO[n.tipo];
  const cuerpo = ['name: ' + q(n.nombre)].concat(flagsDe(n));
  if (n.tipo !== 'trigger') cuerpo.push('parameters: ' + parametros(n));
  cuerpo.push('position: [' + pos[0] + ', ' + pos[1] + ']');
  const salida = n.tipo === 'if' ? '' : ',\n  output: [' + n.muestra + ']';
  const fabrica = n.tipo === 'trigger' ? 'trigger' : n.tipo === 'if' ? 'ifElse' : n.tipo === 'switch' ? 'switchCase' : 'node';
  const tipoParam = fabrica === 'ifElse' || fabrica === 'switchCase' ? '' : '  type: ' + tipo + ',\n';
  return 'const ' + n.v + ' = ' + fabrica + '({\n' + tipoParam + '  version: ' + version + ',\n  config: { ' + cuerpo.join(', ') + ' }' + salida + '\n});\n';
}

// Expresión encadenada de un nodo y todo lo que cuelga de él; la primera vez que aparece un nodo lleva su continuación,
// las demás veces (varias entradas al mismo nodo) solo se nombra. Cada llamada va en su línea, con sangría por nivel.
function expresion(v, emitidos, nivel) {
  if (emitidos.has(v)) return v;
  emitidos.add(v);
  const n = nodos[v];
  const sg = '\n' + '  '.repeat(nivel + 1);
  if (n.tipo === 'if') return v + sg + '.onTrue(' + expresion(n.ramas[0], emitidos, nivel + 2) + ')' + sg + '.onFalse(' + expresion(n.ramas[1], emitidos, nivel + 2) + ')';
  if (n.tipo === 'switch') return v + n.casos.map((d, i) => sg + '.onCase(' + i + ', ' + expresion(d, emitidos, nivel + 2) + ')').join('');
  // Primero «.onError», después «.to»: el SDK de n8n engancha un «.onError» escrito DESPUÉS de un «.to» al último nodo de la
  // cadena, no al nodo al que se le escribió (comprobado contra n8n: ver n8n/comparar-despliegue.js).
  let s = v;
  if (n.error) s += sg + '.onError(' + expresion(n.error, emitidos, nivel + 2) + ')';
  if (n.siguiente) s += sg + '.to(' + expresion(n.siguiente, emitidos, nivel + 1) + ')';
  return s;
}

function generar() {
  const pos = posiciones();
  const partes = [];
  partes.push("import { workflow, node, trigger, ifElse, switchCase, sticky, expr } from '@n8n/workflow-sdk';\n");
  orden.forEach((v) => partes.push(declaracion(nodos[v], pos[v])));
  partes.push(
    "const notaCabecera = sticky('[COB-DEV] Shell demo-01. Banco de pruebas con datos ficticios: la carpeta de entrada, la de salida y el correo son TABLAS (cob_dev_*). " +
    "Nada sale de n8n. Todo lo que se decide lo decide el subflujo «[COB-DEV] Núcleo (puro)»; este flujo solo lee y escribe filas y obedece. No se publica.', [" + 'entrada' + "], { color: 4 });\n");
  const emitidos = new Set(['disparador']);
  partes.push("export default workflow('cob-dev-shell-demo-01', '[COB-DEV] Shell demo-01')\n  .add(disparador)\n  .to(" + expresion('entrada', emitidos, 1) + ')\n  .add(notaCabecera);\n');
  const faltan = orden.filter((v) => !emitidos.has(v));
  if (faltan.length) throw new Error('nodos sin conectar: ' + faltan.join(', '));
  const sdk = partes.join('\n');

  const aristas = [];
  orden.forEach((v) => {
    const n = nodos[v];
    if (n.siguiente) aristas.push({ de: n.nombre, salida: 'main', a: nodos[n.siguiente].nombre });
    if (n.error) aristas.push({ de: n.nombre, salida: 'error', a: nodos[n.error].nombre });
    if (n.ramas) { aristas.push({ de: n.nombre, salida: 'true', a: nodos[n.ramas[0]].nombre }); aristas.push({ de: n.nombre, salida: 'false', a: nodos[n.ramas[1]].nombre }); }
    if (n.casos) n.casos.forEach((d, i) => aristas.push({ de: n.nombre, salida: 'caso ' + i, a: nodos[d].nombre }));
  });
  const spec = {
    nodos: orden.map((v) => ({ nombre: nodos[v].nombre, tipo: nodos[v].tipo, onError: nodos[v].onError || null, codigo: nodos[v].tipo === 'code' ? nodos[v].js : undefined })),
    aristas
  };
  return { sdk, spec: JSON.stringify(spec, null, 2) + '\n' };
}

function main() {
  const verificar = process.argv.includes('--verificar');
  const { sdk, spec } = generar();
  const archivos = { 'shell-demo.workflow.ts': sdk, 'shell-demo.spec.json': spec };
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
  if (verificar && distintos) { console.error('\n' + distintos + ' archivo(s) desactualizados: ejecutar «node n8n/generar-shell.js».'); process.exit(1); }
}

if (require.main === module) main();
module.exports = { generar, N, ID_NUCLEO };
