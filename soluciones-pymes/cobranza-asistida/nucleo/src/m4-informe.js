/* ==========================================================================
   M4 · Informe. Módulo PURO (usa solo Util).

   Entrada: la antigüedad (M2), los borradores (M3) y el resumen de lectura (M1). Salida:
     · html_completo: una página HTML autocontenida (sin scripts, sin red, con política de seguridad
       restrictiva) con el detalle por cliente, los borradores y los botones que abren WhatsApp o el correo;
     · texto_resumen: solo totales y contadores, SIN nombres, referencias, teléfonos ni correos, para poder
       enviarlo por correo con un enlace al informe completo (modo «enlace_salida»);
     · avisos de incidencia («no pudimos leer el archivo», «no llegó el archivo») con texto fijo.

   Principios:
   · Todo texto que viene del archivo se escapa. Los únicos enlaces posibles son los de WhatsApp y de
     correo que M3 construyó, y se vuelven a validar con un patrón estricto antes de escribirlos.
   · Cada borrador se muestra bajo SU factura: si el emparejamiento no cuadra, no hay informe.
   · El tono hacia quien recibe el informe es impersonal («revisar cada mensaje antes de enviarlo»).
   ========================================================================== */
var M4 = (function () {
  'use strict';

  var MAX_FILAS_POR_DEFECTO = 300;
  var MAX_NUMEROS_FILA = 15;

  var ETIQUETA_ESCALON = {
    amable: 'Recordatorio amable', segundo_aviso: 'Segundo aviso', firme: 'Aviso firme o llamada',
    en_disputa: 'En disputa (sin borrador)'
  };
  var CLASE_ESCALON = { amable: 'b-amable', segundo_aviso: 'b-segundo', firme: 'b-firme', en_disputa: 'b-disputa' };

  var DESCRIPCION_CODIGO = {
    E_REF_VACIA: 'sin número de factura',
    E_REF_INVALIDA: 'número de factura con caracteres no admitidos',
    E_DEUDOR_VACIO: 'sin nombre del cliente',
    E_IMPORTE_INVALIDO: 'importe que no se puede leer',
    E_IMPORTE_NO_POSITIVO: 'importe cero o negativo (¿nota de crédito?)',
    E_MONEDA_DESCONOCIDA: 'moneda desconocida o ausente',
    E_MONEDA_CONFLICTO: 'la moneda del importe no coincide con la de la columna',
    E_FECHA_VACIA: 'sin fecha de vencimiento',
    E_FECHA_INVALIDA: 'fecha de vencimiento que no existe o no se entiende',
    E_FECHA_AMBIGUA: 'fecha con el día y el mes posiblemente invertidos',
    E_FECHA_FUERA_DE_RANGO: 'fecha de vencimiento fuera del rango esperado',
    E_CELDA_LARGA: 'texto demasiado largo en alguna celda',
    E_FILA_DESALINEADA: 'más columnas de las esperadas (¿un separador dentro de un texto?)',
    E_FILA_INVALIDA: 'fila que no se puede leer',
    E_DUPLICADA: 'factura repetida (se conservó la primera)',
    E_CONFLICTO_FACTURA: 'la misma factura aparece con datos distintos'
  };

  var DESCRIPCION_BLOQUEO = {
    E_ARCHIVO_VACIO: 'el archivo no tiene facturas',
    E_DEMASIADAS_APARTADAS: 'demasiadas filas no se pudieron leer',
    E_COLUMNA_FALTANTE: 'falta una columna esperada',
    E_COLUMNA_DUPLICADA: 'una columna esperada aparece repetida',
    E_DEMASIADAS_FILAS: 'el archivo tiene más filas de las admitidas',
    E_CSV_COMILLAS: 'hay comillas sin cerrar',
    E_CSV_VACIO: 'el archivo está vacío',
    E_ARCHIVO_GRANDE: 'el archivo es demasiado grande'
  };

  /* --------------------------------------------------------------- utilidades */

  var esc = Util.escHtml;

  function etiqueta(escalon) {
    if (Object.prototype.hasOwnProperty.call(ETIQUETA_ESCALON, escalon)) return ETIQUETA_ESCALON[escalon];
    var t = String(escalon).replace(/_/g, ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function clase(escalon) { return Object.prototype.hasOwnProperty.call(CLASE_ESCALON, escalon) ? CLASE_ESCALON[escalon] : 'b-otro'; }
  function descripcion(codigo) { return Object.prototype.hasOwnProperty.call(DESCRIPCION_CODIGO, codigo) ? DESCRIPCION_CODIGO[codigo] : 'motivo no descrito'; }

  var URL_WA_RE = /^https:\/\/api\.whatsapp\.com\/send\?phone=\d{8,15}&text=[A-Za-z0-9\-_.!~*'()%]*$/;
  var URL_MAIL_RE = /^mailto:[a-z0-9._+-]+@[a-z0-9.-]+\?subject=[A-Za-z0-9\-_.!~*'()%]*&body=[A-Za-z0-9\-_.!~*'()%]*$/;
  var URL_DRIVE_RE = /^https:\/\/(?:drive|docs)\.google\.com\/[A-Za-z0-9\/_?=&.%#-]{5,300}$/;

  function enlaceSeguro(url, tipo) {
    if (typeof url !== 'string' || url.length > 2000) return null;
    return (tipo === 'wa' ? URL_WA_RE : URL_MAIL_RE).test(url) ? url : null;
  }

  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  function textoFilas(filas) {
    var v = filas.slice(0, MAX_NUMEROS_FILA).join(', ');
    return filas.length > MAX_NUMEROS_FILA ? v + ' y ' + (filas.length - MAX_NUMEROS_FILA) + ' más' : v;
  }

  function nombreTramo(t) {
    return t.hasta === null ? 'Más de ' + (t.desde - 1) + ' días' : t.desde + ' a ' + t.hasta + ' días';
  }

  var MONEDAS = ['UYU', 'USD'];
  var ETIQUETA_MONEDA = { UYU: '$U', USD: 'US$' };

  function validarEntrada(e) {
    if (!e || typeof e !== 'object' || !Util.esISO(e.fecha_corte)) Util.fallar('E_INFORME_INVALIDO');
    var nombre = Util.limpiar(e.empresa && e.empresa.nombre);
    if (!nombre || nombre.length > 120) Util.fallar('E_CFG_EMPRESA');
    var a = e.antiguedad, b = e.borradores, l = e.lectura;
    if (!a || !Array.isArray(a.vencidas) || !a.totales || !a.por_tramo || !Array.isArray(a.tramos)) Util.fallar('E_INFORME_INVALIDO');
    if (!b || !Array.isArray(b.borradores) || !Array.isArray(b.sin_borrador)) Util.fallar('E_INFORME_INVALIDO');
    if (!l || !l.resumen || !Array.isArray(l.apartadas) || !Array.isArray(l.avisos)) Util.fallar('E_INFORME_INVALIDO');
    // Emparejamiento: cada borrador o «sin borrador» corresponde a UNA factura, la misma que se muestra.
    var vistos = {};
    b.borradores.concat(b.sin_borrador).forEach(function (x) {
      var v = a.vencidas[x.indice];
      if (!v || vistos[x.indice] || v.factura_ref !== x.factura_ref || v.moneda !== x.moneda) Util.fallar('E_INFORME_INCONSISTENTE');
      vistos[x.indice] = true;
    });
    if (Object.keys(vistos).length !== a.vencidas.length) Util.fallar('E_INFORME_INCONSISTENTE');
    return nombre;
  }

  /* ------------------------------------------------------------ texto resumen */

  function lineasLectura(l) {
    var lineas = [];
    var r = l.resumen;
    if (r.apartadas > 0) {
      lineas.push('Filas del archivo que no se pudieron leer: ' + r.apartadas + ' de ' + r.total + '. Conviene revisarlas en el archivo original.');
      var porCodigo = {};
      l.apartadas.forEach(function (x) { (porCodigo[x.codigo] = porCodigo[x.codigo] || []).push(x.fila); });
      Object.keys(porCodigo).sort().forEach(function (c) {
        lineas.push('  · ' + descripcion(c) + ': ' + plural(porCodigo[c].length, 'fila', 'filas') + ' (' + textoFilas(porCodigo[c]) + ')');
      });
    }
    if (l.avisos.length) {
      var avisos = Util.contarPorCodigo(l.avisos.map(function (a) { return { codigo: a.codigo.replace(/^A_/, 'E_') }; }));
      var partes = [];
      if (avisos.E_TEL_INVALIDO) partes.push(plural(avisos.E_TEL_INVALIDO, 'teléfono ilegible', 'teléfonos ilegibles'));
      if (avisos.E_TEL_FIJO) partes.push(plural(avisos.E_TEL_FIJO, 'teléfono fijo (WhatsApp necesita un móvil)', 'teléfonos fijos (WhatsApp necesita un móvil)'));
      if (avisos.E_MAIL_INVALIDO) partes.push(plural(avisos.E_MAIL_INVALIDO, 'correo ilegible', 'correos ilegibles'));
      if (avisos.E_DISPUTA_NO_ENTENDIDA) partes.push(plural(avisos.E_DISPUTA_NO_ENTENDIDA, 'marca de disputa poco clara (se trató como en disputa)', 'marcas de disputa poco claras (se trataron como en disputa)'));
      if (avisos.E_EMISION_INVALIDA) partes.push(plural(avisos.E_EMISION_INVALIDA, 'fecha de emisión ilegible', 'fechas de emisión ilegibles'));
      if (avisos.E_VENCIMIENTO_ANTERIOR_EMISION) partes.push(plural(avisos.E_VENCIMIENTO_ANTERIOR_EMISION, 'vencimiento anterior a la emisión', 'vencimientos anteriores a la emisión'));
      if (partes.length) lineas.push('Avisos: ' + partes.join('; ') + '.');
    }
    return lineas;
  }

  function textoResumen(e, empresa) {
    var a = e.antiguedad;
    var total = a.vencidas.length;
    var L = [];
    L.push('Resumen de cobranza · ' + empresa + ' · al ' + Util.formatoFecha(e.fecha_corte));
    L.push('');
    L.push(total === 0 ? 'No hay facturas vencidas.' : 'Facturas vencidas: ' + total);
    MONEDAS.forEach(function (m) {
      if (a.totales[m]) L.push('  · ' + ETIQUETA_MONEDA[m] + ': ' + plural(a.totales[m].n, 'factura', 'facturas') + ' por ' + Util.formatearImporte(a.totales[m].total_centavos, m));
    });
    MONEDAS.forEach(function (m) {
      if (!a.por_tramo[m]) return;
      L.push('');
      L.push('Por antigüedad (' + ETIQUETA_MONEDA[m] + '):');
      a.por_tramo[m].forEach(function (t) {
        L.push('  · ' + nombreTramo(t) + ': ' + plural(t.n, 'factura', 'facturas') + (t.n ? ' por ' + Util.formatearImporte(t.total_centavos, m) : ''));
      });
    });
    if (total) {
      var nuevas = a.vencidas.filter(function (v) { return v.nueva_esta_semana; }).length;
      L.push('');
      L.push('Vencidas en los últimos 7 días: ' + nuevas);
      if (a.por_escalon.en_disputa) L.push('En disputa (sin borrador): ' + a.por_escalon.en_disputa);
    }
    var lect = lineasLectura(e.lectura);
    if (lect.length) { L.push(''); Array.prototype.push.apply(L, lect); }
    return L.join('\n');
  }

  /* ----------------------------------------------------------------- html */

  var CSS = [
    ':root{color-scheme:light dark;--fondo:#ffffff;--texto:#1b1f24;--suave:#4a5560;--borde:#d0d7de;--tarjeta:#f6f8fa;--acento:#0a4f9e;',
    '--ok-f:#e3f4e8;--ok-t:#0b4a22;--am-f:#fff1c2;--am-t:#5c3d00;--ro-f:#fde3e6;--ro-t:#7a1620;--gr-f:#e8ecef;--gr-t:#2f3b44;',
    '--alerta-f:#fff8e1;--alerta-b:#c99700}',
    '@media (prefers-color-scheme:dark){:root{--fondo:#111418;--texto:#e6e9ec;--suave:#aab3bc;--borde:#38414a;--tarjeta:#1a1f25;--acento:#7cb4f5;',
    '--ok-f:#12321d;--ok-t:#a9e6bd;--am-f:#3a2c00;--am-t:#ffe08a;--ro-f:#3d1218;--ro-t:#ffb4bd;--gr-f:#2a323a;--gr-t:#d3dae0;',
    '--alerta-f:#2e2500;--alerta-b:#c99700}}',
    '*{box-sizing:border-box}body{margin:0;background:var(--fondo);color:var(--texto);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    'main{max-width:960px;margin:0 auto;padding:16px}h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.15rem;margin:28px 0 10px}',
    'p{margin:0 0 8px}.sub{color:var(--suave)}.banner{border:2px dashed var(--alerta-b);background:var(--alerta-f);padding:10px 12px;margin:12px 0;border-radius:8px;font-weight:600}',
    '.tarjetas{display:flex;flex-wrap:wrap;gap:12px}.tarjeta{flex:1 1 220px;background:var(--tarjeta);border:1px solid var(--borde);border-radius:10px;padding:12px 14px}',
    '.tarjeta .cifra{font-size:1.5rem;font-weight:700}.tarjeta .det{color:var(--suave)}',
    'table{border-collapse:collapse;width:100%;margin:6px 0 12px}th,td{border:1px solid var(--borde);padding:6px 8px;text-align:left;vertical-align:top}th{background:var(--tarjeta)}td.num,th.num{text-align:right;white-space:nowrap}',
    '.alerta{border:1px solid var(--alerta-b);background:var(--alerta-f);border-radius:8px;padding:10px 12px;margin:10px 0}.alerta ul{margin:6px 0 0;padding-left:20px}',
    '.grupo{margin-top:22px}.grupo h3{font-size:1.05rem;margin:0 0 8px}',
    '.fila{border:1px solid var(--borde);border-radius:10px;padding:12px 14px;margin:0 0 12px;background:var(--fondo)}',
    '.fila .cab{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}.fila .cab strong{overflow-wrap:anywhere}',
    '.datos{color:var(--suave);margin:4px 0 8px;overflow-wrap:anywhere}',
    '.badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.85rem;font-weight:600}',
    '.b-amable{background:var(--ok-f);color:var(--ok-t)}.b-segundo{background:var(--am-f);color:var(--am-t)}',
    '.b-firme{background:var(--ro-f);color:var(--ro-t)}.b-disputa,.b-otro{background:var(--gr-f);color:var(--gr-t)}',
    'pre.borrador{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:var(--tarjeta);border:1px solid var(--borde);border-radius:8px;padding:10px 12px;margin:6px 0;user-select:all;-webkit-user-select:all}',
    '.acciones{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 0;align-items:center}',
    'a.btn,span.btn{display:inline-block;min-height:44px;line-height:44px;padding:0 16px;border-radius:8px;font-weight:600;text-decoration:none}',
    'a.btn{background:var(--acento);color:var(--fondo)}a.btn:focus-visible{outline:3px solid var(--texto);outline-offset:2px}',
    'span.btn{border:1px dashed var(--borde);color:var(--suave);font-weight:400}.nota{color:var(--suave);font-size:.9rem}footer{margin-top:28px;border-top:1px solid var(--borde);padding-top:12px}',
    '@media (max-width:380px){main{padding:12px}table{font-size:.9rem}th,td{padding:5px 5px}}',
    '@media print{a.btn{border:1px solid var(--texto);background:none;color:var(--texto)}}'
  ].join('');

  function celdaMoneda(m) { return ETIQUETA_MONEDA[m]; }

  function htmlCabecera(e, empresa, titulo) {
    var h = [];
    h.push('<h1>Resumen de cobranza</h1>');
    h.push('<p class="sub">' + esc(empresa) + ' · al ' + esc(Util.formatoFecha(e.fecha_corte)) + '</p>');
    if (e.opciones && e.opciones.demo) h.push('<p class="banner" role="note">EJEMPLO CON DATOS FICTICIOS. Ningún nombre, importe, teléfono ni correo es real, y en esta demostración los botones no abren nada.</p>');
    else if (e.opciones && e.opciones.ensayo) h.push('<p class="banner" role="note">ENSAYO: este informe no es el informe real del cliente.</p>');
    return h.join('');
  }

  function htmlTotales(a) {
    var h = ['<h2>Resumen</h2>'];
    var hay = MONEDAS.filter(function (m) { return a.totales[m]; });
    if (!hay.length) return h.concat(['<p>No hay facturas vencidas.</p>']).join('');
    h.push('<div class="tarjetas">');
    hay.forEach(function (m) {
      h.push('<div class="tarjeta"><div class="det">Vencido en ' + esc(celdaMoneda(m)) + '</div><div class="cifra">' +
        esc(Util.formatearImporte(a.totales[m].total_centavos, m)) + '</div><div class="det">' +
        esc(plural(a.totales[m].n, 'factura', 'facturas')) + '</div></div>');
    });
    h.push('</div>');
    h.push('<h2>Por antigüedad</h2>');
    hay.forEach(function (m) {
      h.push('<table><caption class="nota">' + esc(celdaMoneda(m)) + '</caption><thead><tr><th scope="col">Atraso</th><th scope="col" class="num">Facturas</th><th scope="col" class="num">Importe</th></tr></thead><tbody>');
      a.por_tramo[m].forEach(function (t) {
        h.push('<tr><td>' + esc(nombreTramo(t)) + '</td><td class="num">' + t.n + '</td><td class="num">' +
          (t.n ? esc(Util.formatearImporte(t.total_centavos, m)) : '—') + '</td></tr>');
      });
      h.push('</tbody></table>');
    });
    return h.join('');
  }

  function htmlLectura(l) {
    var lineas = lineasLectura(l);
    if (!lineas.length) return '';
    var h = ['<div class="alerta" role="alert"><strong>Antes de usar este informe</strong><ul>'];
    lineas.forEach(function (x) { h.push('<li>' + esc(x.replace(/^\s*·\s*/, '')) + '</li>'); });
    h.push('</ul></div>');
    return h.join('');
  }

  function htmlFila(v, b, demo) {
    var h = ['<article class="fila">'];
    h.push('<div class="cab"><strong>' + esc(Util.limpiar(v.deudor_nombre)) + '</strong><span class="badge ' + clase(v.escalon) + '">' + esc(etiqueta(v.escalon)) + '</span></div>');
    h.push('<p class="datos">Factura ' + esc(v.factura_ref) + ' · ' + esc(Util.formatearImporte(v.importe_centavos, v.moneda)) +
      ' · venció el ' + esc(Util.formatoFecha(v.vencimiento)) + ' · ' + esc(plural(v.dias_atraso, 'día', 'días')) + ' de atraso' +
      (v.nueva_esta_semana ? ' · nueva esta semana' : '') + '</p>');
    if (b) {
      h.push('<pre class="borrador">' + esc(b.texto) + '</pre>');
      var wa = demo ? null : enlaceSeguro(b.enlace_wa, 'wa');
      var mail = demo ? null : enlaceSeguro(b.enlace_mail, 'mail');
      h.push('<p class="acciones">');
      if (wa) h.push('<a class="btn" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>');
      if (mail) h.push('<a class="btn" href="' + esc(mail) + '">Abrir correo</a>');
      if (!wa && !mail) {
        h.push('<span class="btn" aria-disabled="true">' + (demo ? 'En la demostración los botones no abren nada' :
          (b.avisos.indexOf('A_TEL_EJEMPLO') >= 0 ? 'Número de ejemplo: sin enlace' : 'Sin teléfono móvil ni correo válidos: copiar el texto')) + '</span>');
      } else if (!wa && b.avisos.indexOf('A_TEL_FIJO') >= 0) {
        h.push('<span class="nota">Teléfono fijo: WhatsApp necesita un móvil.</span>');
      }
      h.push('</p>');
    } else {
      h.push('<p class="nota">Marcada como en disputa: no se sugiere reclamar hasta resolverlo.</p>');
    }
    h.push('</article>');
    return h.join('');
  }

  function ordenGrupos(a) {
    var nombres = a.escalones.map(function (x) { return x.nombre; }).reverse(); // el más grave primero
    return nombres.concat(['en_disputa']);
  }

  function htmlDetalle(e, maxFilas) {
    var a = e.antiguedad, b = e.borradores;
    var pares = a.vencidas.map(function (v, i) { return { v: v, b: null, i: i }; });
    b.borradores.forEach(function (x) { pares[x.indice].b = x; });
    var h = ['<h2>Para revisar y enviar</h2>',
      '<p class="nota">Este informe no envía nada a ningún cliente. Antes de enviar, revisar cada mensaje; el texto se copia con un clic sobre él.</p>'];
    var mostrados = 0, omitidos = 0;
    ordenGrupos(a).forEach(function (grupo) {
      var del = pares.filter(function (p) { return p.v.escalon === grupo; });
      if (!del.length) return;
      var visibles = del.slice(0, Math.max(0, maxFilas - mostrados));
      omitidos += del.length - visibles.length;
      mostrados += visibles.length;
      if (!visibles.length) return;
      h.push('<section class="grupo"><h3>' + esc(etiqueta(grupo)) + ' (' + del.length + ')</h3>');
      visibles.forEach(function (p) { h.push(htmlFila(p.v, p.b, !!(e.opciones && e.opciones.demo))); });
      h.push('</section>');
    });
    if (omitidos) h.push('<p class="alerta" role="note">Se muestran las ' + mostrados + ' facturas más atrasadas de ' + a.vencidas.length + '. Las ' + omitidos + ' restantes están en la planilla.</p>');
    return { html: h.join(''), mostradas: mostrados, omitidas: omitidos };
  }

  /* entrada: { fecha_corte, empresa:{nombre}, antiguedad, borradores, lectura, opciones?:{demo, ensayo, max_filas_informe} } */
  function armarInforme(e) {
    var empresa = validarEntrada(e);
    var opc = e.opciones || {};
    var maxFilas = Number.isInteger(opc.max_filas_informe) && opc.max_filas_informe >= 1 && opc.max_filas_informe <= 2000 ? opc.max_filas_informe : MAX_FILAS_POR_DEFECTO;
    var prefijo = opc.demo === true ? 'EJEMPLO · ' : (opc.ensayo === true ? '[ENSAYO] ' : '');
    var total = e.antiguedad.vencidas.length;
    var asunto = prefijo + 'Resumen semanal de cobranza · ' + Util.formatoFecha(e.fecha_corte) + ' · ' +
      (total === 0 ? 'sin facturas vencidas' : plural(total, 'factura vencida', 'facturas vencidas'));
    var detalle = htmlDetalle(e, maxFilas);
    var titulo = 'Cobranza · resumen al ' + Util.formatoFecha(e.fecha_corte);
    var html = '<!doctype html>\n<html lang="es"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">' +
      '<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex">' +
      '<title>' + esc(titulo) + '</title><style>' + CSS + '</style></head><body><main>' +
      htmlCabecera(e, empresa) + htmlTotales(e.antiguedad) + htmlLectura(e.lectura) + detalle.html +
      '<footer><p class="nota">Borradores generados automáticamente a partir de la planilla del cliente al ' + esc(Util.formatoFecha(e.fecha_corte)) +
      '. Los importes no incluyen intereses ni ajustes. Si algo no cuadra con los registros propios, prevalece lo que dicen los registros propios.</p></footer>' +
      '</main></body></html>\n';
    return {
      asunto: asunto, texto_resumen: textoResumen(e, empresa), html_completo: html,
      nombre_archivo: (opc.ensayo === true ? 'ensayo-' : (opc.demo === true ? 'demo-' : '')) + 'informe-cobranza-' + e.fecha_corte + '.html',
      filas_mostradas: detalle.mostradas, filas_omitidas: detalle.omitidas
    };
  }

  /* ---------------------------------------------- correos con texto fijo */

  // Correo con solo totales y un enlace al informe completo (modo «enlace_salida»).
  function armarCorreoConEnlace(entrada) {
    if (!entrada || typeof entrada.texto_resumen !== 'string' || !entrada.texto_resumen) Util.fallar('E_INFORME_INVALIDO');
    if (typeof entrada.enlace !== 'string' || !URL_DRIVE_RE.test(entrada.enlace)) Util.fallar('E_ENLACE_INVALIDO');
    var prefijo = entrada.ensayo === true ? '[ENSAYO] ' : '';
    return {
      asunto: prefijo + (typeof entrada.asunto === 'string' ? Util.limpiar(entrada.asunto).replace(/^\[ENSAYO\] /, '') : 'Resumen semanal de cobranza'),
      cuerpo_texto: entrada.texto_resumen + '\n\nInforme completo, con los borradores por cliente (solo lo abre quien tenga acceso a la carpeta):\n' + entrada.enlace +
        '\n\nAntes de enviar, revisar cada mensaje. Este correo no se envió a ningún cliente.'
    };
  }

  // Aviso cuando el archivo no se pudo leer (M1 pidió bloquear): texto fijo + códigos, sin datos del archivo.
  function armarAvisoIncidencia(entrada) {
    if (!entrada || !Util.esISO(entrada.fecha_corte) || !entrada.lectura || !entrada.lectura.resumen) Util.fallar('E_INFORME_INVALIDO');
    var empresa = Util.limpiar(entrada.empresa && entrada.empresa.nombre);
    if (!empresa || empresa.length > 120) Util.fallar('E_CFG_EMPRESA');
    var l = entrada.lectura, motivo = l.resumen.motivo_bloqueo;
    var L = ['No se pudo preparar el resumen de cobranza de ' + empresa + ' al ' + Util.formatoFecha(entrada.fecha_corte) + '.', ''];
    L.push('Motivo: ' + (Object.prototype.hasOwnProperty.call(DESCRIPCION_BLOQUEO, motivo) ? DESCRIPCION_BLOQUEO[motivo] : 'el archivo no se pudo leer con seguridad') + '.');
    if (l.detalle && Array.isArray(l.detalle.columnas)) {
      var nombres = l.detalle.columnas.filter(function (c) { return /^[a-z_]{2,20}$/.test(c); });
      if (nombres.length) L.push('Columnas afectadas: ' + nombres.join(', ') + '.');
    }
    var lect = lineasLectura(l);
    if (lect.length) { L.push(''); Array.prototype.push.apply(L, lect); }
    L.push('');
    L.push('No se envió nada a ningún cliente. Revisar el archivo de la semana y volver a dejarlo en la carpeta.');
    return { asunto: (entrada.ensayo === true ? '[ENSAYO] ' : '') + 'No se pudo preparar el resumen de cobranza · ' + Util.formatoFecha(entrada.fecha_corte), cuerpo_texto: L.join('\n') };
  }

  // Aviso cuando esta semana no llegó ninguna exportación reciente.
  function armarAvisoSinArchivo(entrada) {
    if (!entrada || !Util.esISO(entrada.fecha_corte)) Util.fallar('E_INFORME_INVALIDO');
    var empresa = Util.limpiar(entrada.empresa && entrada.empresa.nombre);
    if (!empresa || empresa.length > 120) Util.fallar('E_CFG_EMPRESA');
    return {
      asunto: (entrada.ensayo === true ? '[ENSAYO] ' : '') + 'No encontramos la exportación de esta semana · ' + Util.formatoFecha(entrada.fecha_corte),
      cuerpo_texto: 'No encontramos la exportación de facturas pendientes de ' + empresa + ' de esta semana.\n\n' +
        'Para preparar el resumen de cobranza hace falta dejar el archivo actualizado en la carpeta compartida. ' +
        'Cuando esté, el resumen se prepara automáticamente al día siguiente.\n\nNo se envió nada a ningún cliente.'
    };
  }

  return {
    MAX_FILAS_POR_DEFECTO: MAX_FILAS_POR_DEFECTO, DESCRIPCION_CODIGO: DESCRIPCION_CODIGO, DESCRIPCION_BLOQUEO: DESCRIPCION_BLOQUEO,
    armarInforme: armarInforme, armarCorreoConEnlace: armarCorreoConEnlace,
    armarAvisoIncidencia: armarAvisoIncidencia, armarAvisoSinArchivo: armarAvisoSinArchivo
  };
})();
