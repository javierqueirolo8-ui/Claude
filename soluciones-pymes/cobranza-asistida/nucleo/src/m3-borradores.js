/* ==========================================================================
   M3 · Borradores de mensaje. Módulo PURO (usa solo Util).

   Entrada: las facturas vencidas de M2, los datos de la empresa que cobra y, si hace falta, sus
   propias plantillas. Salida: por cada factura, un texto listo para revisar y, si hay teléfono móvil
   o correo válidos, un enlace que ABRE el WhatsApp o el correo de quien revisa. Este módulo no envía
   nada, no tiene red y no conoce ninguna dirección de envío.

   Principios:
   · Plantillas deterministas (nada de IA): el mismo dato produce siempre el mismo texto.
   · Una plantilla rota bloquea TODOS los borradores. Un mensaje con «{factu}» o sin el importe es
     peor que no tener mensaje.
   · El tono por defecto es formal en plural. Sin amenazas, sin mencionar informes comerciales,
     acciones legales ni consecuencias: una prueba lo comprueba en cada plantilla.
   · La factura, el importe y el vencimiento nunca faltan en un borrador.
   · Los enlaces se construyen con datos ya validados y codificados. Los números de ejemplo nunca
     generan enlace.
   ========================================================================== */
var M3 = (function () {
  'use strict';

  var CAMPOS = ['deudor', 'factura', 'importe', 'moneda', 'importe_completo', 'vencimiento', 'dias_atraso',
    'empresa', 'medios_pago', 'firma'];
  var CAMPOS_ASUNTO = ['factura', 'empresa', 'vencimiento', 'importe_completo', 'dias_atraso'];
  var MAX_PLANTILLA = 2000;
  var MAX_TEXTO_EMPRESA = 300;
  var MAX_ENLACE = 1900;

  var PLANTILLAS_POR_DEFECTO = {
    amable: {
      asunto: 'Recordatorio de la factura {factura}',
      cuerpo: 'Estimados:\n' +
        'Les escribimos de {empresa} para recordarles que la factura {factura} por {importe_completo}, con vencimiento el {vencimiento}, figura pendiente de pago.\n' +
        'Si ya fue abonada, les pedimos disculpas y que ignoren este mensaje.\n' +
        '{medios_pago}\n' +
        'Quedamos a su disposición para cualquier consulta.\n' +
        '{firma}'
    },
    segundo_aviso: {
      asunto: 'Factura {factura} pendiente de pago',
      cuerpo: 'Estimados:\n' +
        'Nos comunicamos nuevamente por la factura {factura} por {importe_completo}, vencida el {vencimiento} ({dias_atraso} días de atraso).\n' +
        'Les agradeceremos regularizarla o indicarnos cuándo podrán hacerlo. Si ya fue abonada, les rogamos que nos envíen el comprobante.\n' +
        '{medios_pago}\n' +
        'Quedamos a su disposición.\n' +
        '{firma}'
    },
    firme: {
      asunto: 'Factura {factura}: solicitamos su respuesta',
      cuerpo: 'Estimados:\n' +
        'La factura {factura} por {importe_completo} venció el {vencimiento} y registra {dias_atraso} días de atraso.\n' +
        'Les solicitamos comunicarse con nosotros a la brevedad para acordar su cancelación.\n' +
        'Si ya fue abonada, les pedimos que nos envíen el comprobante.\n' +
        '{medios_pago}\n' +
        'Gracias por su atención.\n' +
        '{firma}'
    }
  };

  // Lo que una plantilla NO puede contener (se compara sin tildes y en minúsculas, sobre el texto de la
  // plantilla, no sobre los datos). Un aviso de cobranza amable no amenaza ni menciona consecuencias; si
  // un cliente quiere otra política, es un cambio consciente de la v1, no un descuido en una plantilla.
  // PREFIJOS atrapan las conjugaciones («suspenderemos», «judicialmente»); PALABRAS son exactas para no
  // confundir «mora» con «moral» ni «intereses» con «interesa»; FRASES son expresiones de varias palabras.
  var PREFIJOS_PROHIBIDOS = ['suspend', 'suspens', 'embarg', 'demanda', 'demandar', 'judicial', 'abogad', 'juicio', 'protesto',
    'clearing', 'moros', 'incumpl', 'legal', 'consecuenc', 'denunci', 'antecedent', 'intim', 'ejecuc', 'ejecut', 'penal',
    'recarg', 'multa', 'rescin', 'rescis', 'sancion'];
  var PALABRAS_PROHIBIDAS = ['mora', 'interes', 'intereses', 'bcu'];
  var FRASES_PROHIBIDAS = ['informe comercial', 'informes comerciales', 'central de riesgos', 'lista negra'];
  var FRASES_RE = new RegExp(
    '(?:^|[^a-z0-9])(?:(?:' + PREFIJOS_PROHIBIDOS.join('|') + ')[a-z0-9]*|' + PALABRAS_PROHIBIDAS.join('|') + '|' +
    FRASES_PROHIBIDAS.join('|').replace(/ /g, ' +') + ')(?![a-z0-9])');

  /* ------------------------------------------------------------ plantillas */

  function camposDe(texto) {
    var usados = [];
    String(texto).replace(/\{([A-Za-z_]+)\}/g, function (m, c) { usados.push(c.toLowerCase()); return m; });
    return usados;
  }

  // Devuelve el primer problema (código) o null.
  function problemaDePlantilla(texto, permitidos, esCuerpo) {
    if (typeof texto !== 'string' || !texto.trim()) return 'E_PLANTILLA_VACIA';
    if (texto.length > MAX_PLANTILLA) return 'E_PLANTILLA_LARGA';
    var usados = camposDe(texto);
    for (var i = 0; i < usados.length; i++) if (permitidos.indexOf(usados[i]) < 0) return 'E_PLANTILLA_CAMPO_DESCONOCIDO';
    if (/[{}]/.test(texto.replace(/\{[A-Za-z_]+\}/g, ''))) return 'E_PLANTILLA_LLAVES';
    var plano = Util.sinAcentos(Util.limpiar(texto.replace(/\{[A-Za-z_]+\}/g, ' '))).toLowerCase();
    if (FRASES_RE.test(plano)) return 'E_PLANTILLA_FRASE_PROHIBIDA';
    if (esCuerpo) {
      var tieneImporte = usados.indexOf('importe_completo') >= 0 || usados.indexOf('importe') >= 0;
      if (usados.indexOf('factura') < 0 || !tieneImporte || usados.indexOf('vencimiento') < 0) return 'E_PLANTILLA_SIN_DATOS_CLAVE';
    }
    return null;
  }

  // Mezcla las plantillas del cliente con las de por defecto y las valida todas: una plantilla rota que
  // hoy no se usa mañana sí se usará, y se detiene ahora.
  function validarPlantillas(propias) {
    var mezcla = {};
    Object.keys(PLANTILLAS_POR_DEFECTO).forEach(function (n) { mezcla[n] = PLANTILLAS_POR_DEFECTO[n]; });
    if (propias !== undefined && propias !== null) {
      if (typeof propias !== 'object' || Array.isArray(propias)) Util.fallar('E_PLANTILLA_VACIA');
      Object.keys(propias).forEach(function (n) {
        if (!/^[a-z][a-z_]{1,29}$/.test(n) || n === 'en_disputa') Util.fallar('E_PLANTILLA_CAMPO_DESCONOCIDO');
        mezcla[n] = propias[n];
      });
    }
    Object.keys(mezcla).forEach(function (n) {
      var p = mezcla[n];
      if (!p || typeof p !== 'object') Util.fallar('E_PLANTILLA_VACIA');
      var pa = problemaDePlantilla(p.asunto, CAMPOS_ASUNTO, false);
      if (pa) Util.fallar(pa);
      var pc = problemaDePlantilla(p.cuerpo, CAMPOS, true);
      if (pc) Util.fallar(pc);
    });
    return mezcla;
  }

  // Sustituye {campos}. Una línea se omite solo si faltan TODOS sus datos («{medios_pago}» sin medios de
  // pago); si falta uno pero hay otros, la línea se conserva y se ordena el hueco. El texto insertado
  // no se vuelve a analizar: un nombre con «{factura}» dentro no cambia nada.
  function renderizar(plantilla, vars) {
    var lineas = String(plantilla).replace(/\r\n?/g, '\n').split('\n');
    var salida = [];
    lineas.forEach(function (linea) {
      var total = 0, vacios = 0;
      var l = linea.replace(/\{([A-Za-z_]+)\}/g, function (m, clave) {
        var k = clave.toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(vars, k)) return m;
        total++;
        var v = String(vars[k]);
        if (!v.trim()) { vacios++; return ''; }
        return v;
      });
      if (total > 0 && vacios === total) return;
      if (vacios > 0) l = l.replace(/\s+([,.;:!?])/g, '$1').replace(/^[\s,;:]+/, '').replace(/ {2,}/g, ' ');
      salida.push(l.replace(/[ \t]+$/, ''));
    });
    return salida.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* --------------------------------------------------------------- empresa */

  // Varias líneas permitidas (firma, datos de pago), sin controles ni caracteres invisibles.
  function limpiarMultilinea(v, maxLineas) {
    if (typeof v !== 'string') return '';
    var lineas = v.replace(/\r\n?/g, '\n').split('\n').map(function (l) { return Util.limpiar(l); })
      .filter(function (l) { return l !== ''; }); // sin líneas en blanco: gastan el cupo y no aportan
    if (lineas.length > maxLineas) lineas = lineas.slice(0, maxLineas);
    return lineas.join('\n');
  }

  function validarEmpresa(e) {
    if (!e || typeof e !== 'object') Util.fallar('E_CFG_EMPRESA');
    var nombre = Util.limpiar(e.nombre);
    if (!nombre || nombre.length > 120) Util.fallar('E_CFG_EMPRESA');
    var medios = limpiarMultilinea(e.medios_pago, 5);
    var firma = limpiarMultilinea(e.firma, 5);
    if (medios.length > MAX_TEXTO_EMPRESA || firma.length > MAX_TEXTO_EMPRESA) Util.fallar('E_CFG_EMPRESA');
    return { nombre: nombre, medios_pago: medios, firma: firma };
  }

  /* --------------------------------------------------------------- enlaces */

  // https://api.whatsapp.com/send?phone=<número internacional sin +>&text=<mensaje codificado>
  // No se usa wa.me: su redirección sustituye los emojis y cualquier carácter fuera de Windows-1252 por «�»;
  // api.whatsapp.com, a donde redirige, los conserva.
  function enlaceWhatsApp(digitos, mensaje) {
    if (typeof digitos !== 'string' || !/^\d{8,15}$/.test(digitos)) return null;
    var url;
    try { url = 'https://api.whatsapp.com/send?phone=' + digitos + '&text=' + encodeURIComponent(mensaje); } catch (e) { return null; }
    return url.length <= MAX_ENLACE ? url : null;
  }

  // mailto:<dirección>?subject=<…>&body=<…>. La dirección debe pasar el patrón estricto SIN cambios: una
  // dirección con «?», «&», «,» o «%» habría añadido parámetros ocultos (Bcc, cc) al abrir el enlace.
  function enlaceMail(direccion, asunto, cuerpo) {
    var d = Util.normalizarCorreo(direccion);
    if (!d || d !== direccion) return null;
    var url;
    try {
      url = 'mailto:' + d + '?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(String(cuerpo).replace(/\n/g, '\r\n'));
    } catch (e) { return null; }
    return url.length <= MAX_ENLACE ? url : null;
  }

  /* ------------------------------------------------------------ borradores */

  function variables(v, emp) {
    var completo = Util.formatearImporte(v.importe_centavos, v.moneda);
    return {
      deudor: Util.limpiar(v.deudor_nombre), factura: v.factura_ref,
      importe: completo.replace(/^\S+ /, ''), moneda: completo.replace(/ .*$/, ''), importe_completo: completo,
      vencimiento: Util.formatoFecha(v.vencimiento), dias_atraso: String(v.dias_atraso),
      empresa: emp.nombre, medios_pago: emp.medios_pago, firma: emp.firma
    };
  }

  function validarVencida(v) {
    if (!v || typeof v !== 'object' || !Util.refValida(v.factura_ref) ||
        typeof v.escalon !== 'string' || !/^[a-z][a-z_]{1,29}$/.test(v.escalon) ||
        !(typeof v.dias_atraso === 'number' && Math.floor(v.dias_atraso) === v.dias_atraso && v.dias_atraso >= 1) ||
        !Util.esISO(v.vencimiento)) Util.fallar('E_FACTURA_INVALIDA');
  }

  /* entrada: { vencidas, empresa: {nombre, medios_pago?, firma?}, plantillas?, opciones?: { demo } } */
  function generarBorradores(entrada) {
    if (!entrada || typeof entrada !== 'object' || !Array.isArray(entrada.vencidas)) Util.fallar('E_FACTURAS_INVALIDAS');
    var emp = validarEmpresa(entrada.empresa);
    var plantillas = validarPlantillas(entrada.plantillas);
    var demo = !!(entrada.opciones && entrada.opciones.demo === true);

    var borradores = [], sinBorrador = [];
    entrada.vencidas.forEach(function (v, indice) {
      validarVencida(v);
      var fila = typeof v.fila_origen === 'number' ? v.fila_origen : null;
      if (v.escalon === 'en_disputa') { sinBorrador.push({ indice: indice, factura_ref: v.factura_ref, moneda: v.moneda, fila_origen: fila, motivo: 'en_disputa' }); return; }
      var p = Object.prototype.hasOwnProperty.call(plantillas, v.escalon) ? plantillas[v.escalon] : null; // «constructor» no es una plantilla
      if (!p) Util.fallar('E_PLANTILLA_FALTANTE');

      var vars = variables(v, emp);
      var texto = renderizar(p.cuerpo, vars);
      var asunto = Util.limpiar(renderizar(p.asunto, vars)).slice(0, 150);
      // Defensa en profundidad: aunque la plantilla se validó, el texto final debe traer los tres datos.
      if (texto.indexOf(v.factura_ref) < 0 || texto.indexOf(vars.vencimiento) < 0 ||
          (texto.indexOf(vars.importe_completo) < 0 && texto.indexOf(vars.importe) < 0)) Util.fallar('E_BORRADOR_SIN_DATOS_CLAVE');

      var avisos = [];
      var wa = null, mail = null;
      if (v.contacto_tel) {
        if (Util.esNumeroDeEjemplo(v.contacto_tel)) avisos.push('A_TEL_EJEMPLO');
        else if (v.tel_movil === false) avisos.push('A_TEL_FIJO');
        else if (!demo) {
          wa = enlaceWhatsApp(v.contacto_tel, texto);
          if (!wa) avisos.push('A_ENLACE_WA_OMITIDO');
        }
      }
      if (v.contacto_mail && !demo) {
        mail = enlaceMail(v.contacto_mail, asunto, texto);
        if (!mail) avisos.push('A_ENLACE_MAIL_OMITIDO');
      }
      borradores.push({
        indice: indice, factura_ref: v.factura_ref, moneda: v.moneda, fila_origen: fila, escalon: v.escalon,
        asunto: asunto, texto: texto, enlace_wa: wa, enlace_mail: mail, avisos: avisos
      });
    });
    return { borradores: borradores, sin_borrador: sinBorrador, demo: demo };
  }

  return {
    CAMPOS: CAMPOS, PLANTILLAS_POR_DEFECTO: PLANTILLAS_POR_DEFECTO,
    PREFIJOS_PROHIBIDOS: PREFIJOS_PROHIBIDOS, PALABRAS_PROHIBIDAS: PALABRAS_PROHIBIDAS, FRASES_PROHIBIDAS: FRASES_PROHIBIDAS,
    validarPlantillas: validarPlantillas, validarEmpresa: validarEmpresa, renderizar: renderizar,
    enlaceWhatsApp: enlaceWhatsApp, enlaceMail: enlaceMail, generarBorradores: generarBorradores
  };
})();
