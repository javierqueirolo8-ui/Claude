import { workflow, node, trigger, ifElse, switchCase, sticky, expr } from '@n8n/workflow-sdk';

const disparador = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Disparador manual', position: [240, 120] },
  output: [{}]
});

const entrada = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'DEV · Entrada', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `// Solo para el banco de pruebas: la configuración del cliente ficticio y el reloj llegan en el pedido de la prueba.
// En producción la configuración la fija Javier en este nodo y el reloj es el del servidor.
const pedido = $input.first().json || {};
const base = {"cliente_id":"demo-01","empresa":{"nombre":"Ferretería Ficticia S.R.L.","medios_pago":"Pueden abonarla por transferencia a la cuenta ficticia 000-000000-0.","firma":"Administración\\nFerretería Ficticia S.R.L."},"destinatarios_permitidos":["administracion@ferreteria-ficticia.example"],"remitente_prueba":"bandeja.de.pruebas@ejemplo.example","entrega":"enlace_salida","modo":"dry_run","zona_horaria":"America/Montevideo","patron_nombre_archivo":"*","antiguedad_maxima_archivo_dias":8,"umbral_rechazo":20,"ignorar_filas_de_total":true,"formato_importe":{"decimal":",","miles":"."},"monedas_admitidas":["UYU","USD"],"mapeo_columnas":{"factura":["Nro Factura"],"deudor":["Cliente"],"importe":["Saldo"],"moneda":["Moneda"],"emision":["Fecha Emisión"],"vencimiento":["Vencimiento"],"telefono":["Teléfono"],"correo":["Email"],"en_disputa":["En disputa"]}};
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
` }, position: [520, 120] },
  output: [{ config: {}, ahora_utc: '2026-10-05T11:30:00Z', fallos: [], operador: 'javier@ejemplo.example', workflow: '[COB-DEV] Shell demo-01', ejecucion_id: '1' }]
});

const leerInterruptor = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Leer interruptor general', onError: 'continueErrorOutput', executeOnce: true, alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_config_global' }, returnAll: true }, position: [800, 120] },
  output: [{ id: 1 }]
});

const leerBloqueos = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Leer bloqueos del cliente', onError: 'continueErrorOutput', executeOnce: true, alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_bloqueos' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("DEV · Entrada").first(0).json.config.cliente_id }}') }] }, returnAll: true }, position: [1080, 120] },
  output: [{ id: 1 }]
});

const prepararInicio = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar inicio', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
const filas = function (nodo) { return $(nodo).all(0).map(function (i) { return i.json; }).filter(function (j) { return j.id !== undefined; }); };
return [{ json: { op: 'iniciar', entrada: { config: ctx.config, filas_control: filas('Leer interruptor general'), filas_bloqueo: filas('Leer bloqueos del cliente'), ahora_utc: ctx.ahora_utc } } }];
` }, position: [1360, 120] },
  output: [{ op: 'iniciar', entrada: {} }]
});

const nucleoIniciar = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { name: 'Núcleo · iniciar', onError: 'continueErrorOutput', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'UEhnlNWjhmIa7l1D' }, options: { waitForSubWorkflow: true } }, position: [1640, 120] },
  output: [{ ok: true, op: 'iniciar', resultado: {} }]
});

const rutaDia = switchCase({
  version: 3.4,
  config: { name: '¿Cómo sigue el día?', parameters: { mode: 'rules', rules: { values: [
        { outputKey: 'núcleo con error', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ String($json.ok) }}'), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'true' }], combinator: 'and' } },
        { outputKey: 'continuar', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.resultado?.accion ?? "" }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'continuar' }], combinator: 'and' } },
        { outputKey: 'error al arrancar', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.resultado?.accion ?? "" }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'error' }], combinator: 'and' } },
        { outputKey: 'avisar sin libro', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.resultado?.codigo ?? "" }}'), operator: { type: 'string', operation: 'notEquals' }, rightValue: '' }], combinator: 'and' } }
      ] }, options: { fallbackOutput: 'extra', renameFallbackOutput: 'sin trabajo' } }, position: [1920, 120] },
  output: [{ ok: true, op: 'iniciar', resultado: { accion: 'continuar' } }]
});

const escribirBloqueo = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Escribir bloqueo', onError: 'continueErrorOutput', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_bloqueos' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          cliente_id: expr('{{ $json.resultado.bloqueo_nuevo.cliente_id }}'),
          expira_utc: expr('{{ $json.resultado.bloqueo_nuevo.expira_utc }}')
        },
        schema: [
          { id: 'cliente_id', displayName: 'cliente_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'expira_utc', displayName: 'expira_utc', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      } }, position: [2200, 120] },
  output: [{ id: 1 }]
});

const leerLibro = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Leer libro del cliente', onError: 'continueErrorOutput', executeOnce: true, alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_ejecuciones' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("DEV · Entrada").first(0).json.config.cliente_id }}') }] }, returnAll: true }, position: [2480, 120] },
  output: [{ id: 1 }]
});

const leerCarpeta = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Drive · leer carpeta (simulado)', onError: 'continueErrorOutput', executeOnce: true, alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_drive_entrada' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("DEV · Entrada").first(0).json.config.cliente_id }}') }] }, returnAll: true }, position: [2760, 120] },
  output: [{ id: 1 }]
});

const prepararEleccion = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar elección de archivo', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
if (ctx.fallos.indexOf('listar') >= 0) throw new Error('E_DRIVE_LISTAR');
const ini = $("Núcleo · iniciar").first(0).json.resultado;
const archivos = $('Drive · leer carpeta (simulado)').all(0).map(function (i) { return i.json; }).filter(function (j) { return j.id !== undefined; }).map(function (f) {
  return { id: f.archivo_id, name: f.nombre, mimeType: f.mime_type, size: f.tamano, modifiedTime: f.modificado };
});
return [{ json: { op: 'elegir_archivo', entrada: { config: ctx.config, archivos: archivos, fecha_corte: ini.fecha_corte } } }];
` }, position: [3040, 120] },
  output: [{ op: 'elegir_archivo', entrada: {} }]
});

const nucleoElegir = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { name: 'Núcleo · elegir archivo', onError: 'continueErrorOutput', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'UEhnlNWjhmIa7l1D' }, options: { waitForSubWorkflow: true } }, position: [3320, 120] },
  output: [{ ok: true, op: 'elegir_archivo', resultado: {} }]
});

const rutaCarpeta = switchCase({
  version: 3.4,
  config: { name: '¿Qué hay en la carpeta?', parameters: { mode: 'rules', rules: { values: [
        { outputKey: 'núcleo con error', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ String($json.ok) }}'), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'true' }], combinator: 'and' } },
        { outputKey: 'elegido', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.resultado?.estado ?? "" }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'elegido' }], combinator: 'and' } },
        { outputKey: 'sin archivo', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.resultado?.estado ?? "" }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'sin_archivo' }], combinator: 'and' } },
        { outputKey: 'ambiguo', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.resultado?.estado ?? "" }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'ambiguo' }], combinator: 'and' } }
      ] }, options: { fallbackOutput: 'extra', renameFallbackOutput: 'estado desconocido' } }, position: [3600, 120] },
  output: [{ ok: true, op: 'elegir_archivo', resultado: { estado: 'elegido' } }]
});

const descargar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Drive · descargar (simulado)', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
if (ctx.fallos.indexOf('descargar') >= 0) throw new Error('E_DRIVE_DESCARGAR');
const elegido = $("Núcleo · elegir archivo").first(0).json.resultado.archivo;
const filas = $('Drive · leer carpeta (simulado)').all(0).map(function (i) { return i.json; }).filter(function (j) { return j.id !== undefined; }).filter(function (f) { return f.archivo_id === elegido.id; });
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
` }, position: [3880, 120] },
  output: [{ formato: 'csv', texto: '', filas: null, para_huella: '', recibido_bytes: 0 }]
});

const huella = node({
  type: 'n8n-nodes-base.crypto',
  version: 2,
  config: { name: 'Huella SHA-256', onError: 'continueErrorOutput', parameters: { action: 'hash', type: 'SHA256', value: expr('{{ $json.para_huella }}'), dataPropertyName: 'hash', encoding: 'hex' }, position: [4160, 120] },
  output: [{ hash: '' }]
});

const prepararDecision = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar decisión', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
const elegido = $("Núcleo · elegir archivo").first(0).json.resultado.archivo;
const descarga = $("Drive · descargar (simulado)").first(0).json;
const hash = $("Huella SHA-256").first(0).json.hash;
return [{ json: { op: 'decidir_procesado', entrada: {
  cliente_id: ctx.config.cliente_id, fecha_exportacion: elegido.modificado_fecha, hash_archivo: hash,
  esperado_bytes: elegido.bytes, recibido_bytes: descarga.recibido_bytes, filas_libro: $('Leer libro del cliente').all(0).map(function (i) { return i.json; }).filter(function (j) { return j.id !== undefined; })
} } }];
` }, position: [4440, 120] },
  output: [{ op: 'decidir_procesado', entrada: {} }]
});

const nucleoDecidir = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { name: 'Núcleo · decidir procesado', onError: 'continueErrorOutput', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'UEhnlNWjhmIa7l1D' }, options: { waitForSubWorkflow: true } }, position: [4720, 120] },
  output: [{ ok: true, op: 'decidir_procesado', resultado: {} }]
});

const rutaProcesar = switchCase({
  version: 3.4,
  config: { name: '¿Procesar este archivo?', parameters: { mode: 'rules', rules: { values: [
        { outputKey: 'núcleo con error', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ String($json.ok) }}'), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'true' }], combinator: 'and' } },
        { outputKey: 'procesar', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.resultado?.decision ?? "" }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'procesar' }], combinator: 'and' } },
        { outputKey: 'ya procesado', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.resultado?.decision ?? "" }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'omitir_ya_procesado' }], combinator: 'and' } }
      ] }, options: { fallbackOutput: 'extra', renameFallbackOutput: 'decisión desconocida' } }, position: [5000, 120] },
  output: [{ ok: true, op: 'decidir_procesado', resultado: { decision: 'procesar' } }]
});

const prepararInforme = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar informe', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
const ini = $("Núcleo · iniciar").first(0).json.resultado;
const descarga = $("Drive · descargar (simulado)").first(0).json;
const contenido = descarga.formato === 'xlsx' ? { formato: 'filas', filas: descarga.filas } : { formato: 'csv', texto: descarga.texto };
return [{ json: { op: 'preparar', entrada: { config: ctx.config, guardias: { permitido: ini.guardias.permitido, dry_run: ini.guardias.dry_run }, fecha_corte: ini.fecha_corte, contenido: contenido } } }];
` }, position: [5280, 120] },
  output: [{ op: 'preparar', entrada: {} }]
});

const nucleoPreparar = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { name: 'Núcleo · preparar', onError: 'continueErrorOutput', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'UEhnlNWjhmIa7l1D' }, options: { waitForSubWorkflow: true } }, position: [5560, 120] },
  output: [{ ok: true, op: 'preparar', resultado: {} }]
});

const rutaEntrega = switchCase({
  version: 3.4,
  config: { name: '¿Cómo se entrega?', parameters: { mode: 'rules', rules: { values: [
        { outputKey: 'núcleo con error', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ String($json.ok) }}'), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'true' }], combinator: 'and' } },
        { outputKey: 'informe por enlace', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.resultado?.tipo ?? "" }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'informe' }, { leftValue: expr('{{ $("DEV · Entrada").first(0).json.config.entrega }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'enlace_salida' }], combinator: 'and' } }
      ] }, options: { fallbackOutput: 'extra', renameFallbackOutput: 'directo' } }, position: [5840, 120] },
  output: [{ ok: true, op: 'preparar', resultado: { tipo: 'informe' } }]
});

const prepararSubida = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar subida del informe', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
if (ctx.fallos.indexOf('subir') >= 0) throw new Error('E_DRIVE_SUBIR');
const informe = $("Núcleo · preparar").first(0).json.resultado.informe;
const id = 'InformeSim' + ctx.config.cliente_id.replace(/[^A-Za-z0-9]/g, '') + ctx.ejecucion_id;
return [{ json: { cliente_id: ctx.config.cliente_id, archivo_id: id, nombre: informe.nombre_archivo, contenido: informe.html_completo, creado_utc: ctx.ahora_utc } }];
` }, position: [6120, 120] },
  output: [{ cliente_id: 'demo-01', archivo_id: 'InformeSim1', nombre: 'informe.html', contenido: '', creado_utc: '2026-10-05T11:30:00Z' }]
});

const subirInforme = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Drive · subir informe (simulado)', onError: 'continueErrorOutput', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_drive_salida' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          cliente_id: expr('{{ $json.cliente_id }}'),
          archivo_id: expr('{{ $json.archivo_id }}'),
          nombre: expr('{{ $json.nombre }}'),
          contenido: expr('{{ $json.contenido }}'),
          creado_utc: expr('{{ $json.creado_utc }}')
        },
        schema: [
          { id: 'cliente_id', displayName: 'cliente_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'archivo_id', displayName: 'archivo_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'nombre', displayName: 'nombre', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'contenido', displayName: 'contenido', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'creado_utc', displayName: 'creado_utc', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      } }, position: [6400, 120] },
  output: [{ id: 1 }]
});

const prepararArmado = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar armado del envío', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
const ini = $("Núcleo · iniciar").first(0).json.resultado;
const elegido = $("Núcleo · elegir archivo").first(0).json.resultado.archivo;
const preparado = $("Núcleo · preparar").first(0).json.resultado;
const hash = $("Huella SHA-256").first(0).json.hash;
let enlace;
if ($('Drive · subir informe (simulado)').isExecuted) enlace = 'https://drive.google.com/file/d/' + $('Drive · subir informe (simulado)').first(0).json.archivo_id + '/view';
return [{ json: { op: 'armar_envio', entrada: {
  config: ctx.config, guardias: { permitido: ini.guardias.permitido, dry_run: ini.guardias.dry_run }, fecha_corte: ini.fecha_corte, fecha_exportacion: elegido.modificado_fecha, tipo: preparado.tipo,
  preparado: preparado, enlace_informe: enlace, hash_archivo: hash, iniciada_utc: ctx.ahora_utc, terminada_utc: ctx.ahora_utc
} } }];
` }, position: [6120, 290] },
  output: [{ op: 'armar_envio', entrada: {} }]
});

const nucleoArmar = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { name: 'Núcleo · armar envío', onError: 'continueErrorOutput', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'UEhnlNWjhmIa7l1D' }, options: { waitForSubWorkflow: true } }, position: [5000, 290] },
  output: [{ ok: true, op: 'armar_envio', resultado: {} }]
});

const envioArmado = ifElse({
  version: 2.3,
  config: { name: '¿Envío armado?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ String($json.ok) }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'true' }], combinator: 'and' } }, position: [5280, 290] }
});

const prepararCorreo = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar correo', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
if (ctx.fallos.indexOf('enviar') >= 0) throw new Error('E_CORREO_ENVIAR');
const r = $("Núcleo · armar envío").first(0).json.resultado;
const adjunto = r.correo.adjunto;
return r.envio.destinatarios.map(function (para) {
  return { json: {
    tipo: 'dueno', cliente_id: ctx.config.cliente_id, para: para, asunto: r.correo.asunto, cuerpo_texto: r.correo.cuerpo_texto,
    adjunto_nombre: adjunto ? adjunto.nombre : '', adjunto_bytes: adjunto ? Buffer.byteLength(adjunto.contenido, 'utf8') : 0, creado_utc: ctx.ahora_utc
  } };
});
` }, position: [5560, 290] },
  output: [{ tipo: 'dueno', cliente_id: 'demo-01', para: 'a@b.example', asunto: '', cuerpo_texto: '', adjunto_nombre: '', adjunto_bytes: 0, creado_utc: '2026-10-05T11:30:00Z' }]
});

const enviarCorreo = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Correo · enviar (simulado)', onError: 'continueErrorOutput', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_correos' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          tipo: expr('{{ $json.tipo }}'),
          cliente_id: expr('{{ $json.cliente_id }}'),
          para: expr('{{ $json.para }}'),
          asunto: expr('{{ $json.asunto }}'),
          cuerpo_texto: expr('{{ $json.cuerpo_texto }}'),
          adjunto_nombre: expr('{{ $json.adjunto_nombre }}'),
          adjunto_bytes: expr('{{ $json.adjunto_bytes }}'),
          creado_utc: expr('{{ $json.creado_utc }}')
        },
        schema: [
          { id: 'tipo', displayName: 'tipo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'cliente_id', displayName: 'cliente_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'para', displayName: 'para', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'asunto', displayName: 'asunto', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'cuerpo_texto', displayName: 'cuerpo_texto', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'adjunto_nombre', displayName: 'adjunto_nombre', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'adjunto_bytes', displayName: 'adjunto_bytes', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'creado_utc', displayName: 'creado_utc', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      } }, position: [5840, 290] },
  output: [{ id: 1 }]
});

const prepararLibro = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar libro', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `return [{ json: $("Núcleo · armar envío").first(0).json.resultado.libro }];
` }, position: [6120, 460] },
  output: [{ clave: 'demo-01|2026-W41|0', cliente_id: 'demo-01' }]
});

const escribirLibro = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Escribir libro', onError: 'continueErrorOutput', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_ejecuciones' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          clave: expr('{{ $json.clave }}'),
          cliente_id: expr('{{ $json.cliente_id }}'),
          semana_iso: expr('{{ $json.semana_iso }}'),
          hash_archivo: expr('{{ $json.hash_archivo }}'),
          estado: expr('{{ $json.estado }}'),
          iniciada_utc: expr('{{ $json.iniciada_utc }}'),
          terminada_utc: expr('{{ $json.terminada_utc }}'),
          n_filas: expr('{{ $json.n_filas }}'),
          n_vencidas: expr('{{ $json.n_vencidas }}'),
          n_apartadas: expr('{{ $json.n_apartadas }}'),
          codigo_error: expr('{{ $json.codigo_error }}'),
          modo: expr('{{ $json.modo }}')
        },
        schema: [
          { id: 'clave', displayName: 'clave', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'cliente_id', displayName: 'cliente_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'semana_iso', displayName: 'semana_iso', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'hash_archivo', displayName: 'hash_archivo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'estado', displayName: 'estado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'iniciada_utc', displayName: 'iniciada_utc', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'terminada_utc', displayName: 'terminada_utc', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'n_filas', displayName: 'n_filas', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'n_vencidas', displayName: 'n_vencidas', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'n_apartadas', displayName: 'n_apartadas', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'codigo_error', displayName: 'codigo_error', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'modo', displayName: 'modo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      } }, position: [6400, 290] },
  output: [{ id: 1 }]
});

const soltarBloqueo = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Soltar bloqueo', onError: 'continueErrorOutput', alwaysOutputData: true, parameters: { resource: 'row', operation: 'deleteRows', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_bloqueos' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("DEV · Entrada").first(0).json.config.cliente_id }}') }, { keyName: 'expira_utc', condition: 'eq', keyValue: expr('{{ $("Núcleo · iniciar").isExecuted ? ($("Núcleo · iniciar").first(0).json.resultado?.bloqueo_nuevo?.expira_utc ?? "SIN-BLOQUEO") : "SIN-BLOQUEO" }}') }] } }, position: [6680, 120] },
  output: [{ id: 1 }]
});

const finEnvio = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Fin · envío', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ini = $("Núcleo · iniciar").first(0).json.resultado;
const r = $("Núcleo · armar envío").first(0).json.resultado;
const libro = r.libro;
let estado = 'incidencia_enviada';
if (libro.codigo_error === 'E_SIN_ARCHIVO') estado = 'aviso_sin_archivo';
else if (libro.estado === 'ok') estado = 'informe_enviado';
const salida = { estado: estado, fecha_corte: ini.fecha_corte, envio: r.envio.accion };
if (estado !== 'aviso_sin_archivo') salida.hash = libro.hash_archivo;
return [{ json: salida }];
` }, position: [6960, 120] },
  output: [{ estado: 'informe_enviado', fecha_corte: '2026-10-05', envio: 'redirigir_ensayo', hash: '' }]
});

const prepararAviso = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar aviso de «no llegó»', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
const ini = $("Núcleo · iniciar").first(0).json.resultado;
return [{ json: { op: 'decidir_aviso', entrada: { config: ctx.config, fecha_corte: ini.fecha_corte, filas_libro: $('Leer libro del cliente').all(0).map(function (i) { return i.json; }).filter(function (j) { return j.id !== undefined; }) } } }];
` }, position: [3880, 290] },
  output: [{ op: 'decidir_aviso', entrada: {} }]
});

const nucleoAviso = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { name: 'Núcleo · decidir aviso', onError: 'continueErrorOutput', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'UEhnlNWjhmIa7l1D' }, options: { waitForSubWorkflow: true } }, position: [4160, 290] },
  output: [{ ok: true, op: 'decidir_aviso', resultado: {} }]
});

const rutaAviso = switchCase({
  version: 3.4,
  config: { name: '¿Avisar?', parameters: { mode: 'rules', rules: { values: [
        { outputKey: 'núcleo con error', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ String($json.ok) }}'), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'true' }], combinator: 'and' } },
        { outputKey: 'avisar', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.resultado?.decision ?? "" }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'avisar' }], combinator: 'and' } }
      ] }, options: { fallbackOutput: 'extra', renameFallbackOutput: 'sin aviso' } }, position: [4440, 290] },
  output: [{ ok: true, op: 'decidir_aviso', resultado: { decision: 'avisar' } }]
});

const prepararArmadoAviso = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar armado del aviso', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
const ini = $("Núcleo · iniciar").first(0).json.resultado;
return [{ json: { op: 'armar_envio', entrada: {
  config: ctx.config, guardias: { permitido: ini.guardias.permitido, dry_run: ini.guardias.dry_run }, fecha_corte: ini.fecha_corte, tipo: 'sin_archivo', iniciada_utc: ctx.ahora_utc, terminada_utc: ctx.ahora_utc
} } }];
` }, position: [4720, 290] },
  output: [{ op: 'armar_envio', entrada: {} }]
});

const soltarSinEnvio = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Soltar bloqueo (sin envío)', onError: 'continueErrorOutput', alwaysOutputData: true, parameters: { resource: 'row', operation: 'deleteRows', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_bloqueos' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("DEV · Entrada").first(0).json.config.cliente_id }}') }, { keyName: 'expira_utc', condition: 'eq', keyValue: expr('{{ $("Núcleo · iniciar").isExecuted ? ($("Núcleo · iniciar").first(0).json.resultado?.bloqueo_nuevo?.expira_utc ?? "SIN-BLOQUEO") : "SIN-BLOQUEO" }}') }] } }, position: [4720, 460] },
  output: [{ id: 1 }]
});

const finSinEnvio = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Fin · sin envío', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ini = $("Núcleo · iniciar").first(0).json.resultado;
const estado = $('Núcleo · decidir procesado').isExecuted ? 'ya_procesado' : 'sin_archivo_' + $("Núcleo · decidir aviso").first(0).json.resultado.decision;
return [{ json: { estado: estado, fecha_corte: ini.fecha_corte } }];
` }, position: [5000, 460] },
  output: [{ estado: 'ya_procesado', fecha_corte: '2026-10-05' }]
});

const finSinTrabajo = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Fin · sin trabajo', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const r = $("Núcleo · iniciar").first(0).json.resultado;
return [{ json: r.accion === 'omitir_en_curso' ? { estado: 'omitida_en_curso', fecha_corte: r.fecha_corte } : { estado: 'detenida', motivo: r.motivo, fecha_corte: r.fecha_corte } }];
` }, position: [2200, 290] },
  output: [{ estado: 'detenida', motivo: 'INTERRUPTOR_APAGADO', fecha_corte: '2026-10-05' }]
});

const prepararAvisoSinLibro = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar aviso sin libro', onError: 'continueErrorOutput', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
const r = $("Núcleo · iniciar").first(0).json.resultado;
return [{ json: { op: 'error', entrada: {
  codigo: r.codigo,
  contexto: { cliente_id: ctx.config.cliente_id, workflow: ctx.workflow, nodo: r.accion === 'alertar_bloqueo_vencido' ? 'Bloqueo' : 'Arranque', ejecucion_id: ctx.ejecucion_id },
  operador: ctx.operador, problemas: r.problemas
} } }];
` }, position: [2200, 460] },
  output: [{ op: 'error', entrada: {} }]
});

const nucleoAvisoOperador = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { name: 'Núcleo · aviso', onError: 'continueRegularOutput', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'UEhnlNWjhmIa7l1D' }, options: { waitForSubWorkflow: true } }, position: [2480, 290] },
  output: [{ ok: true, op: 'error', resultado: {} }]
});

const hayDestinoAviso = ifElse({
  version: 2.3,
  config: { name: '¿Hay a quién avisar? (aviso)', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $("Núcleo · aviso").first(0).json.resultado?.alerta?.envio?.accion ?? "no_enviar" }}'), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'no_enviar' }], combinator: 'and' } }, position: [2760, 290] }
});

const prepararCorreoAviso = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar correo de aviso', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
const a = $("Núcleo · aviso").first(0).json.resultado.alerta;
const base = { cliente_id: ctx.config.cliente_id, asunto: a.texto.asunto, cuerpo_texto: a.texto.cuerpo_texto, adjunto_nombre: '', adjunto_bytes: 0, creado_utc: ctx.ahora_utc };
// con el correo caído el aviso no sale: queda anotado el intento fallido
if (ctx.fallos.indexOf('enviar') >= 0) return [{ json: Object.assign({ tipo: 'operador_fallido', para: a.envio.destinatarios.join(',') }, base) }];
return a.envio.destinatarios.map(function (para) { return { json: Object.assign({ tipo: 'operador', para: para }, base) }; });
` }, position: [3040, 290] },
  output: [{ tipo: 'operador', cliente_id: 'demo-01', para: 'javier@ejemplo.example', asunto: '', cuerpo_texto: '', adjunto_nombre: '', adjunto_bytes: 0, creado_utc: '2026-10-05T11:30:00Z' }]
});

const enviarCorreoAviso = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Correo · avisar a Javier (aviso)', onError: 'continueRegularOutput', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_correos' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          tipo: expr('{{ $json.tipo }}'),
          cliente_id: expr('{{ $json.cliente_id }}'),
          para: expr('{{ $json.para }}'),
          asunto: expr('{{ $json.asunto }}'),
          cuerpo_texto: expr('{{ $json.cuerpo_texto }}'),
          adjunto_nombre: expr('{{ $json.adjunto_nombre }}'),
          adjunto_bytes: expr('{{ $json.adjunto_bytes }}'),
          creado_utc: expr('{{ $json.creado_utc }}')
        },
        schema: [
          { id: 'tipo', displayName: 'tipo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'cliente_id', displayName: 'cliente_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'para', displayName: 'para', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'asunto', displayName: 'asunto', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'cuerpo_texto', displayName: 'cuerpo_texto', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'adjunto_nombre', displayName: 'adjunto_nombre', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'adjunto_bytes', displayName: 'adjunto_bytes', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'creado_utc', displayName: 'creado_utc', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      } }, position: [3320, 290] },
  output: [{ id: 1 }]
});

const finAviso = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Fin · aviso', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const r = $("Núcleo · iniciar").first(0).json.resultado;
return [{ json: r.accion === 'alertar_bloqueo_vencido' ? { estado: 'bloqueo_vencido', fecha_corte: r.fecha_corte } : { estado: 'detenida', motivo: r.motivo, fecha_corte: r.fecha_corte } }];
` }, position: [3040, 460] },
  output: [{ estado: 'detenida', motivo: 'CONFIG_INVALIDA', fecha_corte: '2026-10-05' }]
});

const codTablaLeer = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Código · tabla (leer)', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'codTablaLeer-1', name: 'codigo', value: 'E_TABLA_LEER', type: 'string' }, { id: 'codTablaLeer-2', name: 'nodo', value: 'Tablas', type: 'string' }] } }, position: [1080, 290] },
  output: [{ codigo: 'E_TABLA_LEER', nodo: 'Tablas' }]
});

const codTablaEscribir = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Código · tabla (escribir)', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'codTablaEscribir-1', name: 'codigo', value: 'E_TABLA_ESCRIBIR', type: 'string' }, { id: 'codTablaEscribir-2', name: 'nodo', value: 'Tablas', type: 'string' }] } }, position: [2480, 460] },
  output: [{ codigo: 'E_TABLA_ESCRIBIR', nodo: 'Tablas' }]
});

const codCarpetaListar = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Código · carpeta (listar)', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'codCarpetaListar-1', name: 'codigo', value: 'E_DRIVE_LISTAR', type: 'string' }, { id: 'codCarpetaListar-2', name: 'nodo', value: 'Carpeta de entrada', type: 'string' }] } }, position: [3320, 460] },
  output: [{ codigo: 'E_DRIVE_LISTAR', nodo: 'Carpeta de entrada' }]
});

const codCarpetaDescargar = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Código · carpeta (descargar)', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'codCarpetaDescargar-1', name: 'codigo', value: 'E_DRIVE_DESCARGAR', type: 'string' }, { id: 'codCarpetaDescargar-2', name: 'nodo', value: 'Carpeta de entrada', type: 'string' }] } }, position: [4160, 460] },
  output: [{ codigo: 'E_DRIVE_DESCARGAR', nodo: 'Carpeta de entrada' }]
});

const codCarpetaSubir = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Código · carpeta (subir)', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'codCarpetaSubir-1', name: 'codigo', value: 'E_DRIVE_SUBIR', type: 'string' }, { id: 'codCarpetaSubir-2', name: 'nodo', value: 'Carpeta de salida', type: 'string' }] } }, position: [6400, 460] },
  output: [{ codigo: 'E_DRIVE_SUBIR', nodo: 'Carpeta de salida' }]
});

const codCorreo = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Código · correo', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'codCorreo-1', name: 'codigo', value: 'E_CORREO_ENVIAR', type: 'string' }, { id: 'codCorreo-2', name: 'nodo', value: 'Correo', type: 'string' }] } }, position: [5840, 460] },
  output: [{ codigo: 'E_CORREO_ENVIAR', nodo: 'Correo' }]
});

const codHuella = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Código · huella', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'codHuella-1', name: 'codigo', value: 'E_HUELLA', type: 'string' }, { id: 'codHuella-2', name: 'nodo', value: 'Huella', type: 'string' }] } }, position: [4440, 460] },
  output: [{ codigo: 'E_HUELLA', nodo: 'Huella' }]
});

const codNucleo = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Código · núcleo', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'codNucleo-1', name: 'codigo', value: 'E_NUCLEO_FALLO', type: 'string' }, { id: 'codNucleo-2', name: 'nodo', value: 'Núcleo', type: 'string' }] } }, position: [1920, 290] },
  output: [{ codigo: 'E_NUCLEO_FALLO', nodo: 'Núcleo' }]
});

const codFlujo = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Código · flujo', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'codFlujo-1', name: 'codigo', value: 'E_FLUJO_FALLO', type: 'string' }, { id: 'codFlujo-2', name: 'nodo', value: 'Flujo', type: 'string' }] } }, position: [1640, 290] },
  output: [{ codigo: 'E_FLUJO_FALLO', nodo: 'Flujo' }]
});

const codAmbiguo = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Código · archivo ambiguo', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'codAmbiguo-1', name: 'codigo', value: 'E_ARCHIVO_AMBIGUO', type: 'string' }, { id: 'codAmbiguo-2', name: 'nodo', value: 'Carpeta de entrada', type: 'string' }] } }, position: [3880, 460] },
  output: [{ codigo: 'E_ARCHIVO_AMBIGUO', nodo: 'Carpeta de entrada' }]
});

const codResultado = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Código · resultado del núcleo', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'codResultado-1', name: 'codigo', value: expr('{{ $json.codigo ?? $json.resultado?.codigo ?? "E_DESCONOCIDO" }}'), type: 'string' }, { id: 'codResultado-2', name: 'nodo', value: 'Núcleo', type: 'string' }] } }, position: [2200, 630] },
  output: [{ codigo: 'E_DESCONOCIDO', nodo: 'Núcleo' }]
});

const prepararError = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar manejo del error', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
const ini = $('Núcleo · iniciar').isExecuted ? $("Núcleo · iniciar").first(0).json : null;
const r = ini && ini.ok ? ini.resultado : null;
const hash = $('Huella SHA-256').isExecuted ? $("Huella SHA-256").first(0).json.hash : undefined;
return [{ json: { op: 'error', entrada: {
  codigo: $json.codigo,
  contexto: { cliente_id: ctx.config.cliente_id, workflow: ctx.workflow, nodo: $json.nodo, ejecucion_id: ctx.ejecucion_id },
  operador: ctx.operador, cliente_id: ctx.config.cliente_id, fecha_corte: r ? r.fecha_corte : undefined, hash_archivo: hash,
  iniciada_utc: ctx.ahora_utc, terminada_utc: ctx.ahora_utc, guardias: r ? r.guardias : null, modo_cliente: ctx.config.modo
} } }];
` }, position: [1360, 290] },
  output: [{ op: 'error', entrada: {} }]
});

const nucleoError = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.3,
  config: { name: 'Núcleo · error', onError: 'continueRegularOutput', parameters: { mode: 'once', source: 'database', workflowId: { __rl: true, mode: 'id', value: 'UEhnlNWjhmIa7l1D' }, options: { waitForSubWorkflow: true } }, position: [1640, 460] },
  output: [{ ok: true, op: 'error', resultado: {} }]
});

const hayFila = ifElse({
  version: 2.3,
  config: { name: '¿Hay fila de libro?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.resultado?.fila ? "si" : "no" }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'si' }], combinator: 'and' } }, position: [1920, 460] }
});

const escribirLibroError = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Escribir libro (error)', onError: 'continueRegularOutput', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_ejecuciones' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          clave: expr('{{ $json.resultado.fila.clave }}'),
          cliente_id: expr('{{ $json.resultado.fila.cliente_id }}'),
          semana_iso: expr('{{ $json.resultado.fila.semana_iso }}'),
          hash_archivo: expr('{{ $json.resultado.fila.hash_archivo }}'),
          estado: expr('{{ $json.resultado.fila.estado }}'),
          iniciada_utc: expr('{{ $json.resultado.fila.iniciada_utc }}'),
          terminada_utc: expr('{{ $json.resultado.fila.terminada_utc }}'),
          n_filas: expr('{{ $json.resultado.fila.n_filas }}'),
          n_vencidas: expr('{{ $json.resultado.fila.n_vencidas }}'),
          n_apartadas: expr('{{ $json.resultado.fila.n_apartadas }}'),
          codigo_error: expr('{{ $json.resultado.fila.codigo_error }}'),
          modo: expr('{{ $json.resultado.fila.modo }}')
        },
        schema: [
          { id: 'clave', displayName: 'clave', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'cliente_id', displayName: 'cliente_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'semana_iso', displayName: 'semana_iso', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'hash_archivo', displayName: 'hash_archivo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'estado', displayName: 'estado', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'iniciada_utc', displayName: 'iniciada_utc', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'terminada_utc', displayName: 'terminada_utc', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'n_filas', displayName: 'n_filas', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'n_vencidas', displayName: 'n_vencidas', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'n_apartadas', displayName: 'n_apartadas', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'codigo_error', displayName: 'codigo_error', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'modo', displayName: 'modo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      } }, position: [2200, 800] },
  output: [{ id: 1 }]
});

const soltarError = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Soltar bloqueo (error)', onError: 'continueRegularOutput', alwaysOutputData: true, parameters: { resource: 'row', operation: 'deleteRows', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_bloqueos' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("DEV · Entrada").first(0).json.config.cliente_id }}') }, { keyName: 'expira_utc', condition: 'eq', keyValue: expr('{{ $("Núcleo · iniciar").isExecuted ? ($("Núcleo · iniciar").first(0).json.resultado?.bloqueo_nuevo?.expira_utc ?? "SIN-BLOQUEO") : "SIN-BLOQUEO" }}') }] } }, position: [2200, 970] },
  output: [{ id: 1 }]
});

const hayDestino = ifElse({
  version: 2.3,
  config: { name: '¿Hay a quién avisar?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $("Núcleo · error").first(0).json.resultado?.alerta?.envio?.accion ?? "no_enviar" }}'), operator: { type: 'string', operation: 'notEquals' }, rightValue: 'no_enviar' }], combinator: 'and' } }, position: [2480, 630] }
});

const prepararCorreoOperador = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Preparar correo al operador', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const ctx = $("DEV · Entrada").first(0).json;
const a = $("Núcleo · error").first(0).json.resultado.alerta;
const base = { cliente_id: ctx.config.cliente_id, asunto: a.texto.asunto, cuerpo_texto: a.texto.cuerpo_texto, adjunto_nombre: '', adjunto_bytes: 0, creado_utc: ctx.ahora_utc };
// con el correo caído el aviso no sale: queda anotado el intento fallido
if (ctx.fallos.indexOf('enviar') >= 0) return [{ json: Object.assign({ tipo: 'operador_fallido', para: a.envio.destinatarios.join(',') }, base) }];
return a.envio.destinatarios.map(function (para) { return { json: Object.assign({ tipo: 'operador', para: para }, base) }; });
` }, position: [2760, 460] },
  output: [{ tipo: 'operador', cliente_id: 'demo-01', para: 'javier@ejemplo.example', asunto: '', cuerpo_texto: '', adjunto_nombre: '', adjunto_bytes: 0, creado_utc: '2026-10-05T11:30:00Z' }]
});

const enviarCorreoOperador = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Correo · avisar a Javier', onError: 'continueRegularOutput', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_correos' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          tipo: expr('{{ $json.tipo }}'),
          cliente_id: expr('{{ $json.cliente_id }}'),
          para: expr('{{ $json.para }}'),
          asunto: expr('{{ $json.asunto }}'),
          cuerpo_texto: expr('{{ $json.cuerpo_texto }}'),
          adjunto_nombre: expr('{{ $json.adjunto_nombre }}'),
          adjunto_bytes: expr('{{ $json.adjunto_bytes }}'),
          creado_utc: expr('{{ $json.creado_utc }}')
        },
        schema: [
          { id: 'tipo', displayName: 'tipo', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'cliente_id', displayName: 'cliente_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'para', displayName: 'para', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'asunto', displayName: 'asunto', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'cuerpo_texto', displayName: 'cuerpo_texto', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'adjunto_nombre', displayName: 'adjunto_nombre', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'adjunto_bytes', displayName: 'adjunto_bytes', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'creado_utc', displayName: 'creado_utc', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      } }, position: [3040, 630] },
  output: [{ id: 1 }]
});

const finError = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Fin · error', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const r = $("Núcleo · error").first(0).json;
const ini = $('Núcleo · iniciar').isExecuted ? $("Núcleo · iniciar").first(0).json : null;
if (r.ok !== true) throw new Error('E_NUCLEO_FALLO');
const sano = r.resultado.alerta.sano;
return [{ json: { estado: 'error', codigo: sano.codigo, nodo: sano.nodo, fecha_corte: ini && ini.ok === true ? ini.resultado.fecha_corte : null } }];
` }, position: [2760, 630] },
  output: [{ estado: 'error', codigo: 'E_DRIVE_LISTAR', nodo: 'Carpeta de entrada', fecha_corte: '2026-10-05' }]
});

const notaCabecera = sticky('[COB-DEV] Shell demo-01. Banco de pruebas con datos ficticios: la carpeta de entrada, la de salida y el correo son TABLAS (cob_dev_*). Nada sale de n8n. Todo lo que se decide lo decide el subflujo «[COB-DEV] Núcleo (puro)»; este flujo solo lee y escribe filas y obedece. No se publica.', [entrada], { color: 4 });

export default workflow('cob-dev-shell-demo-01', '[COB-DEV] Shell demo-01')
  .add(disparador)
  .to(entrada
    .to(leerInterruptor
      .onError(codTablaLeer
          .to(prepararError
            .to(nucleoError
              .to(hayFila
                .onTrue(escribirLibroError
                    .to(soltarError
                      .to(hayDestino
                        .onTrue(prepararCorreoOperador
                            .to(enviarCorreoOperador
                              .to(finError)))
                        .onFalse(finError))))
                .onFalse(soltarError)))))
      .to(leerBloqueos
        .onError(codTablaLeer)
        .to(prepararInicio
          .onError(codFlujo
              .to(prepararError))
          .to(nucleoIniciar
            .onError(codNucleo
                .to(prepararError))
            .to(rutaDia
              .onCase(0, codResultado
                  .to(prepararError))
              .onCase(1, escribirBloqueo
                  .onError(codTablaEscribir
                      .to(prepararError))
                  .to(leerLibro
                    .onError(codTablaLeer)
                    .to(leerCarpeta
                      .onError(codTablaLeer)
                      .to(prepararEleccion
                        .onError(codCarpetaListar
                            .to(prepararError))
                        .to(nucleoElegir
                          .onError(codNucleo)
                          .to(rutaCarpeta
                            .onCase(0, codResultado)
                            .onCase(1, descargar
                                .onError(codCarpetaDescargar
                                    .to(prepararError))
                                .to(huella
                                  .onError(codHuella
                                      .to(prepararError))
                                  .to(prepararDecision
                                    .onError(codFlujo)
                                    .to(nucleoDecidir
                                      .onError(codNucleo)
                                      .to(rutaProcesar
                                        .onCase(0, codResultado)
                                        .onCase(1, prepararInforme
                                            .onError(codFlujo)
                                            .to(nucleoPreparar
                                              .onError(codNucleo)
                                              .to(rutaEntrega
                                                .onCase(0, codResultado)
                                                .onCase(1, prepararSubida
                                                    .onError(codCarpetaSubir
                                                        .to(prepararError))
                                                    .to(subirInforme
                                                      .onError(codCarpetaSubir)
                                                      .to(prepararArmado
                                                        .onError(codFlujo)
                                                        .to(nucleoArmar
                                                          .onError(codNucleo)
                                                          .to(envioArmado
                                                            .onTrue(prepararCorreo
                                                                .onError(codCorreo
                                                                    .to(prepararError))
                                                                .to(enviarCorreo
                                                                  .onError(codCorreo)
                                                                  .to(prepararLibro
                                                                    .onError(codFlujo)
                                                                    .to(escribirLibro
                                                                      .onError(codTablaEscribir)
                                                                      .to(soltarBloqueo
                                                                        .onError(codTablaEscribir)
                                                                        .to(finEnvio))))))
                                                            .onFalse(codResultado))))))
                                                .onCase(2, prepararArmado))))
                                        .onCase(2, soltarSinEnvio
                                            .onError(codTablaEscribir)
                                            .to(finSinEnvio))
                                        .onCase(3, codNucleo))))))
                            .onCase(2, prepararAviso
                                .onError(codFlujo)
                                .to(nucleoAviso
                                  .onError(codNucleo)
                                  .to(rutaAviso
                                    .onCase(0, codResultado)
                                    .onCase(1, prepararArmadoAviso
                                        .onError(codFlujo)
                                        .to(nucleoArmar))
                                    .onCase(2, soltarSinEnvio))))
                            .onCase(3, codAmbiguo
                                .to(prepararError))
                            .onCase(4, codNucleo)))))))
              .onCase(2, codResultado)
              .onCase(3, prepararAvisoSinLibro
                  .onError(codFlujo)
                  .to(nucleoAvisoOperador
                    .to(hayDestinoAviso
                      .onTrue(prepararCorreoAviso
                          .to(enviarCorreoAviso
                            .to(finAviso)))
                      .onFalse(finAviso))))
              .onCase(4, finSinTrabajo)))))))
  .add(notaCabecera);
