'use strict';
/* Pruebas de extremo a extremo con el simulador del shell: la ejecución diaria completa, con carpeta,
   tablas, bloqueo y correo falsos. Todo el código del núcleo es el real. */
const test = require('node:test');
const assert = require('node:assert/strict');
const azar = require('./azar');
const gen = require('../datos-ficticios/generador');
const { configEjemplo } = require('../datos-ficticios/config-ejemplo');
const { problemasDeEtiquetas } = require('./html-seguro');
const { M, Mundo, Drive, Correo, archivo, correr, ejecucion, OPERADOR } = require('./simulador');

// Semana ISO 2026-W41: lunes 5 a domingo 11 de octubre. El shell corre a las 08:30 de Montevideo = 11:30 UTC.
const T = {
  lun: '2026-10-05T11:30:00Z', mar: '2026-10-06T11:30:00Z', mie: '2026-10-07T11:30:00Z', jue: '2026-10-08T11:30:00Z',
  vie: '2026-10-09T11:30:00Z', dom: '2026-10-11T11:30:00Z', lun2: '2026-10-12T11:30:00Z'
};
const EXPORTADO = '2026-10-05T10:00:00.000Z'; // el cliente deja el archivo el lunes a las 07:00
const CORTE = '2026-10-05';
const PRUEBA = 'bandeja.de.pruebas@ejemplo.example';
const DUENO = 'administracion@ferreteria-ficticia.example';

const cfg = (extra = {}) => ({ ...configEjemplo(), ...extra });
const facs = (semilla = 1, n = 30, extra = {}) => gen.crearFacturas({ semilla, n, fecha_corte: CORTE, ...extra });
const csv = (fs) => gen.renderizar(fs, 'A').texto;
const mundo = ({ config = cfg(), control, texto = csv(facs()), modificado = EXPORTADO, nombre, archivos } = {}) =>
  new Mundo({ config, control, drive: new Drive(archivos || (texto === null ? [] : [archivo({ texto, modificado, nombre })])) });
const REAL = { interruptor: 'on', dry_run: 'false' };

/* --------------------------------------------------------------- camino feliz */

test('ensayo por defecto: el informe va SOLO a la bandeja de pruebas, se sube a Salida y el libro guarda contadores', () => {
  const m = mundo();
  const r = correr(m, T.lun);
  assert.equal(r.estado, 'informe_enviado');
  assert.equal(r.envio, 'redirigir_ensayo');
  const enviados = m.aDueno();
  assert.equal(enviados.length, 1);
  assert.deepEqual(enviados[0].para, [PRUEBA]);
  assert.ok(enviados[0].asunto.startsWith('[ENSAYO] Resumen semanal de cobranza · 05/10/2026'));
  assert.ok(enviados[0].cuerpo_texto.startsWith('[ENSAYO] En modo real este mensaje se enviaría a: ' + DUENO));
  assert.equal(m.drive.subidos.length, 1);
  assert.match(m.drive.subidos[0].nombre, /^ensayo-informe-cobranza-2026-10-05\.html$/);
  assert.ok(enviados[0].cuerpo_texto.includes('https://drive.google.com/file/d/' + m.drive.subidos[0].id + '/view'));
  assert.deepEqual(problemasDeEtiquetas(m.drive.subidos[0].contenido), []);
  assert.equal(m.libro.length, 1);
  assert.equal(m.libro[0].estado, 'ok');
  assert.equal(m.libro[0].modo, 'dry');
  assert.equal(m.libro[0].n_filas, 30);
  assert.equal(m.bloqueos.size, 0, 'el bloqueo se libera');
  assert.equal(m.aOperador().length, 0);
});

test('repetir la ejecución con el mismo archivo (mismo día, día siguiente, fin de semana) no envía nada más', () => {
  const m = mundo();
  correr(m, T.lun);
  for (const t of [T.lun, T.mar, T.jue, T.dom]) {
    const r = correr(m, t);
    assert.equal(r.estado, 'ya_procesado', t);
  }
  assert.equal(m.aDueno().length, 1);
  assert.equal(m.drive.subidos.length, 1);
  assert.equal(m.libro.length, 1);
});

test('un archivo corregido (otro contenido) el mismo día genera un informe nuevo; repetirlo no', () => {
  const m = mundo();
  correr(m, T.lun);
  m.drive.archivos[0] = archivo({ texto: csv(facs(1, 31)), modificado: '2026-10-05T13:00:00.000Z' });
  assert.equal(correr(m, T.mar).estado, 'informe_enviado');
  assert.equal(correr(m, T.mie).estado, 'ya_procesado');
  assert.equal(m.aDueno().length, 2);
  assert.equal(m.libro.length, 2);
  assert.notEqual(m.libro[0].hash_archivo, m.libro[1].hash_archivo);
});

test('la semana siguiente con un archivo nuevo vuelve a procesar', () => {
  const m = mundo();
  correr(m, T.lun);
  m.drive.archivos.push(archivo({ texto: csv(facs(2, 25)), modificado: '2026-10-12T10:00:00.000Z' }));
  const r = correr(m, T.lun2);
  assert.equal(r.estado, 'informe_enviado');
  assert.equal(r.fecha_corte, '2026-10-12');
  assert.deepEqual(m.libro.map((f) => f.semana_iso), ['2026-W41', '2026-W42']);
});

test('formato de hoja de cálculo (.xlsx) por el mismo camino y con el mismo resultado que el CSV', () => {
  const fs = facs(4, 30);
  const x = gen.renderizar(fs, 'X');
  const mx = new Mundo({ config: gen.configPara('X', cfg()), drive: new Drive([archivo({ nombre: 'facturas.xlsx', filas: x.filas, modificado: EXPORTADO })]) });
  const r = correr(mx, T.lun);
  assert.equal(r.estado, 'informe_enviado');
  assert.equal(mx.libro[0].n_filas, 30);
  const mc = mundo({ texto: csv(fs) });
  correr(mc, T.lun);
  const resumen = (m) => m.aDueno()[0].cuerpo_texto.split('\n').slice(2).join('\n').replace(/\nInforme completo[\s\S]*$/, '');
  assert.equal(resumen(mx), resumen(mc));
  assert.equal(mx.drive.subidos[0].contenido, mc.drive.subidos[0].contenido);
});

/* ---------------------------------------------------------------- llave doble */

test('llave doble: solo con «sin ensayo» general Y cliente en modo real el mensaje va al dueño', () => {
  const combos = [
    ['true', 'dry_run', PRUEBA], ['true', 'real', PRUEBA], ['false', 'dry_run', PRUEBA], ['false', 'real', DUENO]
  ];
  for (const [dry, modo, esperado] of combos) {
    const m = mundo({ config: cfg({ modo }), control: { interruptor: 'on', dry_run: dry } });
    const r = correr(m, T.lun);
    assert.equal(r.estado, 'informe_enviado', dry + '+' + modo);
    assert.deepEqual(m.aDueno()[0].para, [esperado], 'dry_run=' + dry + ' modo=' + modo);
    assert.equal(m.aDueno()[0].asunto.startsWith('[ENSAYO]'), esperado === PRUEBA);
    assert.equal(m.libro[0].modo, esperado === PRUEBA ? 'dry' : 'real');
  }
});

test('valores raros en el interruptor de ensayo NUNCA abren el envío real', () => {
  for (const dry of ['no', 'falso', '0', '', 'FALSE!', null, undefined, 0, 'talvez']) {
    const m = mundo({ config: cfg({ modo: 'real' }), control: { interruptor: 'on', dry_run: dry } });
    correr(m, T.lun);
    assert.deepEqual(m.aDueno()[0].para, [PRUEBA], String(dry));
  }
  // «false» inequívoco, con mayúsculas y espacios, sí
  const m = mundo({ config: cfg({ modo: 'real' }), control: { interruptor: ' ON ', dry_run: ' False ' } });
  correr(m, T.lun);
  assert.deepEqual(m.aDueno()[0].para, [DUENO]);
});

test('modo real y informe completo por correo exige una aceptación explícita antes de arrancar', () => {
  const sin = mundo({ config: cfg({ modo: 'real', entrega: 'correo_completo' }), control: REAL });
  const r = correr(sin, T.lun);
  assert.equal(r.estado, 'detenida');
  assert.equal(r.motivo, 'CONFIG_INVALIDA');
  assert.equal(sin.drive.consultas, 0);
  assert.equal(sin.aDueno().length, 0);
  const con = mundo({ config: cfg({ modo: 'real', entrega: 'correo_completo', acepta_correo_completo: true }), control: REAL });
  assert.equal(correr(con, T.lun).estado, 'informe_enviado');
  assert.deepEqual(con.aDueno()[0].para, [DUENO]);
  assert.ok(con.aDueno()[0].adjunto.contenido.startsWith('<!doctype html>'));
});

test('correo completo en ensayo: el adjunto viaja solo a la bandeja de pruebas', () => {
  const m = mundo({ config: cfg({ entrega: 'correo_completo' }) });
  correr(m, T.lun);
  const e = m.aDueno()[0];
  assert.deepEqual(e.para, [PRUEBA]);
  assert.equal(e.adjunto.nombre, 'ensayo-informe-cobranza-2026-10-05.html');
  assert.equal(m.drive.subidos.length, 0, 'sin enlace de salida no se sube nada');
});

/* -------------------------------------------------------- interruptores y config */

test('interruptor general apagado: no se toca ni la carpeta, no se envía nada, no se avisa a nadie', () => {
  for (const control of [{ interruptor: 'off', dry_run: 'false' }, { interruptor: 'quizás' }, undefined, null]) {
    const m = mundo({ control: control === undefined ? undefined : control });
    if (control === undefined) m.control = undefined;
    const r = correr(m, T.lun);
    assert.equal(r.estado, 'detenida');
    assert.equal(m.drive.consultas, 0);
    assert.equal(m.correo.enviados.length, 0);
    assert.equal(m.libro.length, 0);
    assert.equal(m.bloqueos.size, 0);
  }
});

test('configuración inválida: no se toca la carpeta; Javier recibe los códigos a corregir y el dueño nada', () => {
  const m = mundo({ config: cfg({ entrega: 'papel', zona_horaria: 'Marte/Olimpo', destinatarios_permitidos: [] }) });
  const r = correr(m, T.lun);
  assert.equal(r.estado, 'error'); // sin zona válida ni siquiera se puede calcular la fecha local
  assert.equal(m.drive.consultas, 0);
  assert.equal(m.aDueno().length, 0);

  const m2 = mundo({ config: cfg({ entrega: 'papel', destinatarios_permitidos: [] }) });
  const r2 = correr(m2, T.lun);
  assert.equal(r2.estado, 'detenida');
  assert.equal(r2.motivo, 'CONFIG_INVALIDA');
  assert.equal(m2.drive.consultas, 0);
  assert.equal(m2.aDueno().length, 0);
  assert.equal(m2.aOperador().length, 1);
  assert.deepEqual(m2.aOperador()[0].para, [OPERADOR]);
  assert.match(m2.aOperador()[0].cuerpo_texto, /Problemas: .*E_CFG_ENTREGA/);
});

/* ------------------------------------------------------------------ incidencias */

test('archivo con una columna ausente: el dueño recibe un aviso claro, no un informe; no se repite con el mismo archivo', () => {
  const m = mundo({ texto: csv(facs()).replace('Saldo', 'Monto total') });
  const r = correr(m, T.lun);
  assert.equal(r.estado, 'incidencia_enviada');
  assert.match(m.aDueno()[0].asunto, /No se pudo preparar el resumen de cobranza/);
  assert.equal(m.libro[0].estado, 'incidencia');
  assert.equal(m.libro[0].codigo_error, 'E_COLUMNA_FALTANTE');
  assert.equal(m.drive.subidos.length, 0);
  for (const t of [T.lun, T.mar, T.mie]) assert.equal(correr(m, t).estado, 'ya_procesado');
  assert.equal(m.aDueno().length, 1);
  // el cliente corrige y vuelve a exportar: se procesa
  m.drive.archivos[0] = archivo({ texto: csv(facs()), modificado: '2026-10-07T10:00:00.000Z' });
  assert.equal(correr(m, T.jue).estado, 'informe_enviado');
  assert.equal(m.aDueno().length, 2);
});

test('archivo con demasiadas filas ilegibles: aviso de incidencia, no un informe engañoso', () => {
  const malo = csv(facs(2, 20)).split('\r\n').map((l, i) => (i === 0 || l === '' ? l : l.split(';').map((c, k) => (k === 5 ? '31/02/2026' : c)).join(';'))).join('\r\n');
  const m = mundo({ texto: malo });
  assert.equal(correr(m, T.lun).estado, 'incidencia_enviada');
  assert.equal(m.libro[0].codigo_error, 'E_DEMASIADAS_APARTADAS');
  assert.equal(m.libro[0].n_apartadas, 20);
});

test('archivo vacío o solo con cabecera: incidencia', () => {
  for (const texto of ['', gen.CABECERAS.A.join(';') + '\r\n', '\r\n\r\n']) {
    const m = mundo({ texto: texto === '' ? ' ' : texto });
    const r = correr(m, T.lun);
    assert.ok(['incidencia_enviada', 'error'].includes(r.estado), r.estado);
    assert.equal(m.aDueno().filter((e) => /^\[ENSAYO\] Resumen semanal/.test(e.asunto)).length, 0);
  }
});

/* ---------------------------------------------------------- «no llegó el archivo» */

test('sin archivo: espera lunes y martes, avisa el miércoles y no vuelve a avisar en la semana', () => {
  const m = mundo({ texto: null });
  assert.equal(correr(m, T.lun).estado, 'sin_archivo_esperar');
  assert.equal(correr(m, T.mar).estado, 'sin_archivo_esperar');
  assert.equal(m.aDueno().length, 0);
  const r = correr(m, T.mie);
  assert.equal(r.estado, 'aviso_sin_archivo');
  assert.match(m.aDueno()[0].asunto, /No encontramos la exportación de esta semana · 07\/10\/2026$/);
  assert.equal(m.libro[0].codigo_error, 'E_SIN_ARCHIVO');
  for (const t of [T.jue, T.vie, T.dom]) assert.equal(correr(m, t).estado, 'sin_archivo_omitir_ya_avisado', t);
  assert.equal(m.aDueno().length, 1);
  // la semana siguiente, otra vez desde cero
  assert.equal(correr(m, T.lun2).estado, 'sin_archivo_esperar');
});

test('si el archivo llega tras el aviso, se procesa con normalidad', () => {
  const m = mundo({ texto: null });
  correr(m, T.mie);
  m.drive.archivos.push(archivo({ texto: csv(facs()), modificado: '2026-10-08T10:00:00.000Z' }));
  assert.equal(correr(m, T.jue).estado, 'informe_enviado');
  assert.equal(m.aDueno().length, 2);
});

test('un archivo demasiado viejo cuenta como «no llegó»', () => {
  const m = mundo({ modificado: '2026-09-20T10:00:00.000Z' });
  assert.equal(correr(m, T.lun).estado, 'sin_archivo_esperar');
  assert.equal(correr(m, T.mie).estado, 'aviso_sin_archivo');
  assert.deepEqual(m.registros.find((r) => r.evento === 'sin_archivo').descartados, { E_ARCHIVO_VIEJO: 1 });
});

test('el día del aviso es configurable', () => {
  const m = mundo({ texto: null, config: cfg({ dia_aviso_sin_archivo: 1 }) });
  assert.equal(correr(m, T.lun).estado, 'aviso_sin_archivo');
});

test('archivos que no sirven (tipo, tamaño, vacío) no se leen y no impiden avisar', () => {
  const m = mundo({ archivos: [archivo({ nombre: 'notas.pdf', mimeType: 'application/pdf', texto: 'x', modificado: EXPORTADO }), archivo({ nombre: 'facturas.csv', texto: '', modificado: EXPORTADO })] });
  assert.equal(correr(m, T.mie).estado, 'aviso_sin_archivo');
  assert.equal(m.drive.descargas, 0);
});

/* ------------------------------------------------------------ bloqueo y doble ejecución */

test('con un bloqueo activo no se hace nada y no se toca la carpeta', () => {
  const m = mundo();
  m.bloqueos.set('demo-01', { cliente_id: 'demo-01', expira_utc: '2026-10-05T12:00:00Z' });
  const r = correr(m, T.lun);
  assert.equal(r.estado, 'omitida_en_curso');
  assert.equal(m.drive.consultas, 0);
  assert.equal(m.correo.enviados.length, 0);
});

test('con un bloqueo vencido se avisa a Javier cada día y no se reintenta solo, hasta que se limpia', () => {
  const m = mundo();
  m.bloqueos.set('demo-01', { cliente_id: 'demo-01', expira_utc: '2026-10-05T11:00:00Z' });
  assert.equal(correr(m, T.lun).estado, 'bloqueo_vencido');
  assert.equal(correr(m, T.mar).estado, 'bloqueo_vencido');
  assert.equal(m.aOperador().length, 2);
  assert.match(m.aOperador()[0].asunto, /E_BLOQUEO_VENCIDO/);
  assert.equal(m.aDueno().length, 0);
  assert.equal(m.drive.consultas, 0);
  m.bloqueos.delete('demo-01'); // Javier revisa y limpia
  assert.equal(correr(m, T.mie).estado, 'informe_enviado');
});

test('dos ejecuciones intercaladas: la segunda ve el bloqueo y sale; el dueño recibe un solo informe', () => {
  const m = mundo();
  const a = ejecucion(m, T.lun);
  assert.equal(a.next().value, 'bloqueo_tomado');
  const b = correr(m, '2026-10-05T11:31:00Z');
  assert.equal(b.estado, 'omitida_en_curso');
  let paso;
  do { paso = a.next(); } while (!paso.done);
  assert.equal(paso.value.estado, 'informe_enviado');
  assert.equal(m.aDueno().length, 1);
  assert.equal(m.libro.length, 1);
  assert.equal(m.bloqueos.size, 0);
});

test('caída del servidor antes de enviar: nada salió; se avisa cuando el bloqueo caduca; tras limpiar, se procesa', () => {
  const m = mundo();
  assert.equal(correr(m, T.lun, { abortarEn: 'antes_de_enviar' }).estado, 'caida');
  assert.equal(m.aDueno().length, 0);
  assert.equal(m.libro.length, 0);
  assert.equal(m.bloqueos.size, 1);
  assert.equal(correr(m, '2026-10-05T11:40:00Z').estado, 'omitida_en_curso'); // aún dentro de los 30 minutos
  assert.equal(correr(m, T.mar).estado, 'bloqueo_vencido');
  m.bloqueos.clear();
  assert.equal(correr(m, T.mie).estado, 'informe_enviado');
  assert.equal(m.aDueno().length, 1);
});

test('caída después de enviar y antes de registrar: el bloqueo impide duplicar solo; un duplicado exigiría limpiar a mano y saldría al mismo buzón', () => {
  const m = mundo();
  assert.equal(correr(m, T.lun, { abortarEn: 'despues_de_enviar' }).estado, 'caida');
  assert.equal(m.aDueno().length, 1);
  assert.equal(m.libro.length, 0);
  assert.equal(correr(m, T.mar).estado, 'bloqueo_vencido'); // avisa, no reenvía
  assert.equal(m.aDueno().length, 1);
  m.bloqueos.clear();
  assert.equal(correr(m, T.mie).estado, 'informe_enviado'); // costo aceptado y documentado: un duplicado, al mismo destinatario
  assert.equal(m.aDueno().length, 2);
  m.aDueno().forEach((e) => assert.deepEqual(e.para, [PRUEBA]));
});

/* ------------------------------------------------------------- fallas externas */

test('correo caído: sin fila «ok», sin datos en la alerta, bloqueo liberado; al volver el correo se envía UNA vez', () => {
  const m = mundo();
  m.correo.caido = true;
  const r = correr(m, T.lun);
  assert.equal(r.estado, 'error');
  assert.equal(r.codigo, 'E_CORREO_ENVIAR');
  assert.equal(m.libro.length, 1);
  assert.equal(m.libro[0].estado, 'error');
  assert.equal(m.bloqueos.size, 0);
  assert.ok(m.sinEnviar.some((s) => s.motivos.includes('CORREO_CAIDO')), 'la alerta tampoco pudo salir y queda constancia');
  m.correo.caido = false;
  assert.equal(correr(m, T.mar).estado, 'informe_enviado');
  assert.equal(correr(m, T.mie).estado, 'ya_procesado');
  assert.equal(m.aDueno().length, 1);
  assert.deepEqual(m.libro.map((f) => f.estado), ['error', 'ok']);
});

test('el error del servidor de correo repite destinatario y texto, y nada de eso llega a la alerta ni al libro', () => {
  const m = mundo();
  correr(m, T.lun);
  const m2 = mundo();
  m2.correo.enviar = function (msg) { if (msg.tipo === 'dueno') throw new Error('550 rechazado ' + msg.para.join(',') + ' :: ' + msg.cuerpo_texto); this.enviados.push(JSON.parse(JSON.stringify(msg))); };
  correr(m2, T.lun);
  const alerta = m2.aOperador()[0];
  assert.ok(alerta, 'la alerta a Javier salió');
  assert.equal(alerta.cuerpo_texto.includes(PRUEBA), false);
  assert.equal(alerta.cuerpo_texto.includes('Resumen'), false);
  assert.match(alerta.asunto, /E_CORREO_ENVIAR/);
});

test('carpeta sin permiso: código propio y ningún dato del mensaje de error', () => {
  const m = mundo();
  m.drive.falloLista = true;
  const r = correr(m, T.lun);
  assert.equal(r.codigo, 'E_DRIVE_LISTAR');
  assert.equal(m.persistente().includes('Juan'), false);
  assert.equal(m.aOperador().length, 1);
  assert.equal(m.aDueno().length, 0);
});

test('descarga cortada a mitad: no se procesa un archivo incompleto', () => {
  const m = mundo();
  m.drive.archivos[0].cortarEn = 400;
  const r = correr(m, T.lun);
  assert.equal(r.codigo, 'E_DESCARGA_INCOMPLETA');
  assert.equal(m.aDueno().length, 0);
  assert.equal(m.libro[0].estado, 'error');
  m.drive.archivos[0].cortarEn = undefined;
  assert.equal(correr(m, T.mar).estado, 'informe_enviado');
});

test('dos archivos igual de recientes: no se elige a ciegas, se avisa a Javier', () => {
  const a = archivo({ nombre: 'facturas-uyu.csv', texto: csv(facs(1, 10)), modificado: EXPORTADO });
  const b = archivo({ nombre: 'facturas-usd.csv', texto: csv(facs(2, 10)), modificado: EXPORTADO });
  const m = mundo({ archivos: [a, b] });
  const r = correr(m, T.lun);
  assert.equal(r.codigo, 'E_ARCHIVO_AMBIGUO');
  assert.equal(m.aDueno().length, 0);
  assert.equal(m.aOperador().length, 1);
});

test('falla al subir el informe a la carpeta de salida: no se envía nada al dueño', () => {
  const m = mundo();
  m.drive.falloSubida = true;
  const r = correr(m, T.lun);
  assert.equal(r.codigo, 'E_DRIVE_SUBIR');
  assert.equal(m.aDueno().length, 0);
  assert.equal(m.libro[0].estado, 'error');
});

test('sin operador válido la alerta no sale, pero queda constancia y el sistema no se cae', () => {
  const m = mundo();
  m.operador = 'Javier@Mal Escrito';
  m.drive.falloLista = true;
  const r = correr(m, T.lun);
  assert.equal(r.estado, 'error');
  assert.equal(m.aOperador().length, 0);
  assert.equal(m.sinEnviar.length, 1);
});

/* ---------------------------------------------------------------- fechas */

test('la fecha de corte es la local del cliente; la semana del libro es la de la exportación', () => {
  const casos = [
    ['2026-10-11T23:30:00Z', '2026-10-11'], // 20:30 del domingo en Montevideo
    ['2026-10-12T02:59:00Z', '2026-10-11'], // 23:59 del domingo
    ['2026-10-12T03:00:00Z', '2026-10-12'] // 00:00 del lunes
  ];
  for (const [ahora, fecha] of casos) {
    const m = mundo({ modificado: '2026-10-11T12:00:00.000Z' }); // exportado el domingo 11 (semana 41)
    const r = correr(m, ahora);
    assert.equal(r.fecha_corte, fecha, ahora);
    assert.equal(m.libro[0].semana_iso, '2026-W41', ahora);
  }
});

test('el día de la exportación también es el LOCAL: un archivo guardado el domingo a las 23:30 en Montevideo es de la semana anterior', () => {
  // 02:30 UTC del lunes 12 son las 23:30 del domingo 11 en Montevideo
  const m = mundo({ modificado: '2026-10-12T02:30:00.000Z' });
  const r = correr(m, '2026-10-12T11:30:00Z');
  assert.equal(r.estado, 'informe_enviado');
  assert.equal(m.libro[0].semana_iso, '2026-W41');
});

test('un archivo que sigue fresco al cruzar el lunes NO genera un segundo informe', () => {
  const m = mundo({ modificado: '2026-10-09T10:00:00.000Z' }); // exportado el viernes 9 (semana 41)
  assert.equal(correr(m, '2026-10-09T11:30:00Z').estado, 'informe_enviado');
  for (const t of ['2026-10-10T11:30:00Z', '2026-10-12T11:30:00Z', '2026-10-13T11:30:00Z', '2026-10-14T11:30:00Z']) {
    assert.equal(correr(m, t).estado, 'ya_procesado', t); // sábado, lunes y siguientes: semana 42 en el reloj, pero el mismo archivo
  }
  assert.equal(m.aDueno().length, 1);
  assert.deepEqual(m.libro.map((f) => f.semana_iso), ['2026-W41']);
});

test('si el cliente re-exporta el mismo contenido la semana siguiente, sí hay informe nuevo (cadencia semanal)', () => {
  const texto = csv(facs());
  const m = mundo({ texto, modificado: '2026-10-09T10:00:00.000Z' });
  correr(m, '2026-10-09T11:30:00Z');
  m.drive.archivos[0] = archivo({ texto, modificado: '2026-10-16T10:00:00.000Z' }); // mismo contenido, nueva exportación
  assert.equal(correr(m, '2026-10-16T11:30:00Z').estado, 'informe_enviado');
  assert.equal(correr(m, '2026-10-17T11:30:00Z').estado, 'ya_procesado');
  assert.equal(m.aDueno().length, 2);
  assert.deepEqual(m.libro.map((f) => f.semana_iso), ['2026-W41', '2026-W42']);
});

/* --------------------------------------------------------- archivos hostiles */

test('un archivo con filas hostiles produce un informe seguro y no rompe nada', () => {
  const { texto } = gen.csvConHostiles(facs(6, 30), CORTE);
  const m = mundo({ texto, config: cfg({ umbral_rechazo: 100 }) });
  const r = correr(m, T.lun);
  assert.equal(r.estado, 'informe_enviado');
  const html = m.drive.subidos[0].contenido;
  assert.deepEqual(problemasDeEtiquetas(html), []);
  assert.equal(html.includes('<script'), false);
  assert.equal(m.aOperador().length, 0);
  assert.equal(m.libro[0].n_apartadas, gen.hostilesA(CORTE).filter((h) => h.esperado === 'apartada').length);
});

/* -------------------------------------------------------------- canarios */

const CANARIOS = (fs) => fs.flatMap((f) => [f.cliente, f.serie + '-' + f.numero, f.correo, f.tel && f.tel.slice(3)].filter(Boolean));

test('canario: nada de lo que dice el archivo queda en el libro, los bloqueos, los registros ni las alertas', () => {
  const fs = facs(12, 40, { prob_correo: 1, prob_tel: 1 });
  const m = mundo({ texto: csv(fs) });
  correr(m, T.lun); // informe
  m.drive.archivos[0] = archivo({ texto: csv(fs).replace('Saldo', 'Monto'), modificado: '2026-10-06T10:00:00.000Z' });
  correr(m, T.mar); // incidencia
  m.drive.archivos[0] = archivo({ texto: csv([...fs, ...facs(99, 1)]), modificado: '2026-10-07T10:00:00.000Z' });
  m.drive.archivos[0].cortarEn = 50;
  correr(m, T.mie); // error de descarga
  m.correo.caido = true;
  m.drive.archivos[0].cortarEn = undefined;
  correr(m, T.jue); // error de correo
  const guardado = m.persistente();
  for (const c of CANARIOS(fs)) assert.equal(guardado.includes(c), false, c);
  assert.deepEqual(m.libro.map((f) => f.estado), ['ok', 'incidencia', 'error', 'error']);
});

test('canario: en el modo «enlace de salida» el correo al dueño no lleva nombres, facturas, correos ni teléfonos', () => {
  const fs = facs(13, 40, { prob_correo: 1, prob_tel: 1 });
  const m = mundo({ texto: csv(fs) });
  correr(m, T.lun);
  const cuerpo = m.aDueno().map((e) => e.asunto + '\n' + e.cuerpo_texto).join('\n');
  for (const c of CANARIOS(fs)) assert.equal(cuerpo.includes(c), false, c);
  // en cambio el informe completo sí los tiene, en la carpeta de salida
  assert.ok(CANARIOS(fs).some((c) => m.drive.subidos[0].contenido.includes(c.replace(/&/g, '&amp;'))));
});

/* ------------------------------------------------- propiedades sobre el conjunto */

const ESTADOS_PERMITIDOS = new Set(['informe_enviado', 'incidencia_enviada', 'aviso_sin_archivo', 'ya_procesado', 'detenida', 'omitida_en_curso', 'bloqueo_vencido', 'error',
  'sin_archivo_esperar', 'sin_archivo_omitir_ya_avisado', 'sin_archivo_avisar']);
const CODIGOS_ESPERADOS = new Set(['E_DRIVE_LISTAR', 'E_DRIVE_DESCARGAR', 'E_DRIVE_SUBIR', 'E_CORREO_ENVIAR', 'E_DESCARGA_INCOMPLETA', 'E_ARCHIVO_AMBIGUO']);

function verificarInvariantes(m, resultados, etiqueta) {
  const permitidos = new Set([DUENO, PRUEBA, OPERADOR]);
  m.correo.enviados.forEach((e) => {
    e.para.forEach((d) => assert.ok(permitidos.has(d), etiqueta + ': destinatario no permitido ' + d));
    assert.ok(e.para.length >= 1 && e.para.length <= 3);
    if (e.tipo === 'operador') assert.deepEqual(e.para, [OPERADOR]);
  });
  resultados.forEach((r) => {
    assert.ok(ESTADOS_PERMITIDOS.has(r.estado), etiqueta + ': estado ' + r.estado);
    if (r.estado === 'error') assert.ok(CODIGOS_ESPERADOS.has(r.codigo), etiqueta + ': error inesperado ' + r.codigo + ' en ' + r.nodo);
  });
  assert.equal(m.bloqueos.size, 0, etiqueta + ': bloqueo sin liberar');
  m.libro.forEach((f) => {
    const { clave, ...resto } = f;
    assert.doesNotThrow(() => M.M6.filaLibro(resto), etiqueta);
    assert.equal(M.M6.filaLibro(resto).clave, clave, etiqueta);
  });
  // un dueño real solo recibe algo si TODAS las llaves están abiertas
  const real = m.control && String(m.control.dry_run).trim().toLowerCase() === 'false' && String(m.control.interruptor).trim().toLowerCase() === 'on' && m.config.modo === 'real';
  if (!real) m.aDueno().forEach((e) => assert.deepEqual(e.para, [PRUEBA], etiqueta + ': salió al dueño sin las dos llaves'));
}

test('propiedad: sobre cientos de archivos aleatorios y estropeados, el sistema nunca se cae y nunca escribe a quien no debe', () => {
  const ESTILOS = gen.ESTILOS.filter((e) => e !== 'X');
  for (const semilla of azar.semillas(1234)) for (let i = 0, az = azar.crear(semilla); i < 300; i++) {
    const estilo = az.elegir(ESTILOS);
    const fs = facs(az.entero(1, 10000), az.entero(0, 60), { prob_correo: az.uno(), prob_tel: az.uno() });
    let texto = gen.renderizar(fs, estilo).texto;
    if (az.prob(0.7)) texto = gen.corromper(texto, az);
    const nombre = estilo === 'C' ? 'pendientes.tsv' : 'facturas.csv';
    const config = gen.configPara(estilo, cfg({ modo: az.elegir(['dry_run', 'real']), umbral_rechazo: az.elegir([0, 5, 20, 100]) }));
    const control = az.elegir([{ interruptor: 'on', dry_run: 'true' }, REAL, { interruptor: 'on', dry_run: 'false' }, { interruptor: 'off' }]);
    const m = new Mundo({ config, control, drive: new Drive([archivo({ nombre, texto, modificado: EXPORTADO })]) });
    const resultados = [correr(m, T.lun), correr(m, T.mar)];
    verificarInvariantes(m, resultados, 'caso ' + i);
    const guardado = m.persistente();
    for (const c of CANARIOS(fs)) assert.equal(guardado.includes(c), false, 'caso ' + i + ' filtró ' + c);
    if (config.entrega === 'enlace_salida') {
      const cuerpos = m.aDueno().map((e) => e.asunto + e.cuerpo_texto).join('\n');
      for (const c of CANARIOS(fs)) assert.equal(cuerpos.includes(c), false, 'caso ' + i + ' filtró en el correo ' + c);
    }
  }
});

test('propiedad: con desastres aleatorios (correo caído, carpeta caída, caídas del servidor) los invariantes se mantienen', () => {
  const puntos = ['bloqueo_tomado', 'archivo_descargado', 'antes_de_enviar', 'despues_de_enviar'];
  for (const semilla of azar.semillas(4321)) for (let i = 0, az = azar.crear(semilla); i < 200; i++) {
    const fs = facs(az.entero(1, 10000), az.entero(1, 40));
    const m = new Mundo({ config: cfg({ modo: az.elegir(['dry_run', 'real']) }), control: az.elegir([{ interruptor: 'on', dry_run: 'true' }, REAL]), drive: new Drive([archivo({ texto: csv(fs), modificado: EXPORTADO })]) });
    const resultados = [];
    const dias = [T.lun, T.mar, T.mie, T.jue];
    for (const t of dias) {
      m.correo.caido = az.prob(0.2);
      m.drive.falloLista = az.prob(0.1);
      m.drive.falloSubida = az.prob(0.1);
      const r = correr(m, t, az.prob(0.2) ? { abortarEn: az.elegir(puntos) } : {});
      resultados.push(r);
      if (r.estado === 'caida' && az.prob(0.5)) m.bloqueos.clear();
    }
    // los invariantes de bloqueo no aplican a una caída sin limpiar: se comprueban los demás
    const bloqueos = new Map(m.bloqueos);
    m.bloqueos.clear();
    verificarInvariantes(m, resultados.filter((r) => r.estado !== 'caida'), 'desastre ' + i);
    m.bloqueos = bloqueos;
    // un solo informe «ok» por clave, aunque haya habido fallos
    const oks = m.libro.filter((f) => f.estado === 'ok').map((f) => f.clave);
    assert.equal(new Set(oks).size, oks.length, 'desastre ' + i + ': informe ok duplicado en el libro');
    const guardado = m.persistente();
    for (const c of CANARIOS(fs)) assert.equal(guardado.includes(c), false, 'desastre ' + i + ' filtró ' + c);
  }
});
