/* ==========================================================================
   Util: utilidades puras y compartidas del núcleo de cobranza asistida.

   · Sin DOM, sin red, sin reloj, sin azar, sin archivos, sin variables de entorno.
   · Se antepone a cada módulo dentro de su nodo de código de n8n (ver ../README.md).
   · Regla de oro: un error lleva un CÓDIGO (E_...) y NUNCA el valor que lo causó.
     Así ningún dato del archivo del cliente puede acabar en un registro o en una alerta.
   ========================================================================== */
var Util = (function () {
  'use strict';

  var CODIGO_RE = /^E_[A-Z0-9_]{2,40}$/;

  /* --------------------------------------------------------------- errores */

  // Lanza un error cuyo mensaje es SOLO el código. Solo se llama con literales E_....
  function fallar(codigo) {
    var c = CODIGO_RE.test(String(codigo)) ? String(codigo) : 'E_INTERNO';
    var e = new Error(c);
    e.codigo = c;
    throw e;
  }

  // Código seguro de cualquier error capturado (nunca su mensaje libre).
  function codigoDe(error) {
    if (error && typeof error === 'object') {
      if (typeof error.codigo === 'string' && CODIGO_RE.test(error.codigo)) return error.codigo;
      if (typeof error.message === 'string' && CODIGO_RE.test(error.message)) return error.message;
    }
    return 'E_DESCONOCIDO';
  }

  /* ----------------------------------------------------------------- texto */

  // Controles C0/C1, caracteres de ancho cero, marcas bidireccionales y separadores de línea Unicode:
  // sirven para disfrazar nombres o partir cabeceras, y no hacen falta en un nombre comercial.
  var CONTROL_RE = (function () {
    // pares [desde, hasta] de puntos de código; se construyen con fromCharCode para que el archivo
    // fuente no contenga ningún carácter invisible ni bidireccional (riesgo «Trojan Source»)
    var rangos = [[0x00, 0x1F], [0x7F, 0x9F], [0x200B, 0x200F], [0x2028, 0x2029], [0x202A, 0x202E],
      [0x2060, 0x2064], [0x2066, 0x2069], [0xFEFF, 0xFEFF]];
    return new RegExp('[' + rangos.map(function (r) {
      return String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1]);
    }).join('') + ']', 'g');
  })();

  // Solo texto y números; objetos, listas o fechas de JavaScript se ignoran (evita «[object Object]»
  // y la conversión de Date a texto, que depende de la zona horaria).
  function texto(v) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return '';
  }

  function limpiar(v) {
    var s = texto(v);
    try { s = s.normalize('NFC'); } catch (e) { /* sin normalización disponible */ }
    return s.replace(CONTROL_RE, ' ').replace(/\s+/g, ' ').trim();
  }

  function sinAcentos(s) { return texto(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // Clave para comparar títulos de columna sin distinguir mayúsculas, tildes ni signos.
  function clave(s) { return sinAcentos(limpiar(s)).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function escHtml(s) {
    return texto(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function pad4(n) { return ('000' + n).slice(-4); }

  /* ------------------------------------------------------------- contadores */

  var MAX_SEGURO = 9007199254740991; // Number.MAX_SAFE_INTEGER

  function sumarSeguro(a, b) {
    var r = a + b;
    if (!(r <= MAX_SEGURO)) fallar('E_DESBORDE');
    return r;
  }

  // [{codigo: 'E_X'}, ...] → { E_X: n }
  function contarPorCodigo(lista) {
    var c = {};
    (lista || []).forEach(function (x) {
      var k = x && x.codigo;
      if (typeof k === 'string' && CODIGO_RE.test(k)) c[k] = (c[k] || 0) + 1;
    });
    return c;
  }

  /* --------------------------------------------------------------- fechas
     Aritmética de calendario con Date.UTC sobre fechas AAAA-MM-DD sin hora: no depende de la zona
     horaria, del horario de verano ni del reloj. La fecha de corte la fija quien llama. */

  function isoDe(y, m, d) { return pad4(y) + '-' + pad2(m) + '-' + pad2(d); }

  function fechaValida(y, m, d) {
    if (!(y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    var f = new Date(Date.UTC(y, m - 1, d));
    return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
  }

  function partesISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto(iso));
    if (!m) return null;
    var p = { y: +m[1], m: +m[2], d: +m[3] };
    return fechaValida(p.y, p.m, p.d) ? p : null;
  }

  function esISO(iso) { return partesISO(iso) !== null; }

  function sumarDias(iso, n) {
    var p = partesISO(iso);
    if (!p) fallar('E_FECHA_INVALIDA');
    var f = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return isoDe(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }

  // Días de calendario de a a b (positivo si b es posterior a a).
  function diasEntre(a, b) {
    var pa = partesISO(a), pb = partesISO(b);
    if (!pa || !pb) fallar('E_FECHA_INVALIDA');
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
  }

  // Semana ISO 8601 («2026-W40»). La semana pertenece al año de su jueves.
  function semanaISO(iso) {
    var p = partesISO(iso);
    if (!p) fallar('E_FECHA_INVALIDA');
    var f = new Date(Date.UTC(p.y, p.m - 1, p.d));
    var dow = f.getUTCDay() || 7; // lunes = 1 … domingo = 7
    f.setUTCDate(f.getUTCDate() + 4 - dow); // jueves de esa semana
    var anio = f.getUTCFullYear();
    var inicio = Date.UTC(anio, 0, 1);
    var semana = Math.ceil(((f.getTime() - inicio) / 86400000 + 1) / 7);
    return anio + '-W' + pad2(semana);
  }

  // «05/10/2026»
  function formatoFecha(iso) {
    var p = partesISO(iso);
    if (!p) fallar('E_FECHA_INVALIDA');
    return pad2(p.d) + '/' + pad2(p.m) + '/' + pad4(p.y);
  }

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MES_POR_NOMBRE = (function () {
    var m = {};
    MESES.forEach(function (n, i) { m[n] = i + 1; m[n.slice(0, 3)] = i + 1; });
    m.setiembre = 9; m.sept = 9; m.set = 9;
    return m;
  })();

  function ok(iso) { return { ok: true, iso: iso }; }
  function mal(codigo) { return { ok: false, codigo: codigo }; }

  // Número de serie de Excel (sistema 1900). Solo se acepta un NÚMERO real, nunca un texto de cifras:
  // un número de factura en la columna de fechas no debe convertirse en una fecha sin avisar.
  function desdeSerialExcel(n) {
    if (typeof n !== 'number' || !isFinite(n) || n < 1 || n > 200000) return mal('E_FECHA_INVALIDA');
    var f = new Date(Date.UTC(1899, 11, 30 + Math.floor(n)));
    var y = f.getUTCFullYear(), m = f.getUTCMonth() + 1, d = f.getUTCDate();
    return fechaValida(y, m, d) ? ok(isoDe(y, m, d)) : mal('E_FECHA_INVALIDA'); // solo 2000 … 2099
  }

  // Fecha local en una zona IANA de un instante (texto ISO con desfase). Determinista: Intl con zona explícita.
  function fechaEnZona(instanteISO, zona) {
    try {
      var f = new Date(instanteISO);
      if (isNaN(f.getTime())) return null;
      var partes = new Intl.DateTimeFormat('en-US', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(f);
      var o = {};
      partes.forEach(function (x) { o[x.type] = x.value; });
      return isoDe(+o.year, +o.month, +o.day);
    } catch (e) {
      return null;
    }
  }

  function anioDe(a) { return a.length === 2 ? 2000 + (+a) : +a; }

  /* Formatos aceptados (siempre día primero; lo que no se puede leer con certeza se rechaza):
       30/09/2026 · 30-9-26 · 30.09.2026 · 2026-09-30 · 30 sep 2026 · 30 de septiembre de 2026
       2026-09-30T00:00:00Z · «30/09/2026 0:00:00» · número de serie de Excel (solo si es un número)
     opc.zona: zona IANA para convertir instantes con desfase que no caen en medianoche.
     Devuelve { ok:true, iso } o { ok:false, codigo }. */
  function parsearFecha(raw, opc) {
    opc = opc || {};
    if (typeof raw === 'number') return desdeSerialExcel(raw);
    var t = sinAcentos(limpiar(raw)).toLowerCase();
    if (!t) return mal('E_FECHA_VACIA');
    var m;

    // ISO con hora opcional
    if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[t ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?\s*(z|[+-]\d{2}(?::?\d{2})?)?)?$/.exec(t))) {
      var y0 = +m[1], mes0 = +m[2], d0 = +m[3];
      if (!fechaValida(y0, mes0, d0)) return mal('E_FECHA_INVALIDA');
      if (m[4] === undefined) return ok(isoDe(y0, mes0, d0));
      var medianoche = +m[4] === 0 && +m[5] === 0 && (m[6] === undefined || +m[6] === 0) && (m[7] === undefined || +m[7] === 0);
      if (medianoche) return ok(isoDe(y0, mes0, d0)); // el exportador escribió una fecha a las 00:00
      if (m[8] === undefined) return ok(isoDe(y0, mes0, d0)); // hora local flotante: la fecha es la que se ve
      if (!opc.zona) return mal('E_FECHA_AMBIGUA'); // instante con desfase: sin zona no se sabe qué día es
      var desfase = m[8] === 'z' ? 'Z' : (m[8].length === 3 ? m[8] + ':00' : (m[8].indexOf(':') < 0 ? m[8].slice(0, 3) + ':' + m[8].slice(3) : m[8]));
      var instante = m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + (m[6] || '00') + desfase;
      var local = fechaEnZona(instante, opc.zona);
      if (!local || !partesISO(local)) return mal('E_FECHA_AMBIGUA');
      return ok(local);
    }

    // año-mes-día con / o .
    if ((m = /^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})(?:[ t]+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(t))) {
      return fechaDMA(+m[3], +m[2], +m[1]);
    }
    // día/mes/año
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})(?:[ t]+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(t))) {
      return fechaDMA(+m[1], +m[2], anioDe(m[3]));
    }
    // «30 de septiembre de 2026», «30 sep 2026»
    if ((m = /^(\d{1,2})\s*(?:de\s+)?([a-z]+)\.?\s*(?:de\s+)?(\d{4}|\d{2})$/.exec(t))) {
      var mesN = MES_POR_NOMBRE[m[2]];
      if (!mesN) return mal('E_FECHA_INVALIDA');
      return fechaDMA(+m[1], mesN, anioDe(m[3]));
    }
    return mal('E_FECHA_INVALIDA');
  }

  function fechaDMA(d, mes, y) {
    // «09/30/2026»: el segundo número no puede ser un mes, pero el primero sí → casi seguro mes-día-año.
    if (d >= 1 && d <= 12 && mes > 12 && mes <= 31) return mal('E_FECHA_AMBIGUA');
    if (!fechaValida(y, mes, d)) return mal('E_FECHA_INVALIDA');
    return ok(isoDe(y, mes, d));
  }

  /* -------------------------------------------------------------- importes
     Los importes se guardan como enteros en centavos: sin decimales flotantes. */

  var TOKENS_MONEDA = {
    '$': 'UYU', '$u': 'UYU', 'uyu': 'UYU', 'pesos': 'UYU', 'peso': 'UYU', 'pesosuruguayos': 'UYU',
    'us$': 'USD', 'u$s': 'USD', 'usd': 'USD', 'dolares': 'USD', 'dolar': 'USD', 'dolaresamericanos': 'USD',
    'dolaresestadounidenses': 'USD'
  };

  // Texto de una columna «moneda» → 'UYU' | 'USD' | null (desconocida).
  function monedaDeTexto(raw) {
    var k = sinAcentos(limpiar(raw)).toLowerCase().replace(/[\s.]/g, '');
    return Object.prototype.hasOwnProperty.call(TOKENS_MONEDA, k) ? TOKENS_MONEDA[k] : null;
  }

  var LIMITE_CENTAVOS = 10000000000000; // 1e13 centavos = 100.000 millones

  function importeDesdeCadena(cad, dec, mil) {
    var re;
    if (dec === ',') {
      re = mil === '.' ? /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/
        : mil === ' ' ? /^(?:\d{1,3}(?: \d{3})+|\d+)(?:,(\d+))?$/
          : /^\d+(?:,(\d+))?$/;
    } else {
      re = mil === ',' ? /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/
        : mil === ' ' ? /^(?:\d{1,3}(?: \d{3})+|\d+)(?:\.(\d+))?$/
          : /^\d+(?:\.(\d+))?$/;
    }
    var m = re.exec(cad);
    if (!m) return null;
    var frac = m[1] || '';
    if (frac.length > 2 && !/^\d{2}0*$/.test(frac)) return null; // más de 2 decimales reales: no se redondea
    var entera = cad.split(dec)[0].replace(/[. ,]/g, '');
    if (entera.length > 13) return null;
    var centavos = +entera * 100 + +((frac + '00').slice(0, 2));
    return centavos;
  }

  /* raw: texto o número. fmt: { decimal: ',' | '.', miles: '.' | ',' | ' ' | '' } (por defecto Uruguay: , y .).
     Reconoce un símbolo de moneda pegado al importe («$U 85.000,00», «U$S 3.150», «85.000 $»).
     Devuelve { ok:true, centavos, moneda } (moneda null si no había símbolo) o { ok:false, codigo }. */
  function parsearImporte(raw, fmt) {
    fmt = fmt || {};
    var dec = fmt.decimal === '.' ? '.' : ',';
    var mil = fmt.miles === undefined ? (dec === ',' ? '.' : ',') : fmt.miles;
    if (typeof raw === 'number') {
      if (!isFinite(raw)) return mal('E_IMPORTE_INVALIDO');
      var c = Math.round(raw * 100);
      // más de dos decimales reales (85000.555) no se redondea: se rechaza. 0.005 centavos cubre el error
      // de la coma flotante hasta el límite de importes (por debajo de 0,002 centavos).
      if (Math.abs(raw * 100 - c) > 0.005) return mal('E_IMPORTE_INVALIDO');
      if (c <= 0) return mal('E_IMPORTE_NO_POSITIVO');
      if (c > LIMITE_CENTAVOS) return mal('E_IMPORTE_INVALIDO');
      return { ok: true, centavos: c, moneda: null };
    }
    var s = limpiar(raw);
    if (!s) return mal('E_IMPORTE_INVALIDO');
    var tokens = s.match(/[A-Za-z$]+/g) || [];
    if (tokens.length > 1) return mal('E_IMPORTE_INVALIDO');
    var moneda = null;
    if (tokens.length === 1) {
      moneda = monedaDeTexto(tokens[0]);
      if (!moneda) return mal('E_MONEDA_DESCONOCIDA');
    }
    var n = s.replace(/[A-Za-z$]+/g, ' ').trim();
    var negativo = /^-/.test(n) || /-$/.test(n) || (/^\(/.test(n) && /\)$/.test(n));
    n = n.replace(/^[-(]\s*/, '').replace(/\s*[-)]$/, '').trim();
    // Un espacio dentro de la cifra solo vale si es el separador de miles configurado: «12 34» no es 1234.
    if (/[^\d., ]/.test(n) || n === '' || (mil !== ' ' && n.indexOf(' ') >= 0)) return mal('E_IMPORTE_INVALIDO');
    var centavos = importeDesdeCadena(n, dec, mil);
    if (centavos === null || centavos > LIMITE_CENTAVOS) return mal('E_IMPORTE_INVALIDO');
    if (negativo || centavos <= 0) return mal('E_IMPORTE_NO_POSITIVO');
    return { ok: true, centavos: centavos, moneda: moneda };
  }

  function agruparMiles(entero) {
    return String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  var ETIQUETA_MONEDA = { UYU: '$U', USD: 'US$' };

  // 8500000, 'UYU' → «$U 85.000»; 8500050 → «$U 85.000,50»
  function formatearImporte(centavos, moneda) {
    if (!(typeof centavos === 'number' && isFinite(centavos) && centavos >= 0 && centavos <= MAX_SEGURO)) fallar('E_IMPORTE_INVALIDO');
    if (!Object.prototype.hasOwnProperty.call(ETIQUETA_MONEDA, moneda)) fallar('E_MONEDA_DESCONOCIDA');
    var enteros = Math.floor(centavos / 100), resto = centavos % 100;
    return ETIQUETA_MONEDA[moneda] + ' ' + agruparMiles(enteros) + (resto ? ',' + pad2(resto) : '');
  }

  function formatearNumero(n) { return agruparMiles(Math.floor(n)); }

  /* ---------------------------------------------------------------- correo
     Patrón deliberadamente estricto: solo ASCII, sin comillas, comentarios, IP ni dominios
     internacionalizados. Un correo dudoso se descarta; nunca se «arregla». Es la defensa contra
     cabeceras inyectadas y contra parámetros ocultos en enlaces mailto:. */

  var CORREO_RE = /^[a-z0-9]+(?:[._+-][a-z0-9]+)*@(?:[a-z0-9]+(?:-[a-z0-9]+)*\.)+[a-z]{2,24}$/;

  function normalizarCorreo(raw) {
    if (typeof raw !== 'string') return null;
    var s = raw.trim().toLowerCase();
    if (s.length < 6 || s.length > 254) return null;
    if (!CORREO_RE.test(s)) return null;
    var local = s.split('@')[0];
    if (local.length > 64) return null;
    return s;
  }

  /* -------------------------------------------------------------- teléfonos
     Devuelve los dígitos en formato internacional (lo que exige WhatsApp: sin +, sin ceros, sin espacios).
     Uruguay: móviles 09x xxx xxx; fijos 2xxx xxxx (Montevideo) y 4xxx xxxx (interior). Otro país solo con + o 00. */

  var NUMEROS_EJEMPLO = ['59899000001', '59899000002', '59899000003', '59899000004', '59899000005',
    '59899000006', '59899000007', '59899000008', '59899000009', '59899000010'];

  function esNumeroDeEjemplo(digitos) { return NUMEROS_EJEMPLO.indexOf(digitos) >= 0; }

  function normalizarTelefono(raw) {
    var original = limpiar(raw);
    if (!original) return mal('A_TEL_VACIO');
    if (/^[\d.,]+e[+-]?\d+$/i.test(original)) return mal('A_TEL_INVALIDO'); // notación científica de Excel
    if (/^\d+\.0+$/.test(original)) original = original.replace(/\.0+$/, ''); // 99123456.0
    var compacto = original.replace(/[\s().\-]/g, '');
    if (/[^\d+]/.test(compacto) || compacto.lastIndexOf('+') > 0) return mal('A_TEL_INVALIDO');
    var internacional = false, digitos;
    if (compacto.charAt(0) === '+') { internacional = true; digitos = compacto.slice(1); }
    else if (compacto.slice(0, 2) === '00') { internacional = true; digitos = compacto.slice(2); }
    else digitos = compacto;
    if (!/^\d+$/.test(digitos)) return mal('A_TEL_INVALIDO');

    var nacional;
    if (internacional && digitos.indexOf('598') !== 0) {
      if (digitos.length < 8 || digitos.length > 15 || digitos.charAt(0) === '0') return mal('A_TEL_INVALIDO');
      return { ok: true, digitos: digitos, movil: true, pais: 'OTRO' };
    }
    if (digitos.indexOf('598') === 0 && (internacional || digitos.length === 11)) nacional = digitos.slice(3);
    else nacional = digitos;
    if (nacional.length === 9 && nacional.charAt(0) === '0') nacional = nacional.slice(1);
    if (nacional.length !== 8) return mal('A_TEL_INVALIDO');
    var c = nacional.charAt(0);
    if (c === '9') return { ok: true, digitos: '598' + nacional, movil: true, pais: 'UY' };
    if (c === '2' || c === '4') return { ok: true, digitos: '598' + nacional, movil: false, pais: 'UY' };
    return mal('A_TEL_INVALIDO');
  }

  /* ----------------------------------------------------------- identificadores */

  function idValido(s) { return typeof s === 'string' && /^[a-z0-9][a-z0-9_-]{0,39}$/i.test(s); }
  function hex64(s) { return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s); }

  return {
    fallar: fallar, codigoDe: codigoDe,
    texto: texto, limpiar: limpiar, sinAcentos: sinAcentos, clave: clave, escHtml: escHtml,
    pad2: pad2, sumarSeguro: sumarSeguro, contarPorCodigo: contarPorCodigo, MAX_SEGURO: MAX_SEGURO,
    isoDe: isoDe, partesISO: partesISO, esISO: esISO, fechaValida: fechaValida, sumarDias: sumarDias, diasEntre: diasEntre,
    semanaISO: semanaISO, formatoFecha: formatoFecha, parsearFecha: parsearFecha, desdeSerialExcel: desdeSerialExcel,
    parsearImporte: parsearImporte, monedaDeTexto: monedaDeTexto, formatearImporte: formatearImporte,
    formatearNumero: formatearNumero, agruparMiles: agruparMiles, LIMITE_CENTAVOS: LIMITE_CENTAVOS,
    normalizarCorreo: normalizarCorreo, normalizarTelefono: normalizarTelefono,
    NUMEROS_EJEMPLO: NUMEROS_EJEMPLO, esNumeroDeEjemplo: esNumeroDeEjemplo,
    idValido: idValido, hex64: hex64
  };
})();
