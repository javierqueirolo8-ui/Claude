'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, plano, capturar } = require('./cargar');
const azar = require('./azar');

const { Util, M7 } = cargar('util', 'm7-ingesta');

const CORTE = '2026-10-05'; // lunes
const CFG = { zona_horaria: 'America/Montevideo' };
let n = 0;
const arch = (extra = {}) => ({
  id: 'ArchivoFicticio' + String(++n).padStart(6, '0'),
  name: 'facturas-pendientes.csv',
  mimeType: 'text/csv',
  size: '20480',
  modifiedTime: '2026-10-05T11:00:00.000Z',
  ...extra
});
const elegir = (archivos, extra = {}) => plano(M7.elegirArchivo({ archivos, fecha_corte: CORTE, config: CFG, ...extra }));
const codigo = (fn) => { const r = capturar(fn); return r.ok ? null : r.codigo; };

/* ---------------------------------------------------------------- coincide */

test('coincidencia con comodines: «*» cualquier tramo, «?» un carácter, todo lo demás literal', () => {
  const c = (p, t) => M7.coincide(p, t);
  assert.equal(c('*', ''), true);
  assert.equal(c('*', 'lo que sea.csv'), true);
  assert.equal(c('facturas*.csv', 'facturas.csv'), true);
  assert.equal(c('facturas*.csv', 'facturas-2026-10.csv'), true);
  assert.equal(c('facturas*.csv', 'facturas-2026-10.tsv'), false);
  assert.equal(c('facturas?.csv', 'facturas1.csv'), true);
  assert.equal(c('facturas?.csv', 'facturas.csv'), false);
  assert.equal(c('facturas?.csv', 'facturas12.csv'), false);
  assert.equal(c('*pendientes*', 'semana pendientes final.csv'), true);
  assert.equal(c('a*b*c', 'aXXbYYc'), true);
  assert.equal(c('a*b*c', 'aXXbYY'), false);
  assert.equal(c('abc', 'abc'), true);
  assert.equal(c('abc', 'abcd'), false);
  assert.equal(c('', ''), true);
  assert.equal(c('', 'a'), false);
  assert.equal(c('.csv', 'a.csv'), false); // el punto es literal
  assert.equal(c('a.csv', 'aXcsv'), false);
});

test('propiedad: el comparador coincide con una expresión regular equivalente en miles de casos', () => {
  const az = azar.crear(707);
  const alfabeto = 'ab.';
  for (let i = 0; i < 6000; i++) {
    const patron = az.cadena(az.entero(0, 7), 'ab.*?');
    const texto = az.cadena(az.entero(0, 9), alfabeto);
    const re = new RegExp('^' + patron.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    assert.equal(M7.coincide(patron, texto), re.test(texto), JSON.stringify([patron, texto]));
  }
});

test('un patrón patológico no bloquea nada (sin retroceso exponencial)', () => {
  const t0 = Date.now();
  const largo = 'a'.repeat(250) + 'b';
  for (let i = 0; i < 200; i++) assert.equal(M7.coincide('*a*a*a*c', largo), false);
  assert.ok(Date.now() - t0 < 1500, 'tardó ' + (Date.now() - t0) + ' ms');
});

/* ------------------------------------------------------------- configuración */

test('configuración por defecto y valores válidos', () => {
  const c = plano(M7.validarConfig(CFG));
  assert.deepEqual(c, { patron: '*', antiguedad: 8, maxBytes: 5000000, zona: 'America/Montevideo' });
  const otro = plano(M7.validarConfig({ zona_horaria: 'UTC', patron_nombre_archivo: 'Facturas*.CSV', antiguedad_maxima_archivo_dias: 31, tamano_maximo_bytes: 1024 }));
  assert.deepEqual(otro, { patron: 'facturas*.csv', antiguedad: 31, maxBytes: 1024, zona: 'UTC' });
});

test('configuración inválida: se detiene con un código antes de mirar ningún archivo', () => {
  const casos = [
    [{}, 'E_CFG_ZONA'], [{ zona_horaria: 'Marte/Olimpo' }, 'E_CFG_ZONA'], [{ zona_horaria: 5 }, 'E_CFG_ZONA'],
    [{ ...CFG, patron_nombre_archivo: 5 }, 'E_CFG_PATRON'], [{ ...CFG, patron_nombre_archivo: '' }, 'E_CFG_PATRON'],
    [{ ...CFG, patron_nombre_archivo: '*'.repeat(4) }, 'E_CFG_PATRON'], [{ ...CFG, patron_nombre_archivo: 'a'.repeat(61) }, 'E_CFG_PATRON'],
    [{ ...CFG, patron_nombre_archivo: '../*' }, 'E_CFG_PATRON'], [{ ...CFG, patron_nombre_archivo: 'a\\b' }, 'E_CFG_PATRON'],
    [{ ...CFG, antiguedad_maxima_archivo_dias: 0 }, 'E_CFG_ANTIGUEDAD'], [{ ...CFG, antiguedad_maxima_archivo_dias: 32 }, 'E_CFG_ANTIGUEDAD'],
    [{ ...CFG, antiguedad_maxima_archivo_dias: '8' }, 'E_CFG_ANTIGUEDAD'], [{ ...CFG, antiguedad_maxima_archivo_dias: 1.5 }, 'E_CFG_ANTIGUEDAD'],
    [{ ...CFG, tamano_maximo_bytes: 1023 }, 'E_CFG_TAMANO'], [{ ...CFG, tamano_maximo_bytes: 6000001 }, 'E_CFG_TAMANO'], [{ ...CFG, tamano_maximo_bytes: '5000' }, 'E_CFG_TAMANO'],
    ['x', 'E_CFG_INGESTA'], [[], 'E_CFG_INGESTA']
  ];
  for (const [cfg, esperado] of casos) {
    assert.equal(codigo(() => M7.elegirArchivo({ archivos: [arch()], fecha_corte: CORTE, config: cfg })), esperado, JSON.stringify(cfg));
  }
});

test('la entrada general se valida: lista, fecha de corte y cantidad de archivos', () => {
  for (const e of [null, undefined, 'x', {}, { archivos: 'no', fecha_corte: CORTE, config: CFG }, { archivos: [], fecha_corte: '05/10/2026', config: CFG },
    { archivos: [], fecha_corte: null, config: CFG }, { archivos: {}, fecha_corte: CORTE, config: CFG }]) {
    assert.equal(codigo(() => M7.elegirArchivo(e)), 'E_INGESTA_INVALIDA', JSON.stringify(e));
  }
  const muchos = Array.from({ length: 501 }, () => arch());
  assert.equal(codigo(() => M7.elegirArchivo({ archivos: muchos, fecha_corte: CORTE, config: CFG })), 'E_INGESTA_DEMASIADOS');
  assert.equal(elegir(muchos.slice(0, 500)).total, 500);
});

/* --------------------------------------------------------------- elección */

test('sin archivos: «sin_archivo»', () => {
  const r = elegir([]);
  assert.equal(r.estado, 'sin_archivo');
  assert.equal(r.archivo, null);
  assert.equal(r.total, 0);
  assert.deepEqual(r.descartados, []);
});

test('un archivo válido se elige y solo se devuelven datos técnicos, nunca el nombre', () => {
  const a = arch({ name: 'CANARIO Juan Pérez facturas.csv' });
  const r = elegir([a]);
  assert.equal(r.estado, 'elegido');
  assert.deepEqual(r.archivo, { indice: 0, id: a.id, formato: 'csv', bytes: 20480, modificado_fecha: '2026-10-05', dias_de_antiguedad: 0 });
  assert.equal(JSON.stringify(r).includes('CANARIO'), false);
  assert.equal(JSON.stringify(r).includes('Juan'), false);
});

test('gana el más reciente entre varios válidos', () => {
  const viejo = arch({ modifiedTime: '2026-09-30T12:00:00.000Z' });
  const nuevo = arch({ modifiedTime: '2026-10-04T12:00:00.000Z' });
  const medio = arch({ modifiedTime: '2026-10-02T12:00:00.000Z' });
  const r = elegir([viejo, nuevo, medio]);
  assert.equal(r.archivo.id, nuevo.id);
  assert.equal(r.archivo.indice, 1);
  assert.equal(r.archivo.dias_de_antiguedad, 1);
});

test('dos archivos aptos con el mismo instante más reciente: «ambiguo», no se elige ninguno', () => {
  const a = arch({ name: 'facturas-uyu.csv' });
  const b = arch({ name: 'facturas-usd.csv' });
  const r = elegir([a, b]);
  assert.equal(r.estado, 'ambiguo');
  assert.equal(r.archivo, null);
  // un empate entre archivos menos recientes no importa
  const c = arch({ modifiedTime: '2026-10-03T12:00:00.000Z' });
  const d = arch({ modifiedTime: '2026-10-03T12:00:00.000Z' });
  const nuevo = arch({ modifiedTime: '2026-10-04T12:00:00.000Z' });
  assert.equal(elegir([c, d, nuevo]).estado, 'elegido');
  // un archivo con el mismo instante pero NO apto tampoco genera ambigüedad
  const malo = arch({ mimeType: 'application/pdf' });
  assert.equal(elegir([a, malo]).estado, 'elegido');
});

test('extensión y tipo de contenido: solo csv, tsv y xlsx, y coherentes entre sí', () => {
  const casos = [
    [{ name: 'f.pdf', mimeType: 'application/pdf' }, 'E_ARCHIVO_TIPO'],
    [{ name: 'f.exe', mimeType: 'application/octet-stream' }, 'E_ARCHIVO_TIPO'],
    [{ name: 'f.csv.exe', mimeType: 'text/csv' }, 'E_ARCHIVO_TIPO'],
    [{ name: 'f', mimeType: 'text/csv' }, 'E_ARCHIVO_TIPO'],
    [{ name: 'f.xls', mimeType: 'application/vnd.ms-excel' }, 'E_ARCHIVO_TIPO'],
    [{ name: 'f.csv', mimeType: 'application/pdf' }, 'E_ARCHIVO_TIPO'],
    [{ name: 'f.csv', mimeType: 'text/html' }, 'E_ARCHIVO_TIPO'],
    [{ name: 'f.xlsx', mimeType: 'text/csv' }, 'E_ARCHIVO_TIPO'],
    [{ name: 'f.tsv', mimeType: 'text/csv' }, 'E_ARCHIVO_TIPO'],
    [{ name: 'f.csv', mimeType: 'application/vnd.google-apps.spreadsheet' }, 'E_ARCHIVO_TIPO']
  ];
  for (const [extra, esperado] of casos) {
    const r = elegir([arch(extra)]);
    assert.equal(r.estado, 'sin_archivo', JSON.stringify(extra));
    assert.deepEqual(r.descartados, [{ indice: 0, codigo: esperado }], JSON.stringify(extra));
  }
  const buenos = [
    { name: 'f.csv', mimeType: 'text/csv' }, { name: 'F.CSV', mimeType: 'TEXT/CSV' }, { name: 'f.csv', mimeType: 'application/vnd.ms-excel' },
    { name: 'f.csv', mimeType: 'text/plain' }, { name: 'f.tsv', mimeType: 'text/tab-separated-values' },
    { name: 'f.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 100000 }
  ];
  for (const extra of buenos) assert.equal(elegir([arch(extra)]).estado, 'elegido', JSON.stringify(extra));
  assert.equal(elegir([arch({ name: 'f.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 100000 })]).archivo.formato, 'xlsx');
});

test('patrón de nombre: sin importar mayúsculas ni tildes', () => {
  const cfg = { ...CFG, patron_nombre_archivo: 'Facturas Pendientes*.CSV' };
  const si = arch({ name: 'facturás pendientes 2026-10.csv' });
  const no = arch({ name: 'otro-archivo.csv' });
  const r = plano(M7.elegirArchivo({ archivos: [no, si], fecha_corte: CORTE, config: cfg }));
  assert.equal(r.estado, 'elegido');
  assert.equal(r.archivo.id, si.id);
  assert.deepEqual(r.descartados, [{ indice: 0, codigo: 'E_ARCHIVO_NOMBRE' }]);
});

test('tamaño: cero es vacío; sobre el tope es grande; el XLSX tiene un tope menor; texto con dígitos es válido', () => {
  const xl = { name: 'f.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  const casos = [
    [{ size: '0' }, 'E_ARCHIVO_VACIO'], [{ size: 0 }, 'E_ARCHIVO_VACIO'],
    [{ size: '5000001' }, 'E_ARCHIVO_GRANDE'], [{ size: 99999999 }, 'E_ARCHIVO_GRANDE'],
    [{ ...xl, size: '2000001' }, 'E_ARCHIVO_GRANDE'],
    [{ size: '12abc' }, 'E_ARCHIVO_METADATOS'], [{ size: -5 }, 'E_ARCHIVO_METADATOS'], [{ size: 1.5 }, 'E_ARCHIVO_METADATOS'],
    [{ size: null }, 'E_ARCHIVO_METADATOS'], [{ size: undefined }, 'E_ARCHIVO_METADATOS'], [{ size: '' }, 'E_ARCHIVO_METADATOS'],
    [{ size: '1e6' }, 'E_ARCHIVO_METADATOS'], [{ size: ' 100' }, 'E_ARCHIVO_METADATOS'], [{ size: NaN }, 'E_ARCHIVO_METADATOS']
  ];
  for (const [extra, esperado] of casos) {
    const r = elegir([arch(extra)]);
    assert.deepEqual(r.descartados, [{ indice: 0, codigo: esperado }], JSON.stringify(extra));
  }
  assert.equal(elegir([arch({ size: '5000000' })]).estado, 'elegido');
  assert.equal(elegir([arch({ ...xl, size: '2000000' })]).estado, 'elegido');
  assert.equal(elegir([arch({ size: 1 })]).archivo.bytes, 1);
  // un tope configurado más bajo también rige para el XLSX
  const r = plano(M7.elegirArchivo({ archivos: [arch({ ...xl, size: '3000' })], fecha_corte: CORTE, config: { ...CFG, tamano_maximo_bytes: 2048 } }));
  assert.deepEqual(r.descartados, [{ indice: 0, codigo: 'E_ARCHIVO_GRANDE' }]);
});

test('antigüedad: hasta el límite sí, un día más no, y un archivo del futuro tampoco', () => {
  const dia = (d) => arch({ modifiedTime: d + 'T15:00:00.000Z' });
  assert.equal(elegir([dia('2026-09-27')]).archivo.dias_de_antiguedad, 8);
  assert.deepEqual(elegir([dia('2026-09-26')]).descartados, [{ indice: 0, codigo: 'E_ARCHIVO_VIEJO' }]);
  assert.deepEqual(elegir([dia('2026-10-06')]).descartados, [{ indice: 0, codigo: 'E_ARCHIVO_FUTURO' }]);
  assert.equal(elegir([dia('2026-10-05')]).archivo.dias_de_antiguedad, 0);
  const cfg = { ...CFG, antiguedad_maxima_archivo_dias: 2 };
  const r = (a) => plano(M7.elegirArchivo({ archivos: [a], fecha_corte: CORTE, config: cfg }));
  assert.equal(r(dia('2026-10-03')).estado, 'elegido');
  assert.equal(r(dia('2026-10-02')).estado, 'sin_archivo');
});

test('la fecha de modificación se lee en la zona horaria del cliente, no en UTC', () => {
  // 02:00 UTC del 6/10 son las 23:00 del 5/10 en Montevideo: es «de hoy», no «del futuro»
  const r = elegir([arch({ modifiedTime: '2026-10-06T02:00:00.000Z' })]);
  assert.equal(r.estado, 'elegido');
  assert.equal(r.archivo.modificado_fecha, '2026-10-05');
  // con desfase explícito da lo mismo
  assert.equal(elegir([arch({ modifiedTime: '2026-10-05T23:00:00-03:00' })]).archivo.modificado_fecha, '2026-10-05');
  // y en otra zona el mismo instante cae en otro día
  const tokio = plano(M7.elegirArchivo({ archivos: [arch({ modifiedTime: '2026-10-05T20:00:00.000Z' })], fecha_corte: '2026-10-06', config: { zona_horaria: 'Asia/Tokyo' } }));
  assert.equal(tokio.archivo.modificado_fecha, '2026-10-06');
});

test('metadatos incompletos o raros: se descartan con código y no rompen la elección de los demás', () => {
  const bueno = arch();
  const raros = [
    null, undefined, 'x', 5, [], {},
    arch({ id: undefined }), arch({ id: '' }), arch({ id: 'corto' }), arch({ id: 'con espacios y símbolos!!' }), arch({ id: 'x'.repeat(129) }),
    arch({ name: undefined }), arch({ name: 5 }), arch({ name: '' }), arch({ name: '   ' }), arch({ name: 'x'.repeat(256) + '.csv' }),
    arch({ mimeType: undefined }), arch({ mimeType: 5 }),
    arch({ modifiedTime: undefined }), arch({ modifiedTime: 'ayer' }), arch({ modifiedTime: '2026-10-05' }), arch({ modifiedTime: '2026-10-05T11:00:00' }),
    arch({ modifiedTime: '2026-10-05 11:00:00Z' }), arch({ modifiedTime: '2026-13-05T11:00:00Z' }), arch({ modifiedTime: '2026-10-05T25:00:00Z' }), arch({ modifiedTime: 5 })
  ];
  const r = elegir([...raros, bueno]);
  assert.equal(r.estado, 'elegido');
  assert.equal(r.archivo.id, bueno.id);
  assert.equal(r.descartados.length, raros.length);
  for (const d of r.descartados) assert.equal(d.codigo, 'E_ARCHIVO_METADATOS', JSON.stringify(d));
});

test('nombres hostiles: se comparan sin ejecutar nada y jamás aparecen en la salida', () => {
  const nombres = [
    '../../etc/passwd.csv', 'a'.repeat(100) + '.csv', '<script>alert(1)</script>.csv', '=HYPERLINK("http://malo")\n.csv',
    String.fromCharCode(0x202E) + 'vsc.exe.csv', 'facturas' + String.fromCharCode(0x200B) + '.csv', 'nombre con\nsalto.csv', 'Ferretería CANARIO_NOMBRE.csv'
  ];
  for (const name of nombres) {
    const r = elegir([arch({ name })]);
    assert.equal(r.estado, 'elegido', JSON.stringify(name));
    assert.equal(JSON.stringify(r).includes('CANARIO'), false);
    assert.equal(/script|passwd|HYPERLINK/.test(JSON.stringify(r)), false);
  }
});

test('el resultado nunca contiene nombres: solo códigos, índices, identificador, formato, bytes y fechas', () => {
  const r = elegir([arch({ name: 'CANARIO_A.csv', mimeType: 'application/pdf' }), arch({ name: 'CANARIO_B.csv' }), arch({ name: 'CANARIO_C.csv', size: 0 })]);
  assert.equal(JSON.stringify(r).includes('CANARIO'), false);
  assert.deepEqual(Object.keys(r).sort(), ['archivo', 'descartados', 'estado', 'por_codigo', 'total']);
  assert.deepEqual(r.por_codigo, { E_ARCHIVO_TIPO: 1, E_ARCHIVO_VACIO: 1 });
});

test('no modifica sus argumentos y da el mismo resultado si se repite', () => {
  const lista = [arch(), arch({ modifiedTime: '2026-10-04T10:00:00.000Z' }), arch({ mimeType: 'x/y' })];
  const antes = JSON.stringify(lista);
  lista.forEach(Object.freeze);
  Object.freeze(lista);
  const cfg = Object.freeze({ ...CFG });
  const a = plano(M7.elegirArchivo({ archivos: lista, fecha_corte: CORTE, config: cfg }));
  const b = plano(M7.elegirArchivo({ archivos: lista, fecha_corte: CORTE, config: cfg }));
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(lista), antes);
});

test('propiedad: el elegido es siempre el más reciente de los aptos, sea cual sea el orden de la lista', () => {
  const az = azar.crear(808);
  const nombres = ['facturas.csv', 'export.tsv', 'lista.xlsx', 'foto.png', 'FACTURAS.CSV', 'notas.txt'];
  const mimes = { csv: 'text/csv', tsv: 'text/tab-separated-values', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', png: 'image/png', txt: 'text/plain' };
  for (let i = 0; i < 1500; i++) {
    const lista = Array.from({ length: az.entero(0, 8) }, () => {
      const name = az.elegir(nombres);
      const ext = name.split('.').pop().toLowerCase();
      const dia = az.entero(20, 31);
      const mes = dia > 30 ? 10 : (dia >= 27 ? 9 : 10);
      return arch({
        name, mimeType: az.prob(0.9) ? mimes[ext] : 'text/html',
        size: az.elegir(['0', '100', '20480', '2500000', '9999999']),
        modifiedTime: '2026-' + String(az.entero(9, 10)).padStart(2, '0') + '-' + String(az.entero(1, 28)).padStart(2, '0') + 'T' + String(az.entero(0, 23)).padStart(2, '0') + ':' + String(az.entero(0, 59)).padStart(2, '0') + ':00.000Z'
      });
    });
    const r = elegir(lista);
    const baraja = elegir(az.barajar(lista));
    assert.equal(r.estado, baraja.estado);
    if (r.estado === 'elegido') assert.equal(r.archivo.id, baraja.archivo.id);
    // verificación independiente: nadie apto es más reciente que el elegido
    const aptos = lista.filter((a) => {
      const q = elegir([a]);
      return q.estado === 'elegido';
    });
    if (r.estado === 'elegido') {
      const elegido = lista.find((a) => a.id === r.archivo.id);
      aptos.forEach((a) => assert.ok(new Date(a.modifiedTime).getTime() <= new Date(elegido.modifiedTime).getTime()));
    } else if (r.estado === 'sin_archivo') {
      assert.equal(aptos.length, 0);
    } else {
      assert.ok(aptos.length >= 2);
    }
  }
});

/* ------------------------------------------------------------ verificarDescarga */

test('una descarga cortada se detecta comparando los bytes recibidos con los del listado', () => {
  assert.deepEqual(plano(M7.verificarDescarga({ esperado_bytes: 20480, recibido_bytes: 20480 })), { ok: true, codigo: null });
  assert.deepEqual(plano(M7.verificarDescarga({ esperado_bytes: '20480', recibido_bytes: 20480 })), { ok: true, codigo: null });
  assert.deepEqual(plano(M7.verificarDescarga({ esperado_bytes: 20480, recibido_bytes: 20000 })), { ok: false, codigo: 'E_DESCARGA_INCOMPLETA' });
  assert.deepEqual(plano(M7.verificarDescarga({ esperado_bytes: 20480, recibido_bytes: 20481 })), { ok: false, codigo: 'E_DESCARGA_INCOMPLETA' });
  assert.deepEqual(plano(M7.verificarDescarga({ esperado_bytes: 20480, recibido_bytes: 0 })), { ok: false, codigo: 'E_DESCARGA_INCOMPLETA' });
  for (const e of [null, {}, { esperado_bytes: 'x', recibido_bytes: 1 }, { esperado_bytes: 1 }, { esperado_bytes: -1, recibido_bytes: -1 }, 'x']) {
    assert.equal(codigo(() => M7.verificarDescarga(e)), 'E_INGESTA_INVALIDA', JSON.stringify(e));
  }
});

/* ------------------------------------------------- día de semana y aviso */

test('día de la semana ISO: lunes = 1 … domingo = 7', () => {
  const casos = { '2026-10-05': 1, '2026-10-06': 2, '2026-10-07': 3, '2026-10-08': 4, '2026-10-09': 5, '2026-10-10': 6, '2026-10-11': 7,
    '2000-01-01': 6, '2000-01-03': 1, '2000-02-29': 2, '2099-12-31': 4, '2024-02-29': 4, '2026-01-01': 4 };
  for (const [f, esperado] of Object.entries(casos)) assert.equal(M7.diaDeSemanaISO(f), esperado, f);
  for (const v of ['05/10/2026', '2026-02-30', '1999-12-31', '2100-01-01', null, undefined, 5, '']) assert.equal(codigo(() => M7.diaDeSemanaISO(v)), 'E_FECHA_INVALIDA', String(v));
});

test('propiedad: el día de la semana coincide con el calendario del sistema en 20 000 fechas de 2000 a 2099', () => {
  const az = azar.crear(909);
  for (let i = 0; i < 20000; i++) {
    const t = Date.UTC(2000, 0, 1) + az.entero(0, 36524) * 86400000; // de 2000-01-01 a 2099-12-31
    const f = new Date(t);
    const iso = f.getUTCFullYear() + '-' + String(f.getUTCMonth() + 1).padStart(2, '0') + '-' + String(f.getUTCDate()).padStart(2, '0');
    assert.equal(M7.diaDeSemanaISO(iso), f.getUTCDay() || 7, iso);
  }
});

test('aviso de «no llegó»: espera hasta el día configurado, avisa una vez por semana', () => {
  const d = (fecha, extra = {}) => M7.decidirSinArchivo({ fecha_corte: fecha, aviso_ya_enviado: false, ...extra });
  assert.equal(d('2026-10-05'), 'esperar'); // lunes
  assert.equal(d('2026-10-06'), 'esperar'); // martes
  assert.equal(d('2026-10-07'), 'avisar'); // miércoles
  assert.equal(d('2026-10-08'), 'avisar');
  assert.equal(d('2026-10-11'), 'avisar'); // domingo: sigue pendiente si no se avisó antes
  assert.equal(d('2026-10-07', { aviso_ya_enviado: true }), 'omitir_ya_avisado');
  assert.equal(d('2026-10-05', { aviso_ya_enviado: true }), 'esperar'); // un aviso viejo de otra semana no cuenta: eso lo resuelve la clave
  assert.equal(d('2026-10-05', { dia_aviso: 1 }), 'avisar');
  assert.equal(d('2026-10-10', { dia_aviso: 7 }), 'esperar');
  assert.equal(d('2026-10-11', { dia_aviso: 7 }), 'avisar');
});

test('el aviso rechaza datos raros con código', () => {
  for (const e of [null, {}, { fecha_corte: CORTE }, { fecha_corte: CORTE, aviso_ya_enviado: 'no' }, { fecha_corte: 'x', aviso_ya_enviado: false }]) {
    assert.equal(codigo(() => M7.decidirSinArchivo(e)), 'E_INGESTA_INVALIDA', JSON.stringify(e));
  }
  for (const dia of [0, 8, 1.5, '3', null]) {
    assert.equal(codigo(() => M7.decidirSinArchivo({ fecha_corte: CORTE, aviso_ya_enviado: false, dia_aviso: dia })), 'E_CFG_DIA_AVISO', String(dia));
  }
});

test('la huella de «sin archivo» es una huella válida del libro y no coincide con ningún SHA-256 real', () => {
  assert.equal(M7.HUELLA_SIN_ARCHIVO.length, 64);
  assert.equal(Util.hex64(M7.HUELLA_SIN_ARCHIVO), true);
  assert.equal(/^0+$/.test(M7.HUELLA_SIN_ARCHIVO), true);
});
