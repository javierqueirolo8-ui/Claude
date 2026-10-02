'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, plano } = require('./cargar');
const azar = require('./azar');

const { Util, M5 } = cargar('util', 'm5-guardia-envio');

const ADMIN = 'administracion@empresa-ficticia.com.uy';
const PRUEBA = 'javier.prueba@ejemplo.com';
const REAL = { permitido: true, dry_run: false };

const base = (extra = {}) => ({
  solicitados: [ADMIN],
  lista_blanca: [ADMIN],
  guardias: { ...REAL },
  modo_cliente: 'real',
  remitente_prueba: PRUEBA,
  ...extra
});
const guardia = (e) => plano(M5.guardiaEnvio(e));

/* ------------------------------------------------------------- caso normal */

test('con las dos llaves abiertas y el destinatario en la lista blanca, se envía', () => {
  const r = guardia(base());
  assert.deepEqual(r, { accion: 'enviar', destinatarios: [ADMIN], motivos: [], bloqueados: [] });
});

test('el resultado tiene solo los campos previstos: no existen copia (Cc) ni copia oculta (Bcc)', () => {
  for (const e of [base(), base({ modo_cliente: 'dry_run' }), base({ guardias: { permitido: false } }), null]) {
    const r = guardia(e);
    assert.deepEqual(Object.keys(r).sort(), ['accion', 'bloqueados', 'destinatarios', 'motivos']);
  }
});

test('mayúsculas y espacios de los destinatarios pedidos se normalizan; el resultado es siempre canónico', () => {
  const r = guardia(base({ solicitados: ['  ' + ADMIN.toUpperCase() + ' \n'] }));
  assert.equal(r.accion, 'enviar');
  assert.deepEqual(r.destinatarios, [ADMIN]);
  assert.equal(/\s/.test(r.destinatarios[0]), false);
});

test('destinatarios repetidos se envían una sola vez', () => {
  const dos = 'contadora@empresa-ficticia.com.uy';
  const r = guardia(base({ lista_blanca: [ADMIN, dos], solicitados: [ADMIN, dos, ADMIN.toUpperCase()] }));
  assert.equal(r.accion, 'enviar');
  assert.deepEqual(r.destinatarios, [ADMIN, dos]);
});

/* ------------------------------------------------------------- lista blanca */

test('una dirección fuera de la lista blanca bloquea TODO el envío, aunque las demás estén bien', () => {
  const r = guardia(base({ solicitados: [ADMIN, 'otra@empresa-ficticia.com.uy'] }));
  assert.equal(r.accion, 'no_enviar');
  assert.deepEqual(r.destinatarios, []);
  assert.deepEqual(r.motivos, ['DESTINATARIO_BLOQUEADO']);
  assert.deepEqual(r.bloqueados, [{ indice: 1, motivo: 'NO_EN_LISTA_BLANCA' }]);
});

test('una dirección mal formada bloquea todo el envío y solo informa su posición, no su contenido', () => {
  const r = guardia(base({ solicitados: [ADMIN, 'esto no es un correo'] }));
  assert.equal(r.accion, 'no_enviar');
  assert.deepEqual(r.bloqueados, [{ indice: 1, motivo: 'DESTINATARIO_INVALIDO' }]);
  assert.equal(JSON.stringify(r).includes('esto no es'), false);
});

test('el bloqueo también rige en ensayo: si lo pedido no está en la lista blanca, algo aguas arriba está mal', () => {
  const r = guardia(base({ modo_cliente: 'dry_run', solicitados: ['otra@empresa-ficticia.com.uy'] }));
  assert.equal(r.accion, 'no_enviar');
  assert.deepEqual(r.destinatarios, []);
});

test('tamaño de la lista blanca: de 1 a 3 (por defecto)', () => {
  const cuatro = ['a1@x.com', 'b2@x.com', 'c3@x.com', 'd4@x.com'];
  for (const lb of [[], undefined, null, 'a1@x.com', cuatro, {}]) {
    const r = guardia(base({ lista_blanca: lb, solicitados: ['a1@x.com'] }));
    assert.equal(r.accion, 'no_enviar', JSON.stringify(lb));
    assert.deepEqual(r.motivos, ['LISTA_BLANCA_TAMANO']);
  }
});

test('la lista blanca debe venir ya en forma canónica: no se «corrige» sola', () => {
  for (const lb of [['Administracion@Empresa-Ficticia.com.uy'], [' ' + ADMIN], [ADMIN, 'no-es-correo'], [5], [null], [ADMIN + '\n']]) {
    const r = guardia(base({ lista_blanca: lb }));
    assert.equal(r.accion, 'no_enviar', JSON.stringify(lb));
    assert.deepEqual(r.motivos, ['LISTA_BLANCA_INVALIDA']);
  }
});

test('tamaño de lo solicitado: de 1 al máximo', () => {
  const lb = ['a1@x.com', 'b2@x.com', 'c3@x.com'];
  for (const sol of [[], undefined, null, 'a1@x.com', ['a1@x.com', 'b2@x.com', 'c3@x.com', 'a1@x.com'], {}]) {
    const r = guardia(base({ lista_blanca: lb, solicitados: sol }));
    assert.equal(r.accion, 'no_enviar', JSON.stringify(sol));
    assert.deepEqual(r.motivos, ['SOLICITADOS_INVALIDOS']);
  }
  const ok = guardia(base({ lista_blanca: lb, solicitados: lb }));
  assert.equal(ok.accion, 'enviar');
  assert.deepEqual(ok.destinatarios, lb);
});

test('el máximo configurable nunca supera el tope absoluto de 5; un valor inválido vuelve a 3', () => {
  assert.equal(M5.TOPE_ABSOLUTO, 5);
  const cinco = ['a1@x.com', 'b2@x.com', 'c3@x.com', 'd4@x.com', 'e5@x.com'];
  assert.equal(guardia(base({ lista_blanca: cinco, solicitados: cinco, max_destinatarios: 5 })).accion, 'enviar');
  for (const m of [6, 100, 0, -1, 2.5, '5', NaN, Infinity, null]) {
    const r = guardia(base({ lista_blanca: cinco, solicitados: cinco, max_destinatarios: m }));
    assert.equal(r.accion, 'no_enviar', 'max ' + String(m));
  }
  const dos = guardia(base({ lista_blanca: cinco.slice(0, 3), solicitados: cinco.slice(0, 3), max_destinatarios: 2 }));
  assert.equal(dos.accion, 'no_enviar'); // 3 direcciones con un máximo de 2
});

/* ---------------------------------------------------- destinatarios hostiles */

const HOSTILES = () => {
  const cirilica = String.fromCharCode(0x0430); // «а» cirílica, idéntica a la «a» latina
  const arrobaAncha = String.fromCharCode(0xFF20); // «＠» de ancho completo
  const separadorLinea = String.fromCharCode(0x2028);
  const ceroAncho = String.fromCharCode(0x200B);
  const bidi = String.fromCharCode(0x202E);
  const nul = String.fromCharCode(0);
  return [
    ADMIN + '\r\nBcc: espia@malo.com',
    ADMIN + '\nBcc: espia@malo.com',
    ADMIN + '\rCc: espia@malo.com',
    'espia@malo.com\r\n' + ADMIN,
    ADMIN + ',espia@malo.com',
    ADMIN + ';espia@malo.com',
    ADMIN + ' espia@malo.com',
    ADMIN + '\tespia@malo.com',
    '<' + ADMIN + '>',
    'Administración <' + ADMIN + '>',
    '"' + ADMIN + '"',
    '"x"@empresa-ficticia.com.uy',
    ADMIN + '%0d%0aBcc:espia@malo.com',
    ADMIN + '%0aBcc:espia@malo.com',
    ADMIN + nul,
    nul + ADMIN.slice(1),
    cirilica + 'dministracion@empresa-ficticia.com.uy',
    'administracion' + arrobaAncha + 'empresa-ficticia.com.uy',
    ADMIN.replace('@', ceroAncho + '@'),
    ADMIN.replace('empresa', 'empre' + ceroAncho + 'sa'),
    ADMIN + separadorLinea + 'Bcc: espia@malo.com',
    bidi + ADMIN,
    ADMIN + '.',
    ADMIN.replace('@', '@@'),
    ADMIN.replace('.com.uy', '..com.uy'),
    ADMIN.replace('@', ' @ '),
    'mailto:' + ADMIN,
    ADMIN + '?bcc=espia@malo.com',
    ADMIN + '&cc=espia@malo.com',
    ADMIN + '(espia@malo.com)',
    'administracion@[192.168.0.1]',
    'administracion@empresa-ficticia.com.uy>\nBcc: x@y.com',
    '',
    '   ',
    '@',
    ADMIN.slice(0, 5)
  ];
};

test('cada intento hostil de colar otro destinatario o cabecera es rechazado y no se envía a nadie', () => {
  for (const h of HOSTILES()) {
    for (const modo of ['real', 'dry_run']) {
      const r = guardia(base({ solicitados: [h], modo_cliente: modo }));
      assert.equal(r.accion, 'no_enviar', 'modo ' + modo + ' · ' + JSON.stringify(h));
      assert.deepEqual(r.destinatarios, []);
      assert.deepEqual(r.motivos, ['DESTINATARIO_BLOQUEADO']);
      assert.deepEqual(r.bloqueados, [{ indice: 0, motivo: 'DESTINATARIO_INVALIDO' }]);
    }
  }
});

test('un hostil acompañado de un destinatario válido tampoco deja pasar al válido', () => {
  for (const h of HOSTILES()) {
    const r = guardia(base({ solicitados: [ADMIN, h] }));
    assert.equal(r.accion, 'no_enviar', JSON.stringify(h));
    assert.deepEqual(r.destinatarios, []);
  }
});

test('los hostiles no se cuelan por la lista blanca', () => {
  for (const h of HOSTILES()) {
    const r = guardia(base({ lista_blanca: [h], solicitados: [ADMIN] }));
    assert.equal(r.accion, 'no_enviar', JSON.stringify(h));
    assert.deepEqual(r.destinatarios, []);
  }
});

test('lo que no es un texto en la lista de pedidos se rechaza', () => {
  for (const v of [null, undefined, 5, true, {}, [], [ADMIN], { toString: () => ADMIN }]) {
    const r = guardia(base({ solicitados: [v] }));
    assert.equal(r.accion, 'no_enviar', JSON.stringify(v));
    assert.deepEqual(r.destinatarios, []);
  }
});

/* ------------------------------------------------------------- interruptor */

test('sin interruptor abierto no se hace nada, ni siquiera el ensayo', () => {
  for (const g of [undefined, null, {}, { permitido: false }, { permitido: 'true' }, { permitido: 1 }, { permitido: 'on' }, { dry_run: false }, 'on']) {
    for (const modo of ['real', 'dry_run']) {
      const r = guardia(base({ guardias: g, modo_cliente: modo }));
      assert.equal(r.accion, 'no_enviar', JSON.stringify(g));
      assert.deepEqual(r.destinatarios, []);
      assert.deepEqual(r.motivos, ['INTERRUPTOR_APAGADO']);
    }
  }
});

test('entrada que no es un objeto: no se envía', () => {
  for (const e of [undefined, null, 5, 'texto', true]) {
    const r = guardia(e);
    assert.equal(r.accion, 'no_enviar');
    assert.deepEqual(r.motivos, ['ENTRADA_INVALIDA']);
    assert.deepEqual(r.destinatarios, []);
  }
});

/* --------------------------------------------------------- llave doble */

test('llave doble: solo con «sin ensayo» global Y cliente en modo «real» se envía al destinatario real', () => {
  const casos = [
    [{ permitido: true, dry_run: false }, 'real', 'enviar'],
    [{ permitido: true, dry_run: true }, 'real', 'redirigir_ensayo'],
    [{ permitido: true, dry_run: false }, 'dry_run', 'redirigir_ensayo'],
    [{ permitido: true, dry_run: true }, 'dry_run', 'redirigir_ensayo'],
    [{ permitido: true, dry_run: false }, undefined, 'redirigir_ensayo'],
    [{ permitido: true, dry_run: false }, 'REAL', 'redirigir_ensayo'],
    [{ permitido: true, dry_run: false }, ' real', 'redirigir_ensayo'],
    [{ permitido: true, dry_run: false }, true, 'redirigir_ensayo'],
    [{ permitido: true, dry_run: false }, 'real ', 'redirigir_ensayo'],
    [{ permitido: true }, 'real', 'redirigir_ensayo'],
    [{ permitido: true, dry_run: 'false' }, 'real', 'redirigir_ensayo'],
    [{ permitido: true, dry_run: 0 }, 'real', 'redirigir_ensayo'],
    [{ permitido: true, dry_run: null }, 'real', 'redirigir_ensayo']
  ];
  for (const [g, modo, esperado] of casos) {
    const r = guardia(base({ guardias: g, modo_cliente: modo }));
    assert.equal(r.accion, esperado, JSON.stringify(g) + ' + ' + JSON.stringify(modo));
  }
});

test('en ensayo el mensaje va a la bandeja de pruebas y JAMÁS a la dirección del cliente', () => {
  const r = guardia(base({ modo_cliente: 'dry_run' }));
  assert.equal(r.accion, 'redirigir_ensayo');
  assert.deepEqual(r.destinatarios, [PRUEBA]);
  assert.deepEqual(r.motivos, ['ENSAYO']);
  assert.equal(r.destinatarios.includes(ADMIN), false);
});

test('en ensayo, sin remitente de pruebas válido no se envía nada', () => {
  for (const rp of [undefined, null, '', 'Javier@Ejemplo.com', 'no-es-correo', 5, ' ' + PRUEBA]) {
    const r = guardia(base({ modo_cliente: 'dry_run', remitente_prueba: rp }));
    assert.equal(r.accion, 'no_enviar', JSON.stringify(rp));
    assert.deepEqual(r.motivos, ['REMITENTE_PRUEBA_INVALIDO']);
    assert.deepEqual(r.destinatarios, []);
  }
});

test('en envío real el remitente de pruebas no interviene', () => {
  const r = guardia(base({ remitente_prueba: undefined }));
  assert.equal(r.accion, 'enviar');
  assert.deepEqual(r.destinatarios, [ADMIN]);
});

/* -------------------------------------------------------------- pureza */

test('no modifica sus argumentos', () => {
  const e = base({ lista_blanca: [ADMIN, 'b@x.com'], solicitados: [ADMIN.toUpperCase(), 'b@x.com'] });
  const antes = JSON.stringify(e);
  Object.freeze(e.solicitados);
  Object.freeze(e.lista_blanca);
  Object.freeze(e.guardias);
  Object.freeze(e);
  guardia(e);
  assert.equal(JSON.stringify(e), antes);
});

test('mismo pedido, misma respuesta (determinista)', () => {
  const e = base({ modo_cliente: 'dry_run' });
  assert.deepEqual(guardia(e), guardia(e));
});

test('un pedido bloqueado no devuelve nunca el texto del destinatario pedido (canario)', () => {
  const canario = 'canario.secreto.4471';
  const r = guardia(base({ solicitados: [canario + '@otra-empresa.com'] }));
  assert.equal(r.accion, 'no_enviar');
  assert.equal(JSON.stringify(r).includes('canario'), false);
});

/* ------------------------------------------------------------ propiedades */

test('propiedad: sobre miles de entradas al azar, el envío sale solo si TODAS las condiciones se cumplen', () => {
  const pool = [ADMIN, 'contabilidad@empresa-ficticia.com.uy', PRUEBA, 'espia@malo.com', 'a1@x.io', 'b2@x.io'];
  const cuenta = { enviar: 0, redirigir_ensayo: 0, no_enviar: 0 };
  for (const semilla of azar.semillas(202)) {
    const az = azar.crear(semilla);
    const hostiles = HOSTILES();
    const suelto = () => (az.prob(0.3) ? az.elegir(hostiles) : az.prob(0.1) ? az.elegir([null, 5, {}, [], undefined]) : az.elegir(pool.concat(['Admin@X.com', 'sin-arroba'])));
    const variar = (c) => az.elegir([c, c, c.toUpperCase(), '  ' + c + ' ', c + '\n']);
    for (let i = 0; i < 4000; i++) {
      // la mayoría de las veces una lista blanca sana (así se ejercitan los caminos de envío); a veces basura
      const lb = az.prob(0.8) ? az.barajar(pool).slice(0, az.entero(1, 3)) : Array.from({ length: az.entero(0, 5) }, suelto);
      const sol = az.prob(0.8) && lb.length && lb.every((x) => typeof x === 'string')
        ? Array.from({ length: az.entero(1, lb.length) }, () => variar(az.elegir(lb)))
        : Array.from({ length: az.entero(0, 5) }, suelto);
      const e = {
        solicitados: sol,
        lista_blanca: lb,
        guardias: az.prob(0.1) ? az.elegir([undefined, {}, { permitido: 'true' }, { permitido: false }]) : { permitido: true, dry_run: az.elegir([true, false, false, false, 'false', undefined]) },
        modo_cliente: az.elegir(['real', 'real', 'real', 'dry_run', 'REAL', undefined, null]),
        remitente_prueba: az.prob(0.9) ? PRUEBA : az.elegir(['Mal@x.com', undefined, 5]),
        max_destinatarios: az.prob(0.15) ? az.elegir([1, 2, 3, 4, 5, 6, 0, -1, '3']) : undefined
      };
      const r = guardia(e);
      cuenta[r.accion]++;
      const max = Number.isInteger(e.max_destinatarios) && e.max_destinatarios >= 1 && e.max_destinatarios <= 5 ? e.max_destinatarios : 3;
      const canonicos = (l) => Array.isArray(l) && l.every((x) => typeof x === 'string' && Util.normalizarCorreo(x) === x);

      assert.ok(['enviar', 'redirigir_ensayo', 'no_enviar'].includes(r.accion));
      assert.ok(r.destinatarios.length <= 5);
      assert.deepEqual(Object.keys(r).sort(), ['accion', 'bloqueados', 'destinatarios', 'motivos']);
      if (r.accion === 'no_enviar') {
        assert.deepEqual(r.destinatarios, []);
        assert.ok(r.motivos.length >= 1);
        continue;
      }
      // Toda salida que no es «no enviar» exige interruptor abierto, lista blanca sana y pedidos dentro de la lista blanca.
      assert.equal(e.guardias.permitido, true);
      assert.ok(canonicos(lb) && lb.length >= 1 && lb.length <= max);
      assert.ok(Array.isArray(sol) && sol.length >= 1 && sol.length <= max);
      sol.forEach((x) => assert.ok(lb.includes(Util.normalizarCorreo(x))));
      if (r.accion === 'enviar') {
        assert.equal(e.guardias.dry_run, false);
        assert.equal(e.modo_cliente, 'real');
        r.destinatarios.forEach((d) => assert.ok(lb.includes(d)));
        assert.equal(new Set(r.destinatarios).size, r.destinatarios.length);
      } else {
        assert.deepEqual(r.destinatarios, [e.remitente_prueba]);
        assert.equal(Util.normalizarCorreo(e.remitente_prueba), e.remitente_prueba);
      }
    }
  }
  // que la prueba no sea vacía: los tres resultados ocurren muchas veces
  assert.ok(cuenta.enviar > 300 && cuenta.redirigir_ensayo > 300 && cuenta.no_enviar > 300, JSON.stringify(cuenta));
});
