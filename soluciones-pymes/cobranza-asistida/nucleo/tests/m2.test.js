'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, plano, capturar } = require('./cargar');

const { Util, M2 } = cargar('util', 'm2-antiguedad');

const CORTE = '2026-10-05';
let fila = 1;
const fac = (ref, moneda, centavos, dias, extra = {}) => ({
  factura_ref: ref, deudor_nombre: 'Ficticia ' + ref, moneda, importe_centavos: centavos,
  emision: null, vencimiento: Util.sumarDias(CORTE, -dias), contacto_tel: null, tel_movil: null, contacto_mail: null,
  en_disputa: false, fila_origen: fila++, ...extra
});
const calc = (facturas, extra = {}) => plano(M2.calcularAntiguedad({ facturas, fecha_corte: CORTE, ...extra }));

test('tramos por defecto: los bordes caen donde deben', () => {
  const casos = [[1, 0], [30, 0], [31, 1], [60, 1], [61, 2], [90, 2], [91, 3], [500, 3], [3650, 3]];
  casos.forEach(([dias, tramo]) => {
    const r = calc([fac('A', 'UYU', 100, dias)]);
    assert.equal(r.vencidas[0].dias_atraso, dias);
    assert.equal(r.vencidas[0].tramo, tramo, dias + ' días');
  });
});

test('escalones por defecto: amable 1-15, segundo aviso 16-45, firme 46 o más', () => {
  const casos = [[1, 'amable'], [15, 'amable'], [16, 'segundo_aviso'], [45, 'segundo_aviso'], [46, 'firme'], [200, 'firme']];
  casos.forEach(([dias, esc]) => assert.equal(calc([fac('A', 'UYU', 100, dias)]).vencidas[0].escalon, esc, dias + ' días'));
});

test('lo que vence hoy o más adelante no está vencido', () => {
  const r = calc([fac('A', 'UYU', 100, 0), fac('B', 'UYU', 100, -1), fac('C', 'UYU', 100, -30), fac('D', 'UYU', 100, 1)]);
  assert.equal(r.vencidas.length, 1);
  assert.equal(r.vencidas[0].factura_ref, 'D');
  assert.equal(r.vencen_hoy_n, 1);
  assert.equal(r.sin_vencer_n, 2);
});

test('«nueva esta semana» = 7 días de atraso o menos', () => {
  const r = calc([fac('A', 'UYU', 100, 7), fac('B', 'UYU', 100, 8)]);
  const por = Object.fromEntries(r.vencidas.map((v) => [v.factura_ref, v.nueva_esta_semana]));
  assert.deepEqual(por, { A: true, B: false });
});

test('en disputa: sigue contando en los totales pero no recibe escalón', () => {
  const r = calc([fac('A', 'UYU', 1000, 20, { en_disputa: true }), fac('B', 'UYU', 500, 20)]);
  assert.equal(r.vencidas.find((v) => v.factura_ref === 'A').escalon, 'en_disputa');
  assert.equal(r.vencidas.find((v) => v.factura_ref === 'B').escalon, 'segundo_aviso');
  assert.deepEqual(r.totales.UYU, { n: 2, total_centavos: 1500 });
  assert.deepEqual(r.por_escalon, { en_disputa: 1, segundo_aviso: 1 });
});

test('las monedas nunca se mezclan: totales y tramos por moneda', () => {
  const r = calc([fac('A', 'UYU', 8500000, 10), fac('B', 'USD', 315000, 46), fac('C', 'UYU', 6130000, 97), fac('D', 'USD', 100000, 5)]);
  assert.deepEqual(r.totales, { UYU: { n: 2, total_centavos: 14630000 }, USD: { n: 2, total_centavos: 415000 } });
  assert.deepEqual(r.por_tramo.UYU.map((t) => [t.desde, t.hasta, t.n, t.total_centavos]), [[1, 30, 1, 8500000], [31, 60, 0, 0], [61, 90, 0, 0], [91, null, 1, 6130000]]);
  assert.deepEqual(r.por_tramo.USD.map((t) => t.n), [1, 1, 0, 0]);
  Object.keys(r.por_tramo).forEach((m) => {
    assert.equal(r.por_tramo[m].reduce((s, t) => s + t.n, 0), r.totales[m].n);
    assert.equal(r.por_tramo[m].reduce((s, t) => s + t.total_centavos, 0), r.totales[m].total_centavos);
  });
});

test('orden estable: pesos primero, más atraso primero, más importe primero, luego referencia', () => {
  const r = calc([fac('Z', 'USD', 100, 50), fac('B', 'UYU', 100, 10), fac('A', 'UYU', 100, 10), fac('C', 'UYU', 900, 10), fac('D', 'UYU', 100, 40)]);
  assert.deepEqual(r.vencidas.map((v) => v.factura_ref), ['D', 'C', 'A', 'B', 'Z']);
});

test('el resultado no depende del orden de entrada', () => {
  const base = [fac('A', 'UYU', 100, 3), fac('B', 'UYU', 100, 3), fac('C', 'USD', 500, 60), fac('D', 'UYU', 7, 200), fac('E', 'UYU', 100, 16)];
  const ref = JSON.stringify(calc(base));
  for (let i = 0; i < 20; i++) {
    const mezcla = base.slice().sort(() => (i % 2 ? 1 : -1)).reverse();
    assert.equal(JSON.stringify(calc(mezcla)), ref);
  }
});

test('tramos y escalones personalizados', () => {
  const r = calc([fac('A', 'UYU', 100, 5), fac('B', 'UYU', 100, 20)], {
    tramos: [[1, 10], [11, null]],
    escalones: [{ nombre: 'primero', desde: 1, hasta: 9 }, { nombre: 'ultimo', desde: 10, hasta: null }]
  });
  assert.deepEqual(r.vencidas.map((v) => [v.factura_ref, v.tramo, v.escalon]), [['B', 1, 'ultimo'], ['A', 0, 'primero']]);
});

test('configuración de tramos y escalones inválida: se detiene con código', () => {
  const t = (tramos) => capturar(() => M2.calcularAntiguedad({ facturas: [], fecha_corte: CORTE, tramos })).codigo;
  assert.equal(t([]), 'E_CFG_TRAMOS');
  assert.equal(t([[2, 30], [31, null]]), 'E_CFG_TRAMOS'); // no empieza en 1
  assert.equal(t([[1, 30], [32, null]]), 'E_CFG_TRAMOS'); // hueco
  assert.equal(t([[1, 30], [30, null]]), 'E_CFG_TRAMOS'); // solapa
  assert.equal(t([[1, 30], [31, 60]]), 'E_CFG_TRAMOS'); // el último no es abierto
  assert.equal(t([[1, null], [2, null]]), 'E_CFG_TRAMOS');
  assert.equal(t([[1, 'x'], [2, null]]), 'E_CFG_TRAMOS');
  assert.equal(t('no'), 'E_CFG_TRAMOS');
  const e = (escalones) => capturar(() => M2.calcularAntiguedad({ facturas: [], fecha_corte: CORTE, escalones })).codigo;
  assert.equal(e([]), 'E_CFG_ESCALONES');
  assert.equal(e([{ nombre: 'a', desde: 1, hasta: null }]), 'E_CFG_ESCALONES'); // nombre demasiado corto
  assert.equal(e([{ nombre: 'en_disputa', desde: 1, hasta: null }]), 'E_CFG_ESCALONES'); // reservado
  assert.equal(e([{ nombre: 'uno', desde: 1, hasta: 5 }, { nombre: 'uno', desde: 6, hasta: null }]), 'E_CFG_ESCALONES'); // repetido
  assert.equal(e([{ nombre: 'uno', desde: 1, hasta: 5 }, { nombre: 'dos', desde: 7, hasta: null }]), 'E_CFG_ESCALONES'); // hueco
  assert.equal(e([{ nombre: 'Uno', desde: 1, hasta: null }]), 'E_CFG_ESCALONES');
  assert.equal(e([{ nombre: 'uno', desde: 1, hasta: 5 }]), 'E_CFG_ESCALONES');
});

test('entradas que rompen el contrato con M1 se detienen con código', () => {
  const c = (entrada) => capturar(() => M2.calcularAntiguedad(entrada)).codigo;
  assert.equal(c(null), 'E_FACTURAS_INVALIDAS');
  assert.equal(c({ facturas: [], fecha_corte: '05/10/2026' }), 'E_FECHA_CORTE_INVALIDA');
  assert.equal(c({ facturas: [], fecha_corte: '2026-02-30' }), 'E_FECHA_CORTE_INVALIDA');
  assert.equal(c({ facturas: 'x', fecha_corte: CORTE }), 'E_FACTURAS_INVALIDAS');
  const mala = (cambio) => c({ facturas: [{ ...fac('A', 'UYU', 100, 5), ...cambio }], fecha_corte: CORTE });
  assert.equal(mala({ moneda: 'EUR' }), 'E_FACTURA_INVALIDA');
  assert.equal(mala({ importe_centavos: 0 }), 'E_FACTURA_INVALIDA');
  assert.equal(mala({ importe_centavos: -5 }), 'E_FACTURA_INVALIDA');
  assert.equal(mala({ importe_centavos: 1.5 }), 'E_FACTURA_INVALIDA');
  assert.equal(mala({ importe_centavos: '100' }), 'E_FACTURA_INVALIDA');
  assert.equal(mala({ vencimiento: '2026-13-01' }), 'E_FACTURA_INVALIDA');
  assert.equal(mala({ factura_ref: '' }), 'E_FACTURA_INVALIDA');
  assert.equal(c({ facturas: [null], fecha_corte: CORTE }), 'E_FACTURA_INVALIDA');
});

test('la suma no pierde precisión: falla antes de desbordar', () => {
  const muchas = Array.from({ length: 1000 }, (_, i) => fac('F' + i, 'UYU', Util.LIMITE_CENTAVOS, 10));
  assert.equal(capturar(() => M2.calcularAntiguedad({ facturas: muchas, fecha_corte: CORTE })).codigo, 'E_DESBORDE');
});

test('lista vacía: resultado vacío y coherente', () => {
  const r = calc([]);
  assert.deepEqual(r.vencidas, []);
  assert.deepEqual(r.totales, {});
  assert.equal(r.sin_vencer_n, 0);
});

test('la fecha de corte es un parámetro: el resultado no depende de la zona horaria ni del reloj', () => {
  const f = [fac('A', 'UYU', 100, 10)];
  assert.equal(plano(M2.calcularAntiguedad({ facturas: f, fecha_corte: '2026-10-05' })).vencidas[0].dias_atraso, 10);
  assert.equal(plano(M2.calcularAntiguedad({ facturas: f, fecha_corte: '2026-10-06' })).vencidas[0].dias_atraso, 11);
});

test('los datos de la factura pasan intactos al resultado (sin perder ni inventar campos)', () => {
  const original = fac('A', 'USD', 12345, 33, { contacto_tel: '59899000001', tel_movil: true, contacto_mail: 'x@ficticia.example' });
  const v = calc([original]).vencidas[0];
  Object.keys(original).forEach((k) => assert.deepEqual(v[k], original[k], k));
  assert.deepEqual(Object.keys(v).filter((k) => !(k in original)).sort(), ['dias_atraso', 'escalon', 'nueva_esta_semana', 'tramo']);
});
