/* ==========================================================================
   M7 · Ingesta: decidir QUÉ archivo se procesa y si hay que avisar de que no llegó. Módulo PURO (usa solo Util).

   Entrada: la lista de archivos que devolvió la carpeta de entrada (id, nombre, tipo, tamaño, fecha de
   modificación), la fecha de corte y los límites de la configuración. Nunca abre archivos y JAMÁS devuelve
   nombres: el nombre de un archivo puede contener el de una persona. Solo devuelve identificador, formato,
   tamaño y fechas.

   Reglas (todas fallan cerradas: ante la duda, el archivo no se usa):
   · Solo formatos .csv, .tsv y .xlsx, con un tipo de contenido coherente con la extensión.
   · Tamaño mayor que cero y menor que el tope (el XLSX tiene un tope menor: es un zip y puede expandirse).
   · Modificado dentro de los últimos N días (8 por defecto) y no en el futuro; el más reciente gana.
   · Si dos archivos aptos comparten el instante más reciente, no se elige ninguno («ambiguo»).
   · «No llegó» se avisa una sola vez por semana, a partir del día configurado (miércoles por defecto).
   ========================================================================== */
var M7 = (function () {
  'use strict';

  var MAX_ARCHIVOS_LISTADOS = 500;
  var MAX_BYTES_TOPE = 6000000; // el mismo tope de caracteres que M1
  var MAX_BYTES_DEFECTO = 5000000;
  var MAX_BYTES_XLSX = 2000000;
  var ANTIGUEDAD_DEFECTO = 8;
  var DIA_AVISO_DEFECTO = 3; // miércoles (ISO: lunes = 1 … domingo = 7)
  var HUELLA_SIN_ARCHIVO = new Array(65).join('0'); // 64 ceros: «no hay archivo» en la clave del libro

  var TIPOS = {
    csv: ['text/csv', 'application/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'],
    tsv: ['text/tab-separated-values', 'text/plain', 'application/octet-stream'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream']
  };

  var ID_RE = /^[A-Za-z0-9_-]{10,128}$/;
  var INSTANTE_RE = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

  function esObjeto(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  /* ----------------------------------------------------------- configuración */

  function comparable(s) { return Util.sinAcentos(Util.limpiar(s)).toLowerCase(); }

  function validarConfig(cfg) {
    var c = cfg === undefined || cfg === null ? {} : cfg;
    if (!esObjeto(c)) Util.fallar('E_CFG_INGESTA');
    var patron = c.patron_nombre_archivo === undefined ? '*' : c.patron_nombre_archivo;
    if (typeof patron !== 'string') Util.fallar('E_CFG_PATRON');
    var p = comparable(patron);
    if (!p || p.length > 60 || p.split('*').length > 4 || /[\/\\]/.test(p)) Util.fallar('E_CFG_PATRON');
    var ant = c.antiguedad_maxima_archivo_dias === undefined ? ANTIGUEDAD_DEFECTO : c.antiguedad_maxima_archivo_dias;
    if (!(Number.isInteger(ant) && ant >= 1 && ant <= 31)) Util.fallar('E_CFG_ANTIGUEDAD');
    var max = c.tamano_maximo_bytes === undefined ? MAX_BYTES_DEFECTO : c.tamano_maximo_bytes;
    if (!(Number.isInteger(max) && max >= 1024 && max <= MAX_BYTES_TOPE)) Util.fallar('E_CFG_TAMANO');
    var zona = c.zona_horaria;
    if (typeof zona !== 'string' || !/^[A-Za-z_]+(?:\/[A-Za-z_+-]+){0,2}$/.test(zona) || Util.fechaEnZona('2026-01-01T12:00:00Z', zona) === null) Util.fallar('E_CFG_ZONA');
    return { patron: p, antiguedad: ant, maxBytes: max, zona: zona };
  }

  /* ------------------------------------------------------------ coincidencia */

  // «*» = cualquier tramo, «?» = un carácter. Sin expresiones regulares: el coste es acotado por el largo del nombre.
  function coincide(patron, texto) {
    var p = 0, t = 0, estrella = -1, marca = 0;
    while (t < texto.length) {
      if (p < patron.length && (patron.charAt(p) === '?' || patron.charAt(p) === texto.charAt(t))) { p++; t++; }
      else if (p < patron.length && patron.charAt(p) === '*') { estrella = p; marca = t; p++; }
      else if (estrella >= 0) { p = estrella + 1; marca++; t = marca; }
      else return false;
    }
    while (p < patron.length && patron.charAt(p) === '*') p++;
    return p === patron.length;
  }

  function formatoDe(nombre) {
    var m = /\.([a-z0-9]{1,5})$/.exec(nombre);
    var ext = m ? m[1] : '';
    return ext === 'csv' || ext === 'tsv' || ext === 'xlsx' ? ext : null;
  }

  function tamanoDe(v) {
    if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 9007199254740991 ? v : null;
    if (typeof v === 'string' && /^\d{1,15}$/.test(v)) return parseInt(v, 10); // la API de Drive lo entrega como texto
    return null;
  }

  /* ---------------------------------------------------------- elegirArchivo */

  // Devuelve { codigo } si el archivo no sirve, o { ok:true, ... } con lo que hace falta saber de él.
  function evaluar(a, cfg, fechaCorte) {
    if (!esObjeto(a) || typeof a.id !== 'string' || !ID_RE.test(a.id) || typeof a.name !== 'string' ||
        typeof a.mimeType !== 'string' || typeof a.modifiedTime !== 'string' || !INSTANTE_RE.test(a.modifiedTime)) return { codigo: 'E_ARCHIVO_METADATOS' };
    var bytes = tamanoDe(a.size);
    if (bytes === null) return { codigo: 'E_ARCHIVO_METADATOS' };
    var nombre = comparable(a.name);
    if (!nombre || nombre.length > 255) return { codigo: 'E_ARCHIVO_METADATOS' };

    var formato = formatoDe(nombre);
    if (!formato || TIPOS[formato].indexOf(a.mimeType.trim().toLowerCase()) < 0) return { codigo: 'E_ARCHIVO_TIPO' };
    if (!coincide(cfg.patron, nombre)) return { codigo: 'E_ARCHIVO_NOMBRE' };

    if (bytes === 0) return { codigo: 'E_ARCHIVO_VACIO' };
    var tope = formato === 'xlsx' ? Math.min(cfg.maxBytes, MAX_BYTES_XLSX) : cfg.maxBytes;
    if (bytes > tope) return { codigo: 'E_ARCHIVO_GRANDE' };

    var local = Util.fechaEnZona(a.modifiedTime, cfg.zona);
    var instante = new Date(a.modifiedTime).getTime();
    if (local === null || isNaN(instante)) return { codigo: 'E_ARCHIVO_METADATOS' };
    var dias = Util.diasEntre(local, fechaCorte);
    if (dias < 0) return { codigo: 'E_ARCHIVO_FUTURO' };
    if (dias > cfg.antiguedad) return { codigo: 'E_ARCHIVO_VIEJO' };
    return { ok: true, id: a.id, formato: formato, bytes: bytes, modificado_fecha: local, dias_de_antiguedad: dias, instante: instante };
  }

  /* entrada: { archivos: [{id, name, mimeType, size, modifiedTime}], fecha_corte, config: { patron_nombre_archivo?,
               antiguedad_maxima_archivo_dias?, tamano_maximo_bytes?, zona_horaria } }
     salida: { estado: 'elegido' | 'sin_archivo' | 'ambiguo', archivo, descartados: [{indice, codigo}], por_codigo, total } */
  function elegirArchivo(e) {
    if (!esObjeto(e) || !Array.isArray(e.archivos) || !Util.esISO(e.fecha_corte)) Util.fallar('E_INGESTA_INVALIDA');
    if (e.archivos.length > MAX_ARCHIVOS_LISTADOS) Util.fallar('E_INGESTA_DEMASIADOS');
    var cfg = validarConfig(e.config);

    var aptos = [], descartados = [];
    e.archivos.forEach(function (a, indice) {
      var r = evaluar(a, cfg, e.fecha_corte);
      if (r.ok) { r.indice = indice; aptos.push(r); } else descartados.push({ indice: indice, codigo: r.codigo });
    });

    var salida = { archivo: null, descartados: descartados, por_codigo: Util.contarPorCodigo(descartados), total: e.archivos.length };
    if (!aptos.length) { salida.estado = 'sin_archivo'; return salida; }

    aptos.sort(function (x, y) { return y.instante - x.instante || x.indice - y.indice; });
    if (aptos.length > 1 && aptos[0].instante === aptos[1].instante) {
      salida.estado = 'ambiguo';
      return salida;
    }
    var g = aptos[0];
    salida.estado = 'elegido';
    salida.archivo = { indice: g.indice, id: g.id, formato: g.formato, bytes: g.bytes, modificado_fecha: g.modificado_fecha, dias_de_antiguedad: g.dias_de_antiguedad };
    return salida;
  }

  /* ------------------------------------------------------------- descarga */

  // Una descarga cortada a mitad daría un informe con facturas de menos sin que nadie lo note.
  function verificarDescarga(e) {
    if (!esObjeto(e) || tamanoDe(e.esperado_bytes) === null || tamanoDe(e.recibido_bytes) === null) Util.fallar('E_INGESTA_INVALIDA');
    var igual = tamanoDe(e.esperado_bytes) === tamanoDe(e.recibido_bytes);
    return { ok: igual, codigo: igual ? null : 'E_DESCARGA_INCOMPLETA' };
  }

  /* ------------------------------------------------ aviso de «no llegó» */

  // Lunes = 1 … domingo = 7. El 3 de enero de 2000 fue lunes (las fechas admitidas van de 2000 a 2099).
  function diaDeSemanaISO(iso) {
    if (!Util.esISO(iso)) Util.fallar('E_FECHA_INVALIDA');
    return (Util.diasEntre('2000-01-03', iso) % 7 + 7) % 7 + 1;
  }

  // entrada: { fecha_corte, dia_aviso?: 1..7, aviso_ya_enviado: boolean } → 'esperar' | 'avisar' | 'omitir_ya_avisado'
  function decidirSinArchivo(e) {
    if (!esObjeto(e) || !Util.esISO(e.fecha_corte) || typeof e.aviso_ya_enviado !== 'boolean') Util.fallar('E_INGESTA_INVALIDA');
    var dia = e.dia_aviso === undefined ? DIA_AVISO_DEFECTO : e.dia_aviso;
    if (!(Number.isInteger(dia) && dia >= 1 && dia <= 7)) Util.fallar('E_CFG_DIA_AVISO');
    if (diaDeSemanaISO(e.fecha_corte) < dia) return 'esperar';
    return e.aviso_ya_enviado ? 'omitir_ya_avisado' : 'avisar';
  }

  return {
    HUELLA_SIN_ARCHIVO: HUELLA_SIN_ARCHIVO, MAX_BYTES_DEFECTO: MAX_BYTES_DEFECTO, MAX_BYTES_XLSX: MAX_BYTES_XLSX,
    ANTIGUEDAD_DEFECTO: ANTIGUEDAD_DEFECTO, DIA_AVISO_DEFECTO: DIA_AVISO_DEFECTO, MAX_ARCHIVOS_LISTADOS: MAX_ARCHIVOS_LISTADOS,
    validarConfig: validarConfig, coincide: coincide, elegirArchivo: elegirArchivo, verificarDescarga: verificarDescarga,
    diaDeSemanaISO: diaDeSemanaISO, decidirSinArchivo: decidirSinArchivo
  };
})();
