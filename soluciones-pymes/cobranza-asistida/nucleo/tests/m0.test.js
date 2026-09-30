'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, plano } = require('./cargar');
const azar = require('./azar');

const { M0 } = cargar('util', 'm0-guardias');
const guardias = (f) => plano(M0.evaluarGuardias(f));
const validar = (c) => plano(M0.validarConfigCliente(c));

const CFG = () => ({
  cliente_id: 'demo-01',
  destinatarios_permitidos: ['administracion@empresa-ficticia.com.uy'],
  remitente_prueba: 'javier.prueba@ejemplo.com',
  entrega: 'enlace_salida',
  modo: 'dry_run',
  zona_horaria: 'America/Montevideo',
  empresa: { nombre: 'Ferretería Ficticia S.R.L.' },
  umbral_rechazo: 20
});

/* ------------------------------------------------------------ evaluarGuardias */

test('interruptor encendido y ensayo desactivado: la única combinación que permite enviar de verdad', () => {
  assert.deepEqual(guardias({ interruptor: 'on', dry_run: 'false' }), { permitido: true, dry_run: false, motivo: null });
  assert.deepEqual(guardias({ interruptor: true, dry_run: false }), { permitido: true, dry_run: false, motivo: null });
});

test('interruptor encendido con ensayo activo o sin dato: sigue en ensayo', () => {
  assert.deepEqual(guardias({ interruptor: 'on', dry_run: 'true' }), { permitido: true, dry_run: true, motivo: null });
  assert.deepEqual(guardias({ interruptor: 'on' }), { permitido: true, dry_run: true, motivo: null });
  assert.deepEqual(guardias({ interruptor: true, dry_run: true }), { permitido: true, dry_run: true, motivo: null });
});

test('mayúsculas y espacios en los valores guardados no cambian el significado', () => {
  assert.deepEqual(guardias({ interruptor: ' ON ', dry_run: ' False ' }), { permitido: true, dry_run: false, motivo: null });
  assert.deepEqual(guardias({ interruptor: 'Off', dry_run: 'TRUE' }), { permitido: false, dry_run: true, motivo: 'INTERRUPTOR_APAGADO' });
});

test('interruptor apagado: no se procesa', () => {
  for (const v of ['off', false, 'OFF', ' off']) {
    const r = guardias({ interruptor: v, dry_run: 'false' });
    assert.equal(r.permitido, false);
    assert.equal(r.motivo, 'INTERRUPTOR_APAGADO');
  }
});

test('interruptor con un valor raro, ausente o de otro tipo: no se procesa, motivo «desconocido»', () => {
  for (const v of ['talvez', 'yes', 'si', 'sí', 'true', '1', 1, 0, null, undefined, '', {}, [], ['on']]) {
    const r = guardias({ interruptor: v, dry_run: 'false' });
    assert.equal(r.permitido, false, 'interruptor ' + JSON.stringify(v));
    assert.equal(r.motivo, 'INTERRUPTOR_DESCONOCIDO', 'interruptor ' + JSON.stringify(v));
  }
  const sin = guardias({});
  assert.equal(sin.permitido, false);
  assert.equal(sin.motivo, 'INTERRUPTOR_DESCONOCIDO');
});

test('ensayo: cualquier valor que no sea un «false» inequívoco deja el ensayo activo', () => {
  for (const v of ['no', 'falso', '0', 0, '', null, undefined, 'False!', 'f', 'nope', 'true', true, 'off', {}, [], [false], 'false ok']) {
    assert.equal(guardias({ interruptor: 'on', dry_run: v }).dry_run, true, 'dry_run ' + JSON.stringify(v));
  }
});

test('sin fila de control (o con algo que no es una fila): no se procesa y se ensaya', () => {
  for (const v of [null, undefined, 'on', 5, true, [], [{ interruptor: 'on' }], () => 1]) {
    assert.deepEqual(guardias(v), { permitido: false, dry_run: true, motivo: 'SIN_DATOS' });
  }
});

test('propiedad: sobre miles de entradas raras, «permitido» y «sin ensayo» solo salen de valores exactos', () => {
  for (const semilla of azar.semillas(101)) {
    const az = azar.crear(semilla);
    const valores = ['on', 'off', 'true', 'false', true, false, null, undefined, 0, 1, '', ' ', 'ON', 'False', 'yes', 'sí', {}, [], 'onn', 'of', ' on', 'on\n'];
    for (let i = 0; i < 4000; i++) {
      const fila = {};
      if (az.prob(0.9)) fila.interruptor = az.elegir(valores);
      if (az.prob(0.9)) fila.dry_run = az.elegir(valores);
      const r = guardias(fila);
      const i0 = fila.interruptor;
      const esOn = i0 === true || (typeof i0 === 'string' && i0.trim().toLowerCase() === 'on');
      assert.equal(r.permitido, esOn);
      const d0 = fila.dry_run;
      const esFalse = d0 === false || (typeof d0 === 'string' && d0.trim().toLowerCase() === 'false');
      assert.equal(r.dry_run, !esFalse);
      assert.deepEqual(Object.keys(r).sort(), ['dry_run', 'motivo', 'permitido']);
      assert.equal(r.permitido, r.motivo === null);
    }
  }
});

/* ------------------------------------------------------- validarConfigCliente */

test('una configuración completa es válida', () => {
  assert.deepEqual(validar(CFG()), { ok: true, problemas: [] });
});

test('sin «modo» se toma el ensayo; sin umbral tampoco es un problema', () => {
  const c = CFG();
  delete c.modo;
  delete c.umbral_rechazo;
  assert.deepEqual(validar(c), { ok: true, problemas: [] });
});

test('sin «modo», la configuración es de ensayo: el informe completo por correo no exige aceptación', () => {
  const c = CFG();
  delete c.modo;
  c.entrega = 'correo_completo';
  assert.deepEqual(validar(c), { ok: true, problemas: [] });
  c.modo = 'real';
  assert.deepEqual(validar(c).problemas, ['E_CFG_ENTREGA_REAL']);
});

test('lo que no es un objeto no es una configuración', () => {
  for (const v of [null, undefined, 'x', 5, [], true]) {
    assert.deepEqual(validar(v), { ok: false, problemas: ['E_CFG_CLIENTE'] });
  }
});

test('identificador de cliente: solo letras, números, guion y guion bajo, hasta 40', () => {
  for (const v of [undefined, null, '', 'a b', '../x', 'Ferretería', 'x'.repeat(41), 5, '-abc', '_abc', 'a/b', 'a|b']) {
    const c = CFG();
    c.cliente_id = v;
    assert.deepEqual(validar(c).problemas, ['E_CFG_CLIENTE_ID'], 'cliente_id ' + JSON.stringify(v));
  }
  for (const v of ['a', 'demo-01', 'Cliente_2', 'x'.repeat(40)]) {
    const c = CFG();
    c.cliente_id = v;
    assert.equal(validar(c).ok, true, 'cliente_id ' + v);
  }
});

test('destinatarios permitidos: de 1 a 3, ya en forma canónica y sin repetidos', () => {
  const casos = [
    [undefined, 'E_CFG_DESTINATARIOS_TAMANO'],
    ['a@empresa.com', 'E_CFG_DESTINATARIOS_TAMANO'],
    [[], 'E_CFG_DESTINATARIOS_TAMANO'],
    [['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'], 'E_CFG_DESTINATARIOS_TAMANO'],
    [['Admin@Empresa.com'], 'E_CFG_DESTINATARIOS_INVALIDOS'],
    [[' admin@empresa.com'], 'E_CFG_DESTINATARIOS_INVALIDOS'],
    [['admin@empresa.com', 'admin@empresa.com'], 'E_CFG_DESTINATARIOS_INVALIDOS'],
    [['admin@empresa'], 'E_CFG_DESTINATARIOS_INVALIDOS'],
    [['admin@empresa.com,otro@empresa.com'], 'E_CFG_DESTINATARIOS_INVALIDOS'],
    [[5], 'E_CFG_DESTINATARIOS_INVALIDOS'],
    [[null], 'E_CFG_DESTINATARIOS_INVALIDOS'],
    [[{ correo: 'a@x.com' }], 'E_CFG_DESTINATARIOS_INVALIDOS']
  ];
  for (const [valor, codigo] of casos) {
    const c = CFG();
    c.destinatarios_permitidos = valor;
    assert.deepEqual(validar(c).problemas, [codigo], JSON.stringify(valor));
  }
  const tres = CFG();
  tres.destinatarios_permitidos = ['a1@empresa.com', 'b2@empresa.com', 'c3@empresa.com'];
  assert.equal(validar(tres).ok, true);
});

test('remitente de pruebas: una dirección canónica', () => {
  for (const v of [undefined, null, '', 'Javier@Ejemplo.com', 'javier', 5, ' javier@ejemplo.com']) {
    const c = CFG();
    c.remitente_prueba = v;
    assert.deepEqual(validar(c).problemas, ['E_CFG_REMITENTE_PRUEBA'], JSON.stringify(v));
  }
});

test('entrega, modo y zona horaria', () => {
  const casos = [
    ['entrega', 'correo', 'E_CFG_ENTREGA'], ['entrega', undefined, 'E_CFG_ENTREGA'], ['entrega', 'ENLACE_SALIDA', 'E_CFG_ENTREGA'],
    ['modo', 'real ', 'E_CFG_MODO'], ['modo', 'REAL', 'E_CFG_MODO'], ['modo', true, 'E_CFG_MODO'], ['modo', null, 'E_CFG_MODO'],
    ['zona_horaria', undefined, 'E_CFG_ZONA'], ['zona_horaria', '', 'E_CFG_ZONA'], ['zona_horaria', 'Montevideo; DROP', 'E_CFG_ZONA'],
    ['zona_horaria', 'Mars/Olympus', 'E_CFG_ZONA'], ['zona_horaria', 5, 'E_CFG_ZONA'], ['zona_horaria', '../etc', 'E_CFG_ZONA']
  ];
  for (const [campo, valor, codigo] of casos) {
    const c = CFG();
    c[campo] = valor;
    assert.deepEqual(validar(c).problemas, [codigo], campo + ' = ' + JSON.stringify(valor));
  }
  for (const z of ['America/Montevideo', 'UTC', 'America/Argentina/Buenos_Aires', 'Europe/Madrid']) {
    const c = CFG();
    c.zona_horaria = z;
    assert.equal(validar(c).ok, true, z);
  }
});

test('nombre de la empresa: obligatorio, sin controles y hasta 120 caracteres', () => {
  for (const v of [undefined, null, {}, { nombre: '' }, { nombre: '   ' }, { nombre: 'x'.repeat(121) }, { nombre: 5 }, { nombre: String.fromCharCode(0, 8203) }, 'Empresa']) {
    const c = CFG();
    c.empresa = v;
    assert.deepEqual(validar(c).problemas, ['E_CFG_EMPRESA'], JSON.stringify(v));
  }
  const c = CFG();
  c.empresa = { nombre: 'x'.repeat(120) };
  assert.equal(validar(c).ok, true);
});

test('umbral de rechazo: número entre 0 y 100', () => {
  for (const v of [-1, 101, '20', NaN, Infinity, null, true, {}]) {
    const c = CFG();
    c.umbral_rechazo = v;
    assert.deepEqual(validar(c).problemas, ['E_CFG_UMBRAL'], String(v));
  }
  for (const v of [0, 20, 100, 12.5]) {
    const c = CFG();
    c.umbral_rechazo = v;
    assert.equal(validar(c).ok, true, String(v));
  }
});

test('modo real con informe completo por correo exige una aceptación explícita', () => {
  const real = CFG();
  real.modo = 'real';
  real.entrega = 'correo_completo';
  assert.deepEqual(validar(real).problemas, ['E_CFG_ENTREGA_REAL']);
  real.acepta_correo_completo = 'true';
  assert.deepEqual(validar(real).problemas, ['E_CFG_ENTREGA_REAL']);
  real.acepta_correo_completo = 1;
  assert.deepEqual(validar(real).problemas, ['E_CFG_ENTREGA_REAL']);
  real.acepta_correo_completo = true;
  assert.equal(validar(real).ok, true);

  const enlace = CFG();
  enlace.modo = 'real';
  assert.equal(validar(enlace).ok, true);

  const ensayo = CFG();
  ensayo.entrega = 'correo_completo';
  assert.equal(validar(ensayo).ok, true); // en ensayo, con datos ficticios, el informe completo es lo esperado
});

test('devuelve TODOS los problemas de una vez, sin repetidos', () => {
  const r = validar({ cliente_id: '', destinatarios_permitidos: [], remitente_prueba: 'x', entrega: '?', modo: '?', zona_horaria: '?', empresa: null, umbral_rechazo: 500 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.problemas.slice().sort(), [
    'E_CFG_CLIENTE_ID', 'E_CFG_DESTINATARIOS_TAMANO', 'E_CFG_EMPRESA', 'E_CFG_ENTREGA', 'E_CFG_MODO',
    'E_CFG_REMITENTE_PRUEBA', 'E_CFG_UMBRAL', 'E_CFG_ZONA'
  ]);
  const dos = CFG();
  dos.destinatarios_permitidos = ['A@x.com', 'B@x.com'];
  assert.deepEqual(validar(dos).problemas, ['E_CFG_DESTINATARIOS_INVALIDOS']); // un solo código aunque haya dos direcciones mal
});

test('los problemas son solo códigos: ningún valor de la configuración aparece en la respuesta (canario)', () => {
  const CANARIO = 'CANARIO_SECRETO_7731';
  const c = {
    cliente_id: CANARIO + ' !!', destinatarios_permitidos: [CANARIO + '@x.com', 5], remitente_prueba: CANARIO,
    entrega: CANARIO, modo: CANARIO, zona_horaria: CANARIO, empresa: { nombre: 'x'.repeat(200) + CANARIO }, umbral_rechazo: CANARIO
  };
  const r = validar(c);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(r).includes(CANARIO), false);
  for (const p of r.problemas) assert.match(p, /^E_[A-Z0-9_]{2,40}$/);
});

test('no modifica la configuración recibida', () => {
  const c = CFG();
  const antes = JSON.stringify(c);
  Object.freeze(c);
  Object.freeze(c.empresa);
  Object.freeze(c.destinatarios_permitidos);
  validar(c);
  assert.equal(JSON.stringify(c), antes);
});
