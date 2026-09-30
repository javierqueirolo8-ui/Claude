'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, plano, capturar } = require('./cargar');

const { Util } = cargar('util');
const U = (fn) => plano(fn());
const ch = (n) => String.fromCharCode(n);

/* ------------------------------------------------------------------ errores */

test('fallar lanza solo el código y codigoDe nunca devuelve texto libre', () => {
  assert.equal(capturar(() => Util.fallar('E_PRUEBA')).mensaje, 'E_PRUEBA');
  assert.equal(capturar(() => Util.fallar('E_PRUEBA')).codigo, 'E_PRUEBA');
  // un código mal formado (por ejemplo, con un dato dentro) se sustituye
  assert.equal(capturar(() => Util.fallar('Juan Pérez 099123456')).codigo, 'E_INTERNO');
  assert.equal(capturar(() => Util.fallar('E_' + 'A'.repeat(60))).codigo, 'E_INTERNO');
  assert.equal(Util.codigoDe(new Error('E_ABC')), 'E_ABC');
  assert.equal(Util.codigoDe(new Error('Cliente Ficticio S.A. debe 100')), 'E_DESCONOCIDO');
  assert.equal(Util.codigoDe({ codigo: 'e_minuscula' }), 'E_DESCONOCIDO');
  assert.equal(Util.codigoDe(null), 'E_DESCONOCIDO');
  assert.equal(Util.codigoDe('texto'), 'E_DESCONOCIDO');
});

/* -------------------------------------------------------------------- texto */

test('limpiar quita controles, ancho cero y marcas bidireccionales, y colapsa espacios', () => {
  assert.equal(Util.limpiar('  Hola \t\n mundo  '), 'Hola mundo');
  assert.equal(Util.limpiar('A' + ch(0x200B) + 'B' + ch(0x202E) + 'C' + ch(0x2066) + 'D' + ch(0) + 'E'), 'A B C D E');
  assert.equal(Util.limpiar('a' + ch(0x2028) + 'b' + ch(0x2029) + 'c'), 'a b c');
  assert.equal(Util.limpiar('cafe' + ch(0x0301)), 'caf' + ch(0xE9)); // NFC: e + acento combinado → é
  assert.equal(Util.limpiar(null), '');
  assert.equal(Util.limpiar(undefined), '');
  assert.equal(Util.limpiar({ a: 1 }), '');
  assert.equal(Util.limpiar([1, 2]), '');
  assert.equal(Util.limpiar(NaN), '');
  assert.equal(Util.limpiar(Infinity), '');
  assert.equal(Util.limpiar(42), '42');
  assert.equal(Util.limpiar(true), 'true');
});

test('limpiar ignora un Date de JavaScript: su conversión a texto depende de la zona horaria', () => {
  assert.equal(Util.limpiar(new Date(0)), '');
});

test('clave compara títulos sin mayúsculas, tildes ni signos', () => {
  assert.equal(Util.clave('  Fecha de Vencimiento  '), 'fechadevencimiento');
  assert.equal(Util.clave('N° Comprobante'), 'ncomprobante');
  assert.equal(Util.clave('Teléfono/Celular'), 'telefonocelular');
});

test('escHtml escapa los seis caracteres peligrosos', () => {
  assert.equal(Util.escHtml(`<script>alert("x")&'\`</script>`),
    '&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;&#96;&lt;/script&gt;');
  assert.equal(Util.escHtml(null), '');
});

/* ------------------------------------------------------------------- fechas */

test('parsearFecha: formatos válidos, siempre día primero', () => {
  const casos = [
    ['30/09/2026', '2026-09-30'], ['30-9-26', '2026-09-30'], ['30.09.2026', '2026-09-30'],
    ['1/1/2026', '2026-01-01'], ['2026-09-30', '2026-09-30'], ['2026/09/30', '2026-09-30'],
    ['30 sep 2026', '2026-09-30'], ['30 de septiembre de 2026', '2026-09-30'], ['30 setiembre 2026', '2026-09-30'],
    ['5 ene 27', '2027-01-05'], ['29/02/2028', '2028-02-29'], ['  30/09/2026  ', '2026-09-30'],
    ['30/09/2026 0:00:00', '2026-09-30'], ['30/09/2026 10:15', '2026-09-30'],
    ['2026-09-30T00:00:00Z', '2026-09-30'], ['2026-09-30T00:00:00.000-03:00', '2026-09-30'],
    ['2026-09-30 10:15:00', '2026-09-30'], ['2026-09-30T10:15', '2026-09-30'], ['30 SEP 2026', '2026-09-30'],
    ['30 de Septiembre de 2026', '2026-09-30']
  ];
  casos.forEach(([entrada, esperado]) => {
    assert.deepEqual(U(() => Util.parsearFecha(entrada)), { ok: true, iso: esperado }, entrada);
  });
});

test('parsearFecha: rechaza con código, sin adivinar', () => {
  const casos = [
    ['31/02/2026', 'E_FECHA_INVALIDA'], ['32/01/2026', 'E_FECHA_INVALIDA'], ['00/01/2026', 'E_FECHA_INVALIDA'],
    ['29/02/2027', 'E_FECHA_INVALIDA'], ['13/13/2026', 'E_FECHA_INVALIDA'], ['2026-13-01', 'E_FECHA_INVALIDA'],
    ['2026-02-30', 'E_FECHA_INVALIDA'], ['1999-12-31', 'E_FECHA_INVALIDA'], ['30/09/2100', 'E_FECHA_INVALIDA'],
    ['09/30/2026', 'E_FECHA_AMBIGUA'], ['12/31/2026', 'E_FECHA_AMBIGUA'], ['1/13/2026', 'E_FECHA_AMBIGUA'],
    ['', 'E_FECHA_VACIA'], ['   ', 'E_FECHA_VACIA'], [null, 'E_FECHA_VACIA'], [undefined, 'E_FECHA_VACIA'],
    ['ayer', 'E_FECHA_INVALIDA'], ['30/09', 'E_FECHA_INVALIDA'], ['45930', 'E_FECHA_INVALIDA'],
    ['30 de foo de 2026', 'E_FECHA_INVALIDA'], ['30/09/26/1', 'E_FECHA_INVALIDA'], [{}, 'E_FECHA_VACIA']
  ];
  casos.forEach(([entrada, codigo]) => {
    assert.deepEqual(U(() => Util.parsearFecha(entrada)), { ok: false, codigo }, String(entrada));
  });
});

test('parsearFecha: número de serie de Excel solo si es un número', () => {
  const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  assert.deepEqual(U(() => Util.parsearFecha(serial(2026, 9, 30))), { ok: true, iso: '2026-09-30' });
  assert.deepEqual(U(() => Util.parsearFecha(serial(2026, 9, 30) + 0.75)), { ok: true, iso: '2026-09-30' });
  assert.deepEqual(U(() => Util.parsearFecha(serial(2000, 1, 1))), { ok: true, iso: '2000-01-01' });
  assert.deepEqual(U(() => Util.parsearFecha(serial(2099, 12, 31))), { ok: true, iso: '2099-12-31' });
  assert.equal(U(() => Util.parsearFecha(5)).ok, false);
  assert.equal(U(() => Util.parsearFecha(NaN)).ok, false);
  assert.equal(U(() => Util.parsearFecha(serial(2100, 1, 1))).ok, false);
});

test('parsearFecha: un instante con desfase necesita zona; medianoche UTC se toma tal cual', () => {
  const zona = 'America/Montevideo';
  // 00:00 hora de Montevideo del 30 = 03:00 UTC del 30 (así lo serializan muchos exportadores)
  assert.deepEqual(U(() => Util.parsearFecha('2026-09-30T03:00:00.000Z', { zona })), { ok: true, iso: '2026-09-30' });
  assert.deepEqual(U(() => Util.parsearFecha('2026-09-30T15:00:00Z', { zona })), { ok: true, iso: '2026-09-30' });
  assert.deepEqual(U(() => Util.parsearFecha('2026-09-30T01:00:00Z', { zona })), { ok: true, iso: '2026-09-29' });
  assert.deepEqual(U(() => Util.parsearFecha('2026-09-30T03:00:00.000Z')), { ok: false, codigo: 'E_FECHA_AMBIGUA' });
  assert.deepEqual(U(() => Util.parsearFecha('2026-09-30T00:00:00.000Z', { zona })), { ok: true, iso: '2026-09-30' });
  assert.deepEqual(U(() => Util.parsearFecha('2026-09-30T03:00:00-03:00', { zona: 'Europe/Madrid' })), { ok: true, iso: '2026-09-30' });
  assert.deepEqual(U(() => Util.parsearFecha('2026-09-30T10:00:00Z', { zona: 'Zona/Inexistente' })), { ok: false, codigo: 'E_FECHA_AMBIGUA' });
});

test('sumarDias y diasEntre no dependen del horario de verano ni de la zona', () => {
  assert.equal(Util.diasEntre('2026-09-30', '2026-10-05'), 5);
  assert.equal(Util.diasEntre('2026-10-05', '2026-09-30'), -5);
  assert.equal(Util.diasEntre('2026-03-28', '2026-03-30'), 2); // cambio de hora en Europa
  assert.equal(Util.diasEntre('2026-10-24', '2026-10-26'), 2);
  assert.equal(Util.diasEntre('2028-02-28', '2028-03-01'), 2); // año bisiesto
  assert.equal(Util.diasEntre('2027-02-28', '2027-03-01'), 1);
  assert.equal(Util.diasEntre('2026-12-31', '2027-01-01'), 1);
  assert.equal(Util.sumarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(Util.sumarDias('2026-03-01', -1), '2026-02-28');
  assert.equal(capturar(() => Util.diasEntre('2026-02-30', '2026-03-01')).codigo, 'E_FECHA_INVALIDA');
  assert.equal(capturar(() => Util.sumarDias('mañana', 1)).codigo, 'E_FECHA_INVALIDA');
});

test('semanaISO: valores conocidos', () => {
  const casos = [
    ['2026-01-01', '2026-W01'], ['2025-12-29', '2026-W01'], ['2025-12-28', '2025-W52'],
    ['2020-12-31', '2020-W53'], ['2021-01-03', '2020-W53'], ['2021-01-04', '2021-W01'],
    ['2024-12-30', '2025-W01'], ['2026-12-31', '2026-W53'], ['2027-01-03', '2026-W53'], ['2027-01-04', '2027-W01'],
    ['2016-01-03', '2015-W53'], ['2015-12-31', '2015-W53'], ['2026-09-28', '2026-W40'], ['2026-10-04', '2026-W40'],
    ['2026-10-05', '2026-W41']
  ];
  casos.forEach(([iso, esperado]) => assert.equal(Util.semanaISO(iso), esperado, iso));
});

test('semanaISO coincide con una implementación independiente en todos los días de 2000 a 2099', () => {
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const p = (y) => (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400)) % 7;
  const semanasEn = (y) => 52 + (p(y) === 4 || p(y - 1) === 3 ? 1 : 0);
  function ref(y, m, d) {
    const f = new Date(Date.UTC(y, m - 1, d));
    const dow = ((f.getUTCDay() + 6) % 7) + 1;
    const doy = Math.floor((f - Date.UTC(y, 0, 1)) / 86400000) + 1;
    let w = Math.floor((doy - dow + 10) / 7), yy = y;
    if (w < 1) { yy = y - 1; w = semanasEn(yy); } else if (w > semanasEn(y)) { w = 1; yy = y + 1; }
    return yy + '-W' + pad(w);
  }
  let n = 0;
  for (let t = Date.UTC(2000, 0, 1); t <= Date.UTC(2099, 11, 31); t += 86400000) {
    const f = new Date(t);
    const y = f.getUTCFullYear(), m = f.getUTCMonth() + 1, d = f.getUTCDate();
    const iso = y + '-' + pad(m) + '-' + pad(d);
    assert.equal(Util.semanaISO(iso), ref(y, m, d), iso);
    n++;
  }
  assert.equal(n, 36525);
});

test('formatoFecha devuelve dd/mm/aaaa', () => {
  assert.equal(Util.formatoFecha('2026-10-05'), '05/10/2026');
  assert.equal(Util.formatoFecha('2026-01-31'), '31/01/2026');
  assert.equal(capturar(() => Util.formatoFecha('5/10/2026')).codigo, 'E_FECHA_INVALIDA');
});

/* ----------------------------------------------------------------- importes */

test('parsearImporte: formato de Uruguay por defecto (coma decimal, punto de miles)', () => {
  const ok = (entrada, centavos, moneda = null, fmt) =>
    assert.deepEqual(U(() => Util.parsearImporte(entrada, fmt)), { ok: true, centavos, moneda }, String(entrada));
  ok('85.000,00', 8500000); ok('85.000', 8500000); ok('85000', 8500000); ok('1.234,5', 123450);
  ok('1.234.567,89', 123456789); ok('0,50', 50); ok('0,5', 50); ok('85.000,0000', 8500000);
  ok('$U 85.000,00', 8500000, 'UYU'); ok('$ 85.000', 8500000, 'UYU'); ok('85.000 $', 8500000, 'UYU');
  ok('U$S 3.150,00', 315000, 'USD'); ok('US$ 3150', 315000, 'USD'); ok('USD 3.150', 315000, 'USD');
  ok('UYU 100', 10000, 'UYU'); ok('  85.000,00  ', 8500000);
  ok(85000.5, 8500050); ok(0.1 + 0.2 > 0.3 ? 0.3 : 0.3, 30); ok(12.34, 1234); ok(85000, 8500000);
  ok('1,234.56', 123456, null, { decimal: '.', miles: ',' }); ok('1234.56', 123456, null, { decimal: '.', miles: ',' });
  ok('1 234,56', 123456, null, { decimal: ',', miles: ' ' });
});

test('parsearImporte: rechaza con código, sin redondear ni adivinar', () => {
  const mal = (entrada, codigo, fmt) =>
    assert.deepEqual(U(() => Util.parsearImporte(entrada, fmt)), { ok: false, codigo }, String(entrada));
  mal('-85.000,00', 'E_IMPORTE_NO_POSITIVO'); mal('(85.000,00)', 'E_IMPORTE_NO_POSITIVO'); mal('85.000,00-', 'E_IMPORTE_NO_POSITIVO');
  mal('0', 'E_IMPORTE_NO_POSITIVO'); mal('0,00', 'E_IMPORTE_NO_POSITIVO'); mal(0, 'E_IMPORTE_NO_POSITIVO'); mal(-5, 'E_IMPORTE_NO_POSITIVO');
  mal('85.000,004', 'E_IMPORTE_INVALIDO'); mal('1.23', 'E_IMPORTE_INVALIDO'); mal('1,234.56', 'E_IMPORTE_INVALIDO');
  mal('1234.56', 'E_IMPORTE_INVALIDO'); mal('12 34', 'E_IMPORTE_INVALIDO'); mal("1'234", 'E_IMPORTE_INVALIDO');
  mal('abc', 'E_MONEDA_DESCONOCIDA'); mal('', 'E_IMPORTE_INVALIDO'); mal('1e6', 'E_MONEDA_DESCONOCIDA'); mal('--5', 'E_IMPORTE_INVALIDO');
  mal('EUR 100', 'E_MONEDA_DESCONOCIDA'); mal('US$ USD 5', 'E_IMPORTE_INVALIDO'); mal('€ 100', 'E_IMPORTE_INVALIDO');
  mal('99999999999999', 'E_IMPORTE_INVALIDO'); mal(1e20, 'E_IMPORTE_INVALIDO'); mal(NaN, 'E_IMPORTE_INVALIDO'); mal(Infinity, 'E_IMPORTE_INVALIDO');
  mal(85000.555, 'E_IMPORTE_INVALIDO'); mal(null, 'E_IMPORTE_INVALIDO'); mal({}, 'E_IMPORTE_INVALIDO'); mal('1.234,56', 'E_IMPORTE_INVALIDO', { decimal: '.', miles: ',' });
  mal('1,2,3', 'E_IMPORTE_INVALIDO'); mal('.5', 'E_IMPORTE_INVALIDO'); mal('5.', 'E_IMPORTE_INVALIDO'); mal('1..000', 'E_IMPORTE_INVALIDO');
});

test('monedaDeTexto reconoce pesos y dólares y rechaza el resto', () => {
  ['$', '$U', '$u', 'UYU', 'pesos', 'Pesos Uruguayos', ' peso '].forEach((t) => assert.equal(Util.monedaDeTexto(t), 'UYU', t));
  ['US$', 'U$S', 'u$s', 'USD', 'Dólares', 'dolares', 'Dólar'].forEach((t) => assert.equal(Util.monedaDeTexto(t), 'USD', t));
  ['EUR', 'UI', 'U$', '', 'reales', null, 'BRL', '$$'].forEach((t) => assert.equal(Util.monedaDeTexto(t), null, String(t)));
});

test('formatearImporte usa punto de miles, coma decimal solo si hay centavos y la etiqueta de la moneda', () => {
  assert.equal(Util.formatearImporte(8500000, 'UYU'), '$U 85.000');
  assert.equal(Util.formatearImporte(8500050, 'UYU'), '$U 85.000,50');
  assert.equal(Util.formatearImporte(315000, 'USD'), 'US$ 3.150');
  assert.equal(Util.formatearImporte(5, 'UYU'), '$U 0,05');
  assert.equal(Util.formatearImporte(100, 'UYU'), '$U 1');
  assert.equal(Util.formatearImporte(123456789, 'UYU'), '$U 1.234.567,89');
  assert.equal(Util.formatearImporte(99, 'USD'), 'US$ 0,99');
  assert.equal(capturar(() => Util.formatearImporte(100, 'EUR')).codigo, 'E_MONEDA_DESCONOCIDA');
  assert.equal(capturar(() => Util.formatearImporte(-1, 'UYU')).codigo, 'E_IMPORTE_INVALIDO');
  assert.equal(capturar(() => Util.formatearImporte(NaN, 'UYU')).codigo, 'E_IMPORTE_INVALIDO');
  assert.equal(capturar(() => Util.formatearImporte(1.5, 'UYU')).ok, true);
});

test('formatear y volver a leer un importe da el mismo valor (ida y vuelta)', () => {
  [1, 99, 100, 101, 12345, 8500000, 8500050, 315000, 123456789, 99999999999].forEach((c) => {
    const texto = Util.formatearImporte(c, 'UYU').replace('$U ', '');
    assert.deepEqual(U(() => Util.parsearImporte(texto)), { ok: true, centavos: c, moneda: null }, texto);
  });
});

test('sumarSeguro falla en vez de perder precisión', () => {
  assert.equal(Util.sumarSeguro(1, 2), 3);
  assert.equal(capturar(() => Util.sumarSeguro(Util.MAX_SEGURO, 1)).codigo, 'E_DESBORDE');
});

/* ------------------------------------------------------------------- correo */

test('normalizarCorreo acepta direcciones simples y descarta todo lo dudoso', () => {
  assert.equal(Util.normalizarCorreo('Nombre.Apellido@Empresa.com.uy'), 'nombre.apellido@empresa.com.uy');
  assert.equal(Util.normalizarCorreo('a+b@sub.ejemplo.example'), 'a+b@sub.ejemplo.example');
  assert.equal(Util.normalizarCorreo('ventas-2@mi-empresa.com'), 'ventas-2@mi-empresa.com');
  // los espacios y saltos de línea de los EXTREMOS se recortan; el resultado siempre es ASCII limpio
  assert.equal(Util.normalizarCorreo('  a@b.com  '), 'a@b.com');
  assert.equal(Util.normalizarCorreo('a@b.com\n'), 'a@b.com');
  assert.equal(Util.normalizarCorreo('a@b.com' + ch(0x2028)), 'a@b.com');
  const malos = ['a@b', 'a@b.c', 'a b@c.com', 'a@b.com\nBcc: x@y.com', 'a@b.com,c@d.com', 'a@b.com;c@d.com', '<a@b.com>', '"a"@b.com',
    'a..b@c.com', '.a@b.com', 'a.@b.com', 'a@-b.com', 'a@b-.com', 'a@b..com', ch(0xE1) + '@b.com', 'a@b' + ch(0xFC) + 'cher.com',
    'a@b.com?bcc=x@y.com', 'a@b.com%0d%0aBcc:x@y.com', "a'b@c.com", 'a@[127.0.0.1]', 'a@b.com>', 'a@@b.com', '@b.com', 'a@',
    'a' + ch(0x200B) + '@b.com', 'a@b.com' + ch(0x200B), ('x'.repeat(65)) + '@b.com', 'a@' + ('b'.repeat(250)) + '.com',
    '', null, undefined, 5, {}, ['a@b.com']];
  malos.forEach((m) => assert.equal(Util.normalizarCorreo(m), null, JSON.stringify(m)));
});

/* ---------------------------------------------------------------- teléfonos */

test('normalizarTelefono: móviles y fijos de Uruguay, y otros países solo con + o 00', () => {
  const ok = (entrada, digitos, movil, pais = 'UY') =>
    assert.deepEqual(U(() => Util.normalizarTelefono(entrada)), { ok: true, digitos, movil, pais }, String(entrada));
  ok('099 123 456', '59899123456', true); ok('99123456', '59899123456', true); ok('+598 99 123 456', '59899123456', true);
  ok('00598 99123456', '59899123456', true); ok('59899123456', '59899123456', true); ok('(099) 123-456', '59899123456', true);
  ok('99123456.0', '59899123456', true); ok('29010065', '59829010065', false); ok('02 901 0065', '59829010065', false);
  ok('43521234', '59843521234', false); ok('+54 9 11 5555 5555', '5491155555555', true, 'OTRO');
  ok('+598 2901 0065', '59829010065', false);
  const mal = (entrada, codigo) => assert.deepEqual(U(() => Util.normalizarTelefono(entrada)), { ok: false, codigo }, String(entrada));
  mal('', 'A_TEL_VACIO'); mal(null, 'A_TEL_VACIO'); mal('12345', 'A_TEL_INVALIDO'); mal('099 12 34', 'A_TEL_INVALIDO');
  mal('0991234567', 'A_TEL_INVALIDO'); mal('+598 99 123 4567', 'A_TEL_INVALIDO'); mal('9,91E+07', 'A_TEL_INVALIDO');
  mal('abc', 'A_TEL_INVALIDO'); mal('099-123-45x', 'A_TEL_INVALIDO'); mal('++59899123456', 'A_TEL_INVALIDO');
  mal('59899+123456', 'A_TEL_INVALIDO'); mal('81234567', 'A_TEL_INVALIDO'); mal('+0123456789', 'A_TEL_INVALIDO');
  mal('+12345', 'A_TEL_INVALIDO'); mal('+1234567890123456', 'A_TEL_INVALIDO');
});

test('los números de ejemplo están marcados', () => {
  assert.equal(Util.esNumeroDeEjemplo('59899000001'), true);
  assert.equal(Util.esNumeroDeEjemplo('59899123456'), false);
  assert.equal(U(() => Util.normalizarTelefono('099 000 001')).digitos, '59899000001');
});

/* --------------------------------------------------------- identificadores */

test('idValido y hex64', () => {
  ['c001', 'cliente-1', 'A_b-9', 'x'].forEach((s) => assert.equal(Util.idValido(s), true, s));
  ['', '-abc', '_abc', 'a b', 'a/b', 'a'.repeat(41), 'ñ', null, 5, 'a\n', "a'b"].forEach((s) => assert.equal(Util.idValido(s), false, String(s)));
  assert.equal(Util.hex64('a'.repeat(64)), true);
  assert.equal(Util.hex64('A'.repeat(64)), false);
  assert.equal(Util.hex64('a'.repeat(63)), false);
  assert.equal(Util.hex64('g'.repeat(64)), false);
});

test('contarPorCodigo ignora entradas que no traen un código válido', () => {
  assert.deepEqual(U(() => Util.contarPorCodigo([{ codigo: 'E_AA' }, { codigo: 'E_AA' }, { codigo: 'E_BB' }, { codigo: 'E_A' }, { codigo: 'texto libre' }, null, {}])),
    { E_AA: 2, E_BB: 1 });
});
