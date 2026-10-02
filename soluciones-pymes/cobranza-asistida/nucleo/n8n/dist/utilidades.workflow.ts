import { workflow, node, trigger, switchCase, sticky, expr } from '@n8n/workflow-sdk';

const disparador = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Disparador manual', position: [240, 160] },
  output: [{}]
});

const pedido = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Pedido', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const p = $input.first().json || {};
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
` }, position: [520, 160] },
  output: [{ accion: 'verificar', cliente_id: 'esc-01', esperado: {} }]
});

const ruta = switchCase({
  version: 3.4,
  config: { name: '¿Qué hay que hacer?', parameters: { mode: 'rules', rules: { values: [
        { outputKey: 'poner control', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.accion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'poner_control' }], combinator: 'and' } },
        { outputKey: 'limpiar cliente', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.accion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'limpiar_cliente' }], combinator: 'and' } },
        { outputKey: 'limpiar bloqueos', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.accion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'limpiar_bloqueos' }], combinator: 'and' } },
        { outputKey: 'verificar', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $json.accion }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'verificar' }], combinator: 'and' } }
      ] }, options: {} }, position: [800, 160] },
  output: [{ accion: 'verificar' }]
});

const borrarControl = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Borrar control', alwaysOutputData: true, parameters: { resource: 'row', operation: 'deleteRows', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_config_global' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'interruptor', condition: 'neq', keyValue: '__ninguno__' }] } }, position: [1080, 0] },
  output: [{ id: 1 }]
});

const expandirControl = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Expandir control', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const p = $("Pedido").first().json;
return p.filas.map(function (f) { return { json: { interruptor: f.interruptor, dry_run: f.dry_run, actualizado_utc: typeof f.actualizado_utc === 'string' ? f.actualizado_utc : '' } }; });
` }, position: [1360, 0] },
  output: [{ interruptor: 'off', dry_run: 'true', actualizado_utc: '' }]
});

const escribirControl = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Escribir control', parameters: { resource: 'row', operation: 'insert', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_config_global' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          interruptor: expr('{{ $json.interruptor }}'),
          dry_run: expr('{{ $json.dry_run }}'),
          actualizado_utc: expr('{{ $json.actualizado_utc }}')
        },
        schema: [
          { id: 'interruptor', displayName: 'interruptor', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'dry_run', displayName: 'dry_run', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'actualizado_utc', displayName: 'actualizado_utc', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      } }, position: [1640, 0] },
  output: [{ id: 1 }]
});

const borrarBloqueos = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Borrar bloqueos', alwaysOutputData: true, parameters: { resource: 'row', operation: 'deleteRows', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_bloqueos' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("Pedido").first().json.cliente_id }}') }] } }, position: [1080, 160] },
  output: [{ id: 1 }]
});

const borrarLibro = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Borrar libro', alwaysOutputData: true, parameters: { resource: 'row', operation: 'deleteRows', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_ejecuciones' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("Pedido").first().json.cliente_id }}') }] } }, position: [1360, 160] },
  output: [{ id: 1 }]
});

const borrarEntrada = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Borrar carpeta de entrada', alwaysOutputData: true, parameters: { resource: 'row', operation: 'deleteRows', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_drive_entrada' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("Pedido").first().json.cliente_id }}') }] } }, position: [1640, 160] },
  output: [{ id: 1 }]
});

const borrarSalida = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Borrar carpeta de salida', alwaysOutputData: true, parameters: { resource: 'row', operation: 'deleteRows', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_drive_salida' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("Pedido").first().json.cliente_id }}') }] } }, position: [1920, 160] },
  output: [{ id: 1 }]
});

const borrarCorreos = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Borrar correos', alwaysOutputData: true, parameters: { resource: 'row', operation: 'deleteRows', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_correos' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("Pedido").first().json.cliente_id }}') }] } }, position: [2200, 160] },
  output: [{ id: 1 }]
});

const borrarSoloBloqueos = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Borrar solo bloqueos', alwaysOutputData: true, parameters: { resource: 'row', operation: 'deleteRows', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_bloqueos' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("Pedido").first().json.cliente_id }}') }] } }, position: [1080, 320] },
  output: [{ id: 1 }]
});

const leerCorreos = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Leer correos', executeOnce: true, alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_correos' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("Pedido").first().json.cliente_id }}') }] }, returnAll: true }, position: [1080, 480] },
  output: [{ id: 1 }]
});

const leerLibro = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Leer libro', executeOnce: true, alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_ejecuciones' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("Pedido").first().json.cliente_id }}') }] }, returnAll: true }, position: [1360, 480] },
  output: [{ id: 1 }]
});

const leerSalida = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Leer carpeta de salida', executeOnce: true, alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_drive_salida' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("Pedido").first().json.cliente_id }}') }] }, returnAll: true }, position: [1640, 480] },
  output: [{ id: 1 }]
});

const leerBloqueos = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: { name: 'Leer bloqueos', executeOnce: true, alwaysOutputData: true, parameters: { resource: 'row', operation: 'get', dataTableId: { __rl: true, mode: 'name', value: 'cob_dev_bloqueos' }, matchType: 'allConditions', filters: { conditions: [{ keyName: 'cliente_id', condition: 'eq', keyValue: expr('{{ $("Pedido").first().json.cliente_id }}') }] }, returnAll: true }, position: [1920, 480] },
  output: [{ id: 1 }]
});

const canonizar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Canonizar', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `var COLUMNAS = {
  correos: ['tipo', 'cliente_id', 'para', 'asunto', 'cuerpo_texto', 'adjunto_nombre', 'adjunto_bytes', 'creado_utc'],
  libro: ['clave', 'cliente_id', 'semana_iso', 'hash_archivo', 'estado', 'iniciada_utc', 'terminada_utc', 'n_filas', 'n_vencidas', 'n_apartadas', 'codigo_error', 'modo'],
  salida: ['cliente_id', 'nombre', 'contenido', 'creado_utc'],
  bloqueos: ['cliente_id', 'expira_utc']
};

function textoNormalizado(s) {
  return String(s).replace(/file\\/d\\/[A-Za-z0-9_-]+\\/view/g, 'file/d/<ID>/view').replace(/\\nEjecución: [^\\n]*/g, '\\nEjecución: #');
}

function filaCanonica(tabla, f) {
  var o = {};
  COLUMNAS[tabla].forEach(function (c) {
    var v = f && f[c] !== undefined && f[c] !== '' ? f[c] : null;
    if (v !== null && c === 'cuerpo_texto') v = textoNormalizado(v);
    o[c] = v;
  });
  return JSON.stringify(o);
}

// tablas: { correos: [fila], libro: [fila], salida: [fila], bloqueos: [fila] } → { correos: texto, libro: texto, salida: texto, bloqueos: texto }
function canonico(tablas) {
  var salida = {};
  Object.keys(COLUMNAS).forEach(function (t) {
    var filas = tablas && Array.isArray(tablas[t]) ? tablas[t] : [];
    salida[t] = filas.map(function (f) { return filaCanonica(t, f); }).sort().join('\\n');
  });
  return salida;
}

const filas = function (nodo) { return $(nodo).all().map(function (i) { return i.json; }).filter(function (j) { return j.id !== undefined; }); };
const tablas = { correos: filas('Leer correos'), libro: filas('Leer libro'), salida: filas('Leer carpeta de salida'), bloqueos: filas('Leer bloqueos') };
const c = canonico(tablas);
return ['correos', 'libro', 'salida', 'bloqueos'].map(function (t) { return { json: { tabla: t, n: tablas[t].length, texto: c[t] } }; });
` }, position: [2200, 480] },
  output: [{ tabla: 'correos', n: 0, texto: '' }]
});

const huella = node({
  type: 'n8n-nodes-base.crypto',
  version: 2,
  config: { name: 'Huella', parameters: { action: 'hash', type: 'SHA256', value: expr('{{ $json.texto }}'), dataPropertyName: 'hash', encoding: 'hex' }, position: [2480, 480] },
  output: [{ tabla: 'correos', n: 0, texto: '', hash: '' }]
});

const comparar = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Comparar', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: `const esperado = $("Pedido").first().json.esperado;
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
` }, position: [2760, 480] },
  output: [{ igual: true, tablas: {} }]
});

const nota = sticky('[COB-DEV] Utilidades de prueba. Herramienta del banco de pruebas (datos ficticios): fija la tabla de control, limpia un cliente de prueba «esc-…» y compara lo que dejó una corrida con lo que dejó el simulador. No se publica.', [pedido], { color: 4 });

export default workflow('cob-dev-utilidades-prueba', '[COB-DEV] Utilidades de prueba')
  .add(disparador)
  .to(pedido
    .to(ruta
      .onCase(0, borrarControl
        .to(expandirControl
          .to(escribirControl)))
      .onCase(1, borrarBloqueos
        .to(borrarLibro
          .to(borrarEntrada
            .to(borrarSalida
              .to(borrarCorreos)))))
      .onCase(2, borrarSoloBloqueos)
      .onCase(3, leerCorreos
        .to(leerLibro
          .to(leerSalida
            .to(leerBloqueos
              .to(canonizar
                .to(huella
                  .to(comparar)))))))))
  .add(nota);
