'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, plano, capturar } = require('./cargar');

const { M1 } = cargar('util', 'm1-normalizar');

const MAPEO = {
  factura: 'Nro Factura', deudor: 'Cliente', importe: 'Saldo', vencimiento: 'Vencimiento',
  moneda: 'Moneda', emision: 'Emisión', telefono: 'Teléfono', correo: 'Correo', en_disputa: 'En disputa'
};
const CFG = { mapeo_columnas: MAPEO, fecha_corte: '2026-10-05' };
const CABECERA = 'Nro Factura;Cliente;Saldo;Vencimiento;Moneda;Emisión;Teléfono;Correo;En disputa';
const csv = (...filas) => [CABECERA, ...filas].join('\n');
const leer = (texto, cfg = CFG) => plano(M1.normalizarCSV(texto, cfg));
const cfgCon = (extra) => ({ ...CFG, ...extra });

/* ------------------------------------------------------------ configuración */

test('validarConfig: una configuración mala se detiene con su código, antes de leer nada', () => {
  const mal = (cfg, codigo) => assert.equal(capturar(() => M1.validarConfig(cfg)).codigo, codigo, JSON.stringify(cfg));
  mal(null, 'E_CFG_MAPEO'); mal({}, 'E_CFG_MAPEO'); mal({ mapeo_columnas: 'x' }, 'E_CFG_MAPEO');
  mal({ mapeo_columnas: { factura: 'A', deudor: 'B', importe: 'C' } }, 'E_CFG_MAPEO'); // falta vencimiento
  mal({ mapeo_columnas: { ...MAPEO, importee: 'X' } }, 'E_CFG_MAPEO'); // campo mal escrito
  mal({ mapeo_columnas: { ...MAPEO, importe: 'Cliente' } }, 'E_CFG_MAPEO'); // una columna, dos significados
  mal({ mapeo_columnas: { ...MAPEO, importe: '' } }, 'E_CFG_MAPEO');
  mal({ mapeo_columnas: { ...MAPEO, importe: [] } }, 'E_CFG_MAPEO');
  mal({ mapeo_columnas: { ...MAPEO, importe: 5 } }, 'E_CFG_MAPEO');
  mal({ mapeo_columnas: MAPEO, formato_importe: { decimal: ';' } }, 'E_CFG_FORMATO');
  mal({ mapeo_columnas: MAPEO, formato_importe: { decimal: ',', miles: ',' } }, 'E_CFG_FORMATO');
  mal({ mapeo_columnas: MAPEO, formato_importe: { decimal: '.', miles: 'x' } }, 'E_CFG_FORMATO');
  mal({ mapeo_columnas: MAPEO, monedas_admitidas: [] }, 'E_CFG_MONEDAS');
  mal({ mapeo_columnas: MAPEO, monedas_admitidas: ['EUR'] }, 'E_CFG_MONEDAS');
  mal({ mapeo_columnas: MAPEO, monedas_admitidas: ['UYU'], moneda_por_defecto: 'USD' }, 'E_CFG_MONEDAS');
  mal({ mapeo_columnas: MAPEO, umbral_rechazo: -1 }, 'E_CFG_UMBRAL'); mal({ mapeo_columnas: MAPEO, umbral_rechazo: 101 }, 'E_CFG_UMBRAL');
  mal({ mapeo_columnas: MAPEO, umbral_rechazo: '5' }, 'E_CFG_UMBRAL');
  mal({ mapeo_columnas: MAPEO, limites: { max_filas: 0 } }, 'E_CFG_LIMITES'); mal({ mapeo_columnas: MAPEO, limites: { max_filas: 20001 } }, 'E_CFG_LIMITES');
  mal({ mapeo_columnas: MAPEO, limites: { max_largo_celda: 5 } }, 'E_CFG_LIMITES');
  mal({ mapeo_columnas: MAPEO, fecha_corte: '05/10/2026' }, 'E_CFG_FECHA_CORTE'); mal({ mapeo_columnas: MAPEO, fecha_corte: '2026-02-30' }, 'E_CFG_FECHA_CORTE');
  mal({ mapeo_columnas: MAPEO, zona_horaria: 'no valida!' }, 'E_CFG_ZONA');
  assert.equal(capturar(() => M1.validarConfig(CFG)).ok, true);
  assert.equal(capturar(() => M1.validarConfig({ mapeo_columnas: MAPEO, zona_horaria: 'America/Argentina/Buenos_Aires' })).ok, true);
});

test('una configuración mala también detiene normalizarCSV y normalizarObjetos', () => {
  assert.equal(capturar(() => M1.normalizarCSV(csv(), { mapeo_columnas: {} })).codigo, 'E_CFG_MAPEO');
  assert.equal(capturar(() => M1.normalizarObjetos([], { mapeo_columnas: {} })).codigo, 'E_CFG_MAPEO');
});

/* -------------------------------------------------------------- lector CSV */

test('leerCSV: detecta ; , tabulador y | y respeta comillas', () => {
  const r = (t) => plano(M1.leerCSV(t));
  assert.deepEqual(r('a;b;c\n1;2;3').cabeceras, ['a', 'b', 'c']);
  assert.deepEqual(r('a,b,c\n1,2,3').filas, [['1', '2', '3']]);
  assert.deepEqual(r('a\tb\tc\n1\t2\t3').filas, [['1', '2', '3']]);
  assert.deepEqual(r('a|b|c\n1|2|3').filas, [['1', '2', '3']]);
  assert.deepEqual(r('a;b\n"x;y";"z ""q"""').filas, [['x;y', 'z "q"']]);
  assert.deepEqual(r('a;b\n"línea 1\nlínea 2";2').filas, [['línea 1\nlínea 2', '2']]);
});

test('leerCSV: BOM, saltos de línea CRLF, LF y CR, y líneas vacías', () => {
  const BOM = String.fromCharCode(0xFEFF);
  assert.deepEqual(plano(M1.leerCSV(BOM + 'a;b\r\n1;2\r\n\r\n3;4\r\n')).filas, [['1', '2'], ['3', '4']]);
  assert.deepEqual(plano(M1.leerCSV('a;b\r1;2\r3;4')).filas, [['1', '2'], ['3', '4']]);
  assert.deepEqual(plano(M1.leerCSV('a;b\n1;2\n\n\n')).filas, [['1', '2']]);
  assert.deepEqual(plano(M1.leerCSV(BOM + 'a;b\n1;2')).cabeceras, ['a', 'b']);
});

test('leerCSV: números de línea reales, también con campos de varias líneas', () => {
  const r = plano(M1.leerCSV('a;b\n1;2\n"x\ny";3\n\n4;5'));
  assert.deepEqual(r.lineas, [2, 3, 6]);
});

test('leerCSV: rechaza lo ilegible con un código', () => {
  assert.equal(capturar(() => M1.leerCSV('a;b\n"sin cerrar;2\n3;4')).codigo, 'E_CSV_COMILLAS');
  assert.equal(capturar(() => M1.leerCSV('')).codigo, 'E_CSV_VACIO');
  assert.equal(capturar(() => M1.leerCSV('  \n \n')).codigo, 'E_CSV_VACIO');
  assert.equal(capturar(() => M1.leerCSV(null)).codigo, 'E_CSV_VACIO');
  assert.equal(capturar(() => M1.leerCSV('a;b\n' + '1;2\n'.repeat(1500000))).codigo, 'E_ARCHIVO_GRANDE');
});

test('normalizarCSV devuelve un resultado bloqueado, con código, si el CSV es ilegible', () => {
  const r = leer('a;b\n"sin cerrar;2', CFG);
  assert.equal(r.error, 'E_CSV_COMILLAS');
  assert.equal(r.resumen.bloquear, true);
  assert.deepEqual(r.facturas, []);
  assert.equal(leer('', CFG).error, 'E_CSV_VACIO');
});

/* -------------------------------------------------------------- columnas */

test('columnas: por configuración y con coincidencia exacta; nunca por parecido', () => {
  const r = leer('Nro Factura;Cliente;Total;Vencimiento\nA-1;X;100;01/09/2026', cfgCon({}));
  assert.equal(r.error, 'E_COLUMNA_FALTANTE'); // «Total» no se lee como «Saldo»
  assert.deepEqual(r.detalle, { columnas: ['importe'] });
  assert.equal(r.resumen.bloquear, true);
  assert.deepEqual(r.facturas, []);
});

test('columnas: sin distinguir mayúsculas, tildes ni signos, y con títulos alternativos', () => {
  const cfg = { mapeo_columnas: { factura: ['N° comprobante', 'Nro Factura'], deudor: 'CLIENTE', importe: 'saldo pendiente', vencimiento: 'fecha de vencimiento' }, moneda_por_defecto: 'UYU', fecha_corte: '2026-10-05' };
  const r = leer('nro. factura;cliente;Saldo Pendiente;Fecha de Vencimiento\nA-1;Ficticia S.A.;1.000,00;01/09/2026', cfg);
  assert.equal(r.error, null);
  assert.equal(r.facturas.length, 1);
  assert.equal(r.facturas[0].factura_ref, 'A-1');
});

test('columnas: dos títulos que significan lo mismo → duplicada, no se elige una', () => {
  const r = leer('Nro Factura;Cliente;Saldo;SALDO;Vencimiento\nA-1;X;100;200;01/09/2026', cfgCon({ mapeo_columnas: { factura: 'Nro Factura', deudor: 'Cliente', importe: 'Saldo', vencimiento: 'Vencimiento' } }));
  assert.equal(r.error, 'E_COLUMNA_DUPLICADA');
  assert.deepEqual(r.detalle, { columnas: ['importe'] });
});

test('columnas opcionales ausentes no impiden leer', () => {
  const cfg = { mapeo_columnas: { factura: 'F', deudor: 'C', importe: 'I', vencimiento: 'V' }, moneda_por_defecto: 'UYU', fecha_corte: '2026-10-05' };
  const r = leer('F;C;I;V\nA-1;Ficticia S.A.;1.000;01/09/2026', cfg);
  assert.equal(r.error, null);
  assert.equal(r.facturas[0].moneda, 'UYU');
  assert.equal(r.facturas[0].contacto_tel, null);
});

/* ------------------------------------------------------------ filas válidas */

test('una fila completa se normaliza', () => {
  const r = leer(csv('a 1001;  Cliente   Uno S.R.L. ;$U 85.000,00;25/09/2026;;20/08/2026;099 000 001;Ventas@Ficticia.example;'));
  assert.equal(r.error, null);
  assert.deepEqual(r.facturas, [{
    factura_ref: 'A 1001', deudor_nombre: 'Cliente Uno S.R.L.', moneda: 'UYU', importe_centavos: 8500000,
    emision: '2026-08-20', vencimiento: '2026-09-25', contacto_tel: '59899000001', tel_movil: true,
    contacto_mail: 'ventas@ficticia.example', en_disputa: false, fila_origen: 2
  }]);
  assert.deepEqual(r.resumen, { total: 1, aceptadas: 1, apartadas: 0, vacias: 0, totales_ignorados: 0, tasa_apartadas: 0, umbral_rechazo: 5, bloquear: false, motivo_bloqueo: null });
});

test('moneda: de la columna, del símbolo del importe o de la configuración', () => {
  const f = (linea, cfg) => leer(csv(linea), cfg).facturas[0];
  assert.equal(f('A1;X;100;01/09/2026;US$', {}.x ? {} : CFG).moneda, 'USD');
  assert.equal(f('A1;X;U$S 100;01/09/2026;', CFG).moneda, 'USD');
  assert.equal(f('A1;X;$U 100;01/09/2026;', CFG).moneda, 'UYU');
  assert.equal(f('A1;X;100;01/09/2026;', cfgCon({ moneda_por_defecto: 'UYU' })).moneda, 'UYU');
  assert.equal(f('A1;X;USD 100;01/09/2026;dólares', CFG).moneda, 'USD');
});

test('serie + número se unen en la referencia', () => {
  const cfg = { mapeo_columnas: { serie: 'Serie', factura: 'Número', deudor: 'Cliente', importe: 'Saldo', vencimiento: 'Vencimiento' }, moneda_por_defecto: 'UYU', fecha_corte: '2026-10-05' };
  const r = leer('Serie;Número;Cliente;Saldo;Vencimiento\nA;1001;X;100;01/09/2026\n;1002;Y;100;01/09/2026', cfg);
  assert.deepEqual(r.facturas.map((x) => x.factura_ref), ['A-1001', '1002']);
});

test('el separador decimal se configura: coma y punto de miles o al revés', () => {
  const cfg = cfgCon({ formato_importe: { decimal: '.', miles: ',' } });
  assert.equal(leer(csv('A1;X;1,234.56;01/09/2026;$U'), cfg).facturas[0].importe_centavos, 123456);
  assert.equal(leer(csv('A1;X;1.234,56;01/09/2026;$U'), cfg).apartadas[0].codigo, 'E_IMPORTE_INVALIDO');
});

/* ------------------------------------------------------------ filas apartadas */

test('cada motivo de rechazo tiene su código y la fila se aparta sin más', () => {
  const casos = [
    ['sin referencia', ';X;100;01/09/2026;$U', 'E_REF_VACIA'],
    ['referencia con signos raros', 'A<1>;X;100;01/09/2026;$U', 'E_REF_INVALIDA'],
    ['referencia demasiado larga', 'A'.repeat(41) + ';X;100;01/09/2026;$U', 'E_REF_INVALIDA'],
    ['sin deudor', 'A1;;100;01/09/2026;$U', 'E_DEUDOR_VACIO'],
    ['importe negativo', 'A1;X;-100;01/09/2026;$U', 'E_IMPORTE_NO_POSITIVO'],
    ['importe cero', 'A1;X;0;01/09/2026;$U', 'E_IMPORTE_NO_POSITIVO'],
    ['importe ilegible', 'A1;X;cien;01/09/2026;$U', 'E_MONEDA_DESCONOCIDA'],
    ['importe con tres decimales', 'A1;X;100,123;01/09/2026;$U', 'E_IMPORTE_INVALIDO'],
    ['moneda desconocida', 'A1;X;100;01/09/2026;EUR', 'E_MONEDA_DESCONOCIDA'],
    ['moneda ausente', 'A1;X;100;01/09/2026;', 'E_MONEDA_DESCONOCIDA'],
    ['moneda en conflicto', 'A1;X;US$ 100;01/09/2026;$U', 'E_MONEDA_CONFLICTO'],
    ['fecha inexistente', 'A1;X;100;31/02/2026;$U', 'E_FECHA_INVALIDA'],
    ['fecha en mes-día-año', 'A1;X;100;09/30/2026;$U', 'E_FECHA_AMBIGUA'],
    ['sin fecha', 'A1;X;100;;$U', 'E_FECHA_VACIA'],
    ['fecha absurda', 'A1;X;100;01/09/2010;$U', 'E_FECHA_FUERA_DE_RANGO'],
    ['fecha lejana', 'A1;X;100;01/09/2030;$U', 'E_FECHA_FUERA_DE_RANGO']
  ];
  casos.forEach(([nombre, fila, codigo]) => {
    const r = leer(csv(fila, 'OK1;Bien;100;01/09/2026;$U'.replace('OK1', 'B' + nombre.length)));
    assert.equal(r.apartadas.length, 1, nombre);
    assert.equal(r.apartadas[0].codigo, codigo, nombre);
    assert.equal(r.apartadas[0].fila, 2, nombre);
    assert.equal(r.facturas.length, 1, nombre);
  });
});

test('varios problemas en una fila: se informa el primero y los demás quedan en «otros», sin repetir', () => {
  const r = leer(csv(';;-5;31/02/2026;EUR', 'B1;Bien;100;01/09/2026;$U'));
  assert.deepEqual(r.apartadas[0], { fila: 2, codigo: 'E_REF_VACIA', otros: ['E_DEUDOR_VACIO', 'E_IMPORTE_NO_POSITIVO', 'E_MONEDA_DESCONOCIDA', 'E_FECHA_INVALIDA'] });
});

test('los códigos no llevan nunca el valor del archivo', () => {
  const canario = 'CANARIO-9F3A-Ficticia';
  const r = leer(csv(canario + ';' + canario + ';' + canario + ';' + canario + ';' + canario, 'B1;Bien;100;01/09/2026;$U'));
  assert.equal(JSON.stringify(r.apartadas).includes('CANARIO'), false);
  assert.equal(JSON.stringify(r.avisos).includes('CANARIO'), false);
  assert.equal(JSON.stringify(r.por_codigo).includes('CANARIO'), false);
});

test('celdas enormes se rechazan', () => {
  const r = leer(csv('A1;' + 'X'.repeat(301) + ';100;01/09/2026;$U', 'B1;Bien;100;01/09/2026;$U'));
  assert.equal(r.apartadas[0].codigo, 'E_CELDA_LARGA');
  const r2 = leer(csv('A1;' + 'X'.repeat(301) + ';100;01/09/2026;$U', 'B1;Bien;100;01/09/2026;$U'), cfgCon({ limites: { max_largo_celda: 400 } }));
  assert.equal(r2.apartadas.length, 0);
});

test('una fila con más celdas que títulos (separador dentro de un texto) se aparta como desalineada', () => {
  const r = leer(csv('A1;Perez; Juan;100;01/09/2026;$U;;;;;extra'.replace('Perez; Juan', 'Perez; Juan'), 'B1;Bien;100;01/09/2026;$U'));
  assert.equal(r.apartadas[0].codigo, 'E_FILA_DESALINEADA');
  assert.equal(r.facturas.length, 1);
});

test('filas vacías no cuentan; las filas de total se ignoran solo si se pide', () => {
  const t = csv('B1;Bien;100;01/09/2026;$U', ';;;;;;;;', ';;5.000,00;;;;;;');
  const sin = leer(t);
  assert.equal(sin.resumen.vacias, 1);
  assert.equal(sin.apartadas.length, 1);
  assert.equal(sin.apartadas[0].codigo, 'E_REF_VACIA');
  const con = leer(t, cfgCon({ ignorar_filas_de_total: true }));
  assert.equal(con.apartadas.length, 0);
  assert.equal(con.resumen.totales_ignorados, 1);
  assert.equal(con.resumen.total, 1);
});

test('duplicadas idénticas: se conserva la primera; en conflicto: se apartan todas', () => {
  const r = leer(csv('A1;Uno;100;01/09/2026;$U', 'a 1;UNO;100;01/09/2026;$U', 'B2;Dos;100;01/09/2026;$U', 'B2;Dos;150;01/09/2026;$U', 'C3;Tres;100;01/09/2026;$U', 'C3;Tres;100;01/09/2026;US$'));
  assert.deepEqual(r.facturas.map((f) => [f.factura_ref, f.moneda]).sort(), [['A1', 'UYU'], ['C3', 'USD'], ['C3', 'UYU']]);
  assert.deepEqual(r.apartadas.map((a) => [a.fila, a.codigo]), [[3, 'E_DUPLICADA'], [4, 'E_CONFLICTO_FACTURA'], [5, 'E_CONFLICTO_FACTURA']]);
  assert.equal(r.resumen.total, r.resumen.aceptadas + r.resumen.apartadas);
});

test('rango de fechas: usa la fecha de corte; sin ella no se comprueba', () => {
  assert.equal(leer(csv('A1;X;100;01/09/2010;$U'), { mapeo_columnas: MAPEO }).facturas.length, 1);
  assert.equal(leer(csv('A1;X;100;01/09/2010;$U')).apartadas[0].codigo, 'E_FECHA_FUERA_DE_RANGO');
  const ancho = cfgCon({ rango_vencimiento: { anios_atras: 30, anios_adelante: 5 } });
  assert.equal(leer(csv('A1;X;100;01/09/2010;$U'), ancho).facturas.length, 1);
});

/* -------------------------------------------------------------------- avisos */

test('los datos opcionales dudosos avisan pero no rechazan la factura', () => {
  const r = leer(csv('A1;X;100;01/09/2026;$U;no es fecha;12345;malo@;quizás'));
  assert.equal(r.facturas.length, 1);
  assert.equal(r.facturas[0].emision, null);
  assert.equal(r.facturas[0].contacto_tel, null);
  assert.equal(r.facturas[0].contacto_mail, null);
  assert.equal(r.facturas[0].en_disputa, true, 'lo que no se entiende se trata como en disputa');
  assert.deepEqual(r.avisos.map((a) => a.codigo).sort(), ['A_DISPUTA_NO_ENTENDIDA', 'A_EMISION_INVALIDA', 'A_MAIL_INVALIDO', 'A_TEL_INVALIDO']);
  assert.equal(r.avisos.every((a) => a.fila === 2), true);
});

test('avisos: teléfono fijo, vencimiento anterior a la emisión', () => {
  const r = leer(csv('A1;X;100;01/09/2026;$U;02/09/2026;2901 0065;;'));
  assert.deepEqual(r.avisos.map((a) => a.codigo).sort(), ['A_TEL_FIJO', 'A_VENCIMIENTO_ANTERIOR_EMISION']);
  assert.equal(r.facturas[0].contacto_tel, '59829010065');
  assert.equal(r.facturas[0].tel_movil, false);
});

test('en disputa: sí/no y variantes', () => {
  ['sí', 'SI', 's', '1', 'x', 'true', 'Verdadero'].forEach((v) => assert.equal(leer(csv(`A1;X;100;01/09/2026;$U;;;;${v}`)).facturas[0].en_disputa, true, v));
  ['no', 'N', '0', 'false', 'falso', ''].forEach((v) => assert.equal(leer(csv(`A1;X;100;01/09/2026;$U;;;;${v}`)).facturas[0].en_disputa, false, v));
});

/* -------------------------------------------------------------------- resumen */

test('bloqueo: archivo vacío y demasiadas filas apartadas', () => {
  const vacio = leer(csv());
  assert.equal(vacio.resumen.total, 0);
  assert.equal(vacio.resumen.bloquear, true);
  assert.equal(vacio.resumen.motivo_bloqueo, 'E_ARCHIVO_VACIO');

  const buenas = Array.from({ length: 19 }, (_, i) => `B${i};Bien ${i};100;01/09/2026;$U`);
  const una = leer(csv(...buenas, 'MAL;;100;01/09/2026;$U')); // 1 de 20 = 5 %: no supera el umbral
  assert.equal(una.resumen.bloquear, false);
  assert.equal(una.resumen.tasa_apartadas, 0.05);
  const dos = leer(csv(...buenas.slice(1), 'MAL;;100;01/09/2026;$U', 'MAL2;;100;01/09/2026;$U')); // 2 de 20 = 10 %
  assert.equal(dos.resumen.bloquear, true);
  assert.equal(dos.resumen.motivo_bloqueo, 'E_DEMASIADAS_APARTADAS');
  const tolerante = leer(csv(...buenas.slice(1), 'MAL;;100;01/09/2026;$U', 'MAL2;;100;01/09/2026;$U'), cfgCon({ umbral_rechazo: 10 }));
  assert.equal(tolerante.resumen.bloquear, false);
  const todoMal = leer(csv('MAL;;100;01/09/2026;$U'), cfgCon({ umbral_rechazo: 0 }));
  assert.equal(todoMal.resumen.bloquear, true);
});

test('demasiadas filas: se rechaza todo el archivo', () => {
  const filas = Array.from({ length: 6 }, (_, i) => `B${i};Bien;100;01/09/2026;$U`);
  const r = leer(csv(...filas), cfgCon({ limites: { max_filas: 5 } }));
  assert.equal(r.error, 'E_DEMASIADAS_FILAS');
  assert.equal(r.resumen.bloquear, true);
  assert.deepEqual(r.facturas, []);
});

test('el número de fila es el de la línea del archivo, aunque haya líneas vacías y campos de varias líneas', () => {
  const r = leer(csv('A1;"Uno\nmultilínea";100;01/09/2026;$U', '', 'MAL;;100;01/09/2026;$U', 'B2;Dos;100;01/09/2026;$U'));
  assert.deepEqual(r.facturas.map((f) => f.fila_origen), [2, 6]);
  assert.deepEqual(r.apartadas.map((a) => a.fila), [5]);
});

/* -------------------------------------------------------------- filas de n8n */

test('normalizarObjetos: filas ya extraídas, con números y fechas tipados de una hoja de cálculo', () => {
  const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  const filas = [
    { 'Nro Factura': 'A-1', Cliente: 'Ficticia Uno S.A.', Saldo: 85000.5, Vencimiento: serial(2026, 9, 25), Moneda: 'UYU' },
    { 'Nro Factura': 1002, Cliente: 'Ficticia Dos', Saldo: '3.150,00', Vencimiento: '2026-09-10T00:00:00.000Z', Moneda: 'USD' },
    { 'Nro Factura': 'A-3', Cliente: 'Ficticia Tres', Saldo: 0, Vencimiento: '10/09/2026', Moneda: 'UYU' },
    'basura', null
  ];
  const r = plano(M1.normalizarObjetos(filas, cfgCon({ mapeo_columnas: { factura: 'Nro Factura', deudor: 'Cliente', importe: 'Saldo', vencimiento: 'Vencimiento', moneda: 'Moneda' } })));
  assert.deepEqual(r.facturas.map((f) => [f.factura_ref, f.importe_centavos, f.moneda, f.vencimiento]), [
    ['A-1', 8500050, 'UYU', '2026-09-25'], ['1002', 315000, 'USD', '2026-09-10']
  ]);
  assert.deepEqual(r.apartadas.map((a) => [a.fila, a.codigo]), [[4, 'E_IMPORTE_NO_POSITIVO'], [5, 'E_FILA_INVALIDA'], [6, 'E_FILA_INVALIDA']]);
  assert.equal(r.resumen.total, 5);
});

test('normalizarObjetos: las claves distintas entre filas se unen; una lista mal formada falla con código', () => {
  const r = plano(M1.normalizarObjetos([{ F: 'A1', C: 'X', I: '1.000', V: '01/09/2026' }, { F: 'A2', C: 'Y', I: '2.000', V: '01/09/2026', Extra: 'z' }],
    { mapeo_columnas: { factura: 'F', deudor: 'C', importe: 'I', vencimiento: 'V' }, moneda_por_defecto: 'UYU', fecha_corte: '2026-10-05' }));
  assert.equal(r.facturas.length, 2);
  assert.equal(capturar(() => M1.normalizarObjetos('no es una lista', CFG)).codigo, 'E_FILAS_INVALIDAS');
  assert.equal(capturar(() => M1.normalizarObjetos({}, CFG)).codigo, 'E_FILAS_INVALIDAS');
});

test('la salida es JSON puro y estable: mismo archivo, mismo resultado', () => {
  const t = csv('A1;Uno;100;01/09/2026;$U;;099 000 001;a@ficticia.example;no', 'MAL;;;;', 'B2;Dos;US$ 5.000;01/08/2026;');
  const a = JSON.stringify(leer(t)), b = JSON.stringify(leer(t));
  assert.equal(a, b);
  assert.equal(JSON.stringify(JSON.parse(a)), a);
});
