'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, plano, capturar } = require('./cargar');
const azar = require('./azar');

const { Util, M6 } = cargar('util', 'm6-registro');

const HUELLA = 'a'.repeat(64);
const OTRA_HUELLA = 'b'.repeat(64);
const FILA = () => ({
  cliente_id: 'demo-01', semana_iso: '2026-W41', hash_archivo: HUELLA, estado: 'ok',
  iniciada_utc: '2026-10-05T11:00:00Z', terminada_utc: '2026-10-05T11:00:04Z',
  n_filas: 120, n_vencidas: 31, n_apartadas: 3, codigo_error: null, modo: 'dry'
});
const codigo = (fn) => { const r = capturar(fn); return r.ok ? null : r.codigo; };

/* ------------------------------------------------------------ sanearError */

test('el saneador conserva solo el código del error, nunca su mensaje libre', () => {
  const e = new Error('No se pudo leer a Juan Pérez, factura A 1234, tel 099123456');
  const s = plano(M6.sanearError(e, { cliente_id: 'demo-01', workflow: 'Cobranza · shell', nodo: 'Leer archivo', ejecucion_id: 4711 }));
  assert.deepEqual(s, { cliente_id: 'demo-01', workflow: 'Cobranza · shell', nodo: 'Leer archivo', codigo: 'E_DESCONOCIDO', ejecucion_id: '4711' });
  assert.equal(JSON.stringify(s).includes('Juan'), false);
});

test('un error con código propio lo conserva; también si el mensaje ES un código', () => {
  const con = Object.assign(new Error('texto libre con datos'), { codigo: 'E_ARCHIVO_VACIO' });
  assert.equal(M6.sanearError(con, {}).codigo, 'E_ARCHIVO_VACIO');
  assert.equal(M6.sanearError(new Error('E_FECHA_INVALIDA'), {}).codigo, 'E_FECHA_INVALIDA');
  for (const v of [null, undefined, 'texto', 5, {}, { codigo: 'no es un codigo' }, { message: 'E_' }, { codigo: 'E_' + 'X'.repeat(50) }]) {
    assert.equal(M6.sanearError(v, {}).codigo, 'E_DESCONOCIDO', JSON.stringify(v));
  }
});

test('el contexto también se sanea: identificador, flujo, nodo y ejecución', () => {
  const s = plano(M6.sanearError(new Error('x'), {
    cliente_id: 'Ferretería Ficticia S.R.L.', workflow: 'Cobranza\nBcc: espia@malo.com <script>', nodo: 'a'.repeat(200), ejecucion_id: 'abc def\n'
  }));
  assert.equal(s.cliente_id, 'desconocido');
  assert.equal(s.ejecucion_id, 'desconocido');
  assert.equal(s.workflow.includes('\n'), false);
  assert.equal(/[<>@]/.test(s.workflow), false);
  assert.ok(s.nodo.length <= 80);
  assert.deepEqual(Object.keys(s).sort(), ['cliente_id', 'codigo', 'ejecucion_id', 'nodo', 'workflow']);
});

test('sin contexto, todo queda como «desconocido»', () => {
  for (const c of [undefined, null, 5, 'x', []]) {
    const s = plano(M6.sanearError(new Error('x'), c));
    assert.deepEqual(s, { cliente_id: 'desconocido', workflow: 'desconocido', nodo: 'desconocido', codigo: 'E_DESCONOCIDO', ejecucion_id: 'desconocido' });
  }
});

test('identificador de ejecución: números y textos simples sí; el resto no', () => {
  const id = (v) => M6.sanearError(new Error('x'), { ejecucion_id: v }).ejecucion_id;
  assert.equal(id(4711), '4711');
  assert.equal(id('abc-123_X'), 'abc-123_X');
  for (const v of ['', 'a b', 'a/b', 'a'.repeat(65), null, undefined, {}, '<b>']) assert.equal(id(v), 'desconocido', JSON.stringify(v));
});

test('canario: un dato del cliente dentro de un error jamás aparece en lo saneado ni en la alerta', () => {
  const CANARIO = 'CANARIO_DEUDOR_9921';
  const e = Object.assign(new Error('fallo con ' + CANARIO), { codigo: 'E_ARCHIVO_INVALIDO', detalle: CANARIO, cause: { fila: CANARIO } });
  const s = plano(M6.sanearError(e, { cliente_id: 'demo-01', workflow: 'flujo', nodo: 'nodo', ejecucion_id: 7, dato: CANARIO }));
  const t = plano(M6.textoAlerta(s));
  assert.equal(JSON.stringify(s).includes(CANARIO), false);
  assert.equal(JSON.stringify(t).includes(CANARIO), false);
});

/* ----------------------------------------------------------------- alerta */

test('la alerta tiene asunto y cuerpo con solo código, cliente, flujo, nodo y ejecución', () => {
  const s = M6.sanearError(Object.assign(new Error('x'), { codigo: 'E_ARCHIVO_VACIO' }), { cliente_id: 'demo-01', workflow: 'Cobranza · shell', nodo: 'Leer archivo', ejecucion_id: 12 });
  const t = plano(M6.textoAlerta(s));
  assert.equal(t.asunto, 'Error en cobranza · demo-01 · E_ARCHIVO_VACIO');
  assert.equal(t.cuerpo_texto.split('\n')[0], 'Cliente: demo-01');
  assert.match(t.cuerpo_texto, /Código: E_ARCHIVO_VACIO/);
  assert.match(t.cuerpo_texto, /Ejecución: 12/);
  assert.match(t.cuerpo_texto, /no contiene datos del archivo del cliente/);
  assert.equal(t.asunto.includes('\n'), false);
});

test('la alerta rechaza lo que no viene saneado y no deja pasar saltos de línea ni direcciones', () => {
  for (const v of [null, undefined, 'x', 5, {}, { codigo: 'no' }, { codigo: 'E_' }, { codigo: 'e_minuscula' }]) {
    assert.equal(codigo(() => M6.textoAlerta(v)), 'E_ALERTA_INVALIDA', JSON.stringify(v));
  }
  const t = plano(M6.textoAlerta({ cliente_id: 'x\r\nBcc: a@b.com', workflow: 'w\nBcc: a@b.com', nodo: '<n>', codigo: 'E_PRUEBA', ejecucion_id: '1\n2' }));
  assert.equal(t.asunto.includes('\n') || t.asunto.includes('\r'), false);
  assert.equal(/@|<|>/.test(t.cuerpo_texto), false);
  assert.equal(t.cuerpo_texto.split('\n').length, 7);
});

/* --------------------------------------------------------- claveEjecucion */

test('la clave junta cliente, semana ISO y huella del archivo', () => {
  assert.equal(M6.claveEjecucion('demo-01', '2026-10-05', HUELLA), 'demo-01|2026-W41|' + HUELLA);
  assert.equal(M6.claveEjecucion('demo-01', '2026-10-11', HUELLA), 'demo-01|2026-W41|' + HUELLA); // domingo de la misma semana
  assert.equal(M6.claveEjecucion('demo-01', '2026-10-12', HUELLA), 'demo-01|2026-W42|' + HUELLA);
});

test('semanas ISO en los bordes del año', () => {
  const sem = (f) => M6.claveEjecucion('c', f, HUELLA).split('|')[1];
  assert.equal(sem('2026-01-01'), '2026-W01');
  assert.equal(sem('2025-12-29'), '2026-W01');
  assert.equal(sem('2027-01-03'), '2026-W53');
  assert.equal(sem('2027-01-04'), '2027-W01');
});

test('otra huella, otro cliente u otra semana: otra clave; lo mismo: la misma', () => {
  const k = M6.claveEjecucion('demo-01', '2026-10-05', HUELLA);
  assert.equal(M6.claveEjecucion('demo-01', '2026-10-05', HUELLA), k);
  assert.notEqual(M6.claveEjecucion('demo-01', '2026-10-05', OTRA_HUELLA), k);
  assert.notEqual(M6.claveEjecucion('demo-02', '2026-10-05', HUELLA), k);
  assert.notEqual(M6.claveEjecucion('demo-01', '2026-10-12', HUELLA), k);
});

test('la clave rechaza entradas inválidas con un código, sin repetir el valor', () => {
  const malos = [
    ['', '2026-10-05', HUELLA], ['a b', '2026-10-05', HUELLA], [5, '2026-10-05', HUELLA], ['demo', '05/10/2026', HUELLA],
    ['demo', '2026-02-30', HUELLA], ['demo', null, HUELLA], ['demo', '2026-10-05', 'a'.repeat(63)], ['demo', '2026-10-05', 'A'.repeat(64)],
    ['demo', '2026-10-05', 'g'.repeat(64)], ['demo', '2026-10-05', null], ['demo', '2026-10-05', 5]
  ];
  for (const a of malos) {
    const r = capturar(() => M6.claveEjecucion(...a));
    assert.equal(r.ok, false, JSON.stringify(a));
    assert.equal(r.codigo, 'E_LIBRO_INVALIDO');
    assert.equal(r.mensaje, 'E_LIBRO_INVALIDO');
  }
});

/* -------------------------------------------------------------- filaLibro */

test('una fila válida se acepta y devuelve su clave', () => {
  const f = plano(M6.filaLibro(FILA()));
  assert.equal(f.clave, 'demo-01|2026-W41|' + HUELLA);
  assert.deepEqual(Object.keys(f).sort(), ['clave', ...M6.CLAVES_LIBRO].sort());
  assert.equal(f.codigo_error, null);
});

test('la clave de la fila coincide con claveEjecucion de una fecha de esa semana', () => {
  const f = plano(M6.filaLibro(FILA()));
  assert.equal(f.clave, M6.claveEjecucion('demo-01', '2026-10-07', HUELLA));
});

test('una ejecución con error lleva su código y ceros en los contadores que no llegó a calcular', () => {
  const f = plano(M6.filaLibro({ ...FILA(), estado: 'error', codigo_error: 'E_ARCHIVO_INVALIDO', n_filas: 0, n_vencidas: 0, n_apartadas: 0 }));
  assert.equal(f.estado, 'error');
  assert.equal(f.codigo_error, 'E_ARCHIVO_INVALIDO');
});

test('«omitida» y el modo real también son válidos; el código de error puede faltar', () => {
  const d = FILA();
  delete d.codigo_error;
  d.estado = 'omitida';
  d.modo = 'real';
  const f = plano(M6.filaLibro(d));
  assert.equal(f.estado, 'omitida');
  assert.equal(f.modo, 'real');
  assert.equal(f.codigo_error, null);
});

test('ni una columna de más: nombres, correos, importes o cualquier otro dato no entran en el libro', () => {
  for (const extra of ['deudor_nombre', 'contacto_mail', 'importe_centavos', 'detalle', 'mensaje', 'nombre', 'factura_ref', 'x', '__proto__', 'constructor', 'clave']) {
    const d = JSON.parse(JSON.stringify(FILA()));
    Object.defineProperty(d, extra, { value: 'CANARIO', enumerable: true, configurable: true, writable: true });
    const r = capturar(() => M6.filaLibro(d));
    assert.equal(r.ok, false, extra);
    assert.equal(r.codigo, 'E_LIBRO_INVALIDO', extra);
  }
  const conProto = JSON.parse('{"__proto__": {"x": 1}, "cliente_id": "demo-01"}');
  assert.equal(codigo(() => M6.filaLibro(conProto)), 'E_LIBRO_INVALIDO');
});

test('cada campo de la fila se valida', () => {
  const malos = {
    cliente_id: [undefined, '', 'a b', 5, '../x', 'x'.repeat(41)],
    semana_iso: [undefined, '2026-W4', '2026-W00', '2026-W54', '2026W41', '26-W41', 41, '2026-w41'],
    hash_archivo: [undefined, 'a'.repeat(63), 'A'.repeat(64), 'z'.repeat(64), null, 5],
    estado: [undefined, 'OK', 'fallo', 'ok ', null, 1],
    iniciada_utc: [undefined, '2026-10-05 11:00:00', '2026-10-05T11:00:00', '2026-10-05T11:00:00+00:00', '2026-02-30T11:00:00Z', '2026-10-05T24:00:00Z', '2026-10-05T11:60:00Z', '2026-10-05T11:00:60Z', '2026-10-05T11:00:00.1234Z', 5, null],
    terminada_utc: [undefined, 'ayer', '2026-13-01T00:00:00Z', 5, null],
    n_filas: [undefined, -1, 1.5, '5', NaN, Infinity, 1000001, null, true],
    n_vencidas: [undefined, -1, 1.5, '5', NaN, Infinity, 1000001, null],
    n_apartadas: [undefined, -1, 1.5, '5', NaN, Infinity, 1000001, null],
    codigo_error: ['Juan Pérez', 'E_', 'e_minus', 'E_' + 'X'.repeat(41), 5, {}, 'E_CON ESPACIO'],
    modo: [undefined, 'DRY', 'prod', 'real ', null, true]
  };
  for (const [campo, valores] of Object.entries(malos)) {
    for (const v of valores) {
      const d = FILA();
      if (v === undefined) delete d[campo]; else d[campo] = v;
      if (campo === 'codigo_error' && v === undefined) continue; // falta permitida
      assert.equal(codigo(() => M6.filaLibro(d)), 'E_LIBRO_INVALIDO', campo + ' = ' + JSON.stringify(v));
    }
  }
});

test('coherencia de contadores: vencidas más apartadas no pueden superar las filas', () => {
  assert.equal(codigo(() => M6.filaLibro({ ...FILA(), n_filas: 10, n_vencidas: 8, n_apartadas: 3 })), 'E_LIBRO_INVALIDO');
  assert.equal(M6.filaLibro({ ...FILA(), n_filas: 10, n_vencidas: 7, n_apartadas: 3 }).n_filas, 10);
  assert.equal(M6.filaLibro({ ...FILA(), n_filas: 0, n_vencidas: 0, n_apartadas: 0 }).n_filas, 0);
});

test('una fila que no es un objeto es inválida', () => {
  for (const v of [null, undefined, 'x', 5, [], [FILA()], true]) assert.equal(codigo(() => M6.filaLibro(v)), 'E_LIBRO_INVALIDO', JSON.stringify(v));
});

test('el libro solo acepta milésimas de 1 a 3 cifras y horas reales', () => {
  for (const t of ['2026-10-05T11:00:00Z', '2026-10-05T11:00:00.5Z', '2026-10-05T11:00:00.50Z', '2026-10-05T11:00:00.500Z', '2026-10-05T00:00:00Z', '2026-10-05T23:59:59Z']) {
    assert.equal(M6.filaLibro({ ...FILA(), iniciada_utc: t }).iniciada_utc, t);
  }
});

test('canario: un valor rechazado nunca aparece en el mensaje del error', () => {
  const CANARIO = 'CANARIO LIBRO 5512'; // con espacios: no es válido en ninguna columna
  for (const campo of ['cliente_id', 'semana_iso', 'hash_archivo', 'estado', 'iniciada_utc', 'codigo_error', 'modo']) {
    const d = FILA();
    d[campo] = CANARIO;
    const r = capturar(() => M6.filaLibro(d));
    assert.equal(r.ok, false);
    assert.equal(String(r.mensaje).includes(CANARIO), false);
    assert.equal(r.mensaje, 'E_LIBRO_INVALIDO');
  }
});

test('propiedad: una fila que pasa siempre tiene solo columnas conocidas con contadores enteros y coherentes', () => {
  const estados = ['ok', 'error', 'omitida', 'OK', '', null];
  for (const semilla of azar.semillas(303)) {
    const az = azar.crear(semilla);
    let aceptadas = 0;
    for (let i = 0; i < 4000; i++) {
      const d = FILA();
      if (az.prob(0.3)) d.estado = az.elegir(estados);
      if (az.prob(0.3)) d.n_filas = az.elegir([0, 1, 10, 100, -1, 1.5, '3', 1000000, 1000001]);
      if (az.prob(0.3)) d.n_vencidas = az.elegir([0, 1, 5, 200, -2, 0.5]);
      if (az.prob(0.3)) d.n_apartadas = az.elegir([0, 1, 5, 200, -2, 2.5]);
      if (az.prob(0.2)) d.codigo_error = az.elegir([null, 'E_PRUEBA', 'texto libre', 'E_', 7]);
      if (az.prob(0.1)) d[az.elegir(['extra', 'nombre', 'detalle'])] = 'x';
      const r = capturar(() => M6.filaLibro(d));
      if (!r.ok) { assert.equal(r.codigo, 'E_LIBRO_INVALIDO'); continue; }
      aceptadas++;
      const f = r.valor;
      assert.deepEqual(Object.keys(f).sort(), ['clave', ...M6.CLAVES_LIBRO].sort());
      for (const c of ['n_filas', 'n_vencidas', 'n_apartadas']) assert.ok(Number.isInteger(f[c]) && f[c] >= 0);
      assert.ok(f.n_vencidas + f.n_apartadas <= f.n_filas);
      assert.ok(f.codigo_error === null || /^E_[A-Z0-9_]{2,40}$/.test(f.codigo_error));
      assert.ok(['ok', 'error', 'omitida'].includes(f.estado));
    }
    assert.ok(aceptadas > 300, 'aceptadas: ' + aceptadas);
  }
});

/* ---------------------------------------------------------- estadoBloqueo */

test('sin fila de bloqueo, está libre', () => {
  assert.equal(M6.estadoBloqueo(null, '2026-10-05T11:00:00Z'), 'libre');
  assert.equal(M6.estadoBloqueo(undefined, '2026-10-05T11:00:00Z'), 'libre');
});

test('con caducidad futura está ocupado; con caducidad pasada o justo ahora, vencido', () => {
  const ahora = '2026-10-05T11:00:00Z';
  assert.equal(M6.estadoBloqueo({ expira_utc: '2026-10-05T11:30:00Z' }, ahora), 'ocupado');
  assert.equal(M6.estadoBloqueo({ expira_utc: '2026-10-05T11:00:01Z' }, ahora), 'ocupado');
  assert.equal(M6.estadoBloqueo({ expira_utc: '2026-10-05T11:00:00Z' }, ahora), 'vencido');
  assert.equal(M6.estadoBloqueo({ expira_utc: '2026-10-05T10:59:59Z' }, ahora), 'vencido');
  assert.equal(M6.estadoBloqueo({ expira_utc: '2026-10-04T23:00:00Z' }, ahora), 'vencido');
});

test('las milésimas se comparan bien aunque un instante las traiga y el otro no', () => {
  // 11:00:00.500 es POSTERIOR a 11:00:00; como texto crudo se ordenarían al revés
  assert.equal(M6.estadoBloqueo({ expira_utc: '2026-10-05T11:00:00Z' }, '2026-10-05T11:00:00.500Z'), 'vencido');
  assert.equal(M6.estadoBloqueo({ expira_utc: '2026-10-05T11:00:00.500Z' }, '2026-10-05T11:00:00Z'), 'ocupado');
  assert.equal(M6.estadoBloqueo({ expira_utc: '2026-10-05T11:00:00.5Z' }, '2026-10-05T11:00:00.500Z'), 'vencido');
  assert.equal(M6.estadoBloqueo({ expira_utc: '2026-10-05T11:00:00.51Z' }, '2026-10-05T11:00:00.5Z'), 'ocupado');
  assert.equal(M6.estadoBloqueo({ expira_utc: '2026-10-05T11:00:00.001Z' }, '2026-10-05T11:00:00Z'), 'ocupado');
});

test('propiedad: el orden por texto canónico coincide con el orden real de los instantes', () => {
  const az = azar.crear(404);
  const fmt = (ms, forma) => {
    const iso = new Date(ms).toISOString(); // 2026-10-05T11:00:00.500Z
    if (forma === 0) return iso;
    const sinMs = iso.replace(/\.\d{3}Z$/, 'Z');
    if (forma === 1) return ms % 1000 === 0 ? sinMs : iso;
    const m = /\.(\d{3})Z$/.exec(iso)[1].replace(/0+$/, '');
    return m === '' ? sinMs : iso.replace(/\.\d{3}Z$/, '.' + m + 'Z');
  };
  const inicio = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 6000; i++) {
    const a = inicio + az.entero(0, 3000) * (az.prob(0.5) ? 500 : 1000);
    const b = az.prob(0.3) ? a : inicio + az.entero(0, 3000) * (az.prob(0.5) ? 500 : 1000);
    const esperado = a > b ? 'ocupado' : 'vencido';
    assert.equal(M6.estadoBloqueo({ expira_utc: fmt(a, az.entero(0, 2)) }, fmt(b, az.entero(0, 2))), esperado, a + ' vs ' + b);
  }
});

test('un bloqueo o un instante mal formados fallan con código, no se interpretan', () => {
  const ahora = '2026-10-05T11:00:00Z';
  for (const f of [{ expira_utc: 'mañana' }, { expira_utc: null }, {}, 'x', 5, [], { expira_utc: '2026-10-05 11:30:00' }, { expira_utc: '2026-10-05T25:00:00Z' }]) {
    assert.equal(codigo(() => M6.estadoBloqueo(f, ahora)), 'E_BLOQUEO_INVALIDO', JSON.stringify(f));
  }
  for (const a of [undefined, null, '', 'ahora', 5, '2026-10-05', '2026-10-05T11:00:00']) {
    assert.equal(codigo(() => M6.estadoBloqueo({ expira_utc: '2026-10-05T11:30:00Z' }, a)), 'E_BLOQUEO_INVALIDO', JSON.stringify(a));
    assert.equal(codigo(() => M6.estadoBloqueo(null, a)), null); // sin fila, el instante no se mira
  }
});

/* ------------------------------------------------------ decidirEjecucion */

test('tabla de decisión completa', () => {
  const t = [
    [true, 'libre', 'omitir_ya_procesado'], [true, 'ocupado', 'omitir_ya_procesado'], [true, 'vencido', 'omitir_ya_procesado'],
    [false, 'libre', 'procesar'], [false, 'ocupado', 'omitir_en_curso'], [false, 'vencido', 'alertar_bloqueo_vencido']
  ];
  for (const [ok, bloqueo, esperado] of t) {
    assert.equal(M6.decidirEjecucion({ hay_fila_ok: ok, bloqueo }), esperado, ok + ' + ' + bloqueo);
  }
});

test('«procesar» es la única decisión que permite trabajar, y solo con libro sin fila «ok» y bloqueo libre', () => {
  const decisiones = new Set();
  for (const ok of [true, false]) for (const b of ['libre', 'ocupado', 'vencido']) {
    const d = M6.decidirEjecucion({ hay_fila_ok: ok, bloqueo: b });
    decisiones.add(d);
    if (d === 'procesar') assert.deepEqual([ok, b], [false, 'libre']);
  }
  assert.deepEqual([...decisiones].sort(), ['alertar_bloqueo_vencido', 'omitir_en_curso', 'omitir_ya_procesado', 'procesar']);
});

test('una decisión con datos raros falla con código, no elige por su cuenta', () => {
  for (const e of [null, undefined, {}, { hay_fila_ok: 'true', bloqueo: 'libre' }, { hay_fila_ok: 1, bloqueo: 'libre' }, { hay_fila_ok: false, bloqueo: 'LIBRE' },
    { hay_fila_ok: false }, { bloqueo: 'libre' }, { hay_fila_ok: false, bloqueo: null }, 'x', 5]) {
    assert.equal(codigo(() => M6.decidirEjecucion(e)), 'E_DECISION_INVALIDA', JSON.stringify(e));
  }
});

/* ---------------------------------------------- flujo de idempotencia entero */

test('escenario: dos ejecuciones seguidas con el mismo archivo procesan una sola vez', () => {
  const libro = [];
  const bloqueos = new Map();
  const correr = (cliente, fecha, huella, ahora) => {
    const clave = M6.claveEjecucion(cliente, fecha, huella);
    const decision = M6.decidirEjecucion({
      hay_fila_ok: libro.some((f) => f.clave === clave && f.estado === 'ok'),
      bloqueo: M6.estadoBloqueo(bloqueos.get(cliente) || null, ahora)
    });
    if (decision !== 'procesar') return decision;
    bloqueos.set(cliente, { expira_utc: '2026-10-05T11:30:00Z' });
    libro.push(M6.filaLibro({ ...FILA(), cliente_id: cliente, semana_iso: Util.semanaISO(fecha), hash_archivo: huella }));
    bloqueos.delete(cliente);
    return decision;
  };
  assert.equal(correr('demo-01', '2026-10-05', HUELLA, '2026-10-05T11:00:00Z'), 'procesar');
  assert.equal(correr('demo-01', '2026-10-05', HUELLA, '2026-10-05T11:05:00Z'), 'omitir_ya_procesado');
  assert.equal(correr('demo-01', '2026-10-06', HUELLA, '2026-10-06T11:00:00Z'), 'omitir_ya_procesado'); // recuperación diaria, mismo archivo y semana
  assert.equal(correr('demo-01', '2026-10-06', OTRA_HUELLA, '2026-10-06T11:00:00Z'), 'procesar'); // archivo nuevo
  assert.equal(correr('demo-01', '2026-10-12', HUELLA, '2026-10-12T11:00:00Z'), 'procesar'); // semana siguiente
  assert.equal(correr('demo-02', '2026-10-05', HUELLA, '2026-10-05T11:00:00Z'), 'procesar'); // otro cliente
});

test('escenario: una ejecución caída deja un bloqueo vencido y el sistema avisa en vez de reintentar solo', () => {
  const bloqueo = { expira_utc: '2026-10-05T11:30:00Z' };
  assert.equal(M6.decidirEjecucion({ hay_fila_ok: false, bloqueo: M6.estadoBloqueo(bloqueo, '2026-10-05T11:10:00Z') }), 'omitir_en_curso');
  assert.equal(M6.decidirEjecucion({ hay_fila_ok: false, bloqueo: M6.estadoBloqueo(bloqueo, '2026-10-05T12:00:00Z') }), 'alertar_bloqueo_vencido');
});

test('no modifica sus argumentos', () => {
  const d = Object.freeze(FILA());
  const antes = JSON.stringify(d);
  M6.filaLibro(d);
  const f = Object.freeze({ expira_utc: '2026-10-05T11:30:00Z' });
  M6.estadoBloqueo(f, '2026-10-05T11:00:00Z');
  const c = Object.freeze({ cliente_id: 'demo-01' });
  M6.sanearError(new Error('x'), c);
  assert.equal(JSON.stringify(d), antes);
});
