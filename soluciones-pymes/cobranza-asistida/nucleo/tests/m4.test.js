'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, plano, capturar } = require('./cargar');

const { Util, M2, M3, M4 } = cargar('util', 'm2-antiguedad', 'm3-borradores', 'm4-informe');

const CORTE = '2026-10-05';
const EMPRESA = { nombre: 'Ferretería Ficticia S.R.L.', medios_pago: 'Transferencia a la cuenta ficticia 000.', firma: 'Administración' };
let n = 1;
const venc = (ref, dias, extra = {}) => ({
  factura_ref: ref, deudor_nombre: 'Cliente Ficticio ' + ref, moneda: 'UYU', importe_centavos: 8500000,
  emision: null, vencimiento: Util.sumarDias(CORTE, -dias), contacto_tel: null, tel_movil: null, contacto_mail: null,
  en_disputa: false, fila_origen: n++, ...extra
});
const LECTURA_OK = { resumen: { total: 0, aceptadas: 0, apartadas: 0, vacias: 0, totales_ignorados: 0, tasa_apartadas: 0, umbral_rechazo: 5, bloquear: false, motivo_bloqueo: null }, apartadas: [], avisos: [], por_codigo: {} };

function armar(facturas, { lectura = LECTURA_OK, opciones, borrador } = {}) {
  const ant = plano(M2.calcularAntiguedad({ facturas, fecha_corte: CORTE }));
  const bor = plano(M3.generarBorradores({ vencidas: ant.vencidas, empresa: EMPRESA, opciones: opciones && { demo: opciones.demo } }));
  const entrada = { fecha_corte: CORTE, empresa: { nombre: EMPRESA.nombre }, antiguedad: ant, borradores: borrador ? borrador(bor) : bor, lectura, opciones };
  return { ant, bor, entrada, informe: plano(M4.armarInforme(entrada)) };
}

// Solo las etiquetas reales del documento (el texto visible ya viene escapado y no puede abrir ninguna).
const ETIQUETAS_PERMITIDAS = new Set(['html', 'head', 'meta', 'title', 'style', 'body', 'main', 'h1', 'h2', 'h3', 'p', 'div', 'span', 'table',
  'caption', 'thead', 'tbody', 'tr', 'th', 'td', 'article', 'section', 'pre', 'a', 'footer', 'ul', 'li', 'strong']);
function problemasDeEtiquetas(html) {
  const problemas = [];
  const cuerpo = html.replace(/<style>[\s\S]*?<\/style>/, '<style></style>');
  (cuerpo.match(/<[^>]*>/g) || []).forEach((tag) => {
    if (tag.startsWith('<!doctype')) return;
    const nombre = (/^<\/?([a-zA-Z0-9]+)/.exec(tag) || [])[1];
    if (!nombre || !ETIQUETAS_PERMITIDAS.has(nombre.toLowerCase())) problemas.push('etiqueta no permitida: ' + tag.slice(0, 40));
    if (/\son[a-z]+\s*=/i.test(tag)) problemas.push('atributo de evento: ' + tag.slice(0, 40));
    if (/javascript:|data:text|vbscript:/i.test(tag)) problemas.push('URL peligrosa: ' + tag.slice(0, 40));
    if (/http-equiv="refresh"/i.test(tag)) problemas.push('refresco automático');
  });
  return problemas;
}

test('estructura: HTML autocontenido con política de seguridad, sin scripts ni recursos externos', () => {
  const { informe } = armar([venc('A', 10, { contacto_tel: '59899123456', tel_movil: true, contacto_mail: 'x@ficticia.example' }), venc('B', 50)]);
  const h = informe.html_completo;
  assert.ok(h.startsWith('<!doctype html>'));
  assert.ok(h.includes('<html lang="es">'));
  assert.ok(h.includes('<meta charset="utf-8">'));
  assert.ok(h.includes(`content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"`));
  assert.ok(h.includes('<meta name="referrer" content="no-referrer">'));
  assert.deepEqual(problemasDeEtiquetas(h), []);
  // los únicos atributos href son WhatsApp y mailto
  const hrefs = [...h.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  assert.equal(hrefs.length, 2);
  assert.ok(hrefs.some((u) => u.startsWith('https://api.whatsapp.com/send?phone=59899123456&text=')));
  assert.ok(hrefs.some((u) => u.startsWith('mailto:x@ficticia.example?subject=')));
  assert.equal([...h.matchAll(/(?:src|action|srcset|poster|data)=/g)].length, 0);
  assert.equal(h.includes('http://'), false);
  const externas = [...h.matchAll(/https?:\/\/[^"'\s<)]+/g)].map((m) => m[0]).filter((u) => !u.startsWith('https://api.whatsapp.com/'));
  assert.deepEqual(externas, []);
});

test('el contenido del archivo se escapa: ni etiquetas ni atributos inyectados', () => {
  const hostil = `<script>alert(1)</script><img src=x onerror=alert(2)> "quoted" 'single' \`tick\` &amp; {factura}`;
  const { informe } = armar([venc('A', 10, { deudor_nombre: hostil })]);
  const h = informe.html_completo;
  assert.equal(h.includes('<script'), false);
  assert.equal(h.includes('<img'), false);
  assert.deepEqual(problemasDeEtiquetas(h), []);
  assert.ok(h.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(h.includes('&quot;quoted&quot;'));
  assert.ok(h.includes('&#39;single&#39;'));
  assert.ok(h.includes('&amp;amp;'));
  // lo mismo si llegaran valores hostiles en campos que M1 ya habría rechazado
  const raro = armar([venc('A"><b>x</b>', 10)]).informe.html_completo;
  assert.equal(raro.includes('<b>'), false);
  assert.deepEqual(problemasDeEtiquetas(raro), []);
});

test('enlaces manipulados no se escriben: solo los patrones exactos de WhatsApp y mailto', () => {
  const malos = ['https://evil.example/', 'javascript:alert(1)', 'http://api.whatsapp.com/send?phone=59899123456&text=x',
    'https://api.whatsapp.com.evil.example/send?phone=59899123456&text=x', 'https://api.whatsapp.com/send?phone=5989912&text=x',
    'https://api.whatsapp.com/send?phone=59899123456&text=<b>', 'https://api.whatsapp.com/send?phone=59899123456&text=x" onclick="y',
    'https://api.whatsapp.com/send?phone=59899123456&text=x&extra=1', 'mailto:x@ficticia.example?subject=a&body=b&bcc=y@ficticia.example',
    'mailto:x@ficticia.example,y@ficticia.example?subject=a&body=b', 'mailto:x@ficticia.example', ''];
  malos.forEach((url) => {
    const { informe } = armar([venc('A', 10, { contacto_tel: '59899123456', tel_movil: true, contacto_mail: 'x@ficticia.example' })], {
      borrador: (bor) => { bor.borradores[0].enlace_wa = url; bor.borradores[0].enlace_mail = url; return bor; }
    });
    assert.equal((informe.html_completo.match(/href=/g) || []).length, 0, url);
  });
});

test('cada borrador aparece bajo SU factura; si el emparejamiento no cuadra, no hay informe', () => {
  const facturas = [venc('A', 5), venc('B', 20, { deudor_nombre: 'Segundo Cliente' }), venc('C', 100, { deudor_nombre: 'Tercer Cliente' })];
  const { informe } = armar(facturas);
  const h = informe.html_completo;
  ['A', 'B', 'C'].forEach((ref) => {
    const trozo = h.split('<article class="fila">').find((t) => t.includes('Factura ' + ref + ' ·'));
    assert.ok(trozo, ref);
    assert.ok(new RegExp('la factura ' + ref + ' por', 'i').test(trozo), 'el borrador de ' + ref + ' está bajo ' + ref);
    ['A', 'B', 'C'].filter((otra) => otra !== ref).forEach((otra) => assert.equal(new RegExp('la factura ' + otra + ' por', 'i').test(trozo), false));
  });
  const rompe = (mutar) => capturar(() => armar(facturas, { borrador: (b) => { mutar(b); return b; } })).codigo;
  assert.equal(rompe((b) => { b.borradores[0].factura_ref = 'OTRA'; }), 'E_INFORME_INCONSISTENTE');
  assert.equal(rompe((b) => { b.borradores[0].indice = 1; }), 'E_INFORME_INCONSISTENTE');
  assert.equal(rompe((b) => { b.borradores[1].indice = b.borradores[0].indice; }), 'E_INFORME_INCONSISTENTE');
  assert.equal(rompe((b) => { b.borradores.pop(); }), 'E_INFORME_INCONSISTENTE');
  assert.equal(rompe((b) => { b.borradores[0].moneda = 'USD'; }), 'E_INFORME_INCONSISTENTE');
  assert.equal(rompe((b) => { b.borradores[0].indice = 99; }), 'E_INFORME_INCONSISTENTE');
});

test('misma referencia en dos monedas: cada una con su borrador', () => {
  const { informe } = armar([venc('A1', 10), venc('A1', 12, { moneda: 'USD', importe_centavos: 100000 })]);
  assert.ok(informe.html_completo.includes('por $U 85.000'));
  assert.ok(informe.html_completo.includes('por US$ 1.000'));
});

test('texto_resumen: totales y contadores, sin nombres, referencias, teléfonos ni correos', () => {
  const canarios = ['Cliente Canario Uno', 'CANARIO-REF-1', '59899123456', 'canario@ficticia.example'];
  const { informe } = armar([
    venc(canarios[1], 10, { deudor_nombre: canarios[0], contacto_tel: canarios[2], tel_movil: true, contacto_mail: canarios[3], moneda: 'UYU', importe_centavos: 8500000 }),
    venc('B', 46, { moneda: 'USD', importe_centavos: 315000 })
  ]);
  canarios.forEach((c) => assert.equal(informe.texto_resumen.includes(c), false, c));
  assert.equal(informe.texto_resumen, [
    'Resumen de cobranza · Ferretería Ficticia S.R.L. · al 05/10/2026',
    '',
    'Facturas vencidas: 2',
    '  · $U: 1 factura por $U 85.000',
    '  · US$: 1 factura por US$ 3.150',
    '',
    'Por antigüedad ($U):',
    '  · 1 a 30 días: 1 factura por $U 85.000',
    '  · 31 a 60 días: 0 facturas',
    '  · 61 a 90 días: 0 facturas',
    '  · Más de 90 días: 0 facturas',
    '',
    'Por antigüedad (US$):',
    '  · 1 a 30 días: 0 facturas',
    '  · 31 a 60 días: 1 factura por US$ 3.150',
    '  · 61 a 90 días: 0 facturas',
    '  · Más de 90 días: 0 facturas',
    '',
    'Vencidas en los últimos 7 días: 0'
  ].join('\n'));
});

test('sin facturas vencidas: informe válido que lo dice', () => {
  const { informe } = armar([venc('A', -5)]);
  assert.ok(informe.asunto.endsWith('sin facturas vencidas'));
  assert.ok(informe.html_completo.includes('No hay facturas vencidas.'));
  assert.ok(informe.texto_resumen.includes('No hay facturas vencidas.'));
  assert.equal(informe.filas_mostradas, 0);
});

test('asunto: fecha y cantidad, sin nombres; ensayo y demostración lo marcan', () => {
  assert.equal(armar([venc('A', 5), venc('B', 6)]).informe.asunto, 'Resumen semanal de cobranza · 05/10/2026 · 2 facturas vencidas');
  assert.equal(armar([venc('A', 5)]).informe.asunto, 'Resumen semanal de cobranza · 05/10/2026 · 1 factura vencida');
  assert.equal(armar([venc('A', 5)], { opciones: { ensayo: true } }).informe.asunto, '[ENSAYO] Resumen semanal de cobranza · 05/10/2026 · 1 factura vencida');
  assert.equal(armar([venc('A', 5)], { opciones: { demo: true } }).informe.asunto, 'EJEMPLO · Resumen semanal de cobranza · 05/10/2026 · 1 factura vencida');
  const a = armar([venc('A', 5, { deudor_nombre: 'Nombre Secreto' })], { opciones: { ensayo: true } }).informe;
  assert.equal(a.asunto.includes('Nombre Secreto'), false);
  assert.equal(/[\r\n]/.test(a.asunto), false);
  assert.ok(armar([venc('A', 5)], { opciones: { ensayo: true } }).informe.html_completo.includes('ENSAYO: este informe no es el informe real'));
  assert.equal(armar([venc('A', 5)], { opciones: { ensayo: true } }).informe.nombre_archivo, 'ensayo-informe-cobranza-2026-10-05.html');
  assert.equal(armar([venc('A', 5)]).informe.nombre_archivo, 'informe-cobranza-2026-10-05.html');
});

test('agrupación: primero lo más grave; en disputa al final y sin borrador', () => {
  const { informe } = armar([venc('L', 5), venc('M', 20), venc('N', 100), venc('D', 30, { en_disputa: true })]);
  const h = informe.html_completo;
  const orden = ['Aviso firme o llamada (1)', 'Segundo aviso (1)', 'Recordatorio amable (1)', 'En disputa (sin borrador) (1)'].map((t) => h.indexOf(t));
  assert.ok(orden.every((x) => x > 0));
  assert.deepEqual(orden.slice().sort((a, b) => a - b), orden);
  assert.ok(h.includes('Marcada como en disputa'));
});

test('límite de filas: muestra las más atrasadas y avisa de las que faltan', () => {
  const fs = Array.from({ length: 10 }, (_, i) => venc('F' + i, 5 + i * 3));
  const { informe } = armar(fs, { opciones: { max_filas_informe: 4 } });
  assert.equal(informe.filas_mostradas, 4);
  assert.equal(informe.filas_omitidas, 6);
  assert.equal((informe.html_completo.match(/<article class="fila">/g) || []).length, 4);
  assert.ok(informe.html_completo.includes('Se muestran las 4 facturas más atrasadas de 10'));
  assert.ok(informe.html_completo.includes('Factura F9'));
  assert.equal(informe.html_completo.includes('Factura F0 '), false);
});

test('filas no leídas y avisos: se explican con palabras y sin valores', () => {
  const lectura = {
    resumen: { ...LECTURA_OK.resumen, total: 12, aceptadas: 10, apartadas: 2 },
    apartadas: [{ fila: 12, codigo: 'E_FECHA_INVALIDA', otros: [] }, { fila: 40, codigo: 'E_FECHA_INVALIDA', otros: [] }],
    avisos: [{ fila: 3, codigo: 'A_TEL_INVALIDO' }, { fila: 4, codigo: 'A_TEL_FIJO' }, { fila: 5, codigo: 'A_MAIL_INVALIDO' }], por_codigo: {}
  };
  const { informe } = armar([venc('A', 10)], { lectura });
  assert.ok(informe.texto_resumen.includes('Filas del archivo que no se pudieron leer: 2 de 12'));
  assert.ok(informe.texto_resumen.includes('fecha de vencimiento que no existe o no se entiende: 2 filas (12, 40)'));
  assert.ok(informe.texto_resumen.includes('1 teléfono ilegible'));
  assert.ok(informe.texto_resumen.includes('1 correo ilegible'));
  assert.ok(informe.html_completo.includes('Antes de usar este informe'));
});

test('muchas filas no leídas: se recortan los números de fila', () => {
  const apartadas = Array.from({ length: 40 }, (_, i) => ({ fila: i + 2, codigo: 'E_IMPORTE_INVALIDO', otros: [] }));
  const lectura = { ...LECTURA_OK, resumen: { ...LECTURA_OK.resumen, total: 100, apartadas: 40 }, apartadas };
  const t = armar([venc('A', 10)], { lectura }).informe.texto_resumen;
  assert.ok(t.includes('y 25 más'));
});

test('correo con enlace: solo totales y un enlace de Drive o Docs', () => {
  const { informe } = armar([venc('Secreta', 10, { deudor_nombre: 'Nombre Secreto' })]);
  const enlace = 'https://drive.google.com/file/d/1AbCdEfGhIjK/view?usp=sharing';
  const c = plano(M4.armarCorreoConEnlace({ texto_resumen: informe.texto_resumen, enlace, asunto: informe.asunto }));
  assert.ok(c.cuerpo_texto.includes(enlace));
  assert.equal(c.cuerpo_texto.includes('Nombre Secreto'), false);
  assert.equal(c.asunto, informe.asunto);
  assert.equal(plano(M4.armarCorreoConEnlace({ texto_resumen: 'x', enlace, ensayo: true })).asunto, '[ENSAYO] Resumen semanal de cobranza');
  ['https://evil.example/file', 'http://drive.google.com/file/d/1Ab', 'https://drive.google.com.evil.example/x/y/z', 'javascript:alert(1)', 'https://drive.google.com/', '', null, 'https://drive.google.com/a b/c']
    .forEach((e) => assert.equal(capturar(() => M4.armarCorreoConEnlace({ texto_resumen: 'x', enlace: e })).codigo, 'E_ENLACE_INVALIDO', String(e)));
  assert.equal(capturar(() => M4.armarCorreoConEnlace({ texto_resumen: '', enlace })).codigo, 'E_INFORME_INVALIDO');
});

test('avisos con texto fijo: archivo ilegible y archivo ausente', () => {
  const l = { resumen: { ...LECTURA_OK.resumen, bloquear: true, motivo_bloqueo: 'E_COLUMNA_FALTANTE' }, apartadas: [], avisos: [], detalle: { columnas: ['importe'] } };
  const a = plano(M4.armarAvisoIncidencia({ fecha_corte: CORTE, empresa: { nombre: 'Empresa Ficticia' }, lectura: l }));
  assert.equal(a.asunto, 'No se pudo preparar el resumen de cobranza · 05/10/2026');
  assert.ok(a.cuerpo_texto.includes('Motivo: falta una columna esperada.'));
  assert.ok(a.cuerpo_texto.includes('Columnas afectadas: importe.'));
  assert.ok(a.cuerpo_texto.includes('No se envió nada a ningún cliente.'));
  const hostil = { ...l, detalle: { columnas: ['importe', 'Nombre Secreto <script>'] } };
  assert.equal(plano(M4.armarAvisoIncidencia({ fecha_corte: CORTE, empresa: { nombre: 'E' }, lectura: hostil })).cuerpo_texto.includes('Secreto'), false);
  const s = plano(M4.armarAvisoSinArchivo({ fecha_corte: CORTE, empresa: { nombre: 'Empresa Ficticia' }, ensayo: true }));
  assert.equal(s.asunto, '[ENSAYO] No encontramos la exportación de esta semana · 05/10/2026');
  assert.ok(s.cuerpo_texto.includes('Empresa Ficticia'));
  assert.equal(capturar(() => M4.armarAvisoSinArchivo({ fecha_corte: 'x', empresa: { nombre: 'E' } })).codigo, 'E_INFORME_INVALIDO');
  assert.equal(capturar(() => M4.armarAvisoIncidencia({ fecha_corte: CORTE, empresa: {}, lectura: l })).codigo, 'E_CFG_EMPRESA');
});

test('entradas inválidas se detienen con código', () => {
  const { entrada } = armar([venc('A', 10)]);
  const c = (mutar) => { const e = JSON.parse(JSON.stringify(entrada)); mutar(e); return capturar(() => M4.armarInforme(e)).codigo; };
  assert.equal(c((e) => { e.fecha_corte = '05/10/2026'; }), 'E_INFORME_INVALIDO');
  assert.equal(c((e) => { e.empresa = {}; }), 'E_CFG_EMPRESA');
  assert.equal(c((e) => { delete e.antiguedad.totales; }), 'E_INFORME_INVALIDO');
  assert.equal(c((e) => { e.borradores = null; }), 'E_INFORME_INVALIDO');
  assert.equal(c((e) => { e.lectura = {}; }), 'E_INFORME_INVALIDO');
  assert.equal(capturar(() => M4.armarInforme(null)).codigo, 'E_INFORME_INVALIDO');
});

test('determinista y de tamaño razonable con 300 filas', () => {
  const fs = Array.from({ length: 300 }, (_, i) => venc('F' + i, 1 + (i % 200), { contacto_tel: '59899123456', tel_movil: true }));
  const a = armar(fs).informe.html_completo, b = armar(fs).informe.html_completo;
  assert.equal(a, b);
  assert.ok(a.length < 1500000, 'tamaño ' + a.length);
});

test('modo demostración: los botones no abren nada', () => {
  const { informe } = armar([venc('A', 10, { contacto_tel: '59899123456', tel_movil: true, contacto_mail: 'x@ficticia.example' })], { opciones: { demo: true } });
  assert.equal((informe.html_completo.match(/href=/g) || []).length, 0);
  assert.ok(informe.html_completo.includes('EJEMPLO CON DATOS FICTICIOS'));
});
