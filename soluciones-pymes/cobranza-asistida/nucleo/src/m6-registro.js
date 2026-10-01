/* ==========================================================================
   M6 · Registro, alertas y control de ejecuciones. Módulo PURO (usa solo Util).

   Lo que se guarda o se envía a Javier sobre una ejecución no puede contener datos del cliente:
   · sanearError: convierte un error en {cliente, workflow, nodo, CÓDIGO, ejecución}; el mensaje libre
     del error se descarta siempre.
   · filaLibro: fila del libro de ejecuciones con columnas fijas y valores validados (contadores, huella,
     fechas, códigos). Una columna de más, o un valor con forma de texto libre, es un error.
   · claveEjecucion / decidirEjecucion / estadoBloqueo: idempotencia y bloqueo como funciones puras,
     para probarlas a fondo; el flujo solo conecta las tablas de datos.
   · bloqueoVigente / yaResuelto / filaBloqueo: del contenido de las tablas (filas) a la decisión, y la
     fila de un bloqueo nuevo; el flujo lee y escribe filas, nunca interpreta su significado.
   ========================================================================== */
var M6 = (function () {
  'use strict';

  // ok: informe preparado y entregado · incidencia: se avisó al dueño de un problema con el archivo (o de que no llegó)
  // error: falló algo y se avisó a Javier · omitida: se decidió no hacer nada
  var ESTADOS = ['ok', 'incidencia', 'error', 'omitida'];
  var MODOS = ['dry', 'real'];
  var CLAVES_LIBRO = ['cliente_id', 'semana_iso', 'hash_archivo', 'estado', 'iniciada_utc', 'terminada_utc',
    'n_filas', 'n_vencidas', 'n_apartadas', 'codigo_error', 'modo'];
  var CODIGO_RE = /^E_[A-Z0-9_]{2,40}$/;
  var SEMANA_RE = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/;
  // Instante UTC ISO: «2026-10-05T14:30:00Z», con milésimas opcionales. Hora, minuto y segundo dentro de rango.
  var UTC_RE = /^(\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:\.(\d{1,3}))?Z$/;

  function contador(n) { return typeof n === 'number' && Math.floor(n) === n && n >= 0 && n <= 1000000; }

  function utcValido(s) {
    return typeof s === 'string' && UTC_RE.test(s) && Util.esISO(s.slice(0, 10));
  }

  // Mismo instante, mismo texto: las milésimas van siempre, así dos instantes se comparan como texto sin error
  // («…:00Z» y «…:00.500Z» no se ordenan bien como texto crudo).
  function utcCanonico(s) {
    var m = UTC_RE.exec(s);
    return m[1] + '.' + ((m[2] || '') + '000').slice(0, 3) + 'Z';
  }

  /* ---------------------------------------------------------------- alertas */

  // Nombre de flujo o de nodo: solo letras, números, espacios y unos pocos signos; nada que pueda partir un texto.
  function nombreSeguro(v) {
    var s = Util.limpiar(v).slice(0, 80);
    s = s.replace(/[^A-Za-z0-9\u00c0-\u00ff _.:()\[\]\/\u00b7-]/g, '?');
    return s || 'desconocido';
  }

  function idEjecucion(v) {
    var s = typeof v === 'number' ? String(v) : v;
    return typeof s === 'string' && /^[0-9A-Za-z_-]{1,64}$/.test(s) ? s : 'desconocido';
  }

  function sanearError(error, contexto) {
    var c = contexto && typeof contexto === 'object' ? contexto : {};
    return {
      cliente_id: Util.idValido(c.cliente_id) ? c.cliente_id : 'desconocido',
      workflow: nombreSeguro(c.workflow),
      nodo: nombreSeguro(c.nodo),
      codigo: Util.codigoDe(error),
      ejecucion_id: idEjecucion(c.ejecucion_id)
    };
  }

  function textoAlerta(sano) {
    if (!sano || typeof sano !== 'object' || !CODIGO_RE.test(sano.codigo)) Util.fallar('E_ALERTA_INVALIDA');
    return {
      asunto: 'Error en cobranza · ' + nombreSeguro(sano.cliente_id) + ' · ' + sano.codigo,
      cuerpo_texto: 'Cliente: ' + nombreSeguro(sano.cliente_id) + '\nFlujo: ' + nombreSeguro(sano.workflow) + '\nNodo: ' + nombreSeguro(sano.nodo) +
        '\nCódigo: ' + sano.codigo + '\nEjecución: ' + idEjecucion(sano.ejecucion_id) +
        '\n\nEste aviso no contiene datos del archivo del cliente. Para investigar, reproducir el caso con datos ficticios.'
    };
  }

  /* ------------------------------------------------------------------ libro */

  function claveEjecucion(clienteId, fechaCorte, huella) {
    if (!Util.idValido(clienteId) || !Util.esISO(fechaCorte) || !Util.hex64(huella)) Util.fallar('E_LIBRO_INVALIDO');
    return clienteId + '|' + Util.semanaISO(fechaCorte) + '|' + huella;
  }

  function filaLibro(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) Util.fallar('E_LIBRO_INVALIDO');
    Object.keys(d).forEach(function (k) { if (CLAVES_LIBRO.indexOf(k) < 0) Util.fallar('E_LIBRO_INVALIDO'); }); // ni una columna de más
    var ok = Util.idValido(d.cliente_id) && SEMANA_RE.test(String(d.semana_iso)) && Util.hex64(d.hash_archivo) &&
      ESTADOS.indexOf(d.estado) >= 0 && utcValido(d.iniciada_utc) && utcValido(d.terminada_utc) &&
      contador(d.n_filas) && contador(d.n_vencidas) && contador(d.n_apartadas) && d.n_vencidas + d.n_apartadas <= d.n_filas &&
      (d.codigo_error === null || d.codigo_error === undefined || (typeof d.codigo_error === 'string' && CODIGO_RE.test(d.codigo_error))) &&
      MODOS.indexOf(d.modo) >= 0;
    // un error o una incidencia sin código no sirve para diagnosticar; un «ok» con código es una contradicción
    var conCodigo = d.codigo_error !== null && d.codigo_error !== undefined;
    if (ok && ((d.estado === 'error' || d.estado === 'incidencia') ? !conCodigo : (d.estado === 'ok' && conCodigo))) ok = false;
    if (!ok) Util.fallar('E_LIBRO_INVALIDO');
    return {
      clave: d.cliente_id + '|' + d.semana_iso + '|' + d.hash_archivo,
      cliente_id: d.cliente_id, semana_iso: d.semana_iso, hash_archivo: d.hash_archivo, estado: d.estado,
      iniciada_utc: d.iniciada_utc, terminada_utc: d.terminada_utc,
      n_filas: d.n_filas, n_vencidas: d.n_vencidas, n_apartadas: d.n_apartadas,
      codigo_error: d.codigo_error === undefined ? null : d.codigo_error, modo: d.modo
    };
  }

  /* -------------------------------------------------- bloqueo e idempotencia */

  // fila: { cliente_id, expira_utc } o null. ahora: instante UTC ISO que pasa el flujo.
  function estadoBloqueo(fila, ahora) {
    if (fila === null || fila === undefined) return 'libre';
    if (!utcValido(ahora) || typeof fila !== 'object' || !utcValido(fila.expira_utc)) Util.fallar('E_BLOQUEO_INVALIDO');
    return utcCanonico(fila.expira_utc) > utcCanonico(ahora) ? 'ocupado' : 'vencido';
  }

  // Qué hacer al empezar una ejecución. ya_resuelto: el libro ya tiene, con la misma clave, una fila «ok» o «incidencia».
  function decidirEjecucion(e) {
    if (!e || typeof e.ya_resuelto !== 'boolean' || ['libre', 'ocupado', 'vencido'].indexOf(e.bloqueo) < 0) Util.fallar('E_DECISION_INVALIDA');
    if (e.ya_resuelto) return 'omitir_ya_procesado';
    if (e.bloqueo === 'ocupado') return 'omitir_en_curso';
    if (e.bloqueo === 'vencido') return 'alertar_bloqueo_vencido'; // una ejecución anterior murió: se avisa, no se reintenta sola
    return 'procesar';
  }

  /* ------------------------------------ de las filas de las tablas a una decisión */

  // El flujo lee las tablas y entrega FILAS; estas funciones deciden qué significan. Así ninguna regla vive en un nodo suelto.

  var MAX_FILAS_BLOQUEO = 50;
  var MAX_FILAS_LIBRO = 1000;
  var MINUTOS_BLOQUEO = 30;
  var CLAVE_LIBRO_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}\|\d{4}-W\d{2}\|[0-9a-f]{64}$/;

  function esFila(f) { return f !== null && typeof f === 'object' && !Array.isArray(f); }

  // filas: lo que devuelve la tabla de bloqueos al filtrar por cliente (normalmente 0 o 1; varias solo por una carrera rara).
  // Devuelve la de caducidad más lejana (la más restrictiva) o null si no hay ninguna. Una fila ajena o mal formada es un defecto.
  function bloqueoVigente(filas, clienteId) {
    if (!Util.idValido(clienteId) || !Array.isArray(filas) || filas.length > MAX_FILAS_BLOQUEO) Util.fallar('E_BLOQUEO_INVALIDO');
    var mejor = null;
    filas.forEach(function (f) {
      if (!esFila(f) || f.cliente_id !== clienteId || !utcValido(f.expira_utc)) Util.fallar('E_BLOQUEO_INVALIDO');
      if (mejor === null || utcCanonico(f.expira_utc) > utcCanonico(mejor.expira_utc)) mejor = { cliente_id: f.cliente_id, expira_utc: f.expira_utc };
    });
    return mejor;
  }

  // filas: lo que devuelve el libro al filtrar por CLIENTE (todas sus ejecuciones). «Resuelto» = hay una fila «ok» o «incidencia»
  // con ESA clave (una fila «error» u «omitida» no cuenta: así se reintenta; las de otra semana o archivo del mismo cliente
  // se ignoran). Una fila de OTRO cliente, o sin clave o estado válidos, es un defecto: el filtro del flujo está mal.
  function yaResuelto(filas, clave) {
    if (typeof clave !== 'string' || !CLAVE_LIBRO_RE.test(clave) || !Array.isArray(filas) || filas.length > MAX_FILAS_LIBRO) Util.fallar('E_LIBRO_INVALIDO');
    var cliente = clave.slice(0, clave.indexOf('|'));
    var resuelto = false;
    filas.forEach(function (f) {
      if (!esFila(f) || typeof f.clave !== 'string' || f.clave.indexOf('|') !== cliente.length || f.clave.slice(0, cliente.length) !== cliente || ESTADOS.indexOf(f.estado) < 0) Util.fallar('E_LIBRO_INVALIDO');
      if (f.clave === clave && (f.estado === 'ok' || f.estado === 'incidencia')) resuelto = true;
    });
    return resuelto;
  }

  // e: { cliente_id, ahora_utc, minutos? } → { cliente_id, expira_utc }. Caduca «minutos» después de «ahora» (30 por defecto, de 1 a 240).
  // Aritmética entera sobre el texto del instante, sin reloj ni Date: se descartan las milésimas y se prueba contra un oráculo.
  function filaBloqueo(e) {
    if (!esFila(e) || !Util.idValido(e.cliente_id) || !utcValido(e.ahora_utc)) Util.fallar('E_BLOQUEO_INVALIDO');
    var minutos = e.minutos === undefined ? MINUTOS_BLOQUEO : e.minutos;
    if (!(typeof minutos === 'number' && Math.floor(minutos) === minutos && minutos >= 1 && minutos <= 240)) Util.fallar('E_BLOQUEO_INVALIDO');
    var total = (+e.ahora_utc.slice(11, 13)) * 60 + (+e.ahora_utc.slice(14, 16)) + minutos;
    var dias = Math.floor(total / 1440);
    var resto = total - dias * 1440;
    var fecha = dias > 0 ? Util.sumarDias(e.ahora_utc.slice(0, 10), dias) : e.ahora_utc.slice(0, 10);
    if (!Util.esISO(fecha)) Util.fallar('E_BLOQUEO_INVALIDO'); // pasar de 2099 queda fuera del rango admitido
    return {
      cliente_id: e.cliente_id,
      expira_utc: fecha + 'T' + Util.pad2(Math.floor(resto / 60)) + ':' + Util.pad2(resto % 60) + ':' + e.ahora_utc.slice(17, 19) + 'Z'
    };
  }

  return {
    ESTADOS: ESTADOS, MODOS: MODOS, CLAVES_LIBRO: CLAVES_LIBRO, MINUTOS_BLOQUEO: MINUTOS_BLOQUEO,
    sanearError: sanearError, textoAlerta: textoAlerta, claveEjecucion: claveEjecucion, filaLibro: filaLibro,
    estadoBloqueo: estadoBloqueo, decidirEjecucion: decidirEjecucion,
    bloqueoVigente: bloqueoVigente, yaResuelto: yaResuelto, filaBloqueo: filaBloqueo
  };
})();
