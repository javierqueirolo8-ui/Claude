'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, plano, capturar } = require('./cargar');

const { Util, M2, M3 } = cargar('util', 'm2-antiguedad', 'm3-borradores');

const CORTE = '2026-10-05';
const EMPRESA = { nombre: 'Ferretería Ficticia S.R.L.', medios_pago: 'Pueden abonarla por transferencia a la cuenta ficticia 000-000000-0.', firma: 'Administración\nFerretería Ficticia' };
let n = 1;
const venc = (ref, dias, extra = {}) => ({
  factura_ref: ref, deudor_nombre: 'Distribuidora Ficticia ' + ref, moneda: 'UYU', importe_centavos: 8500000,
  emision: null, vencimiento: Util.sumarDias(CORTE, -dias), contacto_tel: null, tel_movil: null, contacto_mail: null,
  en_disputa: false, fila_origen: n++, ...extra
});
// pasa por M2 para tener exactamente lo que recibirá M3 en el flujo real
const borr = (facturas, extra = {}) => {
  const a = M2.calcularAntiguedad({ facturas, fecha_corte: CORTE });
  return plano(M3.generarBorradores({ vencidas: a.vencidas, empresa: EMPRESA, ...extra }));
};

test('borrador amable: formal en plural, con factura, importe y vencimiento', () => {
  const r = borr([venc('A 1001', 10)]);
  assert.equal(r.borradores.length, 1);
  const b = r.borradores[0];
  assert.equal(b.escalon, 'amable');
  assert.equal(b.asunto, 'Recordatorio de la factura A 1001');
  assert.equal(b.texto, [
    'Estimados:',
    'Les escribimos de Ferretería Ficticia S.R.L. para recordarles que la factura A 1001 por $U 85.000, con vencimiento el 25/09/2026, figura pendiente de pago.',
    'Si ya fue abonada, les pedimos disculpas y que ignoren este mensaje.',
    'Pueden abonarla por transferencia a la cuenta ficticia 000-000000-0.',
    'Quedamos a su disposición para cualquier consulta.',
    'Administración',
    'Ferretería Ficticia'
  ].join('\n'));
});

test('cada escalón usa su plantilla y nombra los días de atraso cuando corresponde', () => {
  const r = borr([venc('B', 25), venc('C', 97)]);
  const por = Object.fromEntries(r.borradores.map((b) => [b.factura_ref, b]));
  assert.equal(por.B.escalon, 'segundo_aviso');
  assert.match(por.B.texto, /vencida el 10\/09\/2026 \(25 días de atraso\)/);
  assert.equal(por.C.escalon, 'firme');
  assert.match(por.C.texto, /registra 97 días de atraso/);
  assert.equal(por.C.asunto, 'Factura C: solicitamos su respuesta');
});

test('sin medios de pago ni firma, esas líneas desaparecen y el resto queda ordenado', () => {
  const a = M2.calcularAntiguedad({ facturas: [venc('A', 10)], fecha_corte: CORTE });
  const r = plano(M3.generarBorradores({ vencidas: a.vencidas, empresa: { nombre: 'Empresa Ficticia' } }));
  const lineas = r.borradores[0].texto.split('\n');
  assert.equal(lineas.length, 4);
  assert.equal(lineas[lineas.length - 1], 'Quedamos a su disposición para cualquier consulta.');
  assert.equal(r.borradores[0].texto.indexOf('{'), -1);
});

test('la factura, el importe y el vencimiento están en TODO borrador (propiedad sobre muchos casos)', () => {
  const monedas = ['UYU', 'USD'];
  for (let i = 0; i < 300; i++) {
    const dias = 1 + ((i * 37) % 400);
    const f = venc('X' + i, dias, { moneda: monedas[i % 2], importe_centavos: 1 + ((i * 7919) % 99999999) });
    const b = borr([f]).borradores[0];
    assert.ok(b.texto.includes(f.factura_ref), 'factura');
    assert.ok(b.texto.includes(Util.formatearImporte(f.importe_centavos, f.moneda)), 'importe');
    assert.ok(b.texto.includes(Util.formatoFecha(f.vencimiento)), 'vencimiento');
    assert.equal(b.texto.includes('{'), false);
    assert.equal(b.texto.includes('}'), false);
  }
});

test('en disputa: no hay borrador', () => {
  const r = borr([venc('A', 10, { en_disputa: true }), venc('B', 10)]);
  assert.deepEqual(r.sin_borrador, [{ factura_ref: 'A', motivo: 'en_disputa' }]);
  assert.deepEqual(r.borradores.map((b) => b.factura_ref), ['B']);
});

test('un dato con llaves dentro no se interpreta como plantilla', () => {
  const r = borr([venc('A', 10, { deudor_nombre: 'Ficticia {factura} {firma}' })]);
  assert.equal(r.borradores[0].texto.includes('{'), false); // el nombre no se usa en la plantilla por defecto
  const propia = { amable: { asunto: 'Factura {factura}', cuerpo: 'Estimados {deudor}: la factura {factura} por {importe_completo} vence el {vencimiento}.' } };
  const a = M2.calcularAntiguedad({ facturas: [venc('A', 10, { deudor_nombre: 'Ficticia {factura} {firma}' })], fecha_corte: CORTE });
  const t = plano(M3.generarBorradores({ vencidas: a.vencidas, empresa: EMPRESA, plantillas: propia })).borradores[0].texto;
  assert.equal(t, 'Estimados Ficticia {factura} {firma}: la factura A por $U 85.000 vence el 25/09/2026.');
});

/* ------------------------------------------------------------ plantillas rotas */

test('plantillas propias: cada defecto bloquea, con su código, y ningún borrador sale', () => {
  const ok = { asunto: 'Factura {factura}', cuerpo: 'Estimados: {factura} {importe_completo} {vencimiento}' };
  const con = (cambio) => capturar(() => M3.validarPlantillas({ amable: { ...ok, ...cambio } })).codigo;
  assert.equal(capturar(() => M3.validarPlantillas({ amable: ok })).ok, true);
  assert.equal(con({ cuerpo: '' }), 'E_PLANTILLA_VACIA');
  assert.equal(con({ cuerpo: '   ' }), 'E_PLANTILLA_VACIA');
  assert.equal(con({ asunto: undefined }), 'E_PLANTILLA_VACIA');
  assert.equal(con({ cuerpo: 'Estimados: {factu} {importe_completo} {vencimiento}' }), 'E_PLANTILLA_CAMPO_DESCONOCIDO');
  assert.equal(con({ cuerpo: 'Estimados: {factura} {importe_completo} {vencimiento} {' }), 'E_PLANTILLA_LLAVES');
  assert.equal(con({ cuerpo: 'Estimados: {factura} {importe_completo} {vencimiento} }' }), 'E_PLANTILLA_LLAVES');
  assert.equal(con({ cuerpo: 'Estimados: {factura} {importe_completo}' }), 'E_PLANTILLA_SIN_DATOS_CLAVE');
  assert.equal(con({ cuerpo: 'Estimados: {importe_completo} {vencimiento}' }), 'E_PLANTILLA_SIN_DATOS_CLAVE');
  assert.equal(con({ cuerpo: 'Estimados: {factura} {vencimiento}' }), 'E_PLANTILLA_SIN_DATOS_CLAVE');
  assert.equal(con({ cuerpo: 'x'.repeat(2001) + ' {factura} {importe} {vencimiento}' }), 'E_PLANTILLA_LARGA');
  assert.equal(con({ asunto: 'Factura de {deudor}' }), 'E_PLANTILLA_CAMPO_DESCONOCIDO'); // el asunto no lleva el nombre del deudor
  assert.equal(capturar(() => M3.validarPlantillas({ 'en_disputa': ok })).ok, false);
  assert.equal(capturar(() => M3.validarPlantillas({ 'Nombre Malo': ok })).ok, false);
  assert.equal(capturar(() => M3.validarPlantillas('texto')).ok, false);
  assert.equal(capturar(() => M3.validarPlantillas({ amable: null })).ok, false);
});

test('una plantilla rota bloquea todos los borradores, aunque no sea la que se iba a usar', () => {
  const a = M2.calcularAntiguedad({ facturas: [venc('A', 10)], fecha_corte: CORTE });
  const rota = { firme: { asunto: 'Factura {factura}', cuerpo: 'Estimados: {factura} {importe_completo}' } };
  assert.equal(capturar(() => M3.generarBorradores({ vencidas: a.vencidas, empresa: EMPRESA, plantillas: rota })).codigo, 'E_PLANTILLA_SIN_DATOS_CLAVE');
});

test('ninguna plantilla amenaza ni menciona consecuencias, informes comerciales o acciones legales', () => {
  const prohibidas = ['Les avisamos que iniciaremos acciones legales', 'procederemos judicialmente', 'les reclamaremos por vía legal', 'Podríamos recurrir a un ABOGADO', 'se reportará a Clearing',
    'Sus ANTECEDENTES comerciales', 'se generarán intereses', 'habrá consecuencias', 'proceso judicial', 'embargo de bienes', 'quedan en mora',
    'sufrirá un recargo', 'un moroso', 'lo incluiremos en un informe comercial', 'suspenderemos el servicio', 'aplicaremos una multa',
    'la demanda', 'reclamo judicial', 'ejecución de la deuda', 'sin más trámite: intimación'];
  prohibidas.forEach((frase) => {
    const cuerpo = 'Estimados: ' + frase + '. {factura} {importe_completo} {vencimiento}';
    assert.equal(capturar(() => M3.validarPlantillas({ amable: { asunto: 'Factura {factura}', cuerpo } })).codigo, 'E_PLANTILLA_FRASE_PROHIBIDA', frase);
  });
  // palabras vecinas que no deben confundirse: «demorar», «consecuente», «multiplicar», «moral», «interesa»
  const inocuas = 'Estimados: agradecemos no demorar, es consecuente y multiplica la ayuda; por moral profesional, si les interesa un plan de pagos, escríbannos. {factura} {importe_completo} {vencimiento}';
  assert.equal(capturar(() => M3.validarPlantillas({ amable: { asunto: 'Factura {factura}', cuerpo: inocuas } })).ok, true);
});

test('las plantillas por defecto cumplen todas las reglas (no hace falta configurar nada)', () => {
  assert.equal(capturar(() => M3.validarPlantillas()).ok, true);
  assert.equal(capturar(() => M3.validarPlantillas(null)).ok, true);
  assert.equal(capturar(() => M3.validarPlantillas({})).ok, true);
  Object.keys(M3.PLANTILLAS_POR_DEFECTO).forEach((nombre) => {
    const t = M3.PLANTILLAS_POR_DEFECTO[nombre];
    assert.ok(/^Estimados:/.test(t.cuerpo), nombre + ': formal en plural');
    assert.equal(/\btu\b|\btus\b|\bvos\b|\bte\b/i.test(t.cuerpo), false, nombre + ': sin tuteo ni voseo');
  });
});

test('configuración de la empresa: obligatoria y limitada', () => {
  const a = M2.calcularAntiguedad({ facturas: [venc('A', 10)], fecha_corte: CORTE });
  const e = (empresa) => capturar(() => M3.generarBorradores({ vencidas: a.vencidas, empresa })).codigo;
  assert.equal(e(undefined), 'E_CFG_EMPRESA');
  assert.equal(e({}), 'E_CFG_EMPRESA');
  assert.equal(e({ nombre: '   ' }), 'E_CFG_EMPRESA');
  assert.equal(e({ nombre: 'x'.repeat(121) }), 'E_CFG_EMPRESA');
  assert.equal(e({ nombre: 'Empresa', firma: 'x'.repeat(301) }), 'E_CFG_EMPRESA');
  assert.equal(e({ nombre: 'Empresa', medios_pago: 'x'.repeat(301) }), 'E_CFG_EMPRESA');
});

test('la firma y los medios de pago admiten varias líneas pero no controles ni caracteres invisibles', () => {
  const a = M2.calcularAntiguedad({ facturas: [venc('A', 10)], fecha_corte: CORTE });
  const firma = 'Ana\u0000 Ficticia' + String.fromCharCode(0x202E) + '\r\n\r\nGerencia\n\n\n\n\n\n\n\nLínea 3\nL4\nL5\nL6 (se corta)';
  const r = plano(M3.generarBorradores({ vencidas: a.vencidas, empresa: { nombre: 'E', firma } }));
  const t = r.borradores[0].texto;
  assert.equal(t.includes('\u0000'), false);
  assert.equal(t.includes(String.fromCharCode(0x202E)), false);
  assert.ok(t.endsWith('Ana Ficticia\nGerencia\nLínea 3\nL4\nL5'));
});

test('falta la plantilla de un escalón configurado: se detiene con código', () => {
  const a = M2.calcularAntiguedad({ facturas: [venc('A', 10)], fecha_corte: CORTE,
    escalones: [{ nombre: 'unico', desde: 1, hasta: null }] });
  assert.equal(capturar(() => M3.generarBorradores({ vencidas: a.vencidas, empresa: EMPRESA })).codigo, 'E_PLANTILLA_FALTANTE');
});

/* --------------------------------------------------------------------- enlaces */

test('enlace de WhatsApp: api.whatsapp.com con el mensaje completo codificado (conserva emojis y saltos de línea)', () => {
  const url = M3.enlaceWhatsApp('59899123456', 'Hola 👋\nGracias');
  assert.equal(url, 'https://api.whatsapp.com/send?phone=59899123456&text=Hola%20%F0%9F%91%8B%0AGracias');
  assert.equal(new URL(url).searchParams.get('text'), 'Hola 👋\nGracias');
  assert.equal(new URL(url).host, 'api.whatsapp.com');
  ['', '123', '+59899123456', '598 99123456', '59899123456x', null, undefined, 5, '5989912345678901'].forEach((d) =>
    assert.equal(M3.enlaceWhatsApp(d, 'x'), null, String(d)));
  assert.equal(M3.enlaceWhatsApp('59899123456', 'x'.repeat(3000)), null, 'demasiado largo');
  assert.equal(M3.enlaceWhatsApp('59899123456', String.fromCharCode(0xD800)), null, 'sustituto suelto no es codificable');
});

test('enlace de correo: acepta solo direcciones estrictas y codifica asunto y cuerpo', () => {
  const url = M3.enlaceMail('ventas@ficticia.example', 'Factura A 1', 'Hola\nGracias');
  assert.equal(url, 'mailto:ventas@ficticia.example?subject=Factura%20A%201&body=Hola%0D%0AGracias');
  const hostiles = ['x@ficticia.example?bcc=otro@ficticia.example', 'x@ficticia.example&cc=y@ficticia.example', 'x@ficticia.example,y@ficticia.example',
    'x@ficticia.example%0d%0aBcc:y@ficticia.example', 'X@Ficticia.example', ' x@ficticia.example', 'x@ficticia.example\n', '<x@ficticia.example>', 'x', '', null, undefined];
  hostiles.forEach((h) => assert.equal(M3.enlaceMail(h, 'a', 'b'), null, String(h)));
});

test('los enlaces del borrador salen de datos validados; los teléfonos fijos y de ejemplo no generan enlace', () => {
  const r = borr([
    venc('M', 10, { contacto_tel: '59899123456', tel_movil: true, contacto_mail: 'compras@ficticia.example' }),
    venc('F', 11, { contacto_tel: '59829010065', tel_movil: false }),
    venc('E', 12, { contacto_tel: '59899000001', tel_movil: true })
  ]);
  const por = Object.fromEntries(r.borradores.map((b) => [b.factura_ref, b]));
  assert.ok(por.M.enlace_wa.startsWith('https://api.whatsapp.com/send?phone=59899123456&text='));
  assert.ok(por.M.enlace_mail.startsWith('mailto:compras@ficticia.example?subject='));
  assert.equal(por.F.enlace_wa, null); assert.deepEqual(por.F.avisos, ['A_TEL_FIJO']);
  assert.equal(por.E.enlace_wa, null); assert.deepEqual(por.E.avisos, ['A_TEL_EJEMPLO']);
  assert.equal(new URL(por.M.enlace_wa).searchParams.get('text'), por.M.texto);
});

test('modo demostración: ningún borrador genera enlaces que abran un chat o un correo', () => {
  const a = M2.calcularAntiguedad({ facturas: [venc('A', 10, { contacto_tel: '59899123456', tel_movil: true, contacto_mail: 'x@ficticia.example' })], fecha_corte: CORTE });
  const r = plano(M3.generarBorradores({ vencidas: a.vencidas, empresa: EMPRESA, opciones: { demo: true } }));
  assert.equal(r.demo, true);
  assert.equal(r.borradores[0].enlace_wa, null);
  assert.equal(r.borradores[0].enlace_mail, null);
});

test('entradas que rompen el contrato se detienen con código', () => {
  const c = (entrada) => capturar(() => M3.generarBorradores(entrada)).codigo;
  assert.equal(c(null), 'E_FACTURAS_INVALIDAS');
  assert.equal(c({ vencidas: 'x', empresa: EMPRESA }), 'E_FACTURAS_INVALIDAS');
  assert.equal(c({ vencidas: [{ factura_ref: 'A' }], empresa: EMPRESA }), 'E_FACTURA_INVALIDA');
  assert.equal(c({ vencidas: [null], empresa: EMPRESA }), 'E_FACTURA_INVALIDA');
});

test('el texto de un borrador solo depende de los datos: mismo dato, mismo texto', () => {
  const a = JSON.stringify(borr([venc('A', 33)]).borradores[0].texto);
  const b = JSON.stringify(borr([venc('A', 33)]).borradores[0].texto);
  assert.equal(a, b);
});
