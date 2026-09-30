/* ==========================================================================
   Cobranza · cableado de los módulos. PURO (usa Util y M0 a M7).

   Es la traducción a funciones de lo que hará el shell de n8n: el shell solo hace entrada y salida
   (leer la carpeta, leer y escribir tablas, enviar el correo) y entre un paso y otro llama a estas
   funciones con los mismos datos. Así el orden de los pasos y las decisiones se prueban aquí, sin n8n.

   Orden de una ejecución:
     validarConfiguracion → arrancar → (tomar bloqueo) → M7.elegirArchivo → (descargar, huella)
       → M6.decidirEjecucion → preparar → (subir el informe, si aplica) → armarEnvio → (enviar)
       → (insertar la fila del libro, soltar el bloqueo)
   Si algo falla: alertaOperador (a Javier, solo códigos) + filaError.

   Garantías de este archivo:
   · La configuración se valida ENTERA antes de tocar un dato del cliente.
   · El destinatario sale de la lista blanca de la configuración, jamás del archivo.
   · La fila del libro se construye (y valida) ANTES de enviar: si es inválida, no se envía nada.
   · Lo que se dice a Javier son códigos; lo que se dice al dueño sale de textos fijos o de M4.
   ========================================================================== */
var Cobranza = (function () {
  'use strict';

  function esObjeto(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  function copiaConCorte(config, fechaCorte) {
    var c = {};
    Object.keys(config).forEach(function (k) { c[k] = config[k]; });
    c.fecha_corte = fechaCorte;
    return c;
  }

  function configIngesta(config) {
    return {
      patron_nombre_archivo: config.patron_nombre_archivo,
      antiguedad_maxima_archivo_dias: config.antiguedad_maxima_archivo_dias,
      tamano_maximo_bytes: config.tamano_maximo_bytes,
      zona_horaria: config.zona_horaria
    };
  }

  /* ------------------------------------------------------- configuración */

  // Revisa todo lo que puede estar mal en la configuración de un cliente y devuelve los códigos juntos.
  // No mira ningún dato del cliente. Si no está bien, la ejecución no empieza.
  function validarConfiguracion(config, fechaCorte) {
    if (!esObjeto(config)) return { ok: false, problemas: ['E_CFG_CLIENTE'] };
    var problemas = M0.validarConfigCliente(config).problemas.slice();
    function probar(fn) { try { fn(); } catch (err) { problemas.push(Util.codigoDe(err)); } }
    if (!Util.esISO(fechaCorte)) problemas.push('E_FECHA_CORTE_INVALIDA');
    else {
      probar(function () { M1.validarConfig(copiaConCorte(config, fechaCorte)); });
      probar(function () {
        var a = M2.calcularAntiguedad({ facturas: [], fecha_corte: fechaCorte, tramos: config.tramos, escalones: config.escalones });
        var plantillas = M3.validarPlantillas(config.plantillas);
        // cada escalón necesita su plantilla: si no, el primer atraso de ese tramo detendría todo
        a.escalones.forEach(function (e) { if (!plantillas[e.nombre]) Util.fallar('E_PLANTILLA_FALTANTE'); });
      });
    }
    probar(function () { M3.validarEmpresa(config.empresa); });
    probar(function () { M7.validarConfig(configIngesta(config)); });
    probar(function () {
      if (config.dia_aviso_sin_archivo !== undefined && !(Number.isInteger(config.dia_aviso_sin_archivo) && config.dia_aviso_sin_archivo >= 1 && config.dia_aviso_sin_archivo <= 7)) Util.fallar('E_CFG_DIA_AVISO');
    });
    var unicos = problemas.filter(function (p, i) { return problemas.indexOf(p) === i; });
    return { ok: unicos.length === 0, problemas: unicos };
  }

  // Fecha local del cliente (AAAA-MM-DD) del instante UTC «ahora». Es la fecha de corte de la ejecución.
  function fechaCorteDe(ahoraUtc, zona) {
    if (typeof ahoraUtc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(ahoraUtc)) Util.fallar('E_AHORA_INVALIDO');
    var f = Util.fechaEnZona(ahoraUtc, zona);
    if (f === null || !Util.esISO(f)) Util.fallar('E_AHORA_INVALIDO');
    return f;
  }

  /* ------------------------------------------------------------- arranque */

  /* e: { config, fila_control, fecha_corte, ahora_utc, fila_bloqueo }
     → { accion: 'continuar' | 'detener' | 'omitir_en_curso' | 'alertar_bloqueo_vencido', motivo, problemas, guardias }
     El orden importa: primero los interruptores, después la configuración y al final el bloqueo. */
  function arrancar(e) {
    if (!esObjeto(e)) Util.fallar('E_ARRANQUE_INVALIDO');
    var guardias = M0.evaluarGuardias(e.fila_control);
    if (!guardias.permitido) return { accion: 'detener', motivo: guardias.motivo, problemas: [], guardias: guardias };
    var cfg = validarConfiguracion(e.config, e.fecha_corte);
    if (!cfg.ok) return { accion: 'detener', motivo: 'CONFIG_INVALIDA', problemas: cfg.problemas, guardias: guardias };
    var bloqueo = M6.estadoBloqueo(e.fila_bloqueo === undefined ? null : e.fila_bloqueo, e.ahora_utc);
    var decision = M6.decidirEjecucion({ ya_resuelto: false, bloqueo: bloqueo });
    if (decision === 'procesar') return { accion: 'continuar', motivo: null, problemas: [], guardias: guardias };
    return { accion: decision, motivo: decision === 'omitir_en_curso' ? 'BLOQUEO_ACTIVO' : 'BLOQUEO_VENCIDO', problemas: [], guardias: guardias };
  }

  /* ------------------------------------------------------------- preparar */

  /* e: { config, guardias, fecha_corte, contenido: { formato: 'csv', texto } | { formato: 'filas', filas }, demo? }
     → { tipo: 'informe', informe, conteos, ensayo } | { tipo: 'incidencia', codigo, aviso, conteos, ensayo } */
  function preparar(e) {
    if (!esObjeto(e) || !esObjeto(e.config) || !Util.esISO(e.fecha_corte) || !esObjeto(e.contenido)) Util.fallar('E_PREPARAR_INVALIDO');
    var config = e.config;
    var ensayo = !M5.esEnvioReal(e.guardias, config.modo);
    var cfgLectura = copiaConCorte(config, e.fecha_corte);
    var lectura;
    if (e.contenido.formato === 'csv') lectura = M1.normalizarCSV(e.contenido.texto, cfgLectura);
    else if (e.contenido.formato === 'filas') lectura = M1.normalizarObjetos(e.contenido.filas, cfgLectura);
    else Util.fallar('E_PREPARAR_INVALIDO');

    var conteos = { n_filas: lectura.resumen.total, n_vencidas: 0, n_apartadas: lectura.resumen.apartadas };
    if (lectura.resumen.bloquear) {
      return {
        tipo: 'incidencia', codigo: lectura.resumen.motivo_bloqueo,
        aviso: M4.armarAvisoIncidencia({ fecha_corte: e.fecha_corte, empresa: config.empresa, lectura: lectura, ensayo: ensayo }),
        conteos: conteos, ensayo: ensayo
      };
    }
    var demo = e.demo === true;
    var antiguedad = M2.calcularAntiguedad({ facturas: lectura.facturas, fecha_corte: e.fecha_corte, tramos: config.tramos, escalones: config.escalones });
    var borradores = M3.generarBorradores({ vencidas: antiguedad.vencidas, empresa: config.empresa, plantillas: config.plantillas, opciones: { demo: demo } });
    var informe = M4.armarInforme({
      fecha_corte: e.fecha_corte, empresa: config.empresa, antiguedad: antiguedad, borradores: borradores, lectura: lectura,
      opciones: { demo: demo, ensayo: ensayo, max_filas_informe: config.max_filas_informe }
    });
    conteos.n_vencidas = antiguedad.vencidas.length;
    return { tipo: 'informe', informe: informe, conteos: conteos, ensayo: ensayo };
  }

  /* ------------------------------------------------------------ armarEnvio */

  var SIN_CONTEOS = { n_filas: 0, n_vencidas: 0, n_apartadas: 0 };

  /* e: { config, guardias, fecha_corte, tipo: 'informe' | 'incidencia' | 'sin_archivo', preparado?, enlace_informe?,
          hash_archivo, iniciada_utc, terminada_utc }
     → { correo: { asunto, cuerpo_texto, adjunto? }, envio: { accion, destinatarios, motivos, bloqueados }, libro }
     Lanza E_ENVIO_<motivo> si la guardia de envío no deja enviar. */
  function armarEnvio(e) {
    if (!esObjeto(e) || !esObjeto(e.config) || !Util.esISO(e.fecha_corte)) Util.fallar('E_ENVIO_INVALIDO');
    var config = e.config;
    var real = M5.esEnvioReal(e.guardias, config.modo);
    var ensayo = !real;
    var p = e.preparado;
    if ((e.tipo === 'informe' || e.tipo === 'incidencia') && (!esObjeto(p) || p.tipo !== e.tipo || p.ensayo !== ensayo)) Util.fallar('E_INCONSISTENCIA_ENSAYO');

    var correo, estado, codigoError = null, conteos, hash = e.hash_archivo;
    if (e.tipo === 'informe') {
      if (config.entrega === 'enlace_salida') {
        correo = M4.armarCorreoConEnlace({ asunto: p.informe.asunto, texto_resumen: p.informe.texto_resumen, enlace: e.enlace_informe, ensayo: ensayo });
      } else {
        correo = {
          asunto: p.informe.asunto, cuerpo_texto: p.informe.texto_resumen,
          adjunto: { nombre: p.informe.nombre_archivo, tipo: 'text/html', contenido: p.informe.html_completo }
        };
      }
      estado = 'ok'; conteos = p.conteos;
    } else if (e.tipo === 'incidencia') {
      correo = { asunto: p.aviso.asunto, cuerpo_texto: p.aviso.cuerpo_texto };
      estado = 'incidencia'; codigoError = p.codigo; conteos = p.conteos;
    } else if (e.tipo === 'sin_archivo') {
      var aviso = M4.armarAvisoSinArchivo({ fecha_corte: e.fecha_corte, empresa: config.empresa, ensayo: ensayo });
      correo = { asunto: aviso.asunto, cuerpo_texto: aviso.cuerpo_texto };
      estado = 'incidencia'; codigoError = 'E_SIN_ARCHIVO'; conteos = SIN_CONTEOS; hash = M7.HUELLA_SIN_ARCHIVO;
    } else Util.fallar('E_ENVIO_INVALIDO');

    // El destinatario sale SOLO de la configuración. Lo que diga el archivo del cliente no interviene.
    var envio = M5.guardiaEnvio({
      solicitados: config.destinatarios_permitidos, lista_blanca: config.destinatarios_permitidos,
      guardias: e.guardias, modo_cliente: config.modo, remitente_prueba: config.remitente_prueba
    });
    if (envio.accion === 'no_enviar') Util.fallar('E_ENVIO_' + envio.motivos[0]);
    if ((envio.accion === 'enviar') !== real) Util.fallar('E_INCONSISTENCIA_ENSAYO'); // dos definiciones de «real» que no coinciden

    if (ensayo) {
      correo = {
        asunto: correo.asunto,
        cuerpo_texto: '[ENSAYO] En modo real este mensaje se enviaría a: ' + config.destinatarios_permitidos.join(', ') + '.\n\n' + correo.cuerpo_texto,
        adjunto: correo.adjunto
      };
    }
    if (correo.adjunto === undefined) delete correo.adjunto;

    // La fila del libro se valida ahora, antes de enviar: una fila inválida detiene el envío, no lo sigue.
    var libro = M6.filaLibro({
      cliente_id: config.cliente_id, semana_iso: Util.semanaISO(e.fecha_corte), hash_archivo: hash, estado: estado,
      iniciada_utc: e.iniciada_utc, terminada_utc: e.terminada_utc,
      n_filas: conteos.n_filas, n_vencidas: conteos.n_vencidas, n_apartadas: conteos.n_apartadas,
      codigo_error: codigoError, modo: ensayo ? 'dry' : 'real'
    });
    return { correo: correo, envio: envio, libro: libro };
  }

  /* --------------------------------------------------------------- errores */

  /* e: { error, contexto: { cliente_id, workflow, nodo, ejecucion_id }, operador }
     → { sano, texto: { asunto, cuerpo_texto }, envio }   Todo lo que va a Javier son códigos. */
  function alertaOperador(e) {
    if (!esObjeto(e)) Util.fallar('E_ALERTA_INVALIDA');
    var sano = M6.sanearError(e.error, e.contexto);
    var texto = M6.textoAlerta(sano);
    // La alerta va solo a Javier; no depende del ensayo (no lleva datos del cliente) pero pasa por la misma guardia.
    var envio = M5.guardiaEnvio({
      solicitados: [e.operador], lista_blanca: [e.operador], guardias: { permitido: true, dry_run: false }, modo_cliente: 'real'
    });
    return { sano: sano, texto: texto, envio: envio };
  }

  /* e: { cliente_id, codigo, fecha_corte, hash_archivo?, iniciada_utc, terminada_utc, modo? } → fila del libro con estado «error» */
  function filaError(e) {
    if (!esObjeto(e)) Util.fallar('E_LIBRO_INVALIDO');
    return M6.filaLibro({
      cliente_id: e.cliente_id, semana_iso: Util.semanaISO(e.fecha_corte), hash_archivo: e.hash_archivo === undefined ? M7.HUELLA_SIN_ARCHIVO : e.hash_archivo,
      estado: 'error', iniciada_utc: e.iniciada_utc, terminada_utc: e.terminada_utc,
      n_filas: 0, n_vencidas: 0, n_apartadas: 0, codigo_error: e.codigo, modo: e.modo === 'real' ? 'real' : 'dry'
    });
  }

  return {
    validarConfiguracion: validarConfiguracion, fechaCorteDe: fechaCorteDe, arrancar: arrancar, preparar: preparar,
    armarEnvio: armarEnvio, alertaOperador: alertaOperador, filaError: filaError
  };
})();
