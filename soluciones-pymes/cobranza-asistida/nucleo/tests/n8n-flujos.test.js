'use strict';
/* Los flujos de n8n de la Etapa 2 («[COB-DEV] Shell demo-01» y «[COB-DEV] Utilidades de prueba») se generan desde aquí
   (n8n/generar-shell.js, n8n/generar-utilidades.js) y se suben a n8n copiando su texto. Estas pruebas vigilan, sin red ni n8n:
   · que lo generado está al día y que el texto del SDK y la especificación describen el mismo grafo;
   · la postura de seguridad del banco de pruebas: un solo disparador (manual), ningún nodo que hable con el exterior, ninguna
     credencial, solo tablas «cob_dev_*», correos solo «.example», y ningún borrado de filas sin filtro;
   · que todo nodo con salida de error la tiene conectada y que todo camino de fallo termina en el mismo lugar;
   · las reglas aprendidas contra n8n (referencias con índice explícito);
   · que el código de los nodos compila y que las guardas del flujo de utilidades hacen lo que dicen;
   · la forma canónica con la que se compara n8n con el simulador, y la coherencia de los escenarios de prueba.
   Lo que solo se puede comprobar contra n8n (que el flujo guardado es el generado) lo hace n8n/comparar-despliegue.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { generar: generarShell, N, ID_NUCLEO } = require('../n8n/generar-shell');
const { generar: generarUtilidades } = require('../n8n/generar-utilidades');
const { evaluarSdk, compararDespliegue } = require('../n8n/comparar-despliegue');
const { canonico, COLUMNAS, fuente } = require('../n8n/canonico');
const E = require('../n8n/escenarios');
const { cargar } = require('./cargar');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'n8n', 'dist');
const leer = (...p) => fs.readFileSync(path.join(...p), 'utf8');

const SHELL = generarShell();
const SDK_SHELL = SHELL.sdk;
const SDK_UTIL = generarUtilidades();
const FLUJO_SHELL = evaluarSdk(SDK_SHELL);
const FLUJO_UTIL = evaluarSdk(SDK_UTIL);
const ESPEC = JSON.parse(SHELL.spec);

const TIPOS_PERMITIDOS = new Set(['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.code', 'n8n-nodes-base.set', 'n8n-nodes-base.if', 'n8n-nodes-base.switch',
  'n8n-nodes-base.dataTable', 'n8n-nodes-base.executeWorkflow', 'n8n-nodes-base.crypto']);

const nodos = (f) => [...f.nodos.values()];
const aristasDe = (f, nombre) => [...f.aristas].filter((a) => a.startsWith(nombre + ' --'));
const catalogo = () => leer(RAIZ, 'CODIGOS.md');
const codigosDelShell = () => {
  const c = catalogo();
  const seccion = c.slice(c.indexOf('## 9.'));
  return new Set([...seccion.matchAll(/`(E_[A-Z][A-Z0-9_]{1,39})`/g)].map((m) => m[1]));
};
const codigosDelCatalogo = () => new Set([...catalogo().matchAll(/`([EA]_[A-Z][A-Z0-9_]{1,39})`/g)].map((m) => m[1]));

/* El código de un nodo Code se ejecuta como cuerpo de una función; $input, $ y el resto los pone n8n. */
function correrNodo(js, globales) {
  return vm.runInNewContext('(function () {' + js + '\n})()', Object.assign({ Error, JSON, Array, Object, String, Number, Math, Date }, globales), { filename: 'nodo.js' });
}

/* ------------------------------------------------------------ lo generado está al día */

test('el shell de n8n está al día: lo que hay en dist/ es exactamente lo que se genera', () => {
  assert.equal(leer(DIST, 'shell-demo.workflow.ts'), SHELL.sdk, 'dist/shell-demo.workflow.ts desactualizado: ejecutar «node n8n/generar-shell.js»');
  assert.equal(leer(DIST, 'shell-demo.spec.json'), SHELL.spec, 'dist/shell-demo.spec.json desactualizado: ejecutar «node n8n/generar-shell.js»');
});

test('el flujo de utilidades está al día', () => {
  assert.equal(leer(DIST, 'utilidades.workflow.ts'), SDK_UTIL, 'dist/utilidades.workflow.ts desactualizado: ejecutar «node n8n/generar-utilidades.js»');
});

test('el texto del SDK y la especificación describen el mismo grafo (mismos nodos y mismas conexiones, con su salida)', () => {
  const delSdk = new Set(FLUJO_SHELL.aristas);
  const deEspec = new Set(ESPEC.aristas.map((a) => a.de + ' --' + (/^\d+$/.test(a.salida) ? 'caso ' + a.salida : a.salida) + '--> ' + a.a));
  assert.deepEqual([...delSdk].filter((a) => !deEspec.has(a)), [], 'conexiones que solo están en el SDK');
  assert.deepEqual([...deEspec].filter((a) => !delSdk.has(a)), [], 'conexiones que solo están en la especificación');
  assert.deepEqual(ESPEC.nodos.map((n) => n.nombre).sort(), [...FLUJO_SHELL.nodos.keys()].sort());
});

test('el comparador acepta un despliegue idéntico y rechaza uno adulterado', () => {
  // Un «despliegue» armado a partir del propio SDK: si el comparador no lo aceptara, no serviría para detectar nada.
  const conexiones = {};
  for (const a of FLUJO_SHELL.aristas) {
    const [, de, salida, a_] = /^(.*) --(.*)--> (.*)$/.exec(a);
    const tipo = FLUJO_SHELL.nodos.get(de).tipo;
    const i = tipo === 'n8n-nodes-base.switch' ? Number(salida.replace('caso ', '')) : salida === 'true' || salida === 'main' ? 0 : 1;
    conexiones[de] = conexiones[de] || { main: [] };
    while (conexiones[de].main.length <= i) conexiones[de].main.push([]);
    conexiones[de].main[i].push({ node: a_, type: 'main', index: 0 });
  }
  const real = () => ({
    workflow: {
      name: '[COB-DEV] Shell demo-01', active: false, activeVersionId: null, isArchived: false, pinData: {}, connections: JSON.parse(JSON.stringify(conexiones)),
      nodes: nodos(FLUJO_SHELL).map((n) => ({ name: n.nombre, type: n.tipo, typeVersion: n.version, parameters: JSON.parse(JSON.stringify(n.parametros)),
        onError: n.ajustes.onError, executeOnce: n.ajustes.executeOnce, alwaysOutputData: n.ajustes.alwaysOutputData }))
        .concat(FLUJO_SHELL.notas.map(() => ({ name: 'Nota', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, parameters: { content: FLUJO_SHELL.notas[0].contenido } })))
    }
  });
  assert.deepEqual(compararDespliegue(real(), SDK_SHELL).diferencias, []);
  const activo = real(); activo.workflow.active = true;
  assert.ok(compararDespliegue(activo, SDK_SHELL).diferencias.some((d) => /no está inactivo/.test(d)));
  const roto = real(); roto.workflow.nodes.find((n) => n.name === 'Leer interruptor general').parameters.dataTableId.value = 'otra_tabla';
  assert.ok(compararDespliegue(roto, SDK_SHELL).diferencias.some((d) => /Leer interruptor general/.test(d)));
  const sinConexion = real(); delete sinConexion.workflow.connections['DEV · Entrada'];
  assert.ok(compararDespliegue(sinConexion, SDK_SHELL).diferencias.some((d) => /falta la conexión/.test(d)));
  const deMas = real(); deMas.workflow.nodes.push({ name: 'Intruso', type: 'n8n-nodes-base.httpRequest', typeVersion: 4, parameters: {} });
  assert.ok(compararDespliegue(deMas, SDK_SHELL).diferencias.some((d) => /de más/.test(d)));
});

/* ------------------------------------------------------------ postura de seguridad del banco de pruebas */

for (const [nombre, flujo, sdk] of [['shell', FLUJO_SHELL, SDK_SHELL], ['utilidades', FLUJO_UTIL, SDK_UTIL]]) {
  test(nombre + ': un solo disparador, manual; ningún nodo que hable con el exterior; ninguna credencial', () => {
    const tipos = nodos(flujo).map((n) => n.tipo);
    assert.deepEqual(tipos.filter((t) => /trigger/i.test(t)), ['n8n-nodes-base.manualTrigger']);
    assert.deepEqual([...new Set(tipos)].filter((t) => !TIPOS_PERMITIDOS.has(t)), [], 'tipos de nodo no previstos para el banco de pruebas');
    assert.equal(/credentials/i.test(sdk), false, 'aparece «credentials»');
    assert.equal(/\bwebhook\b|\bschedule\b|httpRequest|emailSend|gmail|googleDrive/i.test(sdk.replace(/Disparador manual/g, '')), false);
  });

  test(nombre + ': solo toca tablas «cob_dev_*», y los flujos se llaman «[COB-DEV] …»', () => {
    const tablas = nodos(flujo).filter((n) => n.tipo === 'n8n-nodes-base.dataTable').map((n) => n.parametros.dataTableId.value);
    assert.ok(tablas.length > 0);
    for (const t of tablas) assert.match(t, /^cob_dev_[a-z_]+$/, 'tabla fuera del banco de pruebas: ' + t);
    assert.match(flujo.flujo.nombre, /^\[COB-DEV\] /);
  });

  test(nombre + ': ningún borrado de filas sin filtro, y fuera de la tabla de control siempre es por cliente', () => {
    const borrados = nodos(flujo).filter((n) => n.tipo === 'n8n-nodes-base.dataTable' && n.parametros.operation === 'deleteRows');
    assert.ok(borrados.length > 0);
    for (const n of borrados) {
      const cond = (n.parametros.filters && n.parametros.filters.conditions) || [];
      assert.ok(cond.length >= 1, '«' + n.nombre + '» borra sin filtro');
      if (n.parametros.dataTableId.value === 'cob_dev_config_global') continue; // la tabla de control se reemplaza entera, a propósito
      assert.ok(cond.some((c) => c.keyName === 'cliente_id' && c.condition === 'eq' && /cliente_id/.test(c.keyValue)), '«' + n.nombre + '» no filtra por cliente');
    }
  });

  test(nombre + ': todo código del flujo compila', () => {
    const codigos = nodos(flujo).filter((n) => n.tipo === 'n8n-nodes-base.code');
    assert.ok(codigos.length > 0);
    for (const n of codigos) assert.doesNotThrow(() => new vm.Script('(function () {' + n.parametros.jsCode + '\n})', { filename: n.nombre }), n.nombre);
  });
}

test('shell: solo correos de ejemplo (dominio «.example») y ningún enlace salvo el de ejemplo de la carpeta de salida', () => {
  for (const m of SDK_SHELL.matchAll(/[A-Za-z0-9._+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)) assert.match(m[1], /\.example$/, m[0]);
  const enlaces = [...new Set([...SDK_SHELL.matchAll(/https?:\/\/[^\s'"`]+/g)].map((m) => m[0]))];
  assert.deepEqual(enlaces, ['https://drive.google.com/file/d/']);
});

test('shell: el subflujo del núcleo que se llama es el conocido, y ningún flujo se llama por un nombre o un id distinto', () => {
  const llamadas = nodos(FLUJO_SHELL).filter((n) => n.tipo === 'n8n-nodes-base.executeWorkflow');
  assert.ok(llamadas.length >= 7);
  for (const n of llamadas) {
    assert.equal(n.parametros.workflowId.value, ID_NUCLEO, n.nombre);
    assert.equal(n.parametros.source, 'database', n.nombre);
    assert.equal(n.parametros.options.waitForSubWorkflow, true, n.nombre);
  }
  // el identificador es un hecho del servidor (el flujo «[COB-DEV] Núcleo (puro)» tal como se creó): si se vuelve a crear, cambia acá y en el generador
  assert.equal(ID_NUCLEO, 'UEhnlNWjhmIa7l1D');
});

test('shell: el flujo diario usa las siete operaciones del núcleo, todas y solo ellas', () => {
  const { Envoltorio } = cargar('envoltorio');
  const usadas = new Set([...SDK_SHELL.matchAll(/\bop: '([a-z_]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...usadas].sort(), [...Envoltorio.OPERACIONES].sort());
  assert.equal(Envoltorio.OPERACIONES.length, 7);
});

/* ------------------------------------------------------------ errores: nunca silenciosos */

test('shell: todo nodo con salida de error la tiene conectada (un error no se pierde en silencio)', () => {
  const conSalida = nodos(FLUJO_SHELL).filter((n) => n.ajustes.onError === 'continueErrorOutput');
  assert.ok(conSalida.length >= 29);
  for (const n of conSalida) assert.ok(aristasDe(FLUJO_SHELL, n.nombre).some((a) => a.includes(' --error--> ')), '«' + n.nombre + '» tiene salida de error sin conectar');
});

test('shell: ningún nodo ignora sus errores a medias (cada continueRegularOutput está en la cadena de aviso, donde un fallo no puede encadenar otro)', () => {
  const regulares = nodos(FLUJO_SHELL).filter((n) => n.ajustes.onError === 'continueRegularOutput').map((n) => n.nombre).sort();
  assert.deepEqual(regulares, [N.nucleoAvisoOperador, N.enviarCorreoAviso, N.nucleoError, N.escribirLibroError, N.soltarError, N.enviarCorreoOperador].sort());
});

test('shell: todo camino de fallo termina en «Fin · error» y solo ahí (ningún fallo acaba en un fin de éxito)', () => {
  const destinos = [...FLUJO_SHELL.aristas].filter((a) => a.includes(' --error--> ')).map((a) => a.split(' --error--> ')[1]);
  const terminales = (desde) => {
    const visto = new Set();
    const finales = new Set();
    const cola = [desde];
    while (cola.length) {
      const x = cola.shift();
      if (visto.has(x)) continue;
      visto.add(x);
      const salidas = aristasDe(FLUJO_SHELL, x);
      if (!salidas.length) finales.add(x);
      for (const a of salidas) cola.push(a.split('--> ')[1]);
    }
    return [...finales];
  };
  assert.ok(destinos.length >= 29);
  for (const d of new Set(destinos)) assert.deepEqual(terminales(d), [N.finError], 'desde «' + d + '» el día puede terminar en otro lugar que «' + N.finError + '»');
});

test('shell: el bloqueo se libera solo si es el que tomó esta ejecución (mismo cliente y misma caducidad): el de otra ejecución no se toca', () => {
  const soltar = nodos(FLUJO_SHELL).filter((n) => n.tipo === 'n8n-nodes-base.dataTable' && n.parametros.operation === 'deleteRows' && n.parametros.dataTableId.value === 'cob_dev_bloqueos');
  assert.deepEqual(soltar.map((n) => n.nombre).sort(), [N.soltarBloqueo, N.soltarError, N.soltarSinEnvio].sort());
  for (const n of soltar) assert.deepEqual([...n.parametros.filters.conditions.map((c) => c.keyName)].sort(), ['cliente_id', 'expira_utc'], n.nombre); // [...]: los objetos del SDK vienen de otro contexto de vm
});

test('shell: las referencias a otros nodos llevan índice explícito (first(0), all(0)): sin él n8n puede leer la salida vacía de un error', () => {
  assert.equal(/\$\((['"])[^'"]+\1\)\.(first|all|last)\(\)/.test(SDK_SHELL), false);
  assert.equal(/\$\((['"])[^'"]+\1\)\.item\b/.test(SDK_SHELL), false);
});

test('shell: ningún mensaje de error de un servicio se reenvía: los códigos del flujo están todos en el catálogo', () => {
  const enShell = new Set([...SDK_SHELL.matchAll(/\bE_[A-Z][A-Z0-9_]{1,39}\b/g)].map((m) => m[0]));
  const cat = codigosDelCatalogo();
  assert.deepEqual([...enShell].filter((c) => !cat.has(c)), [], 'códigos del shell que faltan en CODIGOS.md');
  for (const c of codigosDelShell()) {
    if (c === 'E_BLOQUEO_VENCIDO') continue; // lo emite el núcleo (alerta de bloqueo vencido); el shell solo lo muestra
    assert.ok(enShell.has(c), 'el catálogo dice que el shell emite ' + c + ' y el shell no lo menciona');
  }
});

/* ------------------------------------------------------------ flujo de utilidades: las guardas */

const codigoDe = (nombre) => FLUJO_UTIL.nodos.get(nombre).parametros.jsCode;
const pedido = (p) => correrNodo(codigoDe('Pedido'), { $input: { first: () => ({ json: p }) } });

test('utilidades: «Pedido» solo acepta acciones conocidas', () => {
  assert.throws(() => pedido({ accion: 'borrar_todo', cliente_id: 'esc-01' }), /ACCION_DESCONOCIDA/);
  assert.throws(() => pedido({}), /ACCION_DESCONOCIDA/);
  assert.throws(() => pedido(null), /ACCION_DESCONOCIDA/);
});

test('utilidades: solo se puede tocar un cliente de prueba («esc-…»), nunca otro', () => {
  const MALOS = ['demo-01', 'cliente-real', 'ESC-01', 'esc_01', 'esc-', 'esc-' + 'a'.repeat(31), 'esc-01; drop', '../esc-01', ' esc-01', 'esc-01 ', 'esc-ñ', '', 5, null, undefined, ['esc-01'], { a: 1 }];
  for (const accion of ['limpiar_cliente', 'limpiar_bloqueos', 'verificar']) {
    for (const cliente_id of MALOS) assert.throws(() => pedido({ accion, cliente_id }), /CLIENTE_NO_PERMITIDO/, accion + ' con ' + JSON.stringify(cliente_id));
  }
  for (const accion of ['limpiar_cliente', 'limpiar_bloqueos']) for (const cliente_id of ['esc-01', 'esc-f7', 'esc-' + 'a'.repeat(30)]) assert.doesNotThrow(() => pedido({ accion, cliente_id }));
});

test('utilidades: la tabla de control solo se reemplaza con hasta tres filas de texto corto', () => {
  const ok = [{ interruptor: 'on', dry_run: 'true', actualizado_utc: '2026-10-05T00:00:00Z' }];
  assert.doesNotThrow(() => pedido({ accion: 'poner_control', filas: ok }));
  assert.doesNotThrow(() => pedido({ accion: 'poner_control', filas: [] }));
  assert.doesNotThrow(() => pedido({ accion: 'poner_control', filas: [ok[0], ok[0], ok[0]] }));
  for (const filas of [undefined, 'on', {}, [ok[0], ok[0], ok[0], ok[0]], [null], [5], [{ interruptor: 'on' }], [{ interruptor: 1, dry_run: 'true' }], [{ interruptor: 'x'.repeat(21), dry_run: 'true' }], [{ interruptor: 'on', dry_run: 'x'.repeat(21) }]]) {
    assert.throws(() => pedido({ accion: 'poner_control', filas }), /CONTROL_INVALIDO/, JSON.stringify(filas));
  }
});

test('utilidades: «verificar» exige las cuatro huellas esperadas, bien formadas', () => {
  const h = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const esperado = { correos: { n: 0, hash: h }, libro: { n: 0, hash: h }, salida: { n: 0, hash: h }, bloqueos: { n: 0, hash: h } };
  assert.doesNotThrow(() => pedido({ accion: 'verificar', cliente_id: 'esc-01', esperado }));
  for (const t of Object.keys(esperado)) {
    const sin = JSON.parse(JSON.stringify(esperado)); delete sin[t];
    assert.throws(() => pedido({ accion: 'verificar', cliente_id: 'esc-01', esperado: sin }), /ESPERADO_INVALIDO/, 'sin ' + t);
    const malaHuella = JSON.parse(JSON.stringify(esperado)); malaHuella[t].hash = h.toUpperCase();
    assert.throws(() => pedido({ accion: 'verificar', cliente_id: 'esc-01', esperado: malaHuella }), /ESPERADO_INVALIDO/, 'huella en mayúsculas en ' + t);
    const malN = JSON.parse(JSON.stringify(esperado)); malN[t].n = 1.5;
    assert.throws(() => pedido({ accion: 'verificar', cliente_id: 'esc-01', esperado: malN }), /ESPERADO_INVALIDO/, 'n decimal en ' + t);
  }
  assert.throws(() => pedido({ accion: 'verificar', cliente_id: 'esc-01' }), /ESPERADO_INVALIDO/);
});

test('utilidades: «Expandir control» arma una fila por cada una pedida, tal cual', () => {
  const filas = [{ interruptor: 'on', dry_run: 'false', actualizado_utc: '2026-10-05T00:00:00Z' }, { interruptor: 'quizás', dry_run: 'true' }];
  const r = correrNodo(codigoDe('Expandir control'), { $: () => ({ first: () => ({ json: { filas } }) }) });
  assert.deepEqual(JSON.parse(JSON.stringify(r)), [{ json: { interruptor: 'on', dry_run: 'false', actualizado_utc: '2026-10-05T00:00:00Z' } }, { json: { interruptor: 'quizás', dry_run: 'true', actualizado_utc: '' } }]);
});

test('utilidades: «Canonizar» deja la misma forma que el simulador, ignora las filas vacías de n8n y no mezcla tablas', () => {
  const correo = { id: 7, createdAt: 'x', updatedAt: 'y', tipo: 'operador', cliente_id: 'esc-01', para: 'javier@ejemplo.example', asunto: 'A', cuerpo_texto: 'Hola\nEjecución: 123\nChau', adjunto_nombre: '', adjunto_bytes: 0, creado_utc: '2026-10-05T11:30:00Z' };
  const libro = { id: 3, clave: 'k', cliente_id: 'esc-01', semana_iso: '2026-W41', hash_archivo: 'h', estado: 'ok', iniciada_utc: 'a', terminada_utc: 'b', n_filas: 4, n_vencidas: 3, n_apartadas: 1, codigo_error: '', modo: 'dry_run' };
  const lecturas = { 'Leer correos': [{ json: correo }], 'Leer libro': [{ json: libro }], 'Leer carpeta de salida': [{ json: {} }], 'Leer bloqueos': [] };
  const r = correrNodo(codigoDe('Canonizar'), { $: (nombre) => ({ all: () => lecturas[nombre] }) });
  const filas = JSON.parse(JSON.stringify(r)).map((x) => x.json);
  const esperado = canonico({ correos: [correo], libro: [libro], salida: [], bloqueos: [] });
  assert.deepEqual(filas.map((f) => f.tabla), ['correos', 'libro', 'salida', 'bloqueos']);
  assert.deepEqual(filas.map((f) => f.n), [1, 1, 0, 0]);
  assert.deepEqual(filas.map((f) => f.texto), [esperado.correos, esperado.libro, esperado.salida, esperado.bloqueos]);
});

test('utilidades: «Comparar» pasa si las huellas coinciden y, si no, falla diciendo qué tabla y por cuánto', () => {
  const h = (c) => c.repeat(64);
  const esperado = { correos: { n: 1, hash: h('a') }, libro: { n: 1, hash: h('b') }, salida: { n: 0, hash: h('c') }, bloqueos: { n: 0, hash: h('d') } };
  const items = (cambios) => ['correos', 'libro', 'salida', 'bloqueos'].map((t) => ({ json: Object.assign({ tabla: t, n: esperado[t].n, hash: esperado[t].hash }, cambios[t] || {}) }));
  const comparar = (cambios) => correrNodo(codigoDe('Comparar'), { $: () => ({ first: () => ({ json: { esperado } }) }), $input: { all: () => items(cambios) } });
  const ok = JSON.parse(JSON.stringify(comparar({})));
  assert.equal(ok[0].json.igual, true);
  assert.throws(() => comparar({ libro: { hash: h('0') } }), /DIFERENTE · libro: n=1 \(esperado 1\), huella 000000000000 \(esperada bbbbbbbbbbbb\)/);
  assert.throws(() => comparar({ correos: { n: 2 }, bloqueos: { hash: h('9') } }), (e) => /correos: n=2/.test(e.message) && /bloqueos:/.test(e.message));
});

/* ------------------------------------------------------------ forma canónica */

test('canónico: ordena las filas, trata vacío y ausente como lo mismo y normaliza lo que depende de la ejecución real', () => {
  const a = { tipo: 'cliente', cliente_id: 'esc-01', para: 'a@b.example', asunto: 'X', cuerpo_texto: 'Ver https://drive.google.com/file/d/AbC_123-x/view\nEjecución: 347\nfin', adjunto_nombre: '', adjunto_bytes: 0, creado_utc: 't' };
  const b = { tipo: 'cliente', cliente_id: 'esc-01', para: 'c@d.example', asunto: 'Y', cuerpo_texto: 'Ver https://drive.google.com/file/d/ZZZ/view\nEjecución: 12\nfin', adjunto_nombre: undefined, adjunto_bytes: 0, creado_utc: 't' };
  const x = canonico({ correos: [a, b] }).correos;
  const y = canonico({ correos: [Object.assign({}, b, { adjunto_nombre: '', cuerpo_texto: b.cuerpo_texto.replace('ZZZ', 'OTRO').replace('12', '999') }), a] }).correos;
  assert.equal(x, y);
  assert.match(x, /file\/d\/<ID>\/view/);
  assert.match(x, /Ejecución: #/);
  assert.equal(x.split('\n').length, 2);
  assert.notEqual(canonico({ correos: [Object.assign({}, a, { para: 'otro@b.example' })] }).correos, canonico({ correos: [a] }).correos);
});

test('canónico: las columnas propias de la tabla no cuentan, y todas las tablas tienen un texto (vacío si no hay filas)', () => {
  const c0 = canonico({});
  assert.deepEqual(Object.keys(c0).sort(), Object.keys(COLUMNAS).sort());
  for (const t of Object.keys(c0)) assert.equal(c0[t], '');
  const fila = { cliente_id: 'esc-01', expira_utc: 'z' };
  assert.equal(canonico({ bloqueos: [fila] }).bloqueos, canonico({ bloqueos: [Object.assign({ id: 9, createdAt: 'a', updatedAt: 'b' }, fila)] }).bloqueos);
});

test('canónico: el texto que se incrusta en n8n da exactamente el mismo resultado que el módulo', () => {
  const incrustado = new Function(fuente() + '\nreturn canonico;')();
  const muestra = { correos: [{ tipo: 'operador', cliente_id: 'esc-9', para: 'j@e.example', asunto: 'Ñandú', cuerpo_texto: 'a\nEjecución: 5\nb', adjunto_nombre: '', adjunto_bytes: 3, creado_utc: 't' }], libro: [], salida: [{ cliente_id: 'esc-9', nombre: 'n', contenido: 'c file/d/xx/view', creado_utc: 't' }], bloqueos: [] };
  assert.deepEqual(incrustado(muestra), canonico(muestra));
  assert.equal(/require|process|fs\./.test(fuente()), false, 'el texto que va a n8n no debe usar módulos');
});

/* ------------------------------------------------------------ escenarios */

test('escenarios: identificadores válidos y sin repetir; el simulador da el estado que cada paso espera', () => {
  const ids = E.ESCENARIOS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^esc-[a-z0-9-]{1,30}$/);
  assert.ok(ids.length >= 40);
  for (const [id, pasos] of Object.entries(E.SIMULADO)) for (const p of pasos) if (p.espera) assert.equal(p.fin.estado, p.espera, id + ' paso ' + p.paso);
});

test('escenarios: el simulador es determinista (dos corridas dan exactamente lo mismo, huellas incluidas)', () => {
  for (const esc of E.ESCENARIOS) assert.deepEqual(E.simular(esc), E.SIMULADO[esc.id], esc.id);
});

test('escenarios: cada rotura a propósito apunta a un nodo y a un valor que existen hoy en el shell, y no es el valor original', () => {
  const m = E.MUT;
  assert.deepEqual(Object.keys(m).sort(), ['escribirLibro', 'flujoPreparar', 'huella', 'leerControl', 'leerLibro', 'nucleoDecidir', 'nucleoError']);
  const nodosRotos = Object.values(m).map((r) => r.nodo);
  assert.equal(new Set(nodosRotos).size, nodosRotos.length, 'dos roturas tocan el mismo nodo: no se podrían aplicar de una vez');
  for (const [clave, r] of Object.entries(m)) {
    const nodo = FLUJO_SHELL.nodos.get(r.nodo);
    assert.ok(nodo, clave + ': el nodo «' + r.nodo + '» no existe');
    const valor = r.ruta.split('/').filter(Boolean).reduce((o, k) => (o === undefined ? undefined : o[k]), nodo.parametros);
    assert.equal(valor, r.original, clave + ': el valor actual de ' + r.nodo + r.ruta + ' no es el «original» del escenario');
    assert.notEqual(r.roto, r.original, clave);
  }
});

test('escenarios: cada rotura vale solo para su cliente (para cualquier otro el nodo queda como siempre) y rompe con un nombre que no existe, nunca con un valor vacío', () => {
  const clienteActual = "$('DEV · Entrada').first(0).json.config.cliente_id";
  for (const [clave, r] of Object.entries(E.MUT)) {
    assert.ok(r.roto.includes("cliente_id === '" + r.cliente + "'"), clave);
    assert.match(r.cliente, /^esc-[a-z0-9-]{1,30}$/);
    if (r.ruta === '/jsCode') { assert.ok(r.roto.endsWith(r.original)); assert.ok(r.roto.startsWith('if (' + clienteActual)); continue; }
    assert.ok(r.roto.startsWith('={{ ') && r.roto.endsWith(' }}'), clave);
    assert.ok(typeof r.malo === 'string' && r.malo.length > 3 && r.malo !== r.original, clave + ': lo roto debe ser un nombre concreto que no existe');
    const cuerpo = r.roto.slice(4, -3);
    const con = (cliente) => vm.runInNewContext(cuerpo, { $: () => ({ first: () => ({ json: { config: { cliente_id: cliente } } }) }), $json: {} });
    assert.equal(con('esc-01'), r.original, clave + ': para otro cliente debe valer lo de siempre');
    assert.equal(con(r.cliente + 'x'), r.original, clave + ': solo el cliente exacto');
    assert.equal(con(r.cliente), r.malo, clave + ': para su cliente debe valer lo roto (un nombre, no un vacío)');
  }
  for (const nombre of ['cob_dev_no_existe', 'NoExisteElSubflujo01']) assert.ok(![...FLUJO_SHELL.nodos.values()].some((n) => JSON.stringify(n.parametros).includes(nombre)), nombre + ' aparece en el flujo real');
});

test('escenarios: las roturas terminan en el código y el nodo que dice el mapa del shell, que está en el catálogo', () => {
  const delShell = codigosDelShell();
  for (const c of Object.keys(E.NODO_DEL_SHELL)) assert.ok(delShell.has(c), c + ' falta en la sección «Emitidos por el shell» de CODIGOS.md');
  const f = Object.values(E.SIMULADO).flat().filter((p) => p.fase === 3);
  assert.deepEqual(f.map((p) => p.id).sort(), Object.values(E.MUT).map((r) => r.cliente).sort(), 'cada rotura tiene exactamente un escenario, con su cliente');
  for (const p of f) {
    assert.ok(['error', 'fallo_visible'].includes(p.fin.estado), p.id);
    assert.equal(p.fin.nodo, E.etiquetaNodo(p.fin.codigo), p.id);
    assert.ok(delShell.has(p.fin.codigo), p.id + ': ' + p.fin.codigo);
    assert.equal(p.mutacion.cliente, p.id);
  }
});

test('escenarios: si falla también el manejo del error, no queda ni fila de libro ni aviso, pero el bloqueo se libera y el día termina a la vista', () => {
  const p = E.SIMULADO['esc-f8'][0];
  assert.equal(p.fin.estado, 'fallo_visible');
  assert.equal(p.fin.codigo, 'E_NUCLEO_FALLO');
  assert.deepEqual([p.esperado.correos.n, p.esperado.libro.n, p.esperado.salida.n, p.esperado.bloqueos.n], [0, 0, 0, 0]);
});

test('shell: «Fin · error» termina el día fallido con el código de siempre; si el manejo del error también falló, FALLA a la vista (nunca en silencio)', () => {
  const js = FLUJO_SHELL.nodos.get(N.finError).parametros.jsCode;
  const mundo = (resultadoError, iniciado) => ({
    $: (nombre) => ({
      isExecuted: nombre === N.nucleoIniciar ? iniciado : true,
      first: () => ({ json: nombre === N.nucleoError ? resultadoError : { ok: true, resultado: { fecha_corte: '2026-10-05' } } })
    })
  });
  const bien = correrNodo(js, mundo({ ok: true, resultado: { alerta: { sano: { codigo: 'E_DRIVE_LISTAR', nodo: 'Carpeta de entrada' } } } }, true));
  assert.deepEqual(JSON.parse(JSON.stringify(bien)), [{ json: { estado: 'error', codigo: 'E_DRIVE_LISTAR', nodo: 'Carpeta de entrada', fecha_corte: '2026-10-05' } }]);
  const sinIniciar = correrNodo(js, mundo({ ok: true, resultado: { alerta: { sano: { codigo: 'E_TABLA_LEER', nodo: 'Tablas' } } } }, false));
  assert.equal(sinIniciar[0].json.fecha_corte, null);
  assert.throws(() => correrNodo(js, mundo({ error: { message: 'datos del cliente que no deben salir' } }, true)), (e) => e.message === 'E_NUCLEO_FALLO');
  assert.throws(() => correrNodo(js, mundo({ ok: false, codigo: 'E_X' }, true)), (e) => e.message === 'E_NUCLEO_FALLO');
});

test('escenarios: las filas de control de la fase 2 pasan la guarda del flujo de utilidades', () => {
  const con = Object.values(E.SIMULADO).flat().filter((p) => p.control);
  assert.ok(con.length >= 8);
  for (const p of con) assert.doesNotThrow(() => pedido({ accion: 'poner_control', filas: p.control.map((f) => Object.assign({ actualizado_utc: '2026-10-05T00:00:00Z' }, f)) }), p.id);
});

test('escenarios: lo esperado de cada paso trae las cuatro huellas, bien formadas, para el flujo de utilidades', () => {
  for (const p of Object.values(E.SIMULADO).flat()) {
    assert.doesNotThrow(() => pedido({ accion: 'verificar', cliente_id: p.id, esperado: p.esperado }), p.id + ' paso ' + p.paso);
  }
});
