/* ==========================================================================
   Cobranza · cableado de los módulos. PURO (usa Util y M0 a M7).

   Es la traducción a funciones de lo que hará el shell de n8n: el shell solo hace entrada y salida
   (leer la carpeta, leer y escribir tablas, enviar el correo) y entre un paso y otro llama a estas
   funciones con los mismos datos. Así el orden de los pasos y las decisiones se prueban aquí, sin n8n.

   Orden de una ejecución (entre paréntesis, lo que hace el flujo: entrada y salida):
     (leer control y bloqueos) → iniciar → (tomar el bloqueo con la fila que trae) → (leer el libro del cliente y listar la carpeta)
       → elegirArchivo → (descargar, huella) → decidirProcesado → preparar → (subir el informe, si aplica) → armarEnvio
       → (enviar) → (insertar la fila del libro, soltar el bloqueo)
     Sin archivo: decidirAviso → armarEnvio (tipo «sin_archivo») → (enviar) → (libro, soltar).
   Si algo falla: manejarError (aviso a Javier, solo códigos, y la fila «error» del libro).
   El flujo nunca interpreta filas de tablas ni decide solo: les pasa las filas a estas funciones y obedece.

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

  /* e: { config, fila_control, fecha_corte, ahora_utc, fila_bloqueo | filas_bloqueo }
     → { accion: 'continuar' | 'detener' | 'omitir_en_curso' | 'alertar_bloqueo_vencido', motivo, codigo?, problemas, guardias }
     (con configuración inválida: motivo «CONFIG_INVALIDA», código «E_CFG_INVALIDA» y la lista de problemas)
     El bloqueo llega como UNA fila (fila_bloqueo) o como las filas que devolvió la tabla (filas_bloqueo); nunca las dos.
     El orden importa: primero los interruptores, después la configuración y al final el bloqueo. */
  function arrancar(e) {
    if (!esObjeto(e) || (e.fila_bloqueo !== undefined && e.filas_bloqueo !== undefined)) Util.fallar('E_ARRANQUE_INVALIDO');
    var guardias = M0.evaluarGuardias(e.fila_control);
    if (!guardias.permitido) return { accion: 'detener', motivo: guardias.motivo, problemas: [], guardias: guardias };
    var cfg = validarConfiguracion(e.config, e.fecha_corte);
    if (!cfg.ok) return { accion: 'detener', motivo: 'CONFIG_INVALIDA', codigo: 'E_CFG_INVALIDA', problemas: cfg.problemas, guardias: guardias };
    var fila = e.filas_bloqueo !== undefined ? M6.bloqueoVigente(e.filas_bloqueo, e.config.cliente_id) : (e.fila_bloqueo === undefined ? null : e.fila_bloqueo);
    // el bloqueo de OTRO cliente no dice nada de este: si la fila no es la suya, algo está mal aguas arriba
    if (fila !== null && (!esObjeto(fila) || fila.cliente_id !== e.config.cliente_id)) Util.fallar('E_BLOQUEO_INVALIDO');
    var bloqueo = M6.estadoBloqueo(fila, e.ahora_utc);
    var decision = M6.decidirEjecucion({ ya_resuelto: false, bloqueo: bloqueo });
    if (decision === 'procesar') return { accion: 'continuar', motivo: null, problemas: [], guardias: guardias };
    if (decision === 'omitir_en_curso') return { accion: decision, motivo: 'BLOQUEO_ACTIVO', problemas: [], guardias: guardias };
    return { accion: decision, motivo: 'BLOQUEO_VENCIDO', codigo: 'E_BLOQUEO_VENCIDO', problemas: [], guardias: guardias };
  }

  /* e: { config, filas_control, filas_bloqueo, ahora_utc } → lo de «arrancar» más { fecha_corte } y, si continúa, { bloqueo_nuevo } (la fila
     que hay que escribir para tomar el bloqueo); acción «error» si algo falla con la fecha ya conocida
     Lo primero que hace el flujo cada día: fecha local del cliente, interruptor general y bloqueo. La tabla de control debe
     tener UNA fila; ninguna o varias es una anomalía y no se procesa (falla cerrada, como un interruptor desconocido). */
  function iniciar(e) {
    // sin la lista de filas de bloqueo (aunque sea vacía) no se sabe si hay otra ejecución en curso: no se arranca
    if (!esObjeto(e) || !esObjeto(e.config) || !Array.isArray(e.filas_bloqueo)) Util.fallar('E_ARRANQUE_INVALIDO');
    var fechaCorte = fechaCorteDe(e.ahora_utc, e.config.zona_horaria);
    var control = Array.isArray(e.filas_control) && e.filas_control.length === 1 && esObjeto(e.filas_control[0]) ? e.filas_control[0] : null;
    var r;
    // Desde aquí la fecha ya se conoce: un fallo no se lanza, se devuelve como acción «error» para que el flujo pueda registrarlo en su semana.
    try {
      r = arrancar({ config: e.config, fila_control: control, fecha_corte: fechaCorte, ahora_utc: e.ahora_utc, filas_bloqueo: e.filas_bloqueo });
      if (r.accion === 'continuar') r.bloqueo_nuevo = M6.filaBloqueo({ cliente_id: e.config.cliente_id, ahora_utc: e.ahora_utc });
    } catch (err) {
      r = { accion: 'error', motivo: 'ERROR', codigo: Util.codigoDe(err), problemas: [], guardias: null };
    }
    r.fecha_corte = fechaCorte;
    return r;
  }

  /* ------------------------------------------------------ carpeta y libro */

  /* e: { config, archivos, fecha_corte } → lo de M7.elegirArchivo. Del archivo solo sale el resultado de la elección. */
  function elegirArchivo(e) {
    if (!esObjeto(e) || !esObjeto(e.config)) Util.fallar('E_INGESTA_INVALIDA');
    return M7.elegirArchivo({ archivos: e.archivos, fecha_corte: e.fecha_corte, config: configIngesta(e.config) });
  }

  // Clave del libro del aviso «no llegó»: semana de HOY y la huella de ceros. e: { cliente_id, fecha_corte } → { clave }
  function claveAviso(e) {
    if (!esObjeto(e)) Util.fallar('E_LIBRO_INVALIDO');
    return { clave: M6.claveEjecucion(e.cliente_id, e.fecha_corte, M7.HUELLA_SIN_ARCHIVO) };
  }

  // Clave del libro de un archivo: semana de su EXPORTACIÓN y su huella. e: { cliente_id, fecha_exportacion, hash_archivo } → { clave }
  function claveArchivo(e) {
    if (!esObjeto(e) || e.hash_archivo === M7.HUELLA_SIN_ARCHIVO) Util.fallar('E_LIBRO_INVALIDO'); // la huella de «sin archivo» no es de un archivo
    return { clave: M6.claveEjecucion(e.cliente_id, e.fecha_exportacion, e.hash_archivo) };
  }

  /* e: { config, fecha_corte, filas_libro } → { decision: 'esperar' | 'avisar' | 'omitir_ya_avisado', clave }
     filas_libro: lo que devolvió el libro al filtrar por la clave del aviso. */
  function decidirAviso(e) {
    if (!esObjeto(e) || !esObjeto(e.config)) Util.fallar('E_INGESTA_INVALIDA');
    var clave = claveAviso({ cliente_id: e.config.cliente_id, fecha_corte: e.fecha_corte }).clave;
    var decision = M7.decidirSinArchivo({ fecha_corte: e.fecha_corte, dia_aviso: e.config.dia_aviso_sin_archivo, aviso_ya_enviado: M6.yaResuelto(e.filas_libro, clave) });
    return { decision: decision, clave: clave };
  }

  /* e: { cliente_id, fecha_exportacion, hash_archivo, esperado_bytes, recibido_bytes, filas_libro }
     → { decision: 'procesar' | 'omitir_ya_procesado', clave }
     Primero verifica que la descarga llegó entera (si no, lanza E_DESCARGA_INCOMPLETA: un informe con facturas de menos no se
     entrega), después busca en el libro del cliente la clave del archivo (semana de su exportación + huella). El bloqueo ya lo
     tiene esta ejecución. */
  function decidirProcesado(e) {
    if (!esObjeto(e)) Util.fallar('E_DECISION_INVALIDA');
    var descarga = M7.verificarDescarga({ esperado_bytes: e.esperado_bytes, recibido_bytes: e.recibido_bytes });
    if (!descarga.ok) Util.fallar('E_DESCARGA_INCOMPLETA');
    var clave = claveArchivo({ cliente_id: e.cliente_id, fecha_exportacion: e.fecha_exportacion, hash_archivo: e.hash_archivo }).clave;
    return { decision: M6.decidirEjecucion({ ya_resuelto: M6.yaResuelto(e.filas_libro, clave), bloqueo: 'libre' }), clave: clave };
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
          hash_archivo, fecha_exportacion (día local en que se modificó el archivo; no aplica a «sin_archivo»),
          iniciada_utc, terminada_utc }
     → { correo: { asunto, cuerpo_texto, adjunto? }, envio: { accion, destinatarios, motivos, bloqueados }, libro }
     La semana del libro es la de la EXPORTACIÓN, no la de la ejecución: un archivo que sigue fresco al cruzar el
     lunes no genera un segundo informe. Lanza E_ENVIO_<motivo> si la guardia de envío no deja enviar. */
  function armarEnvio(e) {
    if (!esObjeto(e) || !esObjeto(e.config) || !Util.esISO(e.fecha_corte)) Util.fallar('E_ENVIO_INVALIDO');
    var config = e.config;
    var real = M5.esEnvioReal(e.guardias, config.modo);
    var ensayo = !real;
    // Segunda barrera (la primera está en arrancar): el informe completo por correo con datos reales exige aceptación expresa.
    if (real && config.entrega === 'correo_completo' && config.acepta_correo_completo !== true) Util.fallar('E_CFG_ENTREGA_REAL');
    var conArchivo = e.tipo === 'informe' || e.tipo === 'incidencia';
    if (conArchivo && (!Util.esISO(e.fecha_exportacion) || e.fecha_exportacion > e.fecha_corte)) Util.fallar('E_ENVIO_INVALIDO');
    if (conArchivo && e.hash_archivo === M7.HUELLA_SIN_ARCHIVO) Util.fallar('E_LIBRO_INVALIDO'); // la huella de «sin archivo» no es de un archivo
    var p = e.preparado;
    if (conArchivo && (!esObjeto(p) || p.tipo !== e.tipo || p.ensayo !== ensayo)) Util.fallar('E_INCONSISTENCIA_ENSAYO');

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
      cliente_id: config.cliente_id, semana_iso: Util.semanaISO(conArchivo ? e.fecha_exportacion : e.fecha_corte), hash_archivo: hash, estado: estado,
      iniciada_utc: e.iniciada_utc, terminada_utc: e.terminada_utc,
      n_filas: conteos.n_filas, n_vencidas: conteos.n_vencidas, n_apartadas: conteos.n_apartadas,
      codigo_error: codigoError, modo: ensayo ? 'dry' : 'real'
    });
    return { correo: correo, envio: envio, libro: libro };
  }

  /* --------------------------------------------------------------- errores */

  /* e: { error, contexto: { cliente_id, workflow, nodo, ejecucion_id }, operador, problemas? (lista de códigos) }
     → { sano, texto: { asunto, cuerpo_texto }, envio }   Todo lo que va a Javier son códigos. */
  function alertaOperador(e) {
    if (!esObjeto(e)) Util.fallar('E_ALERTA_INVALIDA');
    var sano = M6.sanearError(e.error, e.contexto);
    var texto = M6.textoAlerta(sano);
    if (e.problemas !== undefined) {
      var lista = e.problemas;
      if (!Array.isArray(lista) || lista.length > 40 || lista.some(function (c) { return typeof c !== 'string' || !/^E_[A-Z0-9_]{2,40}$/.test(c); })) Util.fallar('E_ALERTA_INVALIDA');
      if (lista.length) texto = { asunto: texto.asunto, cuerpo_texto: texto.cuerpo_texto + '\nProblemas: ' + lista.join(', ') };
    }
    // La alerta va solo a Javier; no depende del ensayo (no lleva datos del cliente) pero pasa por la misma guardia.
    var envio = M5.guardiaEnvio({
      solicitados: [e.operador], lista_blanca: [e.operador], guardias: { permitido: true, dry_run: false }, modo_cliente: 'real'
    });
    return { sano: sano, texto: texto, envio: envio };
  }

  /* e: { codigo, contexto, operador, problemas?, cliente_id, fecha_corte?, hash_archivo?, iniciada_utc, terminada_utc, guardias?, modo_cliente? }
     → { alerta: { sano, texto, envio }, fila, fila_codigo }
     Todo lo que hay que hacer cuando algo falla, en un solo paso: el aviso a Javier (solo códigos) y la fila «error» del libro.
     Sin fecha de corte no hay semana que registrar (fila nula). Si la fila no es válida no se pierde el aviso: se devuelve el
     código de por qué no se pudo armar (fila_codigo). El flujo decide qué escribir: un aviso de configuración no toca el libro. */
  function manejarError(e) {
    if (!esObjeto(e)) Util.fallar('E_ALERTA_INVALIDA');
    var alerta = alertaOperador({ error: { codigo: e.codigo }, contexto: e.contexto, operador: e.operador, problemas: e.problemas });
    var fila = null, filaCodigo = null;
    if (e.fecha_corte !== undefined && e.fecha_corte !== null) {
      try {
        fila = filaError({
          cliente_id: e.cliente_id, codigo: alerta.sano.codigo, fecha_corte: e.fecha_corte, hash_archivo: e.hash_archivo,
          iniciada_utc: e.iniciada_utc, terminada_utc: e.terminada_utc, guardias: e.guardias === undefined ? null : e.guardias, modo_cliente: e.modo_cliente
        });
      } catch (err) { filaCodigo = Util.codigoDe(err); }
    }
    return { alerta: alerta, fila: fila, fila_codigo: filaCodigo };
  }

  /* e: { cliente_id, codigo, fecha_corte, hash_archivo?, iniciada_utc, terminada_utc, modo? | (guardias?, modo_cliente?) }
     → fila del libro con estado «error». El modo sale de «modo» o, mejor, de la misma definición de «envío real» que usa M5
     (guardias + modo del cliente); si no hay ninguno de los dos, es «dry». */
  function filaError(e) {
    if (!esObjeto(e) || (e.modo !== undefined && e.guardias !== undefined)) Util.fallar('E_LIBRO_INVALIDO');
    var real = e.guardias !== undefined ? M5.esEnvioReal(e.guardias, e.modo_cliente) : e.modo === 'real';
    return M6.filaLibro({
      cliente_id: e.cliente_id, semana_iso: Util.semanaISO(e.fecha_corte), hash_archivo: e.hash_archivo === undefined ? M7.HUELLA_SIN_ARCHIVO : e.hash_archivo,
      estado: 'error', iniciada_utc: e.iniciada_utc, terminada_utc: e.terminada_utc,
      n_filas: 0, n_vencidas: 0, n_apartadas: 0, codigo_error: e.codigo, modo: real ? 'real' : 'dry'
    });
  }

  return {
    validarConfiguracion: validarConfiguracion, fechaCorteDe: fechaCorteDe, arrancar: arrancar, iniciar: iniciar,
    elegirArchivo: elegirArchivo, claveAviso: claveAviso, claveArchivo: claveArchivo, decidirAviso: decidirAviso,
    decidirProcesado: decidirProcesado, preparar: preparar, armarEnvio: armarEnvio, alertaOperador: alertaOperador,
    filaError: filaError, manejarError: manejarError
  };
})();
