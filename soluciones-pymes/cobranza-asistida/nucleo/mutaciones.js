#!/usr/bin/env node
'use strict';
/* Pruebas de mutación del núcleo.

   Idea: si se rompe una regla de seguridad o de negocio a propósito, las pruebas TIENEN que darse cuenta. Aquí se
   introduce, de a una, una avería en una copia del código (se cambia una condición, se quita una comprobación, se
   invierte una comparación) y se ejecutan todas las pruebas contra esa copia. Cada avería tiene que hacer fallar
   al menos una prueba («muerta»). Si alguna pasa inadvertida («sobreviviente»), falta una prueba y el script sale
   con error.

   Uso:   node mutaciones.js            todas las mutaciones
          node mutaciones.js M5         solo las que empiezan con «M5»
          node mutaciones.js M5,P-0,U01  varias, separadas por comas
   Variables: MUT_TMP = carpeta para las copias temporales (por defecto, la temporal del sistema).
   No toca src/: trabaja siempre sobre copias (las pruebas leen NUCLEO_SRC). */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const RAIZ = __dirname;
const SRC = path.join(RAIZ, 'src');
const PRUEBAS = fs.readdirSync(path.join(RAIZ, 'tests')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('tests', f));

// { id, archivo, buscar (aparece UNA vez), poner, que: qué regla se rompe, tolerada?: por qué se acepta que sobreviva }
// Una mutación «tolerada» es una avería que ninguna prueba puede provocar porque el código que rompe es una red
// de seguridad inalcanzable por otro camino; se acepta solo con una razón escrita.
const MUTACIONES = [
  /* ---- Util */
  { id: 'U01', archivo: 'util.js', buscar: "if (typeof error.message === 'string' && CODIGO_RE.test(error.message)) return error.message;", poner: "if (typeof error.message === 'string') return error.message;", que: 'el mensaje libre de un error se filtra como si fuera un código' },
  { id: 'U02', archivo: 'util.js', buscar: "var c = CODIGO_RE.test(String(codigo)) ? String(codigo) : 'E_INTERNO';", poner: 'var c = String(codigo);', que: 'fallar acepta textos libres como código' },
  { id: 'U03', archivo: 'util.js', buscar: ".replace(/&/g, '&amp;').replace(/</g, '&lt;')", poner: ".replace(/&/g, '&amp;')", que: 'escHtml deja pasar «<»' },
  { id: 'U04', archivo: 'util.js', buscar: "f.setUTCDate(f.getUTCDate() + 4 - dow);", poner: "f.setUTCDate(f.getUTCDate() + 3 - dow);", que: 'semana ISO desplazada' },
  { id: 'U05', archivo: 'util.js', buscar: "if (!(y >= 2000 && y <= 2099 && m >= 1", poner: "if (!(y >= 1900 && y <= 2099 && m >= 1", que: 'años fuera de 2000–2099 se aceptan' },
  { id: 'U06', archivo: 'util.js', buscar: "if (local.length > 64) return null;", poner: "", que: 'correo con parte local de más de 64 caracteres' },
  { id: 'U07', archivo: 'util.js', buscar: "if (!(r <= MAX_SEGURO)) fallar('E_DESBORDE');", poner: "", que: 'la suma de importes no controla el desborde' },
  { id: 'U08', archivo: 'util.js', buscar: "if (typeof zona !== 'string' || !/^[A-Za-z_]+(?:\\/[A-Za-z_+-]+){0,2}$/.test(zona)) return null;", poner: "", que: 'una zona ausente usa la del sistema (resultado según el servidor)' },
  { id: 'U09', archivo: 'util.js', buscar: "if (frac.length > 2 && !/^\\d{2}0*$/.test(frac)) return null;", poner: "", que: 'importes con más de 2 decimales reales se redondean en silencio' },
  { id: 'U10', archivo: 'util.js', buscar: "if (d >= 1 && d <= 12 && mes > 12 && mes <= 31) return mal('E_FECHA_AMBIGUA');", poner: "", que: 'fecha con mes y día invertidos se acepta' },

  /* ---- M0 */
  { id: 'M0-01', archivo: 'm0-guardias.js', buscar: "var dryRun = !(d === false || texto(d) === 'false');", poner: "var dryRun = !(d === false || texto(d) === 'false' || texto(d) === 'no');", que: 'un «no» desactiva el ensayo' },
  { id: 'M0-02', archivo: 'm0-guardias.js', buscar: "var encendido = i === true || texto(i) === 'on';", poner: "var encendido = i === true || texto(i) === 'on' || texto(i) === 'true';", que: 'el interruptor acepta «true»' },
  { id: 'M0-03', archivo: 'm0-guardias.js', buscar: "var modo = cfg.modo === undefined ? 'dry_run' : cfg.modo;", poner: "var modo = cfg.modo === undefined ? 'real' : cfg.modo;", que: 'sin modo, la configuración queda en real' },
  { id: 'M0-04', archivo: 'm0-guardias.js', buscar: "cfg.acepta_correo_completo !== true", poner: "!cfg.acepta_correo_completo", que: 'cualquier valor verdadero acepta el informe completo por correo' },
  { id: 'M0-05', archivo: 'm0-guardias.js', buscar: "if (typeof x !== 'string' || Util.normalizarCorreo(x) !== x || vistos[x]) problemas.push(codigoInvalido);", poner: "if (typeof x !== 'string' || Util.normalizarCorreo(x) !== x) problemas.push(codigoInvalido);", que: 'lista blanca con direcciones repetidas' },

  /* ---- M1 */
  { id: 'M1-01', archivo: 'm1-normalizar.js', buscar: "else if (apartadas.length * 100 > cfg.umbral * total) { bloquear = true; motivo = 'E_DEMASIADAS_APARTADAS'; }", poner: "else if (apartadas.length * 100 > cfg.umbral * total * 2) { bloquear = true; motivo = 'E_DEMASIADAS_APARTADAS'; }", que: 'el umbral de rechazo se duplica' },
  { id: 'M1-02', archivo: 'm1-normalizar.js', buscar: "return f.importe_centavos === base.importe_centavos && f.vencimiento === base.vencimiento &&", poner: "return true || f.importe_centavos === base.importe_centavos && f.vencimiento === base.vencimiento &&", que: 'facturas repetidas con importes distintos se toman por duplicadas' },
  { id: 'M1-03', archivo: 'm1-normalizar.js', buscar: "if (claves[k] && claves[k] !== campo) Util.fallar('E_CFG_MAPEO');", poner: "", que: 'una columna puede tener dos significados' },
  { id: 'M1-04', archivo: 'm1-normalizar.js', buscar: "else if (hallados.length > 1) duplicadas.push(campo);", poner: "else if (hallados.length > 1) indice[campo] = hallados[0];", que: 'dos columnas con el mismo título se resuelven a ojo' },
  { id: 'M1-05', archivo: 'm1-normalizar.js', buscar: "if (rangoMin && (venc.iso < rangoMin || venc.iso > rangoMax)) codigos.push('E_FECHA_FUERA_DE_RANGO');", poner: "if (rangoMin && venc.iso < rangoMin) codigos.push('E_FECHA_FUERA_DE_RANGO');", que: 'vencimientos absurdos en el futuro se aceptan' },
  { id: 'M1-06', archivo: 'm1-normalizar.js', buscar: "if (monedaCol && imp.moneda && monedaCol !== imp.moneda) codigos.push('E_MONEDA_CONFLICTO');", poner: "if (false) codigos.push('E_MONEDA_CONFLICTO');", que: 'moneda de la columna distinta a la del importe' },
  { id: 'M1-07', archivo: 'm1-normalizar.js', buscar: "if (arreglo.length > nCabeceras && arreglo.slice(nCabeceras).some(function (x) { return !celdaVacia(x); })) {", poner: "if (false) {", que: 'filas desalineadas se aceptan' },
  { id: 'M1-08', archivo: 'm1-normalizar.js', buscar: "if (etiquetaDeTotal(f)) return celdaVacia(d) || etiquetaDeTotal(d);", poner: "if (etiquetaDeTotal(f)) return true;", que: 'una factura cuyo número es «Total» y tiene cliente se ignora' },
  { id: 'M1-09', archivo: 'm1-normalizar.js', buscar: "if (!cerrada) Util.fallar('E_CSV_COMILLAS');", poner: "", que: 'comillas sin cerrar se tragan el resto del archivo' },
  { id: 'M1-10', archivo: 'm1-normalizar.js', buscar: "avisos = avisos.filter(function (a) { return filasFinales[a.fila] === true; });", poner: "", que: 'avisos de filas que fueron apartadas' },

  /* ---- M2 */
  { id: 'M2-01', archivo: 'm2-antiguedad.js', buscar: "if (dias === 0) { vencenHoy++; return; }", poner: "", que: 'una factura que vence hoy se reclama como vencida' },
  { id: 'M2-02', archivo: 'm2-antiguedad.js', buscar: "v.escalon = f.en_disputa === true ? 'en_disputa' : escalones[e].nombre;", poner: "v.escalon = escalones[e].nombre;", que: 'una factura en disputa recibe reclamo' },
  { id: 'M2-03', archivo: 'm2-antiguedad.js', buscar: "if (dias >= rangos[i].desde && (rangos[i].hasta === null || dias <= rangos[i].hasta)) return i;", poner: "if (dias > rangos[i].desde && (rangos[i].hasta === null || dias <= rangos[i].hasta)) return i;", que: 'el primer día de cada tramo cae en el tramo anterior' },
  { id: 'M2-04', archivo: 'm2-antiguedad.js', buscar: "tot.total_centavos = Util.sumarSeguro(tot.total_centavos, v.importe_centavos);", poner: "tot.total_centavos = tot.total_centavos + v.importe_centavos;", que: 'el total no controla el desborde' },
  { id: 'M2-05', archivo: 'm2-antiguedad.js', buscar: "var DIAS_NUEVA = 7;", poner: "var DIAS_NUEVA = 8;", que: '«nueva esta semana» incluye un día de más' },

  /* ---- M3 */
  { id: 'M3-01', archivo: 'm3-borradores.js', buscar: "if (FRASES_RE.test(plano)) return 'E_PLANTILLA_FRASE_PROHIBIDA';", poner: "", que: 'las plantillas pueden amenazar' },
  { id: 'M3-02', archivo: 'm3-borradores.js', buscar: "if (usados.indexOf('factura') < 0 || !tieneImporte || usados.indexOf('vencimiento') < 0) return 'E_PLANTILLA_SIN_DATOS_CLAVE';", poner: "", que: 'plantilla sin la factura, el importe o el vencimiento' },
  { id: 'M3-03', archivo: 'm3-borradores.js', buscar: "(texto.indexOf(vars.importe_completo) < 0 && texto.indexOf(vars.importe) < 0)) Util.fallar('E_BORRADOR_SIN_DATOS_CLAVE');", poner: "false) Util.fallar('E_BORRADOR_SIN_DATOS_CLAVE');", que: 'borrador sin datos clave',
    tolerada: 'red de seguridad inalcanzable: la plantilla validada y las referencias normalizadas ya garantizan factura, importe y vencimiento en el texto' },
  { id: 'M3-04', archivo: 'm3-borradores.js', buscar: "if (typeof digitos !== 'string' || !/^\\d{8,15}$/.test(digitos)) return null;", poner: "if (typeof digitos !== 'string') return null;", que: 'enlace de WhatsApp con cualquier «número»' },
  { id: 'M3-05', archivo: 'm3-borradores.js', buscar: "if (Util.esNumeroDeEjemplo(v.contacto_tel)) avisos.push('A_TEL_EJEMPLO');", poner: "if (false) avisos.push('A_TEL_EJEMPLO');", que: 'los números de ejemplo generan enlace de WhatsApp' },
  { id: 'M3-06', archivo: 'm3-borradores.js', buscar: "if (v.escalon === 'en_disputa') { sinBorrador.push(", poner: "if (false) { sinBorrador.push(", que: 'una factura en disputa recibe borrador' },

  /* ---- M4 */
  { id: 'M4-01', archivo: 'm4-informe.js', buscar: "var esc = Util.escHtml;", poner: "var esc = function (s) { return String(s); };", que: 'el informe no escapa el HTML del archivo' },
  { id: 'M4-02', archivo: 'm4-informe.js', buscar: "return (tipo === 'wa' ? URL_WA_RE : URL_MAIL_RE).test(url) ? url : null;", poner: "return url;", que: 'enlaces no verificados en el informe' },
  { id: 'M4-03', archivo: 'm4-informe.js', buscar: "if (!v || vistos[x.indice] || v.factura_ref !== x.factura_ref || v.moneda !== x.moneda) Util.fallar('E_INFORME_INCONSISTENTE');", poner: "if (!v) Util.fallar('E_INFORME_INCONSISTENTE');", que: 'un borrador puede aparecer bajo otra factura' },
  { id: 'M4-04', archivo: 'm4-informe.js', buscar: "default-src \\'none\\'; style-src \\'unsafe-inline\\';", poner: "default-src *; style-src \\'unsafe-inline\\';", que: 'sin política de seguridad de contenido' },
  { id: 'M4-05', archivo: 'm4-informe.js', buscar: "if (typeof entrada.enlace !== 'string' || !URL_DRIVE_RE.test(entrada.enlace)) Util.fallar('E_ENLACE_INVALIDO');", poner: "", que: 'el correo con enlace acepta cualquier dirección' },
  { id: 'M4-06', archivo: 'm4-informe.js', buscar: "L.push('  · ' + ETIQUETA_MONEDA[m] + ': ' + plural(a.totales[m].n, 'factura', 'facturas') + ' por ' + Util.formatearImporte(a.totales[m].total_centavos, m));", poner: "L.push('  · ' + ETIQUETA_MONEDA[m] + ': ' + plural(a.totales[m].n, 'factura', 'facturas') + ' por ' + Util.formatearImporte(a.totales[m].total_centavos, m) + ' (' + a.vencidas[0].deudor_nombre + ')');", que: 'el resumen para el correo incluye un nombre del archivo' },

  /* ---- M5 */
  { id: 'M5-01', archivo: 'm5-guardia-envio.js', buscar: "else if (lb.indexOf(n) < 0) bloqueados.push({ indice: indice, motivo: 'NO_EN_LISTA_BLANCA' });", poner: "", que: 'se envía a direcciones fuera de la lista blanca' },
  { id: 'M5-02', archivo: 'm5-guardia-envio.js', buscar: "guardias.permitido === true && guardias.dry_run === false && modoCliente === 'real'", poner: "guardias.permitido === true && !guardias.dry_run && modoCliente === 'real'", que: 'un valor vacío en el interruptor de ensayo abre el envío real' },
  { id: 'M5-03', archivo: 'm5-guardia-envio.js', buscar: "guardias.permitido === true && guardias.dry_run === false && modoCliente === 'real'", poner: "guardias.permitido === true && guardias.dry_run === false && modoCliente !== 'dry_run'", que: 'un modo de cliente raro abre el envío real' },
  { id: 'M5-04', archivo: 'm5-guardia-envio.js', buscar: "if (bloqueados.length) return noEnviar('DESTINATARIO_BLOQUEADO', bloqueados);", poner: "", que: 'un destinatario inválido no frena el envío' },
  { id: 'M5-05', archivo: 'm5-guardia-envio.js', buscar: "return resultado('redirigir_ensayo', [rp], ['ENSAYO'], []);", poner: "return resultado('redirigir_ensayo', aceptados, ['ENSAYO'], []);", que: 'en ensayo el mensaje sale al dueño' },
  { id: 'M5-06', archivo: 'm5-guardia-envio.js', buscar: "if (!e.guardias || e.guardias.permitido !== true) return noEnviar('INTERRUPTOR_APAGADO');", poner: "", que: 'con el interruptor apagado se envía igual' },
  { id: 'M5-07', archivo: 'm5-guardia-envio.js', buscar: "var TOPE_ABSOLUTO = 5;", poner: "var TOPE_ABSOLUTO = 50;", que: 'el tope de destinatarios sube a 50' },
  { id: 'M5-08', archivo: 'm5-guardia-envio.js', buscar: "if (typeof lb[i] !== 'string' || Util.normalizarCorreo(lb[i]) !== lb[i]) return noEnviar('LISTA_BLANCA_INVALIDA');", poner: "", que: 'la lista blanca acepta direcciones sin normalizar' },

  /* ---- M6 */
  { id: 'M6-01', archivo: 'm6-registro.js', buscar: "return utcCanonico(fila.expira_utc) > utcCanonico(ahora) ? 'ocupado' : 'vencido';", poner: "return utcCanonico(fila.expira_utc) >= utcCanonico(ahora) ? 'ocupado' : 'vencido';", que: 'un bloqueo que vence justo ahora sigue ocupado' },
  { id: 'M6-02', archivo: 'm6-registro.js', buscar: "if (e.ya_resuelto) return 'omitir_ya_procesado';", poner: "", que: 'un archivo ya procesado se vuelve a procesar' },
  { id: 'M6-03', archivo: 'm6-registro.js', buscar: "Object.keys(d).forEach(function (k) { if (CLAVES_LIBRO.indexOf(k) < 0) Util.fallar('E_LIBRO_INVALIDO'); });", poner: "", que: 'el libro acepta columnas de más (datos personales)' },
  { id: 'M6-04', archivo: 'm6-registro.js', buscar: "codigo: Util.codigoDe(error),", poner: "codigo: String(error && error.message),", que: 'la alerta lleva el mensaje libre del error' },
  { id: 'M6-05', archivo: 'm6-registro.js', buscar: "if (ok && ((d.estado === 'error' || d.estado === 'incidencia') ? !conCodigo : (d.estado === 'ok' && conCodigo))) ok = false;", poner: "", que: 'filas de error sin código o «ok» con código' },
  { id: 'M6-06', archivo: 'm6-registro.js', buscar: "s = s.replace(/[^A-Za-z0-9À-ÿ _.:()\\[\\]\\/·-]/g, '?');", poner: "", que: 'los nombres en la alerta no se limpian' },

  /* ---- M7 */
  { id: 'M7-01', archivo: 'm7-ingesta.js', buscar: "if (dias > cfg.antiguedad) return { codigo: 'E_ARCHIVO_VIEJO' };", poner: "if (dias > cfg.antiguedad + 1) return { codigo: 'E_ARCHIVO_VIEJO' };", que: 'archivos con un día de más de antigüedad' },
  { id: 'M7-02', archivo: 'm7-ingesta.js', buscar: "if (dias < 0) return { codigo: 'E_ARCHIVO_FUTURO' };", poner: "", que: 'archivos del futuro' },
  { id: 'M7-03', archivo: 'm7-ingesta.js', buscar: "if (aptos.length > 1 && aptos[0].instante === aptos[1].instante) {", poner: "if (false) {", que: 'dos archivos igual de recientes: elige uno a ciegas' },
  { id: 'M7-04', archivo: 'm7-ingesta.js', buscar: "var tope = formato === 'xlsx' ? Math.min(cfg.maxBytes, MAX_BYTES_XLSX) : cfg.maxBytes;", poner: "var tope = cfg.maxBytes;", que: 'el tope menor del XLSX desaparece' },
  { id: 'M7-05', archivo: 'm7-ingesta.js', buscar: "var igual = tamanoDe(e.esperado_bytes) === tamanoDe(e.recibido_bytes);", poner: "var igual = true;", que: 'descargas cortadas se dan por buenas' },
  { id: 'M7-06', archivo: 'm7-ingesta.js', buscar: "if (diaDeSemanaISO(e.fecha_corte) < dia) return 'esperar';", poner: "if (diaDeSemanaISO(e.fecha_corte) <= dia) return 'esperar';", que: 'el aviso de «no llegó» se demora un día' },
  { id: 'M7-07', archivo: 'm7-ingesta.js', buscar: "if (!formato || TIPOS[formato].indexOf(a.mimeType.trim().toLowerCase()) < 0) return { codigo: 'E_ARCHIVO_TIPO' };", poner: "if (!formato) return { codigo: 'E_ARCHIVO_TIPO' };", que: 'el tipo de contenido no se comprueba' },
  { id: 'M7-08', archivo: 'm7-ingesta.js', buscar: "if (bytes === 0) return { codigo: 'E_ARCHIVO_VACIO' };", poner: "", que: 'archivos vacíos' },

  /* ---- pipeline */
  { id: 'P-01', archivo: 'pipeline.js', buscar: "var ensayo = !M5.esEnvioReal(e.guardias, config.modo);", poner: "var ensayo = false;", que: 'los informes de ensayo no se marcan como ensayo' },
  { id: 'P-02', archivo: 'pipeline.js', buscar: "if (envio.accion === 'no_enviar') Util.fallar('E_ENVIO_' + envio.motivos[0]);", poner: "", que: 'si la guardia no deja enviar, se sigue adelante' },
  { id: 'P-03', archivo: 'pipeline.js', buscar: "if ((envio.accion === 'enviar') !== real) Util.fallar('E_INCONSISTENCIA_ENSAYO');", poner: "", que: 'dos definiciones de «real» que no coinciden pasan inadvertidas' },
  { id: 'P-04', archivo: 'pipeline.js', buscar: "solicitados: config.destinatarios_permitidos, lista_blanca: config.destinatarios_permitidos,", poner: "solicitados: config.destinatarios_permitidos.concat(['espia@malo.example']), lista_blanca: config.destinatarios_permitidos,", que: 'un destinatario extra se cuela en el pedido' },
  { id: 'P-05', archivo: 'pipeline.js', buscar: "estado = 'incidencia'; codigoError = 'E_SIN_ARCHIVO'; conteos = SIN_CONTEOS; hash = M7.HUELLA_SIN_ARCHIVO;", poner: "estado = 'incidencia'; codigoError = 'E_SIN_ARCHIVO'; conteos = SIN_CONTEOS; hash = e.hash_archivo;", que: 'el aviso de «no llegó» no queda marcado con la huella de «sin archivo»' },
  { id: 'P-06', archivo: 'pipeline.js', buscar: "probar(function () { M7.validarConfig(configIngesta(config)); });", poner: "", que: 'la configuración de ingesta no se valida antes de empezar' },
  { id: 'P-07', archivo: 'pipeline.js', buscar: "a.escalones.forEach(function (e) { if (!plantillas[e.nombre]) Util.fallar('E_PLANTILLA_FALTANTE'); });", poner: "", que: 'un escalón sin plantilla no se detecta al validar' },
  { id: 'P-08', archivo: 'pipeline.js', buscar: "if (!guardias.permitido) return { accion: 'detener', motivo: guardias.motivo, problemas: [], guardias: guardias };", poner: "", que: 'con el interruptor apagado el arranque continúa' },
  { id: 'P-09', archivo: 'pipeline.js', buscar: "var sano = M6.sanearError(e.error, e.contexto);", poner: "var sano = { cliente_id: 'desconocido', workflow: 'x', nodo: 'x', codigo: String(e.error && e.error.message), ejecucion_id: 'x' };", que: 'la alerta al operador lleva el mensaje libre del error' },
  { id: 'P-10', archivo: 'pipeline.js', buscar: "solicitados: [e.operador], lista_blanca: [e.operador], guardias: { permitido: true, dry_run: false }, modo_cliente: 'real'", poner: "solicitados: [e.operador], lista_blanca: [e.operador], guardias: { permitido: true, dry_run: true }, modo_cliente: 'real'", que: 'la alerta al operador queda sujeta al ensayo y no llega' },
  { id: 'P-11', archivo: 'pipeline.js', buscar: "probar(function () { M1.validarConfig(copiaConCorte(config, fechaCorte)); });", poner: "", que: 'el mapeo de columnas no se valida antes de empezar' },
  { id: 'P-12', archivo: 'pipeline.js', buscar: "cuerpo_texto: '[ENSAYO] En modo real este mensaje se enviaría a: ' + config.destinatarios_permitidos.join(', ') + '.\\n\\n' + correo.cuerpo_texto,", poner: "cuerpo_texto: correo.cuerpo_texto,", que: 'el mensaje de ensayo no dice que es un ensayo' },
  { id: 'P-13', archivo: 'pipeline.js', buscar: "if ((e.tipo === 'informe' || e.tipo === 'incidencia') && (!esObjeto(p) || p.tipo !== e.tipo || p.ensayo !== ensayo)) Util.fallar('E_INCONSISTENCIA_ENSAYO');", poner: "", que: 'lo preparado en ensayo se envía como real (o al revés)' },
  { id: 'P-14', archivo: 'pipeline.js', buscar: "var bloqueo = M6.estadoBloqueo(e.fila_bloqueo === undefined ? null : e.fila_bloqueo, e.ahora_utc);", poner: "var bloqueo = 'libre';", que: 'el arranque ignora el bloqueo' },

  /* ---- referencias de factura y otras redes de seguridad */
  { id: 'U11', archivo: 'util.js', buscar: "&& s.indexOf('  ') < 0 && s.charAt(s.length - 1) !== ' ';", poner: ";", que: 'referencias con espacios dobles o finales' },
  { id: 'U12', archivo: 'util.js', buscar: "return typeof s === 'string' && s.length <= 40 && /^[A-Z0-9][A-Z0-9 ./_-]*$/.test(s)", poner: "return typeof s === 'string' && s.length <= 40 && /^[A-Za-z0-9\\s][A-Za-z0-9 ./_\\s-]*$/.test(s)", que: 'referencias con saltos de línea o minúsculas llegan a los mensajes' },
  { id: 'M2-06', archivo: 'm2-antiguedad.js', buscar: "!Util.refValida(f.factura_ref) ||", poner: "typeof f.factura_ref !== 'string' ||", que: 'M2 acepta referencias sin normalizar' },
  { id: 'M2-08', archivo: 'm2-antiguedad.js', buscar: "pt[v.tramo].total_centavos = Util.sumarSeguro(pt[v.tramo].total_centavos, v.importe_centavos);", poner: "pt[v.tramo].total_centavos = pt[v.tramo].total_centavos + v.importe_centavos;", que: 'el total de un tramo no controla el desborde',
    tolerada: 'mutante equivalente: un tramo nunca suma más que el total de su moneda, y ese total se controla antes en cada vuelta' },
  { id: 'M2-07', archivo: 'm2-antiguedad.js', buscar: "f.importe_centavos > 0 && f.importe_centavos <= Util.LIMITE_CENTAVOS)", poner: "f.importe_centavos > 0)", que: 'importes sobre el límite seguro' },
  { id: 'M3-07', archivo: 'm3-borradores.js', buscar: "!Util.refValida(v.factura_ref) ||", poner: "typeof v.factura_ref !== 'string' ||", que: 'M3 acepta referencias sin normalizar' },
  { id: 'M0-06', archivo: 'm0-guardias.js', buscar: "try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (e) { return false; }", poner: "return true;", que: 'zonas horarias inexistentes' },
  { id: 'M5-09', archivo: 'm5-guardia-envio.js', buscar: "else if (aceptados.indexOf(n) < 0) aceptados.push(n);", poner: "else aceptados.push(n);", que: 'destinatarios repetidos reciben el mensaje varias veces' },
  { id: 'M5-10', archivo: 'm5-guardia-envio.js', buscar: "if (!Array.isArray(sol) || sol.length < 1 || sol.length > max) return noEnviar('SOLICITADOS_INVALIDOS');", poner: "if (!Array.isArray(sol) || sol.length < 1) return noEnviar('SOLICITADOS_INVALIDOS');", que: 'más destinatarios que el máximo' },
  { id: 'M6-07', archivo: 'm6-registro.js', buscar: "return clienteId + '|' + Util.semanaISO(fechaCorte) + '|' + huella;", poner: "return clienteId + '|' + fechaCorte + '|' + huella;", que: 'la clave de idempotencia cambia cada día' },
  { id: 'M7-09', archivo: 'm7-ingesta.js', buscar: "if (p < patron.length && (patron.charAt(p) === '?' || patron.charAt(p) === texto.charAt(t))) { p++; t++; }", poner: "if (p < patron.length && patron.charAt(p) === texto.charAt(t)) { p++; t++; }", que: 'el comodín «?» deja de funcionar' },
  { id: 'M1-11', archivo: 'm1-normalizar.js', buscar: "if (total === 0) { bloquear = true; motivo = 'E_ARCHIVO_VACIO'; }", poner: "if (false) { bloquear = true; motivo = 'E_ARCHIVO_VACIO'; }", que: 'un archivo sin filas produce un informe vacío en lugar de una incidencia' },
  { id: 'M4-07', archivo: 'm4-informe.js', buscar: "if (Object.keys(vistos).length !== a.vencidas.length) Util.fallar('E_INFORME_INCONSISTENTE');", poner: "", que: 'facturas vencidas sin borrador ni marca aparecen en el informe' },
];

/* ------------------------------------------------------------------ ejecución */

function copiar(origen, destino) {
  fs.mkdirSync(destino, { recursive: true });
  for (const f of fs.readdirSync(origen)) fs.copyFileSync(path.join(origen, f), path.join(destino, f));
}

function correrUna(m, base) {
  const original = fs.readFileSync(path.join(SRC, m.archivo), 'utf8');
  const apariciones = original.split(m.buscar).length - 1;
  if (apariciones !== 1) return { id: m.id, estado: 'vieja', detalle: apariciones + ' apariciones del texto a cambiar' };
  const mutado = original.replace(m.buscar, () => m.poner);
  if (mutado === original) return { id: m.id, estado: 'vieja', detalle: 'el cambio no modifica nada' };
  try { new vm.Script(mutado, { filename: m.archivo }); } catch (e) { return { id: m.id, estado: 'invalida', detalle: 'el código mutado no compila: ' + e.message }; }
  const dir = fs.mkdtempSync(path.join(base, 'mut-' + m.id + '-'));
  try {
    copiar(SRC, dir);
    fs.writeFileSync(path.join(dir, m.archivo), mutado);
    const r = spawnSync(process.execPath, ['--test', ...PRUEBAS], {
      cwd: RAIZ, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, NUCLEO_SRC: dir, TZ: process.env.TZ || 'America/Montevideo' }
    });
    const fallidas = (/^# fail (\d+)/m.exec(r.stdout) || [])[1];
    if (r.status !== 0 && Number(fallidas) > 0) return { id: m.id, estado: 'muerta', detalle: fallidas + ' pruebas fallan' };
    if (r.status !== 0) return { id: m.id, estado: 'invalida', detalle: 'las pruebas no llegaron a ejecutarse (código ' + r.status + ')' };
    if (m.tolerada) return { id: m.id, estado: 'tolerada', detalle: m.tolerada };
    return { id: m.id, estado: 'sobreviviente', detalle: m.que };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const filtros = (process.argv[2] || '').split(',');
  const lista = MUTACIONES.filter((m) => filtros.some((f) => m.id.startsWith(f)));
  if (!lista.length) { console.error('Ninguna mutación coincide con «' + process.argv[2] + '».'); process.exit(2); }
  const ids = new Set();
  for (const m of MUTACIONES) { if (ids.has(m.id)) { console.error('Identificador repetido: ' + m.id); process.exit(2); } ids.add(m.id); }

  const base = process.env.MUT_TMP || os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  const resultados = [];
  for (const m of lista) {
    const r = correrUna(m, base);
    resultados.push(r);
    const bien = r.estado === 'muerta' || r.estado === 'tolerada';
    console.log((bien ? '  ok  ' : ' FALLA ') + m.id.padEnd(7) + r.estado.padEnd(14) + (r.estado === 'muerta' ? m.que : r.detalle + (r.estado === 'tolerada' ? '' : ' — ' + m.que)));
  }
  const cuenta = (e) => resultados.filter((r) => r.estado === e).length;
  console.log('\nMutaciones: ' + resultados.length + ' · detectadas: ' + cuenta('muerta') + ' · toleradas: ' + cuenta('tolerada') + ' · sobrevivientes: ' + cuenta('sobreviviente') +
    ' · obsoletas: ' + cuenta('vieja') + ' · inválidas: ' + cuenta('invalida'));
  process.exit(cuenta('muerta') + cuenta('tolerada') === resultados.length ? 0 : 1);
}

if (require.main === module) main();
module.exports = { MUTACIONES };
