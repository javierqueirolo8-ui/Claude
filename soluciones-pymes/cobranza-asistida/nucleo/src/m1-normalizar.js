/* ==========================================================================
   M1 · Normalizar tabla. Módulo PURO (usa solo Util, que va antepuesto).

   Entrada: la exportación de «facturas pendientes» del cliente, como texto CSV o como filas ya
   extraídas por n8n (una lista de objetos {título: valor}). Salida: facturas normalizadas y filas
   apartadas con un código. Sin red, sin reloj, sin azar, sin estado.

   Principios:
   · Falla cerrada: una fila dudosa se aparta con un código, nunca se «arregla» a ojo.
   · Los títulos de columna se asignan por configuración, JAMÁS por parecido: leer «Total» en vez de
     «Saldo» reclamaría un importe equivocado.
   · Ningún error, aviso ni código lleva el valor del archivo; solo el número de fila.
   · aceptadas + apartadas = total, siempre.
   ========================================================================== */
var M1 = (function () {
  'use strict';

  var CAMPOS_OBLIGATORIOS = ['factura', 'deudor', 'importe', 'vencimiento'];
  var CAMPOS_OPCIONALES = ['serie', 'moneda', 'emision', 'telefono', 'correo', 'en_disputa'];
  var CAMPOS = CAMPOS_OBLIGATORIOS.concat(CAMPOS_OPCIONALES);

  var LIMITES_POR_DEFECTO = { max_filas: 5000, max_largo_celda: 300 };
  var MAX_CARACTERES_TEXTO = 6000000;
  var UMBRAL_POR_DEFECTO = 5;
  var MONEDAS = ['UYU', 'USD'];

  /* ------------------------------------------------------------ configuración */

  function esObjeto(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  function candidatos(v) {
    var lista = Array.isArray(v) ? v : [v];
    var claves = [];
    for (var i = 0; i < lista.length; i++) {
      if (typeof lista[i] !== 'string') return null;
      var k = Util.clave(lista[i]);
      if (!k || lista[i].length > 100) return null;
      claves.push(k);
    }
    return claves.length ? claves : null;
  }

  // Devuelve la configuración ya validada y completa. Una configuración mala es un error de quien
  // configura, no del archivo: se lanza un código E_CFG_* y no se procesa nada.
  function validarConfig(cfg) {
    if (!esObjeto(cfg)) Util.fallar('E_CFG_MAPEO');
    var mapeo = cfg.mapeo_columnas;
    if (!esObjeto(mapeo)) Util.fallar('E_CFG_MAPEO');
    var claves = {};
    var porCampo = {};
    Object.keys(mapeo).forEach(function (campo) {
      if (CAMPOS.indexOf(campo) < 0) Util.fallar('E_CFG_MAPEO'); // un campo mal escrito no se ignora
    });
    CAMPOS.forEach(function (campo) {
      var v = mapeo[campo];
      if (v === undefined || v === null) {
        if (CAMPOS_OBLIGATORIOS.indexOf(campo) >= 0) Util.fallar('E_CFG_MAPEO');
        return;
      }
      var c = candidatos(v);
      if (!c) Util.fallar('E_CFG_MAPEO');
      c.forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(claves, k) && claves[k] !== campo) Util.fallar('E_CFG_MAPEO'); // una columna, un solo significado
        // (hasOwnProperty: un título llamado «constructor» no es una columna repetida)
        claves[k] = campo;
      });
      porCampo[campo] = c;
    });

    var fi = cfg.formato_importe || {};
    var decimal = fi.decimal === undefined ? ',' : fi.decimal;
    var miles = fi.miles === undefined ? (decimal === ',' ? '.' : ',') : fi.miles;
    if ((decimal !== ',' && decimal !== '.') || [',', '.', ' ', ''].indexOf(miles) < 0 || miles === decimal) Util.fallar('E_CFG_FORMATO');

    var monedas = cfg.monedas_admitidas === undefined ? MONEDAS.slice() : cfg.monedas_admitidas;
    if (!Array.isArray(monedas) || !monedas.length || monedas.some(function (m) { return MONEDAS.indexOf(m) < 0; })) Util.fallar('E_CFG_MONEDAS');
    var porDefecto = cfg.moneda_por_defecto === undefined ? null : cfg.moneda_por_defecto;
    if (porDefecto !== null && monedas.indexOf(porDefecto) < 0) Util.fallar('E_CFG_MONEDAS');

    var umbral = cfg.umbral_rechazo === undefined ? UMBRAL_POR_DEFECTO : cfg.umbral_rechazo;
    if (typeof umbral !== 'number' || !(umbral >= 0 && umbral <= 100)) Util.fallar('E_CFG_UMBRAL');

    var lim = cfg.limites || {};
    var maxFilas = lim.max_filas === undefined ? LIMITES_POR_DEFECTO.max_filas : lim.max_filas;
    var maxCelda = lim.max_largo_celda === undefined ? LIMITES_POR_DEFECTO.max_largo_celda : lim.max_largo_celda;
    if (!(Number.isInteger(maxFilas) && maxFilas >= 1 && maxFilas <= 20000) ||
        !(Number.isInteger(maxCelda) && maxCelda >= 10 && maxCelda <= 1000)) Util.fallar('E_CFG_LIMITES');

    var corte = cfg.fecha_corte === undefined ? null : cfg.fecha_corte;
    if (corte !== null && !Util.esISO(corte)) Util.fallar('E_CFG_FECHA_CORTE');
    var rango = cfg.rango_vencimiento || {};
    var atras = rango.anios_atras === undefined ? 5 : rango.anios_atras;
    var adelante = rango.anios_adelante === undefined ? 2 : rango.anios_adelante;
    if (!(Number.isInteger(atras) && atras >= 1 && atras <= 30 && Number.isInteger(adelante) && adelante >= 0 && adelante <= 30)) Util.fallar('E_CFG_FECHA_CORTE');

    var zona = cfg.zona_horaria === undefined ? null : cfg.zona_horaria;
    if (zona !== null && (typeof zona !== 'string' || !/^[A-Za-z_]+(?:\/[A-Za-z_+-]+){0,2}$/.test(zona))) Util.fallar('E_CFG_ZONA');

    return {
      candidatos: porCampo, decimal: decimal, miles: miles, monedas: monedas, monedaPorDefecto: porDefecto,
      umbral: umbral, maxFilas: maxFilas, maxCelda: maxCelda, corte: corte, atras: atras, adelante: adelante, zona: zona,
      ignorarTotales: cfg.ignorar_filas_de_total === true,
      filaBase: Number.isInteger(cfg.fila_base) && cfg.fila_base >= 1 && cfg.fila_base <= 1000 ? cfg.fila_base : 2
    };
  }

  /* ---------------------------------------------------------------- lector CSV */

  // Delimitador de la primera línea con contenido, ignorando lo que va entre comillas.
  function detectarDelimitador(t) {
    var inicio = t.search(/\S/);
    if (inicio < 0) return null;
    var cuenta = { ';': 0, ',': 0, '\t': 0, '|': 0 }, enComillas = false;
    for (var i = inicio; i < t.length; i++) {
      var c = t.charAt(i);
      if (c === '"') { enComillas = !enComillas; continue; }
      if (!enComillas && (c === '\n' || c === '\r')) break;
      if (!enComillas && Object.prototype.hasOwnProperty.call(cuenta, c)) cuenta[c]++;
    }
    var mejor = null, max = 0;
    [';', ',', '\t', '|'].forEach(function (d) { if (cuenta[d] > max) { max = cuenta[d]; mejor = d; } });
    return mejor;
  }

  // CSV tolerante (RFC 4180): comillas, comillas dobles, saltos de línea dentro de un campo, \r\n / \n / \r.
  // Devuelve { cabeceras, filas: [[celdas]], lineas: [n] }. Comillas sin cerrar = archivo rechazado: se
  // tragarían el resto de filas dentro de un solo campo.
  function leerCSV(entrada) {
    if (typeof entrada !== 'string') Util.fallar('E_CSV_VACIO');
    if (entrada.length > MAX_CARACTERES_TEXTO) Util.fallar('E_ARCHIVO_GRANDE');
    var t = entrada.charCodeAt(0) === 0xFEFF ? entrada.slice(1) : entrada; // quita el BOM
    var delim = detectarDelimitador(t);
    var filas = [], fila = [], campo = '', lineas = [], vacias = 0;
    var i = 0, n = t.length, linea = 1, lineaInicio = 1;

    function cerrarCampo() { fila.push(campo); campo = ''; }
    function cerrarFila() {
      cerrarCampo();
      if (fila.some(function (x) { return x.trim() !== ''; })) { filas.push(fila); lineas.push(lineaInicio); }
      else vacias++;
      fila = [];
    }

    while (i < n) {
      var c = t.charAt(i);
      if (c === '"' && campo.trim() === '') { // comienzo de campo entrecomillado
        campo = ''; i++;
        var cerrada = false;
        while (i < n) {
          var d = t.charAt(i);
          if (d === '"') {
            if (t.charAt(i + 1) === '"') { campo += '"'; i += 2; continue; }
            i++; cerrada = true; break;
          }
          if (d === '\n') linea++;
          campo += d; i++;
        }
        if (!cerrada) Util.fallar('E_CSV_COMILLAS');
        continue;
      }
      if (delim && c === delim) { cerrarCampo(); i++; continue; }
      if (c === '\r' || c === '\n') {
        if (c === '\r' && t.charAt(i + 1) === '\n') i++;
        i++; cerrarFila(); linea++; lineaInicio = linea;
        continue;
      }
      campo += c; i++;
    }
    if (campo !== '' || fila.length) cerrarFila();
    if (!filas.length) Util.fallar('E_CSV_VACIO');
    return { cabeceras: filas[0].map(function (x) { return x.trim(); }), filas: filas.slice(1), lineas: lineas.slice(1), vacias: vacias };
  }

  /* --------------------------------------------------------------- utilidades */

  function celdaVacia(v) { return Util.limpiar(v) === ''; }

  function restarAnios(iso, n) {
    var p = Util.partesISO(iso);
    var y = p.y - n, d = p.d;
    if (p.m === 2 && d === 29 && !Util.fechaValida(y, 2, 29)) d = 28;
    return Util.isoDe(y, p.m, d);
  }

  function referencia(txt) {
    var s = Util.limpiar(txt).toUpperCase();
    if (!s) return { ok: false, codigo: 'E_REF_VACIA' };
    if (!Util.refValida(s)) return { ok: false, codigo: 'E_REF_INVALIDA' };
    return { ok: true, ref: s };
  }

  function claveDeReferencia(ref) { return ref.replace(/[ ./_-]/g, ''); }

  var VERDADERO = { si: 1, s: 1, '1': 1, 'true': 1, x: 1, verdadero: 1, yes: 1, y: 1 };
  var FALSO = { no: 1, n: 1, '0': 1, 'false': 1, falso: 1 };

  // { valor, entendido }: lo que no se entiende se trata como «en disputa» (no insistir) y se avisa.
  function booleano(v) {
    var k = Util.sinAcentos(Util.limpiar(v)).toLowerCase();
    if (k === '') return { valor: false, entendido: true };
    if (Object.prototype.hasOwnProperty.call(VERDADERO, k)) return { valor: true, entendido: true };
    if (Object.prototype.hasOwnProperty.call(FALSO, k)) return { valor: false, entendido: true };
    return { valor: true, entendido: false };
  }

  function nombreDeudor(txt) { return Util.limpiar(txt); }

  // Fila de «Total»: sin fecha de vencimiento y, o bien sin número ni cliente, o bien con la palabra «Total» (o
  // «Subtotal», «Total general»…) como único texto identificador. Solo si la configuración lo pide.
  var ETIQUETAS_TOTAL = ['total', 'totales', 'subtotal', 'subtotales', 'totalgeneral', 'sumatotal'];
  function etiquetaDeTotal(v) { return ETIQUETAS_TOTAL.indexOf(Util.clave(v)) >= 0; }

  function esFilaDeTotal(cel, indice) {
    if (!celdaVacia(cel('vencimiento'))) return false;
    var f = cel('factura'), d = cel('deudor');
    if (celdaVacia(f) && celdaVacia(d)) return indice.serie === undefined || celdaVacia(cel('serie'));
    if (etiquetaDeTotal(f)) return celdaVacia(d) || etiquetaDeTotal(d);
    if (etiquetaDeTotal(d)) return celdaVacia(f);
    return false;
  }

  /* ------------------------------------------------------------- núcleo común */

  function resultadoVacio(codigo, detalle, cfg) {
    return {
      error: codigo, detalle: detalle || null,
      facturas: [], apartadas: [], avisos: [], por_codigo: {},
      resumen: {
        total: 0, aceptadas: 0, apartadas: 0, vacias: 0, totales_ignorados: 0, tasa_apartadas: 0,
        umbral_rechazo: cfg ? cfg.umbral : UMBRAL_POR_DEFECTO, bloquear: true, motivo_bloqueo: codigo
      }
    };
  }

  // tabla: { cabeceras: [texto], filas: [[valores]], lineas?: [n] }
  function normalizarTabla(tabla, cfgEntrada) {
    var cfg = validarConfig(cfgEntrada);
    var cabeceras = tabla.cabeceras, datos = tabla.filas;
    if (datos.length > cfg.maxFilas) return resultadoVacio('E_DEMASIADAS_FILAS', null, cfg);

    // Asignación de columnas: por configuración y con coincidencia EXACTA (sin mayúsculas ni tildes).
    var indice = {}, faltantes = [], duplicadas = [];
    CAMPOS.forEach(function (campo) {
      var cand = cfg.candidatos[campo];
      if (!cand) return;
      var hallados = [];
      cabeceras.forEach(function (h, i) { if (cand.indexOf(Util.clave(h)) >= 0) hallados.push(i); });
      if (hallados.length === 0) { if (CAMPOS_OBLIGATORIOS.indexOf(campo) >= 0) faltantes.push(campo); }
      else if (hallados.length > 1) duplicadas.push(campo);
      else indice[campo] = hallados[0];
    });
    if (faltantes.length) return resultadoVacio('E_COLUMNA_FALTANTE', { columnas: faltantes }, cfg);
    if (duplicadas.length) return resultadoVacio('E_COLUMNA_DUPLICADA', { columnas: duplicadas }, cfg);

    var facturas = [], apartadas = [], avisos = [];
    var vacias = tabla.vacias || 0, totalesIgnorados = 0;
    var rangoMin = null, rangoMax = null;
    if (cfg.corte) {
      rangoMin = restarAnios(cfg.corte, cfg.atras);
      rangoMax = restarAnios(cfg.corte, -cfg.adelante);
    }
    var optZona = cfg.zona ? { zona: cfg.zona } : {};
    var nCabeceras = cabeceras.length;

    datos.forEach(function (celdas, i) {
      var fila = tabla.lineas && tabla.lineas[i] ? tabla.lineas[i] : i + cfg.filaBase;
      var codigos = [];
      var arreglo = Array.isArray(celdas) ? celdas : null;
      if (!arreglo) { apartadas.push({ fila: fila, codigo: 'E_FILA_INVALIDA', otros: [] }); return; }
      if (arreglo.every(celdaVacia)) { vacias++; return; }

      // Más celdas que títulos con contenido: casi seguro un separador dentro de un texto sin comillas.
      if (arreglo.length > nCabeceras && arreglo.slice(nCabeceras).some(function (x) { return !celdaVacia(x); })) {
        apartadas.push({ fila: fila, codigo: 'E_FILA_DESALINEADA', otros: [] });
        return;
      }

      function cel(campo) { return indice[campo] === undefined ? undefined : arreglo[indice[campo]]; }

      if (cfg.ignorarTotales && esFilaDeTotal(cel, indice)) { totalesIgnorados++; return; }

      // Largo de cada celda leída (un texto enorme no es un dato de factura)
      var demasiado = Object.keys(indice).some(function (campo) { return Util.limpiar(cel(campo)).length > cfg.maxCelda; });
      if (demasiado) { apartadas.push({ fila: fila, codigo: 'E_CELDA_LARGA', otros: [] }); return; }

      // factura (serie + número)
      var textoRef = Util.limpiar(cel('factura'));
      if (indice.serie !== undefined && !celdaVacia(cel('serie')) && textoRef) textoRef = Util.limpiar(cel('serie')) + '-' + textoRef;
      var ref = referencia(textoRef);
      if (!ref.ok) codigos.push(ref.codigo);

      // deudor
      var deudor = nombreDeudor(cel('deudor'));
      if (!deudor) codigos.push('E_DEUDOR_VACIO');

      // importe y moneda
      var imp = Util.parsearImporte(cel('importe'), { decimal: cfg.decimal, miles: cfg.miles });
      if (!imp.ok) codigos.push(imp.codigo);
      var moneda = null;
      var monedaCol = null, columnaConMoneda = indice.moneda !== undefined && !celdaVacia(cel('moneda'));
      if (columnaConMoneda) {
        monedaCol = Util.monedaDeTexto(cel('moneda'));
        if (!monedaCol) codigos.push('E_MONEDA_DESCONOCIDA');
      }
      if (imp.ok) {
        if (monedaCol && imp.moneda && monedaCol !== imp.moneda) codigos.push('E_MONEDA_CONFLICTO');
        else {
          moneda = monedaCol || imp.moneda || cfg.monedaPorDefecto;
          // si la columna traía una moneda ilegible ya hay un código; no se añade otro
          if ((!columnaConMoneda || monedaCol) && (!moneda || cfg.monedas.indexOf(moneda) < 0)) codigos.push('E_MONEDA_DESCONOCIDA');
        }
      }

      // vencimiento
      var venc = Util.parsearFecha(cel('vencimiento'), optZona);
      if (!venc.ok) codigos.push(venc.codigo);
      else if (rangoMin && (venc.iso < rangoMin || venc.iso > rangoMax)) codigos.push('E_FECHA_FUERA_DE_RANGO');

      if (codigos.length) {
        // sin duplicados y en el orden en que se detectaron
        var unicos = codigos.filter(function (c, k) { return codigos.indexOf(c) === k; });
        apartadas.push({ fila: fila, codigo: unicos[0], otros: unicos.slice(1) });
        return;
      }

      // campos opcionales: un fallo aquí no rechaza la factura, solo avisa
      var emision = null;
      if (indice.emision !== undefined && !celdaVacia(cel('emision'))) {
        var em = Util.parsearFecha(cel('emision'), optZona);
        if (em.ok) {
          emision = em.iso;
          if (venc.iso < em.iso) avisos.push({ fila: fila, codigo: 'A_VENCIMIENTO_ANTERIOR_EMISION' });
        } else avisos.push({ fila: fila, codigo: 'A_EMISION_INVALIDA' });
      }
      var tel = null, movil = null;
      if (indice.telefono !== undefined && !celdaVacia(cel('telefono'))) {
        var t = Util.normalizarTelefono(cel('telefono'));
        if (t.ok) { tel = t.digitos; movil = t.movil; if (!t.movil) avisos.push({ fila: fila, codigo: 'A_TEL_FIJO' }); }
        else avisos.push({ fila: fila, codigo: 'A_TEL_INVALIDO' });
      }
      var mail = null;
      if (indice.correo !== undefined && !celdaVacia(cel('correo'))) {
        mail = Util.normalizarCorreo(typeof cel('correo') === 'string' ? cel('correo') : '');
        if (!mail) avisos.push({ fila: fila, codigo: 'A_MAIL_INVALIDO' });
      }
      var disputa = false;
      if (indice.en_disputa !== undefined) {
        var b = booleano(cel('en_disputa'));
        disputa = b.valor;
        if (!b.entendido) avisos.push({ fila: fila, codigo: 'A_DISPUTA_NO_ENTENDIDA' });
      }

      facturas.push({
        factura_ref: ref.ref, deudor_nombre: deudor, moneda: moneda, importe_centavos: imp.centavos,
        emision: emision, vencimiento: venc.iso, contacto_tel: tel, tel_movil: movil, contacto_mail: mail,
        en_disputa: disputa, fila_origen: fila
      });
    });

    // Duplicadas y en conflicto: misma factura y moneda más de una vez.
    var grupos = {};
    facturas.forEach(function (f, i) {
      var k = claveDeReferencia(f.factura_ref) + '|' + f.moneda;
      (grupos[k] = grupos[k] || []).push(i);
    });
    var descartar = {};
    Object.keys(grupos).forEach(function (k) {
      var idx = grupos[k];
      if (idx.length < 2) return;
      var base = facturas[idx[0]];
      var identicas = idx.every(function (j) {
        var f = facturas[j];
        return f.importe_centavos === base.importe_centavos && f.vencimiento === base.vencimiento &&
          Util.clave(f.deudor_nombre) === Util.clave(base.deudor_nombre);
      });
      if (identicas) idx.slice(1).forEach(function (j) { descartar[j] = 'E_DUPLICADA'; });
      else idx.forEach(function (j) { descartar[j] = 'E_CONFLICTO_FACTURA'; });
    });
    var finales = [];
    facturas.forEach(function (f, i) {
      if (descartar[i]) apartadas.push({ fila: f.fila_origen, codigo: descartar[i], otros: [] });
      else finales.push(f);
    });
    apartadas.sort(function (a, b) { return a.fila - b.fila; });
    var filasFinales = {};
    finales.forEach(function (f) { filasFinales[f.fila_origen] = true; });
    avisos = avisos.filter(function (a) { return filasFinales[a.fila] === true; }); // sin avisos de filas apartadas

    var total = finales.length + apartadas.length;
    var bloquear = false, motivo = null;
    if (total === 0) { bloquear = true; motivo = 'E_ARCHIVO_VACIO'; }
    else if (apartadas.length * 100 > cfg.umbral * total) { bloquear = true; motivo = 'E_DEMASIADAS_APARTADAS'; }

    return {
      error: null, detalle: null,
      facturas: finales, apartadas: apartadas, avisos: avisos,
      por_codigo: Util.contarPorCodigo(apartadas),
      resumen: {
        total: total, aceptadas: finales.length, apartadas: apartadas.length, vacias: vacias,
        totales_ignorados: totalesIgnorados,
        tasa_apartadas: total ? Math.round(apartadas.length / total * 10000) / 10000 : 0,
        umbral_rechazo: cfg.umbral, bloquear: bloquear, motivo_bloqueo: motivo
      }
    };
  }

  /* ---------------------------------------------------------- puntos de entrada */

  // Filas ya extraídas por n8n: [{ 'Nro Factura': 'A-1', 'Saldo': '1.000,00', … }, …]
  function normalizarObjetos(filas, cfg) {
    if (!Array.isArray(filas)) Util.fallar('E_FILAS_INVALIDAS');
    var cabeceras = [], vistos = {};
    filas.forEach(function (f) {
      if (!esObjeto(f)) return;
      Object.keys(f).forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(vistos, k)) { vistos[k] = cabeceras.length; cabeceras.push(k); }
      });
    });
    var datos = filas.map(function (f) {
      if (!esObjeto(f)) return null;
      return cabeceras.map(function (k) { return Object.prototype.hasOwnProperty.call(f, k) ? f[k] : ''; });
    });
    return normalizarTabla({ cabeceras: cabeceras, filas: datos }, cfg);
  }

  // Texto CSV completo (ya decodificado).
  function normalizarCSV(texto, cfg) {
    var cfgOk = validarConfig(cfg); // una configuración mala se detiene aquí, con su propio código
    var t;
    try { t = leerCSV(texto); } catch (e) {
      // un CSV ilegible no filtra nada: solo su código
      return resultadoVacio(Util.codigoDe(e), null, cfgOk);
    }
    return normalizarTabla({ cabeceras: t.cabeceras, filas: t.filas, lineas: t.lineas, vacias: t.vacias }, cfg);
  }

  return {
    CAMPOS: CAMPOS, CAMPOS_OBLIGATORIOS: CAMPOS_OBLIGATORIOS, CAMPOS_OPCIONALES: CAMPOS_OPCIONALES,
    LIMITES_POR_DEFECTO: LIMITES_POR_DEFECTO, UMBRAL_POR_DEFECTO: UMBRAL_POR_DEFECTO,
    validarConfig: validarConfig, leerCSV: leerCSV, normalizarTabla: normalizarTabla,
    normalizarObjetos: normalizarObjetos, normalizarCSV: normalizarCSV
  };
})();
