/* ==========================================================================
   M6 · Registro, alertas y control de ejecuciones. Módulo PURO (usa solo Util).

   Lo que se guarda o se envía a Javier sobre una ejecución no puede contener datos del cliente:
   · sanearError: convierte un error en {cliente, workflow, nodo, CÓDIGO, ejecución}; el mensaje libre
     del error se descarta siempre.
   · filaLibro: fila del libro de ejecuciones con columnas fijas y valores validados (contadores, huella,
     fechas, códigos). Una columna de más, o un valor con forma de texto libre, es un error.
   · claveEjecucion / decidirEjecucion / estadoBloqueo: idempotencia y bloqueo como funciones puras,
     para probarlas a fondo; el flujo solo conecta las tablas de datos.
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
    s = s.replace(/[^A-Za-z0-9À-ÿ _.:()\[\]\/·-]/g, '?');
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

  return {
    ESTADOS: ESTADOS, MODOS: MODOS, CLAVES_LIBRO: CLAVES_LIBRO,
    sanearError: sanearError, textoAlerta: textoAlerta, claveEjecucion: claveEjecucion, filaLibro: filaLibro,
    estadoBloqueo: estadoBloqueo, decidirEjecucion: decidirEjecucion
  };
})();
