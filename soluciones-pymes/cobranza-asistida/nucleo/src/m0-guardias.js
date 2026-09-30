/* ==========================================================================
   M0 · Guardias globales y validación de la configuración del cliente. Módulo PURO (usa solo Util).

   · evaluarGuardias: convierte los valores guardados en la tabla de control (interruptor general y
     DRY_RUN) en dos booleanos. Ante cualquier valor raro, NO se procesa y se ensaya: el valor por
     defecto es siempre el lado seguro.
   · validarConfigCliente: revisa la parte general de la configuración de un cliente y devuelve TODOS
     los problemas de una vez (como códigos), para que se corrijan juntos. El flujo no arranca si hay
     alguno. Cada módulo valida además su propio trozo (mapeo de columnas, plantillas, tramos…).
   ========================================================================== */
var M0 = (function () {
  'use strict';

  var ENTREGAS = ['correo_completo', 'enlace_salida'];
  var MODOS = ['dry_run', 'real'];
  var MAX_DESTINATARIOS = 3;

  function esObjeto(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  function texto(v) { return typeof v === 'string' ? v.trim().toLowerCase() : ''; }

  // fila: { interruptor: 'on' | 'off' | true | false, dry_run: 'true' | 'false' | true | false }
  function evaluarGuardias(fila) {
    if (!esObjeto(fila)) return { permitido: false, dry_run: true, motivo: 'SIN_DATOS' };
    var i = fila.interruptor;
    var encendido = i === true || texto(i) === 'on';
    var apagado = i === false || texto(i) === 'off';
    var d = fila.dry_run;
    var dryRun = !(d === false || texto(d) === 'false'); // solo un «false» inequívoco desactiva el ensayo
    if (!encendido) return { permitido: false, dry_run: dryRun, motivo: apagado ? 'INTERRUPTOR_APAGADO' : 'INTERRUPTOR_DESCONOCIDO' };
    return { permitido: true, dry_run: dryRun, motivo: null };
  }

  // La zona debe existir de verdad: con una zona mal escrita las fechas con hora no se podrían leer.
  function zonaExiste(z) {
    if (typeof z !== 'string' || !/^[A-Za-z_]+(?:\/[A-Za-z_+-]+){0,2}$/.test(z)) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (e) { return false; }
  }

  function listaDeCorreos(v, problemas, codigoTamano, codigoInvalido) {
    if (!Array.isArray(v) || v.length < 1 || v.length > MAX_DESTINATARIOS) { problemas.push(codigoTamano); return; }
    var vistos = {};
    v.forEach(function (x) {
      // deben venir ya en forma canónica (minúsculas, sin espacios): una lista blanca no se «corrige» sola
      if (typeof x !== 'string' || Util.normalizarCorreo(x) !== x || vistos[x]) problemas.push(codigoInvalido);
      vistos[x] = true;
    });
  }

  function validarConfigCliente(cfg) {
    var problemas = [];
    if (!esObjeto(cfg)) return { ok: false, problemas: ['E_CFG_CLIENTE'] };
    if (!Util.idValido(cfg.cliente_id)) problemas.push('E_CFG_CLIENTE_ID');
    listaDeCorreos(cfg.destinatarios_permitidos, problemas, 'E_CFG_DESTINATARIOS_TAMANO', 'E_CFG_DESTINATARIOS_INVALIDOS');
    if (typeof cfg.remitente_prueba !== 'string' || Util.normalizarCorreo(cfg.remitente_prueba) !== cfg.remitente_prueba) problemas.push('E_CFG_REMITENTE_PRUEBA');
    if (ENTREGAS.indexOf(cfg.entrega) < 0) problemas.push('E_CFG_ENTREGA');
    var modo = cfg.modo === undefined ? 'dry_run' : cfg.modo;
    if (MODOS.indexOf(modo) < 0) problemas.push('E_CFG_MODO');
    if (!zonaExiste(cfg.zona_horaria)) problemas.push('E_CFG_ZONA');
    if (!esObjeto(cfg.empresa) || typeof cfg.empresa.nombre !== 'string' || Util.limpiar(cfg.empresa.nombre) === '' || Util.limpiar(cfg.empresa.nombre).length > 120) problemas.push('E_CFG_EMPRESA');
    if (cfg.umbral_rechazo !== undefined && !(typeof cfg.umbral_rechazo === 'number' && cfg.umbral_rechazo >= 0 && cfg.umbral_rechazo <= 100)) problemas.push('E_CFG_UMBRAL');
    // Con datos reales, el informe completo no viaja por correo salvo que alguien lo acepte de forma explícita.
    if (modo === 'real' && cfg.entrega === 'correo_completo' && cfg.acepta_correo_completo !== true) problemas.push('E_CFG_ENTREGA_REAL');
    var unicos = problemas.filter(function (p, i) { return problemas.indexOf(p) === i; });
    return { ok: unicos.length === 0, problemas: unicos };
  }

  return { MAX_DESTINATARIOS: MAX_DESTINATARIOS, ENTREGAS: ENTREGAS, MODOS: MODOS, evaluarGuardias: evaluarGuardias, validarConfigCliente: validarConfigCliente };
})();
