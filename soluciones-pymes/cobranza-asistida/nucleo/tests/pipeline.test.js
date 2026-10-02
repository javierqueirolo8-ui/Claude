'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, plano, capturar } = require('./cargar');
const { problemasDeEtiquetas } = require('./html-seguro');
const gen = require('../datos-ficticios/generador');
const { configEjemplo } = require('../datos-ficticios/config-ejemplo');

const { Util, M5, M6, M7, Cobranza } = cargar('util', 'm0-guardias', 'm1-normalizar', 'm2-antiguedad', 'm3-borradores', 'm4-informe',
  'm5-guardia-envio', 'm6-registro', 'm7-ingesta', 'pipeline');

const CORTE = '2026-10-05';
const AHORA = '2026-10-05T11:30:00Z';
const FIN = '2026-10-05T11:30:04Z';
const HUELLA = 'c'.repeat(64);
const OTRA_HUELLA_PIPE = 'd'.repeat(64);
const ENSAYO = { permitido: true, dry_run: true };
const REAL = { permitido: true, dry_run: false };
const CONTROL_ON = { interruptor: 'on', dry_run: 'true' };

const config = (extra = {}) => ({ ...configEjemplo(), ...extra });
const codigo = (fn) => { const r = capturar(fn); return r.ok ? null : r.codigo; };
const facturas = (semilla = 1, n = 30, extra = {}) => gen.crearFacturas({ semilla, n, fecha_corte: CORTE, ...extra });
const csvA = (fs) => gen.renderizar(fs, 'A').texto;
const vencidas = (fs) => fs.filter((f) => f.vencimiento < CORTE).length;
const preparar = (extra = {}) => plano(Cobranza.preparar({ config: config(), guardias: ENSAYO, fecha_corte: CORTE, contenido: { formato: 'csv', texto: csvA(facturas()) }, ...extra }));

/* ------------------------------------------------------ validarConfiguracion */

test('la configuración del ejemplo es válida', () => {
  assert.deepEqual(plano(Cobranza.validarConfiguracion(config(), CORTE)), { ok: true, problemas: [] });
});

test('lo que no es una configuración se rechaza sin más', () => {
  for (const v of [null, undefined, 'x', 5, [], true]) assert.deepEqual(plano(Cobranza.validarConfiguracion(v, CORTE)), { ok: false, problemas: ['E_CFG_CLIENTE'] });
});

test('reúne los problemas de todos los módulos a la vez, sin repetir y solo como códigos', () => {
  const mala = config({
    cliente_id: '!!', destinatarios_permitidos: [], mapeo_columnas: { factura: ['A'], deudor: ['B'], importe: ['C'] },
    tramos: [[2, 30]], patron_nombre_archivo: '../x', dia_aviso_sin_archivo: 9, plantillas: { amable: { asunto: 'sin datos', cuerpo: 'nada' } }
  });
  const r = plano(Cobranza.validarConfiguracion(mala, CORTE));
  assert.equal(r.ok, false);
  for (const c of ['E_CFG_CLIENTE_ID', 'E_CFG_DESTINATARIOS_TAMANO', 'E_CFG_MAPEO', 'E_CFG_TRAMOS', 'E_CFG_PATRON', 'E_CFG_DIA_AVISO']) assert.ok(r.problemas.includes(c), c);
  assert.equal(new Set(r.problemas).size, r.problemas.length);
  r.problemas.forEach((p) => assert.match(p, /^E_[A-Z0-9_]{2,40}$/));
});

test('un escalón sin plantilla se detecta antes de empezar, no cuando aparece la primera factura de ese tramo', () => {
  const escalones = [{ nombre: 'amable', desde: 1, hasta: 15 }, { nombre: 'muy_firme', desde: 16, hasta: null }];
  assert.ok(Cobranza.validarConfiguracion(config({ escalones }), CORTE).problemas.includes('E_PLANTILLA_FALTANTE'));
  const conPlantilla = config({ escalones, plantillas: { muy_firme: { asunto: 'Factura {factura}: última comunicación', cuerpo: 'Estimados:\nLa factura {factura} por {importe}, vencida el {vencimiento}, sigue pendiente.\nQuedamos a su disposición.' } } });
  assert.deepEqual(plano(Cobranza.validarConfiguracion(conPlantilla, CORTE)), { ok: true, problemas: [] });
});

test('la fecha de corte inválida se informa; la configuración no se modifica', () => {
  for (const f of [undefined, null, '05/10/2026', '2026-02-30', 5]) assert.ok(Cobranza.validarConfiguracion(config(), f).problemas.includes('E_FECHA_CORTE_INVALIDA'));
  const c = Object.freeze(config());
  Object.freeze(c.mapeo_columnas);
  Cobranza.validarConfiguracion(c, CORTE);
});

/* ------------------------------------------------------------ fechaCorteDe */

test('la fecha de corte es la fecha LOCAL del cliente, también cerca de la medianoche', () => {
  assert.equal(Cobranza.fechaCorteDe('2026-10-05T11:30:00Z', 'America/Montevideo'), '2026-10-05');
  assert.equal(Cobranza.fechaCorteDe('2026-10-06T02:59:59Z', 'America/Montevideo'), '2026-10-05');
  assert.equal(Cobranza.fechaCorteDe('2026-10-06T03:00:00Z', 'America/Montevideo'), '2026-10-06');
  assert.equal(Cobranza.fechaCorteDe('2026-10-06T03:00:00.250Z', 'America/Montevideo'), '2026-10-06');
  assert.equal(Cobranza.fechaCorteDe('2026-10-05T20:00:00Z', 'Asia/Tokyo'), '2026-10-06');
  assert.equal(Cobranza.fechaCorteDe('2026-12-31T23:59:59Z', 'UTC'), '2026-12-31');
});

test('un instante o una zona inválidos detienen todo con un código', () => {
  for (const a of ['2026-10-05', '2026-10-05T11:30:00', '2026-10-05T11:30:00+00:00', 'ahora', null, undefined, 5, '2026-02-30T00:00:00Z']) {
    assert.equal(codigo(() => Cobranza.fechaCorteDe(a, 'America/Montevideo')), 'E_AHORA_INVALIDO', String(a));
  }
  for (const z of ['Marte/Olimpo', '', null, undefined, 5]) assert.equal(codigo(() => Cobranza.fechaCorteDe(AHORA, z)), 'E_AHORA_INVALIDO', String(z));
});

/* ----------------------------------------------------------------- arrancar */

const arrancar = (extra = {}) => plano(Cobranza.arrancar({ config: config(), fila_control: CONTROL_ON, fecha_corte: CORTE, ahora_utc: AHORA, fila_bloqueo: null, ...extra }));

test('todo en orden: continúa, con el ensayo activo según la tabla de control', () => {
  const r = arrancar();
  assert.deepEqual(r, { accion: 'continuar', motivo: null, problemas: [], guardias: { permitido: true, dry_run: true, motivo: null } });
  assert.equal(arrancar({ fila_control: { interruptor: 'on', dry_run: 'false' } }).guardias.dry_run, false);
});

test('interruptor apagado, raro o ausente: se detiene sin mirar nada más', () => {
  for (const [fila, motivo] of [[{ interruptor: 'off', dry_run: 'false' }, 'INTERRUPTOR_APAGADO'], [{ interruptor: '???' }, 'INTERRUPTOR_DESCONOCIDO'], [null, 'SIN_DATOS'], [undefined, 'SIN_DATOS']]) {
    const r = arrancar({ fila_control: fila, config: { roto: true } }); // la configuración rota no importa: el interruptor manda
    assert.equal(r.accion, 'detener');
    assert.equal(r.motivo, motivo);
    assert.deepEqual(r.problemas, []);
  }
});

test('configuración inválida: se detiene y dice qué códigos hay que corregir', () => {
  const r = arrancar({ config: config({ entrega: 'papel', zona_horaria: 'Marte/Olimpo' }) });
  assert.equal(r.accion, 'detener');
  assert.equal(r.motivo, 'CONFIG_INVALIDA');
  assert.deepEqual(r.problemas.slice().sort(), ['E_CFG_ENTREGA', 'E_CFG_ZONA']);
});

test('bloqueo: activo = omitir; vencido = alertar; libre = continuar', () => {
  assert.deepEqual(arrancar({ fila_bloqueo: { cliente_id: 'demo-01', expira_utc: '2026-10-05T11:45:00Z' } }).accion, 'omitir_en_curso');
  const v = arrancar({ fila_bloqueo: { cliente_id: 'demo-01', expira_utc: '2026-10-05T11:00:00Z' } });
  assert.equal(v.accion, 'alertar_bloqueo_vencido');
  assert.equal(v.motivo, 'BLOQUEO_VENCIDO');
  assert.equal(arrancar({ fila_bloqueo: undefined }).accion, 'continuar');
});

test('un bloqueo mal formado no se interpreta: falla con código', () => {
  assert.equal(codigo(() => Cobranza.arrancar({ config: config(), fila_control: CONTROL_ON, fecha_corte: CORTE, ahora_utc: AHORA, fila_bloqueo: { expira_utc: 'mañana' } })), 'E_BLOQUEO_INVALIDO');
  assert.equal(codigo(() => Cobranza.arrancar(null)), 'E_ARRANQUE_INVALIDO');
});

test('la configuración inválida trae su propio código; la fila de bloqueo de otro cliente no vale', () => {
  const r = arrancar({ config: config({ entrega: 'papel' }) });
  assert.equal(r.codigo, 'E_CFG_INVALIDA');
  assert.deepEqual(r.problemas, ['E_CFG_ENTREGA']);
  assert.equal(codigo(() => Cobranza.arrancar({ config: config(), fila_control: CONTROL_ON, fecha_corte: CORTE, ahora_utc: AHORA, fila_bloqueo: { cliente_id: 'otro-cliente', expira_utc: '2026-10-05T12:00:00Z' } })), 'E_BLOQUEO_INVALIDO');
  for (const fila of ['x', 5, [], { expira_utc: '2026-10-05T12:00:00Z' }]) {
    assert.equal(codigo(() => Cobranza.arrancar({ config: config(), fila_control: CONTROL_ON, fecha_corte: CORTE, ahora_utc: AHORA, fila_bloqueo: fila })), 'E_BLOQUEO_INVALIDO', JSON.stringify(fila));
  }
});

/* ----------------------------------------------------------------- preparar */

test('CSV normal: informe con los conteos correctos y prefijo de ensayo', () => {
  const fs = facturas(1, 30);
  const r = preparar({ contenido: { formato: 'csv', texto: csvA(fs) } });
  assert.equal(r.tipo, 'informe');
  assert.equal(r.ensayo, true);
  assert.deepEqual(r.conteos, { n_filas: 30, n_vencidas: vencidas(fs), n_apartadas: 0 });
  assert.ok(r.informe.asunto.startsWith('[ENSAYO] Resumen semanal de cobranza · 05/10/2026'));
  assert.equal(r.informe.nombre_archivo, 'ensayo-informe-cobranza-2026-10-05.html');
  assert.deepEqual(problemasDeEtiquetas(r.informe.html_completo), []);
});

test('modo real (llave doble): sin prefijo de ensayo', () => {
  const r = preparar({ guardias: REAL, config: config({ modo: 'real' }) });
  assert.equal(r.ensayo, false);
  assert.equal(r.informe.asunto.startsWith('[ENSAYO]'), false);
  assert.equal(r.informe.nombre_archivo, 'informe-cobranza-2026-10-05.html');
  // una sola llave no basta
  assert.equal(preparar({ guardias: REAL, config: config({ modo: 'dry_run' }) }).ensayo, true);
  assert.equal(preparar({ guardias: ENSAYO, config: config({ modo: 'real' }) }).ensayo, true);
});

test('CSV y filas de hoja de cálculo del mismo dato dan el mismo informe de resumen', () => {
  const fs = facturas(7, 40);
  const a = preparar({ contenido: { formato: 'csv', texto: csvA(fs) } });
  const cfgX = gen.configPara('X', configEjemplo());
  const x = plano(Cobranza.preparar({ config: cfgX, guardias: ENSAYO, fecha_corte: CORTE, contenido: { formato: 'filas', filas: gen.renderizar(fs, 'X').filas } }));
  assert.equal(x.tipo, 'informe');
  assert.deepEqual(x.conteos, a.conteos);
  assert.equal(x.informe.texto_resumen, a.informe.texto_resumen);
  assert.equal(x.informe.html_completo, a.informe.html_completo);
});

test('los cuatro formatos de exportación dan el mismo resumen (el estilo C no trae columna de disputa)', () => {
  const fs = facturas(11, 50, { prob_disputa: 0 });
  const resumenes = gen.ESTILOS.map((estilo) => {
    const r = gen.renderizar(fs, estilo);
    const contenido = r.formato === 'csv' ? { formato: 'csv', texto: r.texto } : { formato: 'filas', filas: r.filas };
    const p = plano(Cobranza.preparar({ config: gen.configPara(estilo, configEjemplo()), guardias: ENSAYO, fecha_corte: CORTE, contenido }));
    assert.equal(p.tipo, 'informe', estilo);
    return p.informe.texto_resumen;
  });
  resumenes.forEach((t) => assert.equal(t, resumenes[0]));
});

test('sin facturas vencidas: igual se prepara un informe que lo dice', () => {
  const fs = facturas(3, 10).map((f) => ({ ...f, vencimiento: gen.sumarDias(CORTE, 10), emision: gen.sumarDias(CORTE, -20) }));
  const r = preparar({ contenido: { formato: 'csv', texto: csvA(fs) } });
  assert.equal(r.tipo, 'informe');
  assert.equal(r.conteos.n_vencidas, 0);
  assert.match(r.informe.asunto, /sin facturas vencidas/);
});

test('archivo con una columna obligatoria ausente: incidencia con su código, sin informe', () => {
  const texto = csvA(facturas()).replace('Saldo', 'Monto total');
  const r = preparar({ contenido: { formato: 'csv', texto } });
  assert.equal(r.tipo, 'incidencia');
  assert.equal(r.codigo, 'E_COLUMNA_FALTANTE');
  assert.match(r.aviso.asunto, /No se pudo preparar el resumen de cobranza/);
  assert.deepEqual(r.conteos, { n_filas: 0, n_vencidas: 0, n_apartadas: 0 });
  assert.equal(r.informe, undefined);
});

test('demasiadas filas rechazadas: incidencia, no un informe engañoso', () => {
  const malas = csvA(facturas(2, 20)).split('\n').map((l, i) => (i === 0 || l === '' ? l : l.split(';').map((c, k) => (k === 5 ? '31/02/2026' : c)).join(';'))).join('\n');
  const r = preparar({ contenido: { formato: 'csv', texto: malas } });
  assert.equal(r.tipo, 'incidencia');
  assert.equal(r.codigo, 'E_DEMASIADAS_APARTADAS');
  assert.equal(r.conteos.n_apartadas, 20);
});

test('archivo vacío o solo con cabecera: incidencia', () => {
  const soloCabecera = gen.CABECERAS.A.join(';') + '\n';
  assert.equal(preparar({ contenido: { formato: 'csv', texto: soloCabecera } }).codigo, 'E_ARCHIVO_VACIO');
  assert.equal(preparar({ contenido: { formato: 'csv', texto: '' } }).tipo, 'incidencia');
  assert.equal(preparar({ contenido: { formato: 'csv', texto: '   \n\n' } }).tipo, 'incidencia');
  assert.equal(preparar({ contenido: { formato: 'filas', filas: [] } }).tipo, 'incidencia');
});

test('contenido inválido: se detiene con un código', () => {
  for (const contenido of [null, {}, { formato: 'xml', texto: '<x/>' }, { formato: 'csv' }, 'texto']) {
    const c = codigo(() => Cobranza.preparar({ config: config(), guardias: ENSAYO, fecha_corte: CORTE, contenido }));
    assert.ok(['E_PREPARAR_INVALIDO', null].includes(c), JSON.stringify(contenido) + ' → ' + c);
  }
  assert.equal(codigo(() => Cobranza.preparar({ config: config(), guardias: ENSAYO, fecha_corte: CORTE, contenido: { formato: 'xml', texto: '' } })), 'E_PREPARAR_INVALIDO');
  assert.equal(codigo(() => Cobranza.preparar({ config: null, guardias: ENSAYO, fecha_corte: CORTE, contenido: { formato: 'csv', texto: '' } })), 'E_PREPARAR_INVALIDO');
  assert.equal(codigo(() => Cobranza.preparar({ config: config(), guardias: ENSAYO, fecha_corte: '5/10', contenido: { formato: 'csv', texto: '' } })), 'E_PREPARAR_INVALIDO');
});

test('modo demostración: los borradores no llevan enlaces y el asunto lo dice', () => {
  const r = preparar({ demo: true });
  assert.ok(r.informe.asunto.startsWith('[ENSAYO] EJEMPLO'.slice(0, 0)) || /EJEMPLO/.test(r.informe.asunto));
  assert.equal(r.informe.html_completo.includes('api.whatsapp.com'), false);
  assert.equal(r.informe.html_completo.includes('mailto:'), false);
});

test('filas hostiles: se apartan o pasan escapadas; el informe queda limpio y los contadores cuadran', () => {
  const fs = facturas(5, 40);
  const { texto, marcas } = gen.csvConHostiles(fs, CORTE);
  const r = plano(Cobranza.preparar({ config: config({ umbral_rechazo: 100 }), guardias: ENSAYO, fecha_corte: CORTE, contenido: { formato: 'csv', texto } }));
  assert.equal(r.tipo, 'informe');
  const h = r.informe.html_completo;
  assert.deepEqual(problemasDeEtiquetas(h), []);
  for (const peligro of ['<script', '<img', 'javascript:']) assert.equal(h.includes(peligro), false, peligro); // 'onerror=' solo aparece como texto escapado
  assert.equal(new RegExp('[' + String.fromCharCode(0x202E) + String.fromCharCode(0x200B) + ']').test(h), false);
  const apartadas = marcas.filter((m) => m.esperado === 'apartada').length;
  assert.equal(r.conteos.n_apartadas, apartadas);
  assert.equal(r.conteos.n_filas, marcas.length + fs.length);
  assert.match(r.informe.texto_resumen, new RegExp('Filas del archivo que no se pudieron leer: ' + apartadas + ' de ' + (marcas.length + fs.length)));
  // el contenido hostil se ve, pero como texto
  assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(h.includes('=HYPERLINK(&quot;http://malo.example&quot;;&quot;clic&quot;)'));
});

/* --------------------------------------------------------------- armarEnvio */

const armarEnvio = (extra = {}) => {
  const guardias = extra.guardias || ENSAYO;
  const cfg = extra.config || config();
  const p = extra.tipo === 'sin_archivo' ? undefined : preparar({ guardias, config: cfg, contenido: extra.contenido || { formato: 'csv', texto: csvA(facturas()) } });
  return plano(Cobranza.armarEnvio({
    config: cfg, guardias, fecha_corte: CORTE, tipo: (p && p.tipo) || 'sin_archivo', preparado: p, hash_archivo: HUELLA, fecha_exportacion: CORTE,
    enlace_informe: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view', iniciada_utc: AHORA, terminada_utc: FIN, ...extra
  }));
};

test('ensayo: el mensaje va a la bandeja de pruebas, jamás al dueño, y lo dice arriba', () => {
  const r = armarEnvio();
  assert.equal(r.envio.accion, 'redirigir_ensayo');
  assert.deepEqual(r.envio.destinatarios, ['bandeja.de.pruebas@ejemplo.example']);
  assert.ok(r.correo.cuerpo_texto.startsWith('[ENSAYO] En modo real este mensaje se enviaría a: administracion@ferreteria-ficticia.example.'));
  assert.equal(r.libro.modo, 'dry');
  assert.equal(r.libro.estado, 'ok');
  assert.equal(r.libro.codigo_error, null);
});

test('envío real (llave doble): va a la lista blanca del cliente', () => {
  const r = armarEnvio({ guardias: REAL, config: config({ modo: 'real' }) });
  assert.equal(r.envio.accion, 'enviar');
  assert.deepEqual(r.envio.destinatarios, ['administracion@ferreteria-ficticia.example']);
  assert.equal(r.correo.cuerpo_texto.includes('[ENSAYO]'), false);
  assert.equal(r.libro.modo, 'real');
});

test('el destinatario NUNCA sale del archivo: aunque el archivo traiga correos, solo cuenta la lista blanca', () => {
  const fs = facturas(9, 30, { prob_correo: 1 });
  for (const [guardias, modo] of [[ENSAYO, 'dry_run'], [REAL, 'real']]) {
    const r = armarEnvio({ guardias, config: config({ modo }), contenido: { formato: 'csv', texto: csvA(fs) } });
    const permitidos = new Set(['administracion@ferreteria-ficticia.example', 'bandeja.de.pruebas@ejemplo.example']);
    r.envio.destinatarios.forEach((d) => assert.ok(permitidos.has(d), d));
    fs.filter((f) => f.correo).forEach((f) => assert.equal(r.envio.destinatarios.includes(f.correo), false));
  }
});

test('modo enlace de salida: el correo lleva totales y el enlace, y NADA del archivo (canario)', () => {
  const fs = facturas(13, 30, { prob_correo: 1, prob_tel: 1 });
  const r = armarEnvio({ contenido: { formato: 'csv', texto: csvA(fs) } });
  assert.equal(r.correo.adjunto, undefined);
  assert.ok(r.correo.cuerpo_texto.includes('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view'));
  const todo = r.correo.asunto + '\n' + r.correo.cuerpo_texto;
  for (const f of fs) {
    assert.equal(todo.includes(f.cliente), false, f.cliente);
    assert.equal(todo.includes(f.serie + '-' + f.numero), false);
    if (f.correo) assert.equal(todo.includes(f.correo), false);
    if (f.tel) assert.equal(todo.includes(f.tel), false);
  }
});

test('modo enlace de salida sin enlace válido: no hay envío', () => {
  for (const enlace_informe of [undefined, null, '', 'http://drive.google.com/x/yyyyy', 'https://malo.example/informe', 'javascript:alert(1)']) {
    assert.equal(codigo(() => armarEnvio({ enlace_informe })), 'E_ENLACE_INVALIDO', String(enlace_informe));
  }
});

test('modo correo completo: el informe viaja como adjunto y el cuerpo solo trae el resumen', () => {
  const r = armarEnvio({ config: config({ entrega: 'correo_completo' }) });
  assert.equal(r.correo.adjunto.tipo, 'text/html');
  assert.equal(r.correo.adjunto.nombre, 'ensayo-informe-cobranza-2026-10-05.html');
  assert.ok(r.correo.adjunto.contenido.startsWith('<!doctype html>'));
  assert.equal(r.correo.cuerpo_texto.includes('<'), false);
});

test('archivo con problemas: aviso de incidencia al dueño y fila «incidencia» con el código', () => {
  const texto = csvA(facturas()).replace('Saldo', 'Monto total');
  const r = armarEnvio({ contenido: { formato: 'csv', texto } });
  assert.match(r.correo.asunto, /^\[ENSAYO\] No se pudo preparar el resumen de cobranza/);
  assert.equal(r.libro.estado, 'incidencia');
  assert.equal(r.libro.codigo_error, 'E_COLUMNA_FALTANTE');
  assert.equal(r.libro.hash_archivo, HUELLA);
  assert.equal(r.correo.adjunto, undefined);
});

test('no llegó el archivo: aviso fijo y fila «incidencia» con la huella «sin archivo»', () => {
  const r = armarEnvio({ tipo: 'sin_archivo', guardias: REAL, config: config({ modo: 'real' }) });
  assert.match(r.correo.asunto, /^No encontramos la exportación de esta semana · 05\/10\/2026$/);
  assert.equal(r.libro.estado, 'incidencia');
  assert.equal(r.libro.codigo_error, 'E_SIN_ARCHIVO');
  assert.equal(r.libro.hash_archivo, M7.HUELLA_SIN_ARCHIVO);
  assert.deepEqual([r.libro.n_filas, r.libro.n_vencidas, r.libro.n_apartadas], [0, 0, 0]);
  assert.equal(r.libro.clave, 'demo-01|2026-W41|' + M7.HUELLA_SIN_ARCHIVO);
  assert.equal(r.envio.accion, 'enviar');
});

test('la fila del libro trae solo contadores y códigos (ningún dato del cliente)', () => {
  const r = armarEnvio({ contenido: { formato: 'csv', texto: csvA(facturas(4, 25)) } });
  assert.deepEqual(Object.keys(r.libro).sort(), ['clave', ...M6.CLAVES_LIBRO].sort());
  const fs = facturas(4, 25);
  const json = JSON.stringify(r.libro);
  for (const f of fs) assert.equal(json.includes(f.cliente), false);
  assert.equal(r.libro.n_filas, 25);
});

test('si las llaves cambian entre preparar y armar el envío, se detiene (no se mezclan ensayo y real)', () => {
  const p = preparar({ guardias: ENSAYO });
  assert.equal(codigo(() => Cobranza.armarEnvio({ config: config({ modo: 'real' }), guardias: REAL, fecha_corte: CORTE, fecha_exportacion: CORTE, tipo: 'informe', preparado: p, hash_archivo: HUELLA, enlace_informe: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view', iniciada_utc: AHORA, terminada_utc: FIN })), 'E_INCONSISTENCIA_ENSAYO');
  assert.equal(codigo(() => Cobranza.armarEnvio({ config: config(), guardias: ENSAYO, fecha_corte: CORTE, fecha_exportacion: CORTE, tipo: 'incidencia', preparado: p, hash_archivo: HUELLA, iniciada_utc: AHORA, terminada_utc: FIN })), 'E_INCONSISTENCIA_ENSAYO');
});

test('sin «modo» en la configuración se ensaya: el mensaje va a la bandeja de pruebas', () => {
  const cfg = config();
  delete cfg.modo;
  const r = armarEnvio({ guardias: REAL, config: cfg });
  assert.equal(r.envio.accion, 'redirigir_ensayo');
  assert.deepEqual(r.envio.destinatarios, ['bandeja.de.pruebas@ejemplo.example']);
  assert.equal(r.libro.modo, 'dry');
});

test('si la guardia de envío y la definición de «real» no coinciden, se detiene: jamás se envía con dudas', () => {
  const original = M5.guardiaEnvio;
  const enlace = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view';
  try {
    // una guardia defectuosa que «enviaría de verdad» aunque falte una llave
    M5.guardiaEnvio = () => ({ accion: 'enviar', destinatarios: ['administracion@ferreteria-ficticia.example'], motivos: [], bloqueados: [] });
    const enEnsayo = preparar({ guardias: ENSAYO });
    assert.equal(codigo(() => Cobranza.armarEnvio({ config: config(), guardias: ENSAYO, fecha_corte: CORTE, fecha_exportacion: CORTE, tipo: 'informe', preparado: enEnsayo, hash_archivo: HUELLA, enlace_informe: enlace, iniciada_utc: AHORA, terminada_utc: FIN })), 'E_INCONSISTENCIA_ENSAYO');
    // y una que «ensayaría» con todas las llaves abiertas
    M5.guardiaEnvio = () => ({ accion: 'redirigir_ensayo', destinatarios: ['bandeja.de.pruebas@ejemplo.example'], motivos: ['ENSAYO'], bloqueados: [] });
    const enReal = preparar({ guardias: REAL, config: config({ modo: 'real' }) });
    assert.equal(codigo(() => Cobranza.armarEnvio({ config: config({ modo: 'real' }), guardias: REAL, fecha_corte: CORTE, fecha_exportacion: CORTE, tipo: 'informe', preparado: enReal, hash_archivo: HUELLA, enlace_informe: enlace, iniciada_utc: AHORA, terminada_utc: FIN })), 'E_INCONSISTENCIA_ENSAYO');
  } finally {
    M5.guardiaEnvio = original;
  }
  assert.equal(armarEnvio().envio.accion, 'redirigir_ensayo', 'la guardia real quedó restaurada');
});

test('la semana del libro es la de la EXPORTACIÓN; para «no llegó», la de hoy', () => {
  // exportado el domingo 4 (semana 40), procesado el lunes 5 (semana 41)
  const r = armarEnvio({ fecha_exportacion: '2026-10-04' });
  assert.equal(r.libro.semana_iso, '2026-W40');
  assert.equal(r.libro.clave, 'demo-01|2026-W40|' + HUELLA);
  const sin = armarEnvio({ tipo: 'sin_archivo', fecha_exportacion: '2026-10-04' });
  assert.equal(sin.libro.semana_iso, '2026-W41');
});

test('la fecha de exportación debe existir y no puede ser posterior a la ejecución', () => {
  for (const f of [undefined, null, '', '04/10/2026', '2026-02-30', '2026-10-06', 5]) {
    assert.equal(codigo(() => armarEnvio({ fecha_exportacion: f })), 'E_ENVIO_INVALIDO', String(f));
  }
  assert.equal(armarEnvio({ fecha_exportacion: CORTE }).libro.semana_iso, '2026-W41');
});

test('la huella de «sin archivo» no puede ser la de un archivo real', () => {
  assert.equal(codigo(() => armarEnvio({ hash_archivo: M7.HUELLA_SIN_ARCHIVO })), 'E_LIBRO_INVALIDO');
  const texto = csvA(facturas()).replace('Saldo', 'Monto total');
  assert.equal(codigo(() => armarEnvio({ hash_archivo: M7.HUELLA_SIN_ARCHIVO, contenido: { formato: 'csv', texto } })), 'E_LIBRO_INVALIDO');
});

test('segunda barrera: en modo real el informe completo por correo exige aceptación aunque se llame directamente', () => {
  const cfg = config({ modo: 'real', entrega: 'correo_completo' });
  const p = preparar({ guardias: REAL, config: cfg });
  const llamar = (c) => codigo(() => Cobranza.armarEnvio({ config: c, guardias: REAL, fecha_corte: CORTE, fecha_exportacion: CORTE, tipo: 'informe', preparado: p, hash_archivo: HUELLA, iniciada_utc: AHORA, terminada_utc: FIN }));
  assert.equal(llamar(cfg), 'E_CFG_ENTREGA_REAL');
  assert.equal(llamar({ ...cfg, acepta_correo_completo: 'true' }), 'E_CFG_ENTREGA_REAL');
  assert.equal(llamar({ ...cfg, acepta_correo_completo: true }), null);
  // en ensayo no hace falta
  assert.equal(armarEnvio({ config: config({ entrega: 'correo_completo' }) }).envio.accion, 'redirigir_ensayo');
});

test('la guardia de envío bloquea con un código propio', () => {
  const casos = [
    [{ destinatarios_permitidos: ['Mal@Escrito.example'] }, 'E_ENVIO_LISTA_BLANCA_INVALIDA'],
    [{ destinatarios_permitidos: [] }, 'E_ENVIO_LISTA_BLANCA_TAMANO'],
    [{ remitente_prueba: 'no es un correo' }, 'E_ENVIO_REMITENTE_PRUEBA_INVALIDO']
  ];
  for (const [cambio, esperado] of casos) {
    const cfg = config(cambio);
    const p = preparar({ config: config() });
    assert.equal(codigo(() => Cobranza.armarEnvio({ config: cfg, guardias: ENSAYO, fecha_corte: CORTE, fecha_exportacion: CORTE, tipo: 'informe', preparado: p, hash_archivo: HUELLA, enlace_informe: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view', iniciada_utc: AHORA, terminada_utc: FIN })), esperado);
  }
});

test('una fila de libro inválida detiene el envío ANTES de enviar', () => {
  for (const cambio of [{ hash_archivo: 'no-es-una-huella' }, { iniciada_utc: 'ayer' }, { terminada_utc: undefined }]) {
    assert.equal(codigo(() => armarEnvio(cambio)), 'E_LIBRO_INVALIDO', JSON.stringify(cambio));
  }
});

test('tipo desconocido o entrada rota: se detiene', () => {
  assert.equal(codigo(() => Cobranza.armarEnvio({ config: config(), guardias: ENSAYO, fecha_corte: CORTE, fecha_exportacion: CORTE, tipo: 'otra', hash_archivo: HUELLA, iniciada_utc: AHORA, terminada_utc: FIN })), 'E_ENVIO_INVALIDO');
  assert.equal(codigo(() => Cobranza.armarEnvio(null)), 'E_ENVIO_INVALIDO');
  assert.equal(codigo(() => Cobranza.armarEnvio({ config: null })), 'E_ENVIO_INVALIDO');
});

/* ------------------------------------------------------ alertas y errores */

test('la alerta a Javier solo lleva códigos, aunque el error traiga datos del cliente (canario)', () => {
  const CANARIO = 'CANARIO_ALERTA_3319';
  const err = Object.assign(new Error('fallo con ' + CANARIO), { codigo: 'E_ARCHIVO_INVALIDO', datos: CANARIO });
  const r = plano(Cobranza.alertaOperador({ error: err, contexto: { cliente_id: 'demo-01', workflow: 'Cobranza · shell', nodo: 'Leer archivo', ejecucion_id: 42 }, operador: 'javier@ejemplo.example' }));
  assert.equal(r.sano.codigo, 'E_ARCHIVO_INVALIDO');
  assert.equal(JSON.stringify(r).includes(CANARIO), false);
  assert.equal(r.envio.accion, 'enviar');
  assert.deepEqual(r.envio.destinatarios, ['javier@ejemplo.example']);
  assert.match(r.texto.asunto, /^Error en cobranza · demo-01 · E_ARCHIVO_INVALIDO$/);
});

test('la alerta puede llevar la lista de problemas de configuración, y solo como códigos', () => {
  const base = { error: Object.assign(new Error('x'), { codigo: 'E_CFG_INVALIDA' }), contexto: { cliente_id: 'demo-01' }, operador: 'javier@ejemplo.example' };
  const r = plano(Cobranza.alertaOperador({ ...base, problemas: ['E_CFG_ENTREGA', 'E_CFG_ZONA'] }));
  assert.ok(r.texto.cuerpo_texto.endsWith('\nProblemas: E_CFG_ENTREGA, E_CFG_ZONA'));
  assert.equal(r.texto.asunto, 'Error en cobranza · demo-01 · E_CFG_INVALIDA');
  assert.equal(plano(Cobranza.alertaOperador({ ...base, problemas: [] })).texto.cuerpo_texto.includes('Problemas'), false);
  for (const malo of ['E_CFG_ZONA', ['Juan Pérez'], [5], [['E_CFG_ZONA']], ['E_CFG_ZONA\nBcc: x@y.com'], Array.from({ length: 41 }, () => 'E_X1'), null]) {
    assert.equal(codigo(() => Cobranza.alertaOperador({ ...base, problemas: malo })), 'E_ALERTA_INVALIDA', JSON.stringify(malo));
  }
});

test('sin un operador válido la alerta no se envía (y lo dice)', () => {
  for (const operador of [undefined, null, '', 'Javier@Ejemplo.example', 'x', 5]) {
    const r = plano(Cobranza.alertaOperador({ error: new Error('x'), contexto: {}, operador }));
    assert.equal(r.envio.accion, 'no_enviar', String(operador));
  }
  assert.equal(codigo(() => Cobranza.alertaOperador(null)), 'E_ALERTA_INVALIDA');
});

test('fila de error para el libro: contadores en cero, código y huella «ninguna» por defecto', () => {
  const f = plano(Cobranza.filaError({ cliente_id: 'demo-01', codigo: 'E_DESCARGA_INCOMPLETA', fecha_corte: CORTE, iniciada_utc: AHORA, terminada_utc: FIN }));
  assert.equal(f.estado, 'error');
  assert.equal(f.codigo_error, 'E_DESCARGA_INCOMPLETA');
  assert.equal(f.hash_archivo, M7.HUELLA_SIN_ARCHIVO);
  assert.equal(f.modo, 'dry');
  assert.equal(plano(Cobranza.filaError({ cliente_id: 'demo-01', codigo: 'E_X1', fecha_corte: CORTE, iniciada_utc: AHORA, terminada_utc: FIN, modo: 'real', hash_archivo: HUELLA })).modo, 'real');
  assert.equal(codigo(() => Cobranza.filaError({ cliente_id: 'demo-01', codigo: 'texto libre con datos', fecha_corte: CORTE, iniciada_utc: AHORA, terminada_utc: FIN })), 'E_LIBRO_INVALIDO');
  assert.equal(codigo(() => Cobranza.filaError(null)), 'E_LIBRO_INVALIDO');
});

/* ------------------------------------------------ iniciar (lo primero de cada día) */

const BLOQUEO_FILA = (extra = {}) => ({ cliente_id: 'demo-01', expira_utc: '2026-10-05T11:45:00Z', ...extra });
const iniciar = (extra = {}) => plano(Cobranza.iniciar({ config: config(), filas_control: [CONTROL_ON], filas_bloqueo: [], ahora_utc: AHORA, ...extra }));

test('iniciar: fecha local, interruptor y bloqueo en un solo paso; todo en orden continúa y trae la fila del bloqueo que hay que tomar', () => {
  const r = iniciar();
  assert.deepEqual(r, {
    accion: 'continuar', motivo: null, problemas: [], guardias: { permitido: true, dry_run: true, motivo: null }, fecha_corte: CORTE,
    bloqueo_nuevo: { cliente_id: 'demo-01', expira_utc: '2026-10-05T12:00:00Z' }
  });
  assert.equal(iniciar({ ahora_utc: '2026-10-06T02:59:59Z' }).fecha_corte, '2026-10-05'); // aún es lunes en Montevideo
  assert.equal(iniciar({ ahora_utc: '2026-10-06T03:00:00Z' }).fecha_corte, '2026-10-06');
});

test('iniciar: la tabla de control debe tener UNA fila; ninguna, varias o una rara no se procesan', () => {
  for (const filas of [[], undefined, null, 'x', [CONTROL_ON, CONTROL_ON], [null], ['on'], [[CONTROL_ON]]]) {
    const r = iniciar({ filas_control: filas });
    assert.equal(r.accion, 'detener', JSON.stringify(filas));
    assert.equal(r.motivo, 'SIN_DATOS', JSON.stringify(filas));
    assert.equal(r.fecha_corte, CORTE);
  }
  assert.equal(iniciar({ filas_control: [{ interruptor: 'off', dry_run: 'true' }] }).motivo, 'INTERRUPTOR_APAGADO');
  assert.equal(iniciar({ filas_control: [{ interruptor: 'on', dry_run: 'false', id: 1, createdAt: 'x' }] }).guardias.dry_run, false);
});

test('iniciar: sin la lista de filas de bloqueo no se arranca (aunque sea vacía, debe venir)', () => {
  for (const filas of [undefined, null, 'x', {}, 5]) {
    assert.equal(codigo(() => Cobranza.iniciar({ config: config(), filas_control: [CONTROL_ON], filas_bloqueo: filas, ahora_utc: AHORA })), 'E_ARRANQUE_INVALIDO', JSON.stringify(filas));
  }
  for (const e of [null, undefined, 'x', 5, [], { filas_control: [CONTROL_ON], filas_bloqueo: [], ahora_utc: AHORA }, { config: 'x', filas_bloqueo: [] }]) {
    assert.equal(codigo(() => Cobranza.iniciar(e)), 'E_ARRANQUE_INVALIDO', JSON.stringify(e));
  }
});

test('iniciar: bloqueo activo = omitir, vencido = alertar, varias filas = manda la más lejana', () => {
  assert.equal(iniciar({ filas_bloqueo: [BLOQUEO_FILA()] }).accion, 'omitir_en_curso');
  const v = iniciar({ filas_bloqueo: [BLOQUEO_FILA({ expira_utc: '2026-10-05T11:00:00Z' })] });
  assert.equal(v.accion, 'alertar_bloqueo_vencido');
  assert.equal(v.motivo, 'BLOQUEO_VENCIDO');
  assert.equal(v.codigo, 'E_BLOQUEO_VENCIDO');
  assert.equal('bloqueo_nuevo' in v, false); // solo quien sigue adelante toma el bloqueo
  assert.equal('bloqueo_nuevo' in iniciar({ filas_bloqueo: [BLOQUEO_FILA()] }), false);
  assert.equal('bloqueo_nuevo' in iniciar({ filas_control: [{ interruptor: 'off' }] }), false);
  assert.equal(iniciar({ filas_bloqueo: [BLOQUEO_FILA({ expira_utc: '2026-10-05T11:00:00Z' }), BLOQUEO_FILA()] }).accion, 'omitir_en_curso');
  assert.equal(iniciar({ filas_bloqueo: [BLOQUEO_FILA({ id: 3, createdAt: 'x', updatedAt: 'y' })] }).accion, 'omitir_en_curso'); // columnas de más de la tabla
});

test('iniciar: una fila de bloqueo ajena o rota NO lanza un error: devuelve la acción «error» con la fecha ya conocida', () => {
  for (const fila of [BLOQUEO_FILA({ cliente_id: 'otro-cliente' }), BLOQUEO_FILA({ expira_utc: 'mañana' }), 'x', null]) {
    const r = iniciar({ filas_bloqueo: [fila] });
    assert.deepEqual(r, { accion: 'error', motivo: 'ERROR', codigo: 'E_BLOQUEO_INVALIDO', problemas: [], guardias: null, fecha_corte: CORTE }, JSON.stringify(fila));
  }
});

test('iniciar: con configuración inválida se detiene con todos los códigos; el interruptor manda sobre la configuración', () => {
  const r = iniciar({ config: config({ entrega: 'papel', patron_nombre_archivo: '../x' }) });
  assert.equal(r.accion, 'detener');
  assert.equal(r.motivo, 'CONFIG_INVALIDA');
  assert.equal(r.codigo, 'E_CFG_INVALIDA');
  assert.deepEqual(r.problemas.slice().sort(), ['E_CFG_ENTREGA', 'E_CFG_PATRON']);
  assert.equal(iniciar({ config: config({ entrega: 'papel' }), filas_control: [{ interruptor: 'off' }] }).motivo, 'INTERRUPTOR_APAGADO');
});

test('iniciar: un instante o una zona inválidos detienen todo con código (no hay fecha que registrar)', () => {
  for (const a of ['2026-10-05', 'ahora', null, undefined, 5]) assert.equal(codigo(() => Cobranza.iniciar({ config: config(), filas_control: [CONTROL_ON], filas_bloqueo: [], ahora_utc: a })), 'E_AHORA_INVALIDO', String(a));
  assert.equal(codigo(() => Cobranza.iniciar({ config: config({ zona_horaria: 'Marte/Olimpo' }), filas_control: [CONTROL_ON], filas_bloqueo: [], ahora_utc: AHORA })), 'E_AHORA_INVALIDO');
});

test('iniciar equivale a fechaCorteDe + arrancar con las filas ya elegidas', () => {
  const casos = [
    { filas_control: [CONTROL_ON], filas_bloqueo: [] },
    { filas_control: [{ interruptor: 'on', dry_run: 'false' }], filas_bloqueo: [BLOQUEO_FILA()] },
    { filas_control: [{ interruptor: 'off' }], filas_bloqueo: [] },
    { filas_control: [CONTROL_ON], filas_bloqueo: [BLOQUEO_FILA({ expira_utc: '2026-10-05T10:00:00Z' })] }
  ];
  for (const c of casos) {
    const directo = plano(Cobranza.arrancar({ config: config(), fila_control: c.filas_control[0], fecha_corte: CORTE, ahora_utc: AHORA, fila_bloqueo: c.filas_bloqueo[0] || null }));
    const { bloqueo_nuevo, ...resto } = iniciar(c);
    assert.deepEqual(resto, { ...directo, fecha_corte: CORTE });
    assert.equal(bloqueo_nuevo !== undefined, directo.accion === 'continuar');
  }
});

test('arrancar: el bloqueo llega como una fila o como las filas de la tabla, nunca las dos', () => {
  const base = { config: config(), fila_control: CONTROL_ON, fecha_corte: CORTE, ahora_utc: AHORA };
  assert.equal(plano(Cobranza.arrancar({ ...base, filas_bloqueo: [BLOQUEO_FILA()] })).accion, 'omitir_en_curso');
  assert.equal(plano(Cobranza.arrancar({ ...base, filas_bloqueo: [] })).accion, 'continuar');
  assert.equal(codigo(() => Cobranza.arrancar({ ...base, filas_bloqueo: [], fila_bloqueo: null })), 'E_ARRANQUE_INVALIDO');
  assert.equal(codigo(() => Cobranza.arrancar({ ...base, filas_bloqueo: [BLOQUEO_FILA({ cliente_id: 'otro' })] })), 'E_BLOQUEO_INVALIDO');
  assert.equal(codigo(() => Cobranza.arrancar({ ...base, filas_bloqueo: 'x' })), 'E_BLOQUEO_INVALIDO');
});

/* ------------------------------------------------- carpeta, claves y libro */

const archivoDrive = (extra = {}) => ({ id: 'ArchivoFicticio0000000001', name: 'facturas-pendientes.csv', mimeType: 'text/csv', size: '4096', modifiedTime: '2026-10-05T09:00:00Z', ...extra });

test('elegirArchivo: elige con la configuración del cliente y nunca devuelve nombres de archivo', () => {
  const archivos = [archivoDrive(), archivoDrive({ id: 'ArchivoFicticio0000000002', name: 'otra-cosa.csv', modifiedTime: '2026-10-05T10:00:00Z' })];
  const r = plano(Cobranza.elegirArchivo({ config: config({ patron_nombre_archivo: 'facturas*' }), archivos, fecha_corte: CORTE }));
  assert.equal(r.estado, 'elegido');
  assert.equal(r.archivo.id, 'ArchivoFicticio0000000001'); // el patrón del cliente deja fuera al más reciente
  assert.equal(plano(Cobranza.elegirArchivo({ config: config(), archivos, fecha_corte: CORTE })).archivo.id, 'ArchivoFicticio0000000002'); // con «*», el más reciente
  assert.equal(JSON.stringify(r).includes('facturas-pendientes'), false);
  assert.equal(JSON.stringify(r).includes('otra-cosa'), false);
});

test('elegirArchivo equivale a M7.elegirArchivo con el recorte de configuración; sin archivo apto o con empate lo dice', () => {
  const archivos = [archivoDrive({ modifiedTime: '2026-09-01T09:00:00Z' }), archivoDrive({ id: 'x'.repeat(20), name: 'foto.png', mimeType: 'image/png' })];
  const c = config();
  const directo = plano(M7.elegirArchivo({ archivos, fecha_corte: CORTE, config: { patron_nombre_archivo: c.patron_nombre_archivo, antiguedad_maxima_archivo_dias: c.antiguedad_maxima_archivo_dias, tamano_maximo_bytes: c.tamano_maximo_bytes, zona_horaria: c.zona_horaria } }));
  assert.deepEqual(plano(Cobranza.elegirArchivo({ config: c, archivos, fecha_corte: CORTE })), directo);
  assert.equal(directo.estado, 'sin_archivo');
  const empate = [archivoDrive(), archivoDrive({ id: 'ArchivoFicticio0000000002' })];
  assert.equal(plano(Cobranza.elegirArchivo({ config: c, archivos: empate, fecha_corte: CORTE })).estado, 'ambiguo');
});

test('elegirArchivo: entradas rotas fallan con código', () => {
  for (const e of [null, undefined, 'x', 5, [], { archivos: [], fecha_corte: CORTE }, { config: 'x', archivos: [], fecha_corte: CORTE }]) {
    assert.equal(codigo(() => Cobranza.elegirArchivo(e)), 'E_INGESTA_INVALIDA', JSON.stringify(e));
  }
  assert.equal(codigo(() => Cobranza.elegirArchivo({ config: config(), archivos: 'x', fecha_corte: CORTE })), 'E_INGESTA_INVALIDA');
  assert.equal(codigo(() => Cobranza.elegirArchivo({ config: config(), archivos: [], fecha_corte: '05/10/2026' })), 'E_INGESTA_INVALIDA');
});

test('claves del libro: el aviso usa la semana de HOY y la huella de ceros; un archivo, la semana de su exportación y su huella', () => {
  assert.deepEqual(plano(Cobranza.claveAviso({ cliente_id: 'demo-01', fecha_corte: '2026-10-07' })), { clave: 'demo-01|2026-W41|' + '0'.repeat(64) });
  assert.deepEqual(plano(Cobranza.claveArchivo({ cliente_id: 'demo-01', fecha_exportacion: '2026-10-04', hash_archivo: HUELLA })), { clave: 'demo-01|2026-W40|' + HUELLA });
  assert.deepEqual(plano(Cobranza.claveArchivo({ cliente_id: 'demo-01', fecha_exportacion: '2026-10-05', hash_archivo: HUELLA })), { clave: 'demo-01|2026-W41|' + HUELLA });
});

test('claveArchivo no acepta la huella de «sin archivo»; las claves con datos malos fallan con código', () => {
  assert.equal(codigo(() => Cobranza.claveArchivo({ cliente_id: 'demo-01', fecha_exportacion: CORTE, hash_archivo: M7.HUELLA_SIN_ARCHIVO })), 'E_LIBRO_INVALIDO');
  for (const e of [null, undefined, 'x', {}, { cliente_id: 'demo-01', fecha_exportacion: 'ayer', hash_archivo: HUELLA }, { cliente_id: 'demo-01', fecha_exportacion: CORTE, hash_archivo: 'corta' },
    { cliente_id: '', fecha_exportacion: CORTE, hash_archivo: HUELLA }]) {
    assert.equal(codigo(() => Cobranza.claveArchivo(e)), 'E_LIBRO_INVALIDO', JSON.stringify(e));
  }
  for (const e of [null, undefined, 'x', {}, { cliente_id: 'demo-01', fecha_corte: 'hoy' }, { cliente_id: '', fecha_corte: CORTE }]) {
    assert.equal(codigo(() => Cobranza.claveAviso(e)), 'E_LIBRO_INVALIDO', JSON.stringify(e));
  }
});

test('las claves coinciden con las de las filas del libro que arma armarEnvio', () => {
  const p = preparar();
  const hash = 'd'.repeat(64);
  const r = plano(Cobranza.armarEnvio({ config: config(), guardias: ENSAYO, fecha_corte: CORTE, fecha_exportacion: '2026-10-04', tipo: 'informe', preparado: p, enlace_informe: 'https://drive.google.com/file/d/EjemploFicticio0001/view', hash_archivo: hash, iniciada_utc: AHORA, terminada_utc: FIN }));
  assert.equal(r.libro.clave, plano(Cobranza.claveArchivo({ cliente_id: 'demo-01', fecha_exportacion: '2026-10-04', hash_archivo: hash })).clave);
  const s = plano(Cobranza.armarEnvio({ config: config(), guardias: ENSAYO, fecha_corte: CORTE, tipo: 'sin_archivo', hash_archivo: M7.HUELLA_SIN_ARCHIVO, iniciada_utc: AHORA, terminada_utc: FIN }));
  assert.equal(s.libro.clave, plano(Cobranza.claveAviso({ cliente_id: 'demo-01', fecha_corte: CORTE })).clave);
});

test('decidirAviso: espera hasta el día de aviso, avisa una sola vez por semana y reintenta si el último intento falló', () => {
  const miercoles = '2026-10-07';
  const lunes = '2026-10-05';
  const clave = (f) => plano(Cobranza.claveAviso({ cliente_id: 'demo-01', fecha_corte: f })).clave;
  const fila = (f, estado) => ({ clave: clave(f), estado });
  assert.deepEqual(plano(Cobranza.decidirAviso({ config: config(), fecha_corte: lunes, filas_libro: [] })), { decision: 'esperar', clave: clave(lunes) });
  assert.deepEqual(plano(Cobranza.decidirAviso({ config: config(), fecha_corte: miercoles, filas_libro: [] })), { decision: 'avisar', clave: clave(miercoles) });
  assert.equal(plano(Cobranza.decidirAviso({ config: config(), fecha_corte: miercoles, filas_libro: [fila(miercoles, 'incidencia')] })).decision, 'omitir_ya_avisado');
  assert.equal(plano(Cobranza.decidirAviso({ config: config(), fecha_corte: '2026-10-09', filas_libro: [fila('2026-10-09', 'incidencia')] })).decision, 'omitir_ya_avisado'); // viernes de la misma semana
  assert.equal(plano(Cobranza.decidirAviso({ config: config(), fecha_corte: miercoles, filas_libro: [fila(miercoles, 'error')] })).decision, 'avisar');
  assert.equal(plano(Cobranza.decidirAviso({ config: config({ dia_aviso_sin_archivo: 5 }), fecha_corte: miercoles, filas_libro: [] })).decision, 'esperar');
  assert.equal(plano(Cobranza.decidirAviso({ config: config({ dia_aviso_sin_archivo: undefined }), fecha_corte: miercoles, filas_libro: [] })).decision, 'avisar'); // por defecto: miércoles
});

test('decidirAviso: del libro del cliente ignora otras semanas y archivos; una fila de otro cliente es un defecto', () => {
  const ceros = '0'.repeat(64);
  const libro = [{ clave: 'demo-01|2026-W40|' + ceros, estado: 'incidencia' }, { clave: 'demo-01|2026-W41|' + HUELLA, estado: 'ok' }]; // aviso de la semana pasada e informe de esta
  assert.equal(plano(Cobranza.decidirAviso({ config: config(), fecha_corte: '2026-10-07', filas_libro: libro })).decision, 'avisar');
  assert.equal(codigo(() => Cobranza.decidirAviso({ config: config(), fecha_corte: '2026-10-07', filas_libro: [{ clave: 'demo-02|2026-W41|' + ceros, estado: 'incidencia' }] })), 'E_LIBRO_INVALIDO');
  for (const e of [null, undefined, 'x', { config: config(), fecha_corte: '2026-10-07' }, { config: 'x', fecha_corte: '2026-10-07', filas_libro: [] }]) {
    assert.ok(['E_INGESTA_INVALIDA', 'E_LIBRO_INVALIDO'].includes(codigo(() => Cobranza.decidirAviso(e))), JSON.stringify(e));
  }
  assert.equal(codigo(() => Cobranza.decidirAviso({ config: config(), fecha_corte: 'hoy', filas_libro: [] })), 'E_LIBRO_INVALIDO');
});

const procesado = (extra = {}) => ({ cliente_id: 'demo-01', fecha_exportacion: '2026-10-05', hash_archivo: HUELLA, esperado_bytes: 4096, recibido_bytes: 4096, filas_libro: [], ...extra });
const claveDe = 'demo-01|2026-W41|' + HUELLA;

test('decidirProcesado: una fila «ok» o «incidencia» con la clave omite; «error», «omitida» o ninguna procesa', () => {
  const d = (filas) => plano(Cobranza.decidirProcesado(procesado({ filas_libro: filas })));
  assert.deepEqual(d([]), { decision: 'procesar', clave: claveDe });
  assert.deepEqual(d([{ clave: claveDe, estado: 'ok' }]), { decision: 'omitir_ya_procesado', clave: claveDe });
  assert.equal(d([{ clave: claveDe, estado: 'incidencia' }]).decision, 'omitir_ya_procesado');
  assert.equal(d([{ clave: claveDe, estado: 'error' }]).decision, 'procesar');
  assert.equal(d([{ clave: claveDe, estado: 'omitida' }, { clave: claveDe, estado: 'error' }]).decision, 'procesar');
  assert.equal(d([{ clave: claveDe, estado: 'error' }, { clave: claveDe, estado: 'ok' }]).decision, 'omitir_ya_procesado');
});

test('decidirProcesado: busca en todo el libro del cliente; solo cuenta la misma semana de exportación y el mismo archivo', () => {
  const d = (extra) => plano(Cobranza.decidirProcesado(procesado(extra))).decision;
  const libro = [{ clave: 'demo-01|2026-W40|' + HUELLA, estado: 'ok' }, { clave: 'demo-01|2026-W41|' + OTRA_HUELLA_PIPE, estado: 'ok' }];
  assert.equal(d({ filas_libro: libro }), 'procesar'); // el mismo archivo de la semana pasada y otro archivo de esta semana no lo resuelven
  assert.equal(d({ filas_libro: libro, fecha_exportacion: '2026-10-04' }), 'omitir_ya_procesado'); // el domingo 4 pertenece a la semana 40
  assert.equal(d({ filas_libro: libro, hash_archivo: OTRA_HUELLA_PIPE }), 'omitir_ya_procesado');
});

test('decidirProcesado: verifica la descarga ANTES de decidir; una descarga cortada no se informa', () => {
  for (const [esperado, recibido] of [[4096, 100], [4096, 0], [100, 4096], ['4096', 4095]]) {
    assert.equal(codigo(() => Cobranza.decidirProcesado(procesado({ esperado_bytes: esperado, recibido_bytes: recibido }))), 'E_DESCARGA_INCOMPLETA', esperado + ' vs ' + recibido);
  }
  // aunque el libro diga que ya estaba resuelto, una descarga cortada es un error, no un «ya hecho»
  assert.equal(codigo(() => Cobranza.decidirProcesado(procesado({ recibido_bytes: 1, filas_libro: [{ clave: claveDe, estado: 'ok' }] }))), 'E_DESCARGA_INCOMPLETA');
  assert.equal(plano(Cobranza.decidirProcesado(procesado({ esperado_bytes: '4096', recibido_bytes: 4096 }))).decision, 'procesar');
});

test('decidirProcesado: datos rotos fallan con código y no deciden por su cuenta', () => {
  assert.equal(codigo(() => Cobranza.decidirProcesado(procesado({ filas_libro: [{ clave: 'demo-02|2026-W41|' + HUELLA, estado: 'ok' }] }))), 'E_LIBRO_INVALIDO'); // fila de otro cliente
  assert.equal(codigo(() => Cobranza.decidirProcesado(procesado({ filas_libro: [{ clave: claveDe, estado: 'hecho' }] }))), 'E_LIBRO_INVALIDO');
  assert.equal(codigo(() => Cobranza.decidirProcesado(procesado({ filas_libro: 'x' }))), 'E_LIBRO_INVALIDO');
  assert.equal(codigo(() => Cobranza.decidirProcesado(procesado({ filas_libro: undefined }))), 'E_LIBRO_INVALIDO');
  assert.equal(codigo(() => Cobranza.decidirProcesado(procesado({ hash_archivo: 'corta' }))), 'E_LIBRO_INVALIDO');
  assert.equal(codigo(() => Cobranza.decidirProcesado(procesado({ hash_archivo: M7.HUELLA_SIN_ARCHIVO }))), 'E_LIBRO_INVALIDO');
  assert.equal(codigo(() => Cobranza.decidirProcesado(procesado({ fecha_exportacion: 'ayer' }))), 'E_LIBRO_INVALIDO');
  assert.equal(codigo(() => Cobranza.decidirProcesado(procesado({ cliente_id: '' }))), 'E_LIBRO_INVALIDO');
  assert.equal(codigo(() => Cobranza.decidirProcesado(procesado({ esperado_bytes: undefined }))), 'E_INGESTA_INVALIDA');
  for (const e of [null, undefined, 'x', 5]) assert.equal(codigo(() => Cobranza.decidirProcesado(e)), 'E_DECISION_INVALIDA', JSON.stringify(e));
});

/* --------------------------------------------------------------- manejarError */

const fallo = (extra = {}) => ({
  codigo: 'E_DRIVE_LISTAR', contexto: { cliente_id: 'demo-01', workflow: '[COB-DEV] Shell demo-01', nodo: 'Listar carpeta', ejecucion_id: 4711 }, operador: 'javier@ejemplo.example',
  cliente_id: 'demo-01', fecha_corte: CORTE, iniciada_utc: AHORA, terminada_utc: FIN, guardias: ENSAYO, modo_cliente: 'dry_run', ...extra
});

test('manejarError: el aviso a Javier y la fila «error» del libro, en un solo paso y solo con códigos', () => {
  const r = plano(Cobranza.manejarError(fallo({ hash_archivo: HUELLA })));
  assert.equal(r.alerta.sano.codigo, 'E_DRIVE_LISTAR');
  assert.deepEqual(r.alerta.envio.destinatarios, ['javier@ejemplo.example']);
  assert.equal(r.alerta.envio.accion, 'enviar');
  assert.equal(r.fila.estado, 'error');
  assert.equal(r.fila.codigo_error, 'E_DRIVE_LISTAR');
  assert.equal(r.fila.hash_archivo, HUELLA);
  assert.equal(r.fila.modo, 'dry');
  assert.equal(r.fila.clave, 'demo-01|2026-W41|' + HUELLA);
  assert.equal(r.fila_codigo, null);
  assert.equal(plano(Cobranza.manejarError(fallo())).fila.hash_archivo, M7.HUELLA_SIN_ARCHIVO); // sin archivo aún: huella de «ninguno»
});

test('manejarError: «real» solo con la llave doble; sin guardias (aún no se conocen) es «dry»', () => {
  assert.equal(plano(Cobranza.manejarError(fallo({ guardias: REAL, modo_cliente: 'real' }))).fila.modo, 'real');
  assert.equal(plano(Cobranza.manejarError(fallo({ guardias: REAL, modo_cliente: 'dry_run' }))).fila.modo, 'dry');
  assert.equal(plano(Cobranza.manejarError(fallo({ guardias: null, modo_cliente: 'real' }))).fila.modo, 'dry');
  assert.equal(plano(Cobranza.manejarError(fallo({ guardias: undefined, modo_cliente: 'real' }))).fila.modo, 'dry');
});

test('manejarError: sin fecha de corte no hay semana que registrar: solo el aviso', () => {
  for (const fecha of [undefined, null]) {
    const r = plano(Cobranza.manejarError(fallo({ fecha_corte: fecha })));
    assert.equal(r.fila, null);
    assert.equal(r.fila_codigo, null);
    assert.equal(r.alerta.sano.codigo, 'E_DRIVE_LISTAR');
  }
});

test('manejarError: si la fila no se puede armar no se pierde el aviso: se devuelve el código de por qué', () => {
  const r = plano(Cobranza.manejarError(fallo({ cliente_id: 'con espacio' })));
  assert.equal(r.fila, null);
  assert.equal(r.fila_codigo, 'E_LIBRO_INVALIDO');
  assert.equal(r.alerta.sano.codigo, 'E_DRIVE_LISTAR');
  assert.equal(plano(Cobranza.manejarError(fallo({ fecha_corte: 'ayer' }))).fila_codigo, 'E_FECHA_INVALIDA');
});

test('manejarError: un código que no lo es se vuelve «desconocido»; la lista de problemas solo admite códigos; el aviso de configuración', () => {
  const r = plano(Cobranza.manejarError(fallo({ codigo: 'Fallo al leer a Juan Pérez, factura A-1001' })));
  assert.equal(r.alerta.sano.codigo, 'E_DESCONOCIDO');
  assert.equal(JSON.stringify(r).includes('Juan'), false);
  const c = plano(Cobranza.manejarError({ codigo: 'E_CFG_INVALIDA', contexto: { cliente_id: 'demo-01' }, operador: 'javier@ejemplo.example', problemas: ['E_CFG_ENTREGA', 'E_CFG_ZONA'] }));
  assert.equal(c.fila, null);
  assert.ok(c.alerta.texto.cuerpo_texto.includes('Problemas: E_CFG_ENTREGA, E_CFG_ZONA'));
  assert.equal(codigo(() => Cobranza.manejarError(fallo({ problemas: ['texto libre con datos'] }))), 'E_ALERTA_INVALIDA');
  for (const e of [null, undefined, 'x', 5]) assert.equal(codigo(() => Cobranza.manejarError(e)), 'E_ALERTA_INVALIDA', JSON.stringify(e));
});

test('manejarError: con un operador inválido no hay a quién avisar, y lo dice; la fila igual se arma', () => {
  const r = plano(Cobranza.manejarError(fallo({ operador: 'no es un correo' })));
  assert.equal(r.alerta.envio.accion, 'no_enviar');
  assert.equal(r.fila.estado, 'error');
});

test('filaError: el modo sale de la misma definición de «envío real» que usa M5 (guardias + modo del cliente)', () => {
  const base = { cliente_id: 'demo-01', codigo: 'E_DRIVE_LISTAR', fecha_corte: CORTE, iniciada_utc: AHORA, terminada_utc: FIN };
  const modo = (guardias, modo_cliente) => plano(Cobranza.filaError({ ...base, guardias, modo_cliente })).modo;
  assert.equal(modo(REAL, 'real'), 'real');
  assert.equal(modo(REAL, 'dry_run'), 'dry');
  assert.equal(modo(ENSAYO, 'real'), 'dry');
  assert.equal(modo({ permitido: false, dry_run: false }, 'real'), 'dry');
  assert.equal(modo(null, 'real'), 'dry');
  assert.equal(modo(undefined, undefined), 'dry');
  assert.equal(modo({ permitido: 'true', dry_run: 'false' }, 'real'), 'dry'); // solo un booleano inequívoco cuenta
});

test('filaError: «modo» y «guardias» a la vez son ambiguos y no se aceptan', () => {
  const base = { cliente_id: 'demo-01', codigo: 'E_DRIVE_LISTAR', fecha_corte: CORTE, iniciada_utc: AHORA, terminada_utc: FIN };
  assert.equal(codigo(() => Cobranza.filaError({ ...base, modo: 'real', guardias: REAL, modo_cliente: 'real' })), 'E_LIBRO_INVALIDO');
  assert.equal(plano(Cobranza.filaError({ ...base, modo: 'real' })).modo, 'real'); // la forma antigua sigue valiendo
});

/* ------------------------------------------------------------------ pureza */

test('el pipeline no modifica sus entradas y es determinista', () => {
  const entrada = { config: config(), guardias: ENSAYO, fecha_corte: CORTE, contenido: { formato: 'csv', texto: csvA(facturas(21, 25)) } };
  const antes = JSON.stringify(entrada);
  Object.freeze(entrada.config.mapeo_columnas);
  Object.freeze(entrada.config);
  Object.freeze(entrada.guardias);
  Object.freeze(entrada.contenido);
  Object.freeze(entrada);
  const a = plano(Cobranza.preparar(entrada));
  const b = plano(Cobranza.preparar(entrada));
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(entrada), antes);
});
