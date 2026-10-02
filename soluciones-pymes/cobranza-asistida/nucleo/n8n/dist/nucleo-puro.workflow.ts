import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const entradaNucleo = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'Entrada del núcleo',
    parameters: { inputSource: 'passthrough' },
    position: [240, 300]
  },
  output: [{ op: 'iniciar', entrada: {} }]
});

const nucleoPuro = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Núcleo puro',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `/* Nucleo de cobranza asistida - paquete para el nodo de codigo de n8n
   Generado por n8n/generar.js con esbuild 0.28.2 (solo quita comentarios y escapa caracteres no ASCII). NO EDITAR A MANO.
   Huella SHA-256 de cada fuente:
   util              83374d1f4580a8162ba739361755448b382fa5f2436719d2760514481e873893
   m0-guardias       411a6ecaa42f0072a9e3c1aa880fed2474b458619282897a94d2ce0f1c925e70
   m1-normalizar     3753cc36a8269a5f5765d014d51f4a2214ba569d926a3ee8eff1bb6fd1d816c3
   m2-antiguedad     8a96a5257ee318bb7cfa7b9d63a49b5545126deb913189e3ad550020815d0b85
   m3-borradores     61eece4411593108b4a961ba83fb322bf66c22615be6fbbf797f98615170e72b
   m4-informe        a77fbddb263f627fb02deb42493d927e772911ff8982283fdcec434e4936c893
   m5-guardia-envio  6920f7500f622e5ff82ebe5ed3ae7a5477ee3b9bb1bab32a9305b247dd948190
   m6-registro       1407d37447d5ad2f66486780e0a3f8bafd41a3e0112f73c85aa9ee4e2ec6184e
   m7-ingesta        279b2f8c1c78255e88370f6807c1f60342765906d227f7b544c2d8dd15139448
   pipeline          aa02e31ba5883d7476ee439b2c7785d03243b90b0727575e7b9c2f85b66b8571
   envoltorio        4fd5c1ed253a54ae9ebbc9eb73adb5e26ec81825bdfd22285fab4bd5d8f13e4c
*/
// ===== util.js =====
var Util = (function() {
  "use strict";
  var CODIGO_RE = /^E_[A-Z0-9_]{2,40}$/;
  function fallar(codigo) {
    var c = CODIGO_RE.test(String(codigo)) ? String(codigo) : "E_INTERNO";
    var e = new Error(c);
    e.codigo = c;
    throw e;
  }
  function codigoDe(error) {
    if (error && typeof error === "object") {
      if (typeof error.codigo === "string" && CODIGO_RE.test(error.codigo)) return error.codigo;
      if (typeof error.message === "string" && CODIGO_RE.test(error.message)) return error.message;
    }
    return "E_DESCONOCIDO";
  }
  var CONTROL_RE = (function() {
    var rangos = [
      [0, 31],
      [127, 159],
      [8203, 8207],
      [8232, 8233],
      [8234, 8238],
      [8288, 8292],
      [8294, 8297],
      [65279, 65279]
    ];
    return new RegExp("[" + rangos.map(function(r) {
      return String.fromCharCode(r[0]) + "-" + String.fromCharCode(r[1]);
    }).join("") + "]", "g");
  })();
  function texto(v) {
    if (typeof v === "string") return v;
    if (typeof v === "number") return isFinite(v) ? String(v) : "";
    if (typeof v === "boolean") return v ? "true" : "false";
    return "";
  }
  function limpiar(v) {
    var s = texto(v);
    try {
      s = s.normalize("NFC");
    } catch (e) {
    }
    return s.replace(CONTROL_RE, " ").replace(/\\s+/g, " ").trim();
  }
  function sinAcentos(s) {
    return texto(s).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
  }
  function clave(s) {
    return sinAcentos(limpiar(s)).toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function escHtml(s) {
    return texto(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\`/g, "&#96;");
  }
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function pad4(n) {
    return ("000" + n).slice(-4);
  }
  var MAX_SEGURO = 9007199254740991;
  function sumarSeguro(a, b) {
    var r = a + b;
    if (!(r <= MAX_SEGURO)) fallar("E_DESBORDE");
    return r;
  }
  function contarPorCodigo(lista) {
    var c = {};
    (lista || []).forEach(function(x) {
      var k = x && x.codigo;
      if (typeof k === "string" && CODIGO_RE.test(k)) c[k] = (c[k] || 0) + 1;
    });
    return c;
  }
  function isoDe(y, m, d) {
    return pad4(y) + "-" + pad2(m) + "-" + pad2(d);
  }
  function fechaValida(y, m, d) {
    if (!(y >= 2e3 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    var f = new Date(Date.UTC(y, m - 1, d));
    return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
  }
  function partesISO(iso) {
    var m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(texto(iso));
    if (!m) return null;
    var p = { y: +m[1], m: +m[2], d: +m[3] };
    return fechaValida(p.y, p.m, p.d) ? p : null;
  }
  function esISO(iso) {
    return partesISO(iso) !== null;
  }
  function sumarDias(iso, n) {
    var p = partesISO(iso);
    if (!p) fallar("E_FECHA_INVALIDA");
    var f = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return isoDe(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }
  function diasEntre(a, b) {
    var pa = partesISO(a), pb = partesISO(b);
    if (!pa || !pb) fallar("E_FECHA_INVALIDA");
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 864e5);
  }
  function semanaISO(iso) {
    var p = partesISO(iso);
    if (!p) fallar("E_FECHA_INVALIDA");
    var f = new Date(Date.UTC(p.y, p.m - 1, p.d));
    var dow = f.getUTCDay() || 7;
    f.setUTCDate(f.getUTCDate() + 4 - dow);
    var anio = f.getUTCFullYear();
    var inicio = Date.UTC(anio, 0, 1);
    var semana = Math.ceil(((f.getTime() - inicio) / 864e5 + 1) / 7);
    return anio + "-W" + pad2(semana);
  }
  function formatoFecha(iso) {
    var p = partesISO(iso);
    if (!p) fallar("E_FECHA_INVALIDA");
    return pad2(p.d) + "/" + pad2(p.m) + "/" + pad4(p.y);
  }
  var MESES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre"
  ];
  var MES_POR_NOMBRE = (function() {
    var m = {};
    MESES.forEach(function(n, i) {
      m[n] = i + 1;
      m[n.slice(0, 3)] = i + 1;
    });
    m.setiembre = 9;
    m.sept = 9;
    m.set = 9;
    return m;
  })();
  function ok(iso) {
    return { ok: true, iso };
  }
  function mal(codigo) {
    return { ok: false, codigo };
  }
  function desdeSerialExcel(n) {
    if (typeof n !== "number" || !isFinite(n) || n < 1 || n > 2e5) return mal("E_FECHA_INVALIDA");
    var f = new Date(Date.UTC(1899, 11, 30 + Math.floor(n)));
    var y = f.getUTCFullYear(), m = f.getUTCMonth() + 1, d = f.getUTCDate();
    return fechaValida(y, m, d) ? ok(isoDe(y, m, d)) : mal("E_FECHA_INVALIDA");
  }
  var INSTANTE_RE = /^(\\d{4}-\\d{2}-\\d{2})T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,9})?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$/;
  function fechaEnZona(instanteISO, zona) {
    try {
      var m = typeof instanteISO === "string" ? INSTANTE_RE.exec(instanteISO) : null;
      if (!m || !esISO(m[1])) return null;
      if (typeof zona !== "string" || !/^[A-Za-z_]+(?:\\/[A-Za-z_+-]+){0,2}$/.test(zona)) return null;
      var f = new Date(instanteISO);
      if (isNaN(f.getTime())) return null;
      var partes = new Intl.DateTimeFormat("en-US", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(f);
      var o = {};
      partes.forEach(function(x) {
        o[x.type] = x.value;
      });
      return isoDe(+o.year, +o.month, +o.day);
    } catch (e) {
      return null;
    }
  }
  function anioDe(a) {
    return a.length === 2 ? 2e3 + +a : +a;
  }
  function parsearFecha(raw, opc) {
    opc = opc || {};
    if (typeof raw === "number") return desdeSerialExcel(raw);
    var t = sinAcentos(limpiar(raw)).toLowerCase();
    if (!t) return mal("E_FECHA_VACIA");
    var m;
    if (m = /^(\\d{4})-(\\d{2})-(\\d{2})(?:[t ](\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d{1,9}))?)?\\s*(z|[+-]\\d{2}(?::?\\d{2})?)?)?$/.exec(t)) {
      var y0 = +m[1], mes0 = +m[2], d0 = +m[3];
      if (!fechaValida(y0, mes0, d0)) return mal("E_FECHA_INVALIDA");
      if (m[4] === void 0) return ok(isoDe(y0, mes0, d0));
      var medianoche = +m[4] === 0 && +m[5] === 0 && (m[6] === void 0 || +m[6] === 0) && (m[7] === void 0 || +m[7] === 0);
      if (medianoche) return ok(isoDe(y0, mes0, d0));
      if (m[8] === void 0) return ok(isoDe(y0, mes0, d0));
      if (!opc.zona) return mal("E_FECHA_AMBIGUA");
      var desfase = m[8] === "z" ? "Z" : m[8].length === 3 ? m[8] + ":00" : m[8].indexOf(":") < 0 ? m[8].slice(0, 3) + ":" + m[8].slice(3) : m[8];
      var instante = m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":" + (m[6] || "00") + desfase;
      var local = fechaEnZona(instante, opc.zona);
      if (!local || !partesISO(local)) return mal("E_FECHA_AMBIGUA");
      return ok(local);
    }
    if (m = /^(\\d{4})[\\/.](\\d{1,2})[\\/.](\\d{1,2})(?:[ t]+\\d{1,2}:\\d{2}(?::\\d{2})?)?$/.exec(t)) {
      return fechaDMA(+m[3], +m[2], +m[1]);
    }
    if (m = /^(\\d{1,2})[-\\/.](\\d{1,2})[-\\/.](\\d{4}|\\d{2})(?:[ t]+\\d{1,2}:\\d{2}(?::\\d{2})?)?$/.exec(t)) {
      return fechaDMA(+m[1], +m[2], anioDe(m[3]));
    }
    if (m = /^(\\d{1,2})\\s*(?:de\\s+)?([a-z]+)\\.?\\s*(?:de\\s+)?(\\d{4}|\\d{2})$/.exec(t)) {
      var mesN = MES_POR_NOMBRE[m[2]];
      if (!mesN) return mal("E_FECHA_INVALIDA");
      return fechaDMA(+m[1], mesN, anioDe(m[3]));
    }
    return mal("E_FECHA_INVALIDA");
  }
  function fechaDMA(d, mes, y) {
    if (d >= 1 && d <= 12 && mes > 12 && mes <= 31) return mal("E_FECHA_AMBIGUA");
    if (!fechaValida(y, mes, d)) return mal("E_FECHA_INVALIDA");
    return ok(isoDe(y, mes, d));
  }
  var TOKENS_MONEDA = {
    "$": "UYU",
    "$u": "UYU",
    "uyu": "UYU",
    "pesos": "UYU",
    "peso": "UYU",
    "pesosuruguayos": "UYU",
    "us$": "USD",
    "u$s": "USD",
    "usd": "USD",
    "dolares": "USD",
    "dolar": "USD",
    "dolaresamericanos": "USD",
    "dolaresestadounidenses": "USD"
  };
  function monedaDeTexto(raw) {
    var k = sinAcentos(limpiar(raw)).toLowerCase().replace(/[\\s.]/g, "");
    return Object.prototype.hasOwnProperty.call(TOKENS_MONEDA, k) ? TOKENS_MONEDA[k] : null;
  }
  var LIMITE_CENTAVOS = 1e13;
  function importeDesdeCadena(cad, dec, mil) {
    var re;
    if (dec === ",") {
      re = mil === "." ? /^(?:\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,(\\d+))?$/ : mil === " " ? /^(?:\\d{1,3}(?: \\d{3})+|\\d+)(?:,(\\d+))?$/ : /^\\d+(?:,(\\d+))?$/;
    } else {
      re = mil === "," ? /^(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d+))?$/ : mil === " " ? /^(?:\\d{1,3}(?: \\d{3})+|\\d+)(?:\\.(\\d+))?$/ : /^\\d+(?:\\.(\\d+))?$/;
    }
    var m = re.exec(cad);
    if (!m) return null;
    var frac = m[1] || "";
    if (frac.length > 2 && !/^\\d{2}0*$/.test(frac)) return null;
    var entera = cad.split(dec)[0].replace(/[. ,]/g, "");
    if (entera.length > 13) return null;
    var centavos = +entera * 100 + +(frac + "00").slice(0, 2);
    return centavos;
  }
  function parsearImporte(raw, fmt) {
    fmt = fmt || {};
    var dec = fmt.decimal === "." ? "." : ",";
    var mil = fmt.miles === void 0 ? dec === "," ? "." : "," : fmt.miles;
    if (typeof raw === "number") {
      if (!isFinite(raw)) return mal("E_IMPORTE_INVALIDO");
      var c = Math.round(raw * 100);
      if (Math.abs(raw * 100 - c) > 5e-3) return mal("E_IMPORTE_INVALIDO");
      if (c <= 0) return mal("E_IMPORTE_NO_POSITIVO");
      if (c > LIMITE_CENTAVOS) return mal("E_IMPORTE_INVALIDO");
      return { ok: true, centavos: c, moneda: null };
    }
    var s = limpiar(raw);
    if (!s) return mal("E_IMPORTE_INVALIDO");
    var tokens = s.match(/[A-Za-z$]+/g) || [];
    if (tokens.length > 1) return mal("E_IMPORTE_INVALIDO");
    var moneda = null;
    if (tokens.length === 1) {
      moneda = monedaDeTexto(tokens[0]);
      if (!moneda) return mal("E_MONEDA_DESCONOCIDA");
    }
    var n = s.replace(/[A-Za-z$]+/g, " ").trim();
    var negativo = /^-/.test(n) || /-$/.test(n) || /^\\(/.test(n) && /\\)$/.test(n);
    n = n.replace(/^[-(]\\s*/, "").replace(/\\s*[-)]$/, "").trim();
    if (/[^\\d., ]/.test(n) || n === "" || mil !== " " && n.indexOf(" ") >= 0) return mal("E_IMPORTE_INVALIDO");
    var centavos = importeDesdeCadena(n, dec, mil);
    if (centavos === null || centavos > LIMITE_CENTAVOS) return mal("E_IMPORTE_INVALIDO");
    if (negativo || centavos <= 0) return mal("E_IMPORTE_NO_POSITIVO");
    return { ok: true, centavos, moneda };
  }
  function agruparMiles(entero) {
    return String(entero).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".");
  }
  var ETIQUETA_MONEDA = { UYU: "$U", USD: "US$" };
  function formatearImporte(centavos, moneda) {
    if (!(typeof centavos === "number" && isFinite(centavos) && centavos >= 0 && centavos <= MAX_SEGURO)) fallar("E_IMPORTE_INVALIDO");
    if (!Object.prototype.hasOwnProperty.call(ETIQUETA_MONEDA, moneda)) fallar("E_MONEDA_DESCONOCIDA");
    var enteros = Math.floor(centavos / 100), resto = centavos % 100;
    return ETIQUETA_MONEDA[moneda] + " " + agruparMiles(enteros) + (resto ? "," + pad2(resto) : "");
  }
  function formatearNumero(n) {
    return agruparMiles(Math.floor(n));
  }
  var CORREO_RE = /^[a-z0-9]+(?:[._+-][a-z0-9]+)*@(?:[a-z0-9]+(?:-[a-z0-9]+)*\\.)+[a-z]{2,24}$/;
  function normalizarCorreo(raw) {
    if (typeof raw !== "string") return null;
    var s = raw.trim().toLowerCase();
    if (s.length < 6 || s.length > 254) return null;
    if (!CORREO_RE.test(s)) return null;
    var local = s.split("@")[0];
    if (local.length > 64) return null;
    return s;
  }
  var NUMEROS_EJEMPLO = [
    "59899000001",
    "59899000002",
    "59899000003",
    "59899000004",
    "59899000005",
    "59899000006",
    "59899000007",
    "59899000008",
    "59899000009",
    "59899000010"
  ];
  function esNumeroDeEjemplo(digitos) {
    return NUMEROS_EJEMPLO.indexOf(digitos) >= 0;
  }
  function normalizarTelefono(raw) {
    var original = limpiar(raw);
    if (!original) return mal("A_TEL_VACIO");
    if (/^[\\d.,]+e[+-]?\\d+$/i.test(original)) return mal("A_TEL_INVALIDO");
    if (/^\\d+\\.0+$/.test(original)) original = original.replace(/\\.0+$/, "");
    var compacto = original.replace(/[\\s().\\-]/g, "");
    if (/[^\\d+]/.test(compacto) || compacto.lastIndexOf("+") > 0) return mal("A_TEL_INVALIDO");
    var internacional = false, digitos;
    if (compacto.charAt(0) === "+") {
      internacional = true;
      digitos = compacto.slice(1);
    } else if (compacto.slice(0, 2) === "00") {
      internacional = true;
      digitos = compacto.slice(2);
    } else digitos = compacto;
    if (!/^\\d+$/.test(digitos)) return mal("A_TEL_INVALIDO");
    var nacional;
    if (internacional && digitos.indexOf("598") !== 0) {
      if (digitos.length < 8 || digitos.length > 15 || digitos.charAt(0) === "0") return mal("A_TEL_INVALIDO");
      return { ok: true, digitos, movil: true, pais: "OTRO" };
    }
    if (digitos.indexOf("598") === 0 && (internacional || digitos.length === 11)) nacional = digitos.slice(3);
    else nacional = digitos;
    if (nacional.length === 9 && nacional.charAt(0) === "0") nacional = nacional.slice(1);
    if (nacional.length !== 8) return mal("A_TEL_INVALIDO");
    var c = nacional.charAt(0);
    if (c === "9") return { ok: true, digitos: "598" + nacional, movil: true, pais: "UY" };
    if (c === "2" || c === "4") return { ok: true, digitos: "598" + nacional, movil: false, pais: "UY" };
    return mal("A_TEL_INVALIDO");
  }
  function refValida(s) {
    return typeof s === "string" && s.length <= 40 && /^[A-Z0-9][A-Z0-9 ./_-]*$/.test(s) && s.indexOf("  ") < 0 && s.charAt(s.length - 1) !== " ";
  }
  function idValido(s) {
    return typeof s === "string" && /^[a-z0-9][a-z0-9_-]{0,39}$/i.test(s);
  }
  function hex64(s) {
    return typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
  }
  return {
    fallar,
    codigoDe,
    texto,
    limpiar,
    sinAcentos,
    clave,
    escHtml,
    pad2,
    sumarSeguro,
    contarPorCodigo,
    MAX_SEGURO,
    isoDe,
    partesISO,
    esISO,
    fechaValida,
    sumarDias,
    diasEntre,
    semanaISO,
    formatoFecha,
    parsearFecha,
    desdeSerialExcel,
    fechaEnZona,
    parsearImporte,
    monedaDeTexto,
    formatearImporte,
    formatearNumero,
    agruparMiles,
    LIMITE_CENTAVOS,
    normalizarCorreo,
    normalizarTelefono,
    NUMEROS_EJEMPLO,
    esNumeroDeEjemplo,
    refValida,
    idValido,
    hex64
  };
})();
// ===== m0-guardias.js =====
var M0 = (function() {
  "use strict";
  var ENTREGAS = ["correo_completo", "enlace_salida"];
  var MODOS = ["dry_run", "real"];
  var MAX_DESTINATARIOS = 3;
  function esObjeto(x) {
    return x !== null && typeof x === "object" && !Array.isArray(x);
  }
  function texto(v) {
    return typeof v === "string" ? v.trim().toLowerCase() : "";
  }
  function evaluarGuardias(fila) {
    if (!esObjeto(fila)) return { permitido: false, dry_run: true, motivo: "SIN_DATOS" };
    var i = fila.interruptor;
    var encendido = i === true || texto(i) === "on";
    var apagado = i === false || texto(i) === "off";
    var d = fila.dry_run;
    var dryRun = !(d === false || texto(d) === "false");
    if (!encendido) return { permitido: false, dry_run: dryRun, motivo: apagado ? "INTERRUPTOR_APAGADO" : "INTERRUPTOR_DESCONOCIDO" };
    return { permitido: true, dry_run: dryRun, motivo: null };
  }
  function zonaExiste(z) {
    if (typeof z !== "string" || !/^[A-Za-z_]+(?:\\/[A-Za-z_+-]+){0,2}$/.test(z)) return false;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: z });
      return true;
    } catch (e) {
      return false;
    }
  }
  function listaDeCorreos(v, problemas, codigoTamano, codigoInvalido) {
    if (!Array.isArray(v) || v.length < 1 || v.length > MAX_DESTINATARIOS) {
      problemas.push(codigoTamano);
      return;
    }
    var vistos = {};
    v.forEach(function(x) {
      if (typeof x !== "string" || Util.normalizarCorreo(x) !== x || vistos[x]) problemas.push(codigoInvalido);
      vistos[x] = true;
    });
  }
  function validarConfigCliente(cfg) {
    var problemas = [];
    if (!esObjeto(cfg)) return { ok: false, problemas: ["E_CFG_CLIENTE"] };
    if (!Util.idValido(cfg.cliente_id)) problemas.push("E_CFG_CLIENTE_ID");
    listaDeCorreos(cfg.destinatarios_permitidos, problemas, "E_CFG_DESTINATARIOS_TAMANO", "E_CFG_DESTINATARIOS_INVALIDOS");
    if (typeof cfg.remitente_prueba !== "string" || Util.normalizarCorreo(cfg.remitente_prueba) !== cfg.remitente_prueba) problemas.push("E_CFG_REMITENTE_PRUEBA");
    if (ENTREGAS.indexOf(cfg.entrega) < 0) problemas.push("E_CFG_ENTREGA");
    var modo = cfg.modo === void 0 ? "dry_run" : cfg.modo;
    if (MODOS.indexOf(modo) < 0) problemas.push("E_CFG_MODO");
    if (!zonaExiste(cfg.zona_horaria)) problemas.push("E_CFG_ZONA");
    if (!esObjeto(cfg.empresa) || typeof cfg.empresa.nombre !== "string" || Util.limpiar(cfg.empresa.nombre) === "" || Util.limpiar(cfg.empresa.nombre).length > 120) problemas.push("E_CFG_EMPRESA");
    if (cfg.umbral_rechazo !== void 0 && !(typeof cfg.umbral_rechazo === "number" && cfg.umbral_rechazo >= 0 && cfg.umbral_rechazo <= 100)) problemas.push("E_CFG_UMBRAL");
    if (modo === "real" && cfg.entrega === "correo_completo" && cfg.acepta_correo_completo !== true) problemas.push("E_CFG_ENTREGA_REAL");
    var unicos = problemas.filter(function(p, i) {
      return problemas.indexOf(p) === i;
    });
    return { ok: unicos.length === 0, problemas: unicos };
  }
  return { MAX_DESTINATARIOS, ENTREGAS, MODOS, evaluarGuardias, validarConfigCliente };
})();
// ===== m1-normalizar.js =====
var M1 = (function() {
  "use strict";
  var CAMPOS_OBLIGATORIOS = ["factura", "deudor", "importe", "vencimiento"];
  var CAMPOS_OPCIONALES = ["serie", "moneda", "emision", "telefono", "correo", "en_disputa"];
  var CAMPOS = CAMPOS_OBLIGATORIOS.concat(CAMPOS_OPCIONALES);
  var LIMITES_POR_DEFECTO = { max_filas: 5e3, max_largo_celda: 300 };
  var MAX_CARACTERES_TEXTO = 6e6;
  var UMBRAL_POR_DEFECTO = 5;
  var MONEDAS = ["UYU", "USD"];
  function esObjeto(x) {
    return x !== null && typeof x === "object" && !Array.isArray(x);
  }
  function candidatos(v) {
    var lista = Array.isArray(v) ? v : [v];
    var claves = [];
    for (var i = 0; i < lista.length; i++) {
      if (typeof lista[i] !== "string") return null;
      var k = Util.clave(lista[i]);
      if (!k || lista[i].length > 100) return null;
      claves.push(k);
    }
    return claves.length ? claves : null;
  }
  function validarConfig(cfg) {
    if (!esObjeto(cfg)) Util.fallar("E_CFG_MAPEO");
    var mapeo = cfg.mapeo_columnas;
    if (!esObjeto(mapeo)) Util.fallar("E_CFG_MAPEO");
    var claves = {};
    var porCampo = {};
    Object.keys(mapeo).forEach(function(campo) {
      if (CAMPOS.indexOf(campo) < 0) Util.fallar("E_CFG_MAPEO");
    });
    CAMPOS.forEach(function(campo) {
      var v = mapeo[campo];
      if (v === void 0 || v === null) {
        if (CAMPOS_OBLIGATORIOS.indexOf(campo) >= 0) Util.fallar("E_CFG_MAPEO");
        return;
      }
      var c = candidatos(v);
      if (!c) Util.fallar("E_CFG_MAPEO");
      c.forEach(function(k) {
        if (Object.prototype.hasOwnProperty.call(claves, k) && claves[k] !== campo) Util.fallar("E_CFG_MAPEO");
        claves[k] = campo;
      });
      porCampo[campo] = c;
    });
    var fi = cfg.formato_importe || {};
    var decimal = fi.decimal === void 0 ? "," : fi.decimal;
    var miles = fi.miles === void 0 ? decimal === "," ? "." : "," : fi.miles;
    if (decimal !== "," && decimal !== "." || [",", ".", " ", ""].indexOf(miles) < 0 || miles === decimal) Util.fallar("E_CFG_FORMATO");
    var monedas = cfg.monedas_admitidas === void 0 ? MONEDAS.slice() : cfg.monedas_admitidas;
    if (!Array.isArray(monedas) || !monedas.length || monedas.some(function(m) {
      return MONEDAS.indexOf(m) < 0;
    })) Util.fallar("E_CFG_MONEDAS");
    var porDefecto = cfg.moneda_por_defecto === void 0 ? null : cfg.moneda_por_defecto;
    if (porDefecto !== null && monedas.indexOf(porDefecto) < 0) Util.fallar("E_CFG_MONEDAS");
    var umbral = cfg.umbral_rechazo === void 0 ? UMBRAL_POR_DEFECTO : cfg.umbral_rechazo;
    if (typeof umbral !== "number" || !(umbral >= 0 && umbral <= 100)) Util.fallar("E_CFG_UMBRAL");
    var lim = cfg.limites || {};
    var maxFilas = lim.max_filas === void 0 ? LIMITES_POR_DEFECTO.max_filas : lim.max_filas;
    var maxCelda = lim.max_largo_celda === void 0 ? LIMITES_POR_DEFECTO.max_largo_celda : lim.max_largo_celda;
    if (!(Number.isInteger(maxFilas) && maxFilas >= 1 && maxFilas <= 2e4) || !(Number.isInteger(maxCelda) && maxCelda >= 10 && maxCelda <= 1e3)) Util.fallar("E_CFG_LIMITES");
    var corte = cfg.fecha_corte === void 0 ? null : cfg.fecha_corte;
    if (corte !== null && !Util.esISO(corte)) Util.fallar("E_CFG_FECHA_CORTE");
    var rango = cfg.rango_vencimiento || {};
    var atras = rango.anios_atras === void 0 ? 5 : rango.anios_atras;
    var adelante = rango.anios_adelante === void 0 ? 2 : rango.anios_adelante;
    if (!(Number.isInteger(atras) && atras >= 1 && atras <= 30 && Number.isInteger(adelante) && adelante >= 0 && adelante <= 30)) Util.fallar("E_CFG_FECHA_CORTE");
    var zona = cfg.zona_horaria === void 0 ? null : cfg.zona_horaria;
    if (zona !== null && (typeof zona !== "string" || !/^[A-Za-z_]+(?:\\/[A-Za-z_+-]+){0,2}$/.test(zona))) Util.fallar("E_CFG_ZONA");
    return {
      candidatos: porCampo,
      decimal,
      miles,
      monedas,
      monedaPorDefecto: porDefecto,
      umbral,
      maxFilas,
      maxCelda,
      corte,
      atras,
      adelante,
      zona,
      ignorarTotales: cfg.ignorar_filas_de_total === true,
      filaBase: Number.isInteger(cfg.fila_base) && cfg.fila_base >= 1 && cfg.fila_base <= 1e3 ? cfg.fila_base : 2
    };
  }
  function detectarDelimitador(t) {
    var inicio = t.search(/\\S/);
    if (inicio < 0) return null;
    var cuenta = { ";": 0, ",": 0, "\\t": 0, "|": 0 }, enComillas = false;
    for (var i = inicio; i < t.length; i++) {
      var c = t.charAt(i);
      if (c === '"') {
        enComillas = !enComillas;
        continue;
      }
      if (!enComillas && (c === "\\n" || c === "\\r")) break;
      if (!enComillas && Object.prototype.hasOwnProperty.call(cuenta, c)) cuenta[c]++;
    }
    var mejor = null, max = 0;
    [";", ",", "\\t", "|"].forEach(function(d) {
      if (cuenta[d] > max) {
        max = cuenta[d];
        mejor = d;
      }
    });
    return mejor;
  }
  function leerCSV(entrada) {
    if (typeof entrada !== "string") Util.fallar("E_CSV_VACIO");
    if (entrada.length > MAX_CARACTERES_TEXTO) Util.fallar("E_ARCHIVO_GRANDE");
    var t = entrada.charCodeAt(0) === 65279 ? entrada.slice(1) : entrada;
    var delim = detectarDelimitador(t);
    var filas = [], fila = [], campo = "", lineas = [], vacias = 0;
    var i = 0, n = t.length, linea = 1, lineaInicio = 1;
    function cerrarCampo() {
      fila.push(campo);
      campo = "";
    }
    function cerrarFila() {
      cerrarCampo();
      if (fila.some(function(x) {
        return x.trim() !== "";
      })) {
        filas.push(fila);
        lineas.push(lineaInicio);
      } else vacias++;
      fila = [];
    }
    while (i < n) {
      var c = t.charAt(i);
      if (c === '"' && campo.trim() === "") {
        campo = "";
        i++;
        var cerrada = false;
        while (i < n) {
          var d = t.charAt(i);
          if (d === '"') {
            if (t.charAt(i + 1) === '"') {
              campo += '"';
              i += 2;
              continue;
            }
            i++;
            cerrada = true;
            break;
          }
          if (d === "\\n") linea++;
          campo += d;
          i++;
        }
        if (!cerrada) Util.fallar("E_CSV_COMILLAS");
        continue;
      }
      if (delim && c === delim) {
        cerrarCampo();
        i++;
        continue;
      }
      if (c === "\\r" || c === "\\n") {
        if (c === "\\r" && t.charAt(i + 1) === "\\n") i++;
        i++;
        cerrarFila();
        linea++;
        lineaInicio = linea;
        continue;
      }
      campo += c;
      i++;
    }
    if (campo !== "" || fila.length) cerrarFila();
    if (!filas.length) Util.fallar("E_CSV_VACIO");
    return { cabeceras: filas[0].map(function(x) {
      return x.trim();
    }), filas: filas.slice(1), lineas: lineas.slice(1), vacias };
  }
  function celdaVacia(v) {
    return Util.limpiar(v) === "";
  }
  function restarAnios(iso, n) {
    var p = Util.partesISO(iso);
    var y = p.y - n, d = p.d;
    if (p.m === 2 && d === 29 && !Util.fechaValida(y, 2, 29)) d = 28;
    return Util.isoDe(y, p.m, d);
  }
  function referencia(txt) {
    var s = Util.limpiar(txt).toUpperCase();
    if (!s) return { ok: false, codigo: "E_REF_VACIA" };
    if (!Util.refValida(s)) return { ok: false, codigo: "E_REF_INVALIDA" };
    return { ok: true, ref: s };
  }
  function claveDeReferencia(ref) {
    return ref.replace(/[ ./_-]/g, "");
  }
  var VERDADERO = { si: 1, s: 1, "1": 1, "true": 1, x: 1, verdadero: 1, yes: 1, y: 1 };
  var FALSO = { no: 1, n: 1, "0": 1, "false": 1, falso: 1 };
  function booleano(v) {
    var k = Util.sinAcentos(Util.limpiar(v)).toLowerCase();
    if (k === "") return { valor: false, entendido: true };
    if (Object.prototype.hasOwnProperty.call(VERDADERO, k)) return { valor: true, entendido: true };
    if (Object.prototype.hasOwnProperty.call(FALSO, k)) return { valor: false, entendido: true };
    return { valor: true, entendido: false };
  }
  function nombreDeudor(txt) {
    return Util.limpiar(txt);
  }
  var ETIQUETAS_TOTAL = ["total", "totales", "subtotal", "subtotales", "totalgeneral", "sumatotal"];
  function etiquetaDeTotal(v) {
    return ETIQUETAS_TOTAL.indexOf(Util.clave(v)) >= 0;
  }
  function esFilaDeTotal(cel, indice) {
    if (!celdaVacia(cel("vencimiento"))) return false;
    var f = cel("factura"), d = cel("deudor");
    if (celdaVacia(f) && celdaVacia(d)) return indice.serie === void 0 || celdaVacia(cel("serie"));
    if (etiquetaDeTotal(f)) return celdaVacia(d) || etiquetaDeTotal(d);
    if (etiquetaDeTotal(d)) return celdaVacia(f);
    return false;
  }
  function resultadoVacio(codigo, detalle, cfg) {
    return {
      error: codigo,
      detalle: detalle || null,
      facturas: [],
      apartadas: [],
      avisos: [],
      por_codigo: {},
      resumen: {
        total: 0,
        aceptadas: 0,
        apartadas: 0,
        vacias: 0,
        totales_ignorados: 0,
        tasa_apartadas: 0,
        umbral_rechazo: cfg ? cfg.umbral : UMBRAL_POR_DEFECTO,
        bloquear: true,
        motivo_bloqueo: codigo
      }
    };
  }
  function normalizarTabla(tabla, cfgEntrada) {
    var cfg = validarConfig(cfgEntrada);
    var cabeceras = tabla.cabeceras, datos = tabla.filas;
    if (datos.length > cfg.maxFilas) return resultadoVacio("E_DEMASIADAS_FILAS", null, cfg);
    var indice = {}, faltantes = [], duplicadas = [];
    CAMPOS.forEach(function(campo) {
      var cand = cfg.candidatos[campo];
      if (!cand) return;
      var hallados = [];
      cabeceras.forEach(function(h, i) {
        if (cand.indexOf(Util.clave(h)) >= 0) hallados.push(i);
      });
      if (hallados.length === 0) {
        if (CAMPOS_OBLIGATORIOS.indexOf(campo) >= 0) faltantes.push(campo);
      } else if (hallados.length > 1) duplicadas.push(campo);
      else indice[campo] = hallados[0];
    });
    if (faltantes.length) return resultadoVacio("E_COLUMNA_FALTANTE", { columnas: faltantes }, cfg);
    if (duplicadas.length) return resultadoVacio("E_COLUMNA_DUPLICADA", { columnas: duplicadas }, cfg);
    var facturas = [], apartadas = [], avisos = [];
    var vacias = tabla.vacias || 0, totalesIgnorados = 0;
    var rangoMin = null, rangoMax = null;
    if (cfg.corte) {
      rangoMin = restarAnios(cfg.corte, cfg.atras);
      rangoMax = restarAnios(cfg.corte, -cfg.adelante);
    }
    var optZona = cfg.zona ? { zona: cfg.zona } : {};
    var nCabeceras = cabeceras.length;
    datos.forEach(function(celdas, i) {
      var fila = tabla.lineas && tabla.lineas[i] ? tabla.lineas[i] : i + cfg.filaBase;
      var codigos = [];
      var arreglo = Array.isArray(celdas) ? celdas : null;
      if (!arreglo) {
        apartadas.push({ fila, codigo: "E_FILA_INVALIDA", otros: [] });
        return;
      }
      if (arreglo.every(celdaVacia)) {
        vacias++;
        return;
      }
      if (arreglo.length > nCabeceras && arreglo.slice(nCabeceras).some(function(x) {
        return !celdaVacia(x);
      })) {
        apartadas.push({ fila, codigo: "E_FILA_DESALINEADA", otros: [] });
        return;
      }
      function cel(campo) {
        return indice[campo] === void 0 ? void 0 : arreglo[indice[campo]];
      }
      if (cfg.ignorarTotales && esFilaDeTotal(cel, indice)) {
        totalesIgnorados++;
        return;
      }
      var demasiado = Object.keys(indice).some(function(campo) {
        return Util.limpiar(cel(campo)).length > cfg.maxCelda;
      });
      if (demasiado) {
        apartadas.push({ fila, codigo: "E_CELDA_LARGA", otros: [] });
        return;
      }
      var textoRef = Util.limpiar(cel("factura"));
      if (indice.serie !== void 0 && !celdaVacia(cel("serie")) && textoRef) textoRef = Util.limpiar(cel("serie")) + "-" + textoRef;
      var ref = referencia(textoRef);
      if (!ref.ok) codigos.push(ref.codigo);
      var deudor = nombreDeudor(cel("deudor"));
      if (!deudor) codigos.push("E_DEUDOR_VACIO");
      var imp = Util.parsearImporte(cel("importe"), { decimal: cfg.decimal, miles: cfg.miles });
      if (!imp.ok) codigos.push(imp.codigo);
      var moneda = null;
      var monedaCol = null, columnaConMoneda = indice.moneda !== void 0 && !celdaVacia(cel("moneda"));
      if (columnaConMoneda) {
        monedaCol = Util.monedaDeTexto(cel("moneda"));
        if (!monedaCol) codigos.push("E_MONEDA_DESCONOCIDA");
      }
      if (imp.ok) {
        if (monedaCol && imp.moneda && monedaCol !== imp.moneda) codigos.push("E_MONEDA_CONFLICTO");
        else {
          moneda = monedaCol || imp.moneda || cfg.monedaPorDefecto;
          if ((!columnaConMoneda || monedaCol) && (!moneda || cfg.monedas.indexOf(moneda) < 0)) codigos.push("E_MONEDA_DESCONOCIDA");
        }
      }
      var venc = Util.parsearFecha(cel("vencimiento"), optZona);
      if (!venc.ok) codigos.push(venc.codigo);
      else if (rangoMin && (venc.iso < rangoMin || venc.iso > rangoMax)) codigos.push("E_FECHA_FUERA_DE_RANGO");
      if (codigos.length) {
        var unicos = codigos.filter(function(c, k) {
          return codigos.indexOf(c) === k;
        });
        apartadas.push({ fila, codigo: unicos[0], otros: unicos.slice(1) });
        return;
      }
      var emision = null;
      if (indice.emision !== void 0 && !celdaVacia(cel("emision"))) {
        var em = Util.parsearFecha(cel("emision"), optZona);
        if (em.ok) {
          emision = em.iso;
          if (venc.iso < em.iso) avisos.push({ fila, codigo: "A_VENCIMIENTO_ANTERIOR_EMISION" });
        } else avisos.push({ fila, codigo: "A_EMISION_INVALIDA" });
      }
      var tel = null, movil = null;
      if (indice.telefono !== void 0 && !celdaVacia(cel("telefono"))) {
        var t = Util.normalizarTelefono(cel("telefono"));
        if (t.ok) {
          tel = t.digitos;
          movil = t.movil;
          if (!t.movil) avisos.push({ fila, codigo: "A_TEL_FIJO" });
        } else avisos.push({ fila, codigo: "A_TEL_INVALIDO" });
      }
      var mail = null;
      if (indice.correo !== void 0 && !celdaVacia(cel("correo"))) {
        mail = Util.normalizarCorreo(typeof cel("correo") === "string" ? cel("correo") : "");
        if (!mail) avisos.push({ fila, codigo: "A_MAIL_INVALIDO" });
      }
      var disputa = false;
      if (indice.en_disputa !== void 0) {
        var b = booleano(cel("en_disputa"));
        disputa = b.valor;
        if (!b.entendido) avisos.push({ fila, codigo: "A_DISPUTA_NO_ENTENDIDA" });
      }
      facturas.push({
        factura_ref: ref.ref,
        deudor_nombre: deudor,
        moneda,
        importe_centavos: imp.centavos,
        emision,
        vencimiento: venc.iso,
        contacto_tel: tel,
        tel_movil: movil,
        contacto_mail: mail,
        en_disputa: disputa,
        fila_origen: fila
      });
    });
    var grupos = {};
    facturas.forEach(function(f, i) {
      var k = claveDeReferencia(f.factura_ref) + "|" + f.moneda;
      (grupos[k] = grupos[k] || []).push(i);
    });
    var descartar = {};
    Object.keys(grupos).forEach(function(k) {
      var idx = grupos[k];
      if (idx.length < 2) return;
      var base = facturas[idx[0]];
      var identicas = idx.every(function(j) {
        var f = facturas[j];
        return f.importe_centavos === base.importe_centavos && f.vencimiento === base.vencimiento && Util.clave(f.deudor_nombre) === Util.clave(base.deudor_nombre);
      });
      if (identicas) idx.slice(1).forEach(function(j) {
        descartar[j] = "E_DUPLICADA";
      });
      else idx.forEach(function(j) {
        descartar[j] = "E_CONFLICTO_FACTURA";
      });
    });
    var finales = [];
    facturas.forEach(function(f, i) {
      if (descartar[i]) apartadas.push({ fila: f.fila_origen, codigo: descartar[i], otros: [] });
      else finales.push(f);
    });
    apartadas.sort(function(a, b) {
      return a.fila - b.fila;
    });
    var filasFinales = {};
    finales.forEach(function(f) {
      filasFinales[f.fila_origen] = true;
    });
    avisos = avisos.filter(function(a) {
      return filasFinales[a.fila] === true;
    });
    var total = finales.length + apartadas.length;
    var bloquear = false, motivo = null;
    if (total === 0) {
      bloquear = true;
      motivo = "E_ARCHIVO_VACIO";
    } else if (apartadas.length * 100 > cfg.umbral * total) {
      bloquear = true;
      motivo = "E_DEMASIADAS_APARTADAS";
    }
    return {
      error: null,
      detalle: null,
      facturas: finales,
      apartadas,
      avisos,
      por_codigo: Util.contarPorCodigo(apartadas),
      resumen: {
        total,
        aceptadas: finales.length,
        apartadas: apartadas.length,
        vacias,
        totales_ignorados: totalesIgnorados,
        tasa_apartadas: total ? Math.round(apartadas.length / total * 1e4) / 1e4 : 0,
        umbral_rechazo: cfg.umbral,
        bloquear,
        motivo_bloqueo: motivo
      }
    };
  }
  function normalizarObjetos(filas, cfg) {
    if (!Array.isArray(filas)) Util.fallar("E_FILAS_INVALIDAS");
    var cabeceras = [], vistos = {};
    filas.forEach(function(f) {
      if (!esObjeto(f)) return;
      Object.keys(f).forEach(function(k) {
        if (!Object.prototype.hasOwnProperty.call(vistos, k)) {
          vistos[k] = cabeceras.length;
          cabeceras.push(k);
        }
      });
    });
    var datos = filas.map(function(f) {
      if (!esObjeto(f)) return null;
      return cabeceras.map(function(k) {
        return Object.prototype.hasOwnProperty.call(f, k) ? f[k] : "";
      });
    });
    return normalizarTabla({ cabeceras, filas: datos }, cfg);
  }
  function normalizarCSV(texto, cfg) {
    var cfgOk = validarConfig(cfg);
    var t;
    try {
      t = leerCSV(texto);
    } catch (e) {
      return resultadoVacio(Util.codigoDe(e), null, cfgOk);
    }
    return normalizarTabla({ cabeceras: t.cabeceras, filas: t.filas, lineas: t.lineas, vacias: t.vacias }, cfg);
  }
  return {
    CAMPOS,
    CAMPOS_OBLIGATORIOS,
    CAMPOS_OPCIONALES,
    LIMITES_POR_DEFECTO,
    UMBRAL_POR_DEFECTO,
    validarConfig,
    leerCSV,
    normalizarTabla,
    normalizarObjetos,
    normalizarCSV
  };
})();
// ===== m2-antiguedad.js =====
var M2 = (function() {
  "use strict";
  var MONEDAS = ["UYU", "USD"];
  var ORDEN_MONEDA = { UYU: 0, USD: 1 };
  var TRAMOS_POR_DEFECTO = [[1, 30], [31, 60], [61, 90], [91, null]];
  var ESCALONES_POR_DEFECTO = [
    { nombre: "amable", desde: 1, hasta: 15 },
    { nombre: "segundo_aviso", desde: 16, hasta: 45 },
    { nombre: "firme", desde: 46, hasta: null }
  ];
  var DIAS_NUEVA = 7;
  function esEntero(n, min, max) {
    return typeof n === "number" && Math.floor(n) === n && n >= min && n <= max;
  }
  function validarTramos(tramos) {
    if (!Array.isArray(tramos) || tramos.length < 1 || tramos.length > 8) Util.fallar("E_CFG_TRAMOS");
    var salida = [], esperado = 1;
    tramos.forEach(function(t, i) {
      var desde = Array.isArray(t) ? t[0] : t && t.desde;
      var hasta = Array.isArray(t) ? t[1] : t && t.hasta;
      if (hasta === void 0) hasta = null;
      var ultimo = i === tramos.length - 1;
      if (!esEntero(desde, 1, 3650) || desde !== esperado) Util.fallar("E_CFG_TRAMOS");
      if (ultimo) {
        if (hasta !== null) Util.fallar("E_CFG_TRAMOS");
      } else {
        if (!esEntero(hasta, desde, 3650)) Util.fallar("E_CFG_TRAMOS");
        esperado = hasta + 1;
      }
      salida.push({ desde, hasta });
    });
    return salida;
  }
  function validarEscalones(escalones) {
    if (!Array.isArray(escalones) || escalones.length < 1 || escalones.length > 6) Util.fallar("E_CFG_ESCALONES");
    var vistos = {}, esperado = 1, salida = [];
    escalones.forEach(function(e, i) {
      if (!e || typeof e !== "object") Util.fallar("E_CFG_ESCALONES");
      var nombre = e.nombre, hasta = e.hasta === void 0 ? null : e.hasta;
      var ultimo = i === escalones.length - 1;
      if (typeof nombre !== "string" || !/^[a-z][a-z_]{1,29}$/.test(nombre) || nombre === "en_disputa" || vistos[nombre]) Util.fallar("E_CFG_ESCALONES");
      vistos[nombre] = true;
      if (!esEntero(e.desde, 1, 3650) || e.desde !== esperado) Util.fallar("E_CFG_ESCALONES");
      if (ultimo) {
        if (hasta !== null) Util.fallar("E_CFG_ESCALONES");
      } else {
        if (!esEntero(hasta, e.desde, 3650)) Util.fallar("E_CFG_ESCALONES");
        esperado = hasta + 1;
      }
      salida.push({ nombre, desde: e.desde, hasta });
    });
    return salida;
  }
  function buscarRango(rangos, dias) {
    for (var i = 0; i < rangos.length; i++) {
      if (dias >= rangos[i].desde && (rangos[i].hasta === null || dias <= rangos[i].hasta)) return i;
    }
    return -1;
  }
  function validarFactura(f) {
    if (!f || typeof f !== "object" || !Util.refValida(f.factura_ref) || typeof f.deudor_nombre !== "string" || MONEDAS.indexOf(f.moneda) < 0 || !(typeof f.importe_centavos === "number" && Math.floor(f.importe_centavos) === f.importe_centavos && f.importe_centavos > 0 && f.importe_centavos <= Util.LIMITE_CENTAVOS) || !Util.esISO(f.vencimiento)) Util.fallar("E_FACTURA_INVALIDA");
  }
  function comparar(a, b) {
    if (ORDEN_MONEDA[a.moneda] !== ORDEN_MONEDA[b.moneda]) return ORDEN_MONEDA[a.moneda] - ORDEN_MONEDA[b.moneda];
    if (a.dias_atraso !== b.dias_atraso) return b.dias_atraso - a.dias_atraso;
    if (a.importe_centavos !== b.importe_centavos) return b.importe_centavos - a.importe_centavos;
    if (a.factura_ref !== b.factura_ref) return a.factura_ref < b.factura_ref ? -1 : 1;
    return (a.fila_origen || 0) - (b.fila_origen || 0);
  }
  function calcularAntiguedad(entrada) {
    if (!entrada || typeof entrada !== "object") Util.fallar("E_FACTURAS_INVALIDAS");
    if (!Util.esISO(entrada.fecha_corte)) Util.fallar("E_FECHA_CORTE_INVALIDA");
    if (!Array.isArray(entrada.facturas)) Util.fallar("E_FACTURAS_INVALIDAS");
    var corte = entrada.fecha_corte;
    var tramos = validarTramos(entrada.tramos === void 0 ? TRAMOS_POR_DEFECTO : entrada.tramos);
    var escalones = validarEscalones(entrada.escalones === void 0 ? ESCALONES_POR_DEFECTO : entrada.escalones);
    var vencidas = [], sinVencer = 0, vencenHoy = 0;
    entrada.facturas.forEach(function(f) {
      validarFactura(f);
      var dias = Util.diasEntre(f.vencimiento, corte);
      if (dias < 0) {
        sinVencer++;
        return;
      }
      if (dias === 0) {
        vencenHoy++;
        return;
      }
      var t = buscarRango(tramos, dias);
      var e = buscarRango(escalones, dias);
      var v = {};
      Object.keys(f).forEach(function(k) {
        v[k] = f[k];
      });
      v.dias_atraso = dias;
      v.tramo = t;
      v.escalon = f.en_disputa === true ? "en_disputa" : escalones[e].nombre;
      v.nueva_esta_semana = dias <= DIAS_NUEVA;
      vencidas.push(v);
    });
    vencidas.sort(comparar);
    var totales = {}, porTramo = {}, porEscalon = {};
    vencidas.forEach(function(v) {
      var tot = totales[v.moneda] || (totales[v.moneda] = { n: 0, total_centavos: 0 });
      tot.n++;
      tot.total_centavos = Util.sumarSeguro(tot.total_centavos, v.importe_centavos);
      var pt = porTramo[v.moneda] || (porTramo[v.moneda] = tramos.map(function(t) {
        return { desde: t.desde, hasta: t.hasta, n: 0, total_centavos: 0 };
      }));
      pt[v.tramo].n++;
      pt[v.tramo].total_centavos = Util.sumarSeguro(pt[v.tramo].total_centavos, v.importe_centavos);
      porEscalon[v.escalon] = (porEscalon[v.escalon] || 0) + 1;
    });
    return {
      fecha_corte: corte,
      vencidas,
      totales,
      por_tramo: porTramo,
      por_escalon: porEscalon,
      sin_vencer_n: sinVencer,
      vencen_hoy_n: vencenHoy,
      tramos,
      escalones
    };
  }
  return {
    TRAMOS_POR_DEFECTO,
    ESCALONES_POR_DEFECTO,
    DIAS_NUEVA,
    validarTramos,
    validarEscalones,
    calcularAntiguedad
  };
})();
// ===== m3-borradores.js =====
var M3 = (function() {
  "use strict";
  var CAMPOS = [
    "deudor",
    "factura",
    "importe",
    "moneda",
    "importe_completo",
    "vencimiento",
    "dias_atraso",
    "empresa",
    "medios_pago",
    "firma"
  ];
  var CAMPOS_ASUNTO = ["factura", "empresa", "vencimiento", "importe_completo", "dias_atraso"];
  var MAX_PLANTILLA = 2e3;
  var MAX_TEXTO_EMPRESA = 300;
  var MAX_ENLACE = 1900;
  var PLANTILLAS_POR_DEFECTO = {
    amable: {
      asunto: "Recordatorio de la factura {factura}",
      cuerpo: "Estimados:\\nLes escribimos de {empresa} para recordarles que la factura {factura} por {importe_completo}, con vencimiento el {vencimiento}, figura pendiente de pago.\\nSi ya fue abonada, les pedimos disculpas y que ignoren este mensaje.\\n{medios_pago}\\nQuedamos a su disposici\\xF3n para cualquier consulta.\\n{firma}"
    },
    segundo_aviso: {
      asunto: "Factura {factura} pendiente de pago",
      cuerpo: "Estimados:\\nNos comunicamos nuevamente por la factura {factura} por {importe_completo}, vencida el {vencimiento} ({dias_atraso} d\\xEDas de atraso).\\nLes agradeceremos regularizarla o indicarnos cu\\xE1ndo podr\\xE1n hacerlo. Si ya fue abonada, les rogamos que nos env\\xEDen el comprobante.\\n{medios_pago}\\nQuedamos a su disposici\\xF3n.\\n{firma}"
    },
    firme: {
      asunto: "Factura {factura}: solicitamos su respuesta",
      cuerpo: "Estimados:\\nLa factura {factura} por {importe_completo} venci\\xF3 el {vencimiento} y registra {dias_atraso} d\\xEDas de atraso.\\nLes solicitamos comunicarse con nosotros a la brevedad para acordar su cancelaci\\xF3n.\\nSi ya fue abonada, les pedimos que nos env\\xEDen el comprobante.\\n{medios_pago}\\nGracias por su atenci\\xF3n.\\n{firma}"
    }
  };
  var PREFIJOS_PROHIBIDOS = [
    "suspend",
    "suspens",
    "embarg",
    "demanda",
    "demandar",
    "judicial",
    "abogad",
    "juicio",
    "protesto",
    "clearing",
    "moros",
    "incumpl",
    "legal",
    "consecuenc",
    "denunci",
    "antecedent",
    "intim",
    "ejecuc",
    "ejecut",
    "penal",
    "recarg",
    "multa",
    "rescin",
    "rescis",
    "sancion"
  ];
  var PALABRAS_PROHIBIDAS = ["mora", "interes", "intereses", "bcu"];
  var FRASES_PROHIBIDAS = ["informe comercial", "informes comerciales", "central de riesgos", "lista negra"];
  var FRASES_RE = new RegExp(
    "(?:^|[^a-z0-9])(?:(?:" + PREFIJOS_PROHIBIDOS.join("|") + ")[a-z0-9]*|" + PALABRAS_PROHIBIDAS.join("|") + "|" + FRASES_PROHIBIDAS.join("|").replace(/ /g, " +") + ")(?![a-z0-9])"
  );
  function camposDe(texto) {
    var usados = [];
    String(texto).replace(/\\{([A-Za-z_]+)\\}/g, function(m, c) {
      usados.push(c.toLowerCase());
      return m;
    });
    return usados;
  }
  function problemaDePlantilla(texto, permitidos, esCuerpo) {
    if (typeof texto !== "string" || !texto.trim()) return "E_PLANTILLA_VACIA";
    if (texto.length > MAX_PLANTILLA) return "E_PLANTILLA_LARGA";
    var usados = camposDe(texto);
    for (var i = 0; i < usados.length; i++) if (permitidos.indexOf(usados[i]) < 0) return "E_PLANTILLA_CAMPO_DESCONOCIDO";
    if (/[{}]/.test(texto.replace(/\\{[A-Za-z_]+\\}/g, ""))) return "E_PLANTILLA_LLAVES";
    var plano = Util.sinAcentos(Util.limpiar(texto.replace(/\\{[A-Za-z_]+\\}/g, " "))).toLowerCase();
    if (FRASES_RE.test(plano)) return "E_PLANTILLA_FRASE_PROHIBIDA";
    if (esCuerpo) {
      var tieneImporte = usados.indexOf("importe_completo") >= 0 || usados.indexOf("importe") >= 0;
      if (usados.indexOf("factura") < 0 || !tieneImporte || usados.indexOf("vencimiento") < 0) return "E_PLANTILLA_SIN_DATOS_CLAVE";
    }
    return null;
  }
  function validarPlantillas(propias) {
    var mezcla = {};
    Object.keys(PLANTILLAS_POR_DEFECTO).forEach(function(n) {
      mezcla[n] = PLANTILLAS_POR_DEFECTO[n];
    });
    if (propias !== void 0 && propias !== null) {
      if (typeof propias !== "object" || Array.isArray(propias)) Util.fallar("E_PLANTILLA_VACIA");
      Object.keys(propias).forEach(function(n) {
        if (!/^[a-z][a-z_]{1,29}$/.test(n) || n === "en_disputa") Util.fallar("E_PLANTILLA_CAMPO_DESCONOCIDO");
        mezcla[n] = propias[n];
      });
    }
    Object.keys(mezcla).forEach(function(n) {
      var p = mezcla[n];
      if (!p || typeof p !== "object") Util.fallar("E_PLANTILLA_VACIA");
      var pa = problemaDePlantilla(p.asunto, CAMPOS_ASUNTO, false);
      if (pa) Util.fallar(pa);
      var pc = problemaDePlantilla(p.cuerpo, CAMPOS, true);
      if (pc) Util.fallar(pc);
    });
    return mezcla;
  }
  function renderizar(plantilla, vars) {
    var lineas = String(plantilla).replace(/\\r\\n?/g, "\\n").split("\\n");
    var salida = [];
    lineas.forEach(function(linea) {
      var total = 0, vacios = 0;
      var l = linea.replace(/\\{([A-Za-z_]+)\\}/g, function(m, clave) {
        var k = clave.toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(vars, k)) return m;
        total++;
        var v = String(vars[k]);
        if (!v.trim()) {
          vacios++;
          return "";
        }
        return v;
      });
      if (total > 0 && vacios === total) return;
      if (vacios > 0) l = l.replace(/\\s+([,.;:!?])/g, "$1").replace(/^[\\s,;:]+/, "").replace(/ {2,}/g, " ");
      salida.push(l.replace(/[ \\t]+$/, ""));
    });
    return salida.join("\\n").replace(/\\n{3,}/g, "\\n\\n").trim();
  }
  function limpiarMultilinea(v, maxLineas) {
    if (typeof v !== "string") return "";
    var lineas = v.replace(/\\r\\n?/g, "\\n").split("\\n").map(function(l) {
      return Util.limpiar(l);
    }).filter(function(l) {
      return l !== "";
    });
    if (lineas.length > maxLineas) lineas = lineas.slice(0, maxLineas);
    return lineas.join("\\n");
  }
  function validarEmpresa(e) {
    if (!e || typeof e !== "object") Util.fallar("E_CFG_EMPRESA");
    var nombre = Util.limpiar(e.nombre);
    if (!nombre || nombre.length > 120) Util.fallar("E_CFG_EMPRESA");
    var medios = limpiarMultilinea(e.medios_pago, 5);
    var firma = limpiarMultilinea(e.firma, 5);
    if (medios.length > MAX_TEXTO_EMPRESA || firma.length > MAX_TEXTO_EMPRESA) Util.fallar("E_CFG_EMPRESA");
    return { nombre, medios_pago: medios, firma };
  }
  function enlaceWhatsApp(digitos, mensaje) {
    if (typeof digitos !== "string" || !/^\\d{8,15}$/.test(digitos)) return null;
    var url;
    try {
      url = "https://api.whatsapp.com/send?phone=" + digitos + "&text=" + encodeURIComponent(mensaje);
    } catch (e) {
      return null;
    }
    return url.length <= MAX_ENLACE ? url : null;
  }
  function enlaceMail(direccion, asunto, cuerpo) {
    var d = Util.normalizarCorreo(direccion);
    if (!d || d !== direccion) return null;
    var url;
    try {
      url = "mailto:" + d + "?subject=" + encodeURIComponent(asunto) + "&body=" + encodeURIComponent(String(cuerpo).replace(/\\n/g, "\\r\\n"));
    } catch (e) {
      return null;
    }
    return url.length <= MAX_ENLACE ? url : null;
  }
  function variables(v, emp) {
    var completo = Util.formatearImporte(v.importe_centavos, v.moneda);
    return {
      deudor: Util.limpiar(v.deudor_nombre),
      factura: v.factura_ref,
      importe: completo.replace(/^\\S+ /, ""),
      moneda: completo.replace(/ .*$/, ""),
      importe_completo: completo,
      vencimiento: Util.formatoFecha(v.vencimiento),
      dias_atraso: String(v.dias_atraso),
      empresa: emp.nombre,
      medios_pago: emp.medios_pago,
      firma: emp.firma
    };
  }
  function validarVencida(v) {
    if (!v || typeof v !== "object" || !Util.refValida(v.factura_ref) || typeof v.escalon !== "string" || !/^[a-z][a-z_]{1,29}$/.test(v.escalon) || !(typeof v.dias_atraso === "number" && Math.floor(v.dias_atraso) === v.dias_atraso && v.dias_atraso >= 1) || !Util.esISO(v.vencimiento)) Util.fallar("E_FACTURA_INVALIDA");
  }
  function generarBorradores(entrada) {
    if (!entrada || typeof entrada !== "object" || !Array.isArray(entrada.vencidas)) Util.fallar("E_FACTURAS_INVALIDAS");
    var emp = validarEmpresa(entrada.empresa);
    var plantillas = validarPlantillas(entrada.plantillas);
    var demo = !!(entrada.opciones && entrada.opciones.demo === true);
    var borradores = [], sinBorrador = [];
    entrada.vencidas.forEach(function(v, indice) {
      validarVencida(v);
      var fila = typeof v.fila_origen === "number" ? v.fila_origen : null;
      if (v.escalon === "en_disputa") {
        sinBorrador.push({ indice, factura_ref: v.factura_ref, moneda: v.moneda, fila_origen: fila, motivo: "en_disputa" });
        return;
      }
      var p = Object.prototype.hasOwnProperty.call(plantillas, v.escalon) ? plantillas[v.escalon] : null;
      if (!p) Util.fallar("E_PLANTILLA_FALTANTE");
      var vars = variables(v, emp);
      var texto = renderizar(p.cuerpo, vars);
      var asunto = Util.limpiar(renderizar(p.asunto, vars)).slice(0, 150);
      if (texto.indexOf(v.factura_ref) < 0 || texto.indexOf(vars.vencimiento) < 0 || texto.indexOf(vars.importe_completo) < 0 && texto.indexOf(vars.importe) < 0) Util.fallar("E_BORRADOR_SIN_DATOS_CLAVE");
      var avisos = [];
      var wa = null, mail = null;
      if (v.contacto_tel) {
        if (Util.esNumeroDeEjemplo(v.contacto_tel)) avisos.push("A_TEL_EJEMPLO");
        else if (v.tel_movil === false) avisos.push("A_TEL_FIJO");
        else if (!demo) {
          wa = enlaceWhatsApp(v.contacto_tel, texto);
          if (!wa) avisos.push("A_ENLACE_WA_OMITIDO");
        }
      }
      if (v.contacto_mail && !demo) {
        mail = enlaceMail(v.contacto_mail, asunto, texto);
        if (!mail) avisos.push("A_ENLACE_MAIL_OMITIDO");
      }
      borradores.push({
        indice,
        factura_ref: v.factura_ref,
        moneda: v.moneda,
        fila_origen: fila,
        escalon: v.escalon,
        asunto,
        texto,
        enlace_wa: wa,
        enlace_mail: mail,
        avisos
      });
    });
    return { borradores, sin_borrador: sinBorrador, demo };
  }
  return {
    CAMPOS,
    PLANTILLAS_POR_DEFECTO,
    PREFIJOS_PROHIBIDOS,
    PALABRAS_PROHIBIDAS,
    FRASES_PROHIBIDAS,
    validarPlantillas,
    validarEmpresa,
    renderizar,
    enlaceWhatsApp,
    enlaceMail,
    generarBorradores
  };
})();
// ===== m4-informe.js =====
var M4 = (function() {
  "use strict";
  var MAX_FILAS_POR_DEFECTO = 300;
  var MAX_NUMEROS_FILA = 15;
  var ETIQUETA_ESCALON = {
    amable: "Recordatorio amable",
    segundo_aviso: "Segundo aviso",
    firme: "Aviso firme o llamada",
    en_disputa: "En disputa (sin borrador)"
  };
  var CLASE_ESCALON = { amable: "b-amable", segundo_aviso: "b-segundo", firme: "b-firme", en_disputa: "b-disputa" };
  var DESCRIPCION_CODIGO = {
    E_REF_VACIA: "sin n\\xFAmero de factura",
    E_REF_INVALIDA: "n\\xFAmero de factura con caracteres no admitidos",
    E_DEUDOR_VACIO: "sin nombre del cliente",
    E_IMPORTE_INVALIDO: "importe que no se puede leer",
    E_IMPORTE_NO_POSITIVO: "importe cero o negativo (\\xBFnota de cr\\xE9dito?)",
    E_MONEDA_DESCONOCIDA: "moneda desconocida o ausente",
    E_MONEDA_CONFLICTO: "la moneda del importe no coincide con la de la columna",
    E_FECHA_VACIA: "sin fecha de vencimiento",
    E_FECHA_INVALIDA: "fecha de vencimiento que no existe o no se entiende",
    E_FECHA_AMBIGUA: "fecha con el d\\xEDa y el mes posiblemente invertidos",
    E_FECHA_FUERA_DE_RANGO: "fecha de vencimiento fuera del rango esperado",
    E_CELDA_LARGA: "texto demasiado largo en alguna celda",
    E_FILA_DESALINEADA: "m\\xE1s columnas de las esperadas (\\xBFun separador dentro de un texto?)",
    E_FILA_INVALIDA: "fila que no se puede leer",
    E_DUPLICADA: "factura repetida (se conserv\\xF3 la primera)",
    E_CONFLICTO_FACTURA: "la misma factura aparece con datos distintos"
  };
  var DESCRIPCION_BLOQUEO = {
    E_ARCHIVO_VACIO: "el archivo no tiene facturas",
    E_DEMASIADAS_APARTADAS: "demasiadas filas no se pudieron leer",
    E_COLUMNA_FALTANTE: "falta una columna esperada",
    E_COLUMNA_DUPLICADA: "una columna esperada aparece repetida",
    E_DEMASIADAS_FILAS: "el archivo tiene m\\xE1s filas de las admitidas",
    E_CSV_COMILLAS: "hay comillas sin cerrar",
    E_CSV_VACIO: "el archivo est\\xE1 vac\\xEDo",
    E_ARCHIVO_GRANDE: "el archivo es demasiado grande"
  };
  var esc = Util.escHtml;
  function etiqueta(escalon) {
    if (Object.prototype.hasOwnProperty.call(ETIQUETA_ESCALON, escalon)) return ETIQUETA_ESCALON[escalon];
    var t = String(escalon).replace(/_/g, " ");
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function clase(escalon) {
    return Object.prototype.hasOwnProperty.call(CLASE_ESCALON, escalon) ? CLASE_ESCALON[escalon] : "b-otro";
  }
  function descripcion(codigo) {
    return Object.prototype.hasOwnProperty.call(DESCRIPCION_CODIGO, codigo) ? DESCRIPCION_CODIGO[codigo] : "motivo no descrito";
  }
  var URL_WA_RE = /^https:\\/\\/api\\.whatsapp\\.com\\/send\\?phone=\\d{8,15}&text=[A-Za-z0-9\\-_.!~*'()%]*$/;
  var URL_MAIL_RE = /^mailto:[a-z0-9._+-]+@[a-z0-9.-]+\\?subject=[A-Za-z0-9\\-_.!~*'()%]*&body=[A-Za-z0-9\\-_.!~*'()%]*$/;
  var URL_DRIVE_RE = /^https:\\/\\/(?:drive|docs)\\.google\\.com\\/[A-Za-z0-9\\/_?=&.%#-]{5,300}$/;
  function enlaceSeguro(url, tipo) {
    if (typeof url !== "string" || url.length > 2e3) return null;
    return (tipo === "wa" ? URL_WA_RE : URL_MAIL_RE).test(url) ? url : null;
  }
  function plural(n, uno, varios) {
    return n + " " + (n === 1 ? uno : varios);
  }
  function textoFilas(filas) {
    var v = filas.slice(0, MAX_NUMEROS_FILA).join(", ");
    return filas.length > MAX_NUMEROS_FILA ? v + " y " + (filas.length - MAX_NUMEROS_FILA) + " m\\xE1s" : v;
  }
  function nombreTramo(t) {
    return t.hasta === null ? "M\\xE1s de " + (t.desde - 1) + " d\\xEDas" : t.desde + " a " + t.hasta + " d\\xEDas";
  }
  var MONEDAS = ["UYU", "USD"];
  var ETIQUETA_MONEDA = { UYU: "$U", USD: "US$" };
  function validarEntrada(e) {
    if (!e || typeof e !== "object" || !Util.esISO(e.fecha_corte)) Util.fallar("E_INFORME_INVALIDO");
    var nombre = Util.limpiar(e.empresa && e.empresa.nombre);
    if (!nombre || nombre.length > 120) Util.fallar("E_CFG_EMPRESA");
    var a = e.antiguedad, b = e.borradores, l = e.lectura;
    if (!a || !Array.isArray(a.vencidas) || !a.totales || !a.por_tramo || !Array.isArray(a.tramos)) Util.fallar("E_INFORME_INVALIDO");
    if (!b || !Array.isArray(b.borradores) || !Array.isArray(b.sin_borrador)) Util.fallar("E_INFORME_INVALIDO");
    if (!l || !l.resumen || !Array.isArray(l.apartadas) || !Array.isArray(l.avisos)) Util.fallar("E_INFORME_INVALIDO");
    var vistos = {};
    b.borradores.concat(b.sin_borrador).forEach(function(x) {
      var v = a.vencidas[x.indice];
      if (!v || vistos[x.indice] || v.factura_ref !== x.factura_ref || v.moneda !== x.moneda) Util.fallar("E_INFORME_INCONSISTENTE");
      vistos[x.indice] = true;
    });
    if (Object.keys(vistos).length !== a.vencidas.length) Util.fallar("E_INFORME_INCONSISTENTE");
    return nombre;
  }
  function lineasLectura(l) {
    var lineas = [];
    var r = l.resumen;
    if (r.apartadas > 0) {
      lineas.push("Filas del archivo que no se pudieron leer: " + r.apartadas + " de " + r.total + ". Conviene revisarlas en el archivo original.");
      var porCodigo = {};
      l.apartadas.forEach(function(x) {
        (porCodigo[x.codigo] = porCodigo[x.codigo] || []).push(x.fila);
      });
      Object.keys(porCodigo).sort().forEach(function(c) {
        lineas.push("  \\xB7 " + descripcion(c) + ": " + plural(porCodigo[c].length, "fila", "filas") + " (" + textoFilas(porCodigo[c]) + ")");
      });
    }
    if (l.avisos.length) {
      var avisos = Util.contarPorCodigo(l.avisos.map(function(a) {
        return { codigo: a.codigo.replace(/^A_/, "E_") };
      }));
      var partes = [];
      if (avisos.E_TEL_INVALIDO) partes.push(plural(avisos.E_TEL_INVALIDO, "tel\\xE9fono ilegible", "tel\\xE9fonos ilegibles"));
      if (avisos.E_TEL_FIJO) partes.push(plural(avisos.E_TEL_FIJO, "tel\\xE9fono fijo (WhatsApp necesita un m\\xF3vil)", "tel\\xE9fonos fijos (WhatsApp necesita un m\\xF3vil)"));
      if (avisos.E_MAIL_INVALIDO) partes.push(plural(avisos.E_MAIL_INVALIDO, "correo ilegible", "correos ilegibles"));
      if (avisos.E_DISPUTA_NO_ENTENDIDA) partes.push(plural(avisos.E_DISPUTA_NO_ENTENDIDA, "marca de disputa poco clara (se trat\\xF3 como en disputa)", "marcas de disputa poco claras (se trataron como en disputa)"));
      if (avisos.E_EMISION_INVALIDA) partes.push(plural(avisos.E_EMISION_INVALIDA, "fecha de emisi\\xF3n ilegible", "fechas de emisi\\xF3n ilegibles"));
      if (avisos.E_VENCIMIENTO_ANTERIOR_EMISION) partes.push(plural(avisos.E_VENCIMIENTO_ANTERIOR_EMISION, "vencimiento anterior a la emisi\\xF3n", "vencimientos anteriores a la emisi\\xF3n"));
      if (partes.length) lineas.push("Avisos: " + partes.join("; ") + ".");
    }
    return lineas;
  }
  function textoResumen(e, empresa) {
    var a = e.antiguedad;
    var total = a.vencidas.length;
    var L = [];
    L.push("Resumen de cobranza \\xB7 " + empresa + " \\xB7 al " + Util.formatoFecha(e.fecha_corte));
    L.push("");
    L.push(total === 0 ? "No hay facturas vencidas." : "Facturas vencidas: " + total);
    MONEDAS.forEach(function(m) {
      if (a.totales[m]) L.push("  \\xB7 " + ETIQUETA_MONEDA[m] + ": " + plural(a.totales[m].n, "factura", "facturas") + " por " + Util.formatearImporte(a.totales[m].total_centavos, m));
    });
    MONEDAS.forEach(function(m) {
      if (!a.por_tramo[m]) return;
      L.push("");
      L.push("Por antig\\xFCedad (" + ETIQUETA_MONEDA[m] + "):");
      a.por_tramo[m].forEach(function(t) {
        L.push("  \\xB7 " + nombreTramo(t) + ": " + plural(t.n, "factura", "facturas") + (t.n ? " por " + Util.formatearImporte(t.total_centavos, m) : ""));
      });
    });
    if (total) {
      var nuevas = a.vencidas.filter(function(v) {
        return v.nueva_esta_semana;
      }).length;
      L.push("");
      L.push("Vencidas en los \\xFAltimos 7 d\\xEDas: " + nuevas);
      if (a.por_escalon.en_disputa) L.push("En disputa (sin borrador): " + a.por_escalon.en_disputa);
    }
    var lect = lineasLectura(e.lectura);
    if (lect.length) {
      L.push("");
      Array.prototype.push.apply(L, lect);
    }
    return L.join("\\n");
  }
  var CSS = [
    ":root{color-scheme:light dark;--fondo:#ffffff;--texto:#1b1f24;--suave:#4a5560;--borde:#d0d7de;--tarjeta:#f6f8fa;--acento:#0a4f9e;",
    "--ok-f:#e3f4e8;--ok-t:#0b4a22;--am-f:#fff1c2;--am-t:#5c3d00;--ro-f:#fde3e6;--ro-t:#7a1620;--gr-f:#e8ecef;--gr-t:#2f3b44;",
    "--alerta-f:#fff8e1;--alerta-b:#c99700}",
    "@media (prefers-color-scheme:dark){:root{--fondo:#111418;--texto:#e6e9ec;--suave:#aab3bc;--borde:#38414a;--tarjeta:#1a1f25;--acento:#7cb4f5;",
    "--ok-f:#12321d;--ok-t:#a9e6bd;--am-f:#3a2c00;--am-t:#ffe08a;--ro-f:#3d1218;--ro-t:#ffb4bd;--gr-f:#2a323a;--gr-t:#d3dae0;",
    "--alerta-f:#2e2500;--alerta-b:#c99700}}",
    '*{box-sizing:border-box}body{margin:0;background:var(--fondo);color:var(--texto);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    "main{max-width:960px;margin:0 auto;padding:16px}h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.15rem;margin:28px 0 10px}",
    "p{margin:0 0 8px}.sub{color:var(--suave)}.banner{border:2px dashed var(--alerta-b);background:var(--alerta-f);padding:10px 12px;margin:12px 0;border-radius:8px;font-weight:600}",
    ".tarjetas{display:flex;flex-wrap:wrap;gap:12px}.tarjeta{flex:1 1 220px;background:var(--tarjeta);border:1px solid var(--borde);border-radius:10px;padding:12px 14px}",
    ".tarjeta .cifra{font-size:1.5rem;font-weight:700}.tarjeta .det{color:var(--suave)}",
    "table{border-collapse:collapse;width:100%;margin:6px 0 12px}th,td{border:1px solid var(--borde);padding:6px 8px;text-align:left;vertical-align:top}th{background:var(--tarjeta)}td.num,th.num{text-align:right;white-space:nowrap}",
    ".alerta{border:1px solid var(--alerta-b);background:var(--alerta-f);border-radius:8px;padding:10px 12px;margin:10px 0}.alerta ul{margin:6px 0 0;padding-left:20px}",
    ".grupo{margin-top:22px}.grupo h3{font-size:1.05rem;margin:0 0 8px}",
    ".fila{border:1px solid var(--borde);border-radius:10px;padding:12px 14px;margin:0 0 12px;background:var(--fondo)}",
    ".fila .cab{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}.fila .cab strong{overflow-wrap:anywhere}",
    ".datos{color:var(--suave);margin:4px 0 8px;overflow-wrap:anywhere}",
    ".badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.85rem;font-weight:600}",
    ".b-amable{background:var(--ok-f);color:var(--ok-t)}.b-segundo{background:var(--am-f);color:var(--am-t)}",
    ".b-firme{background:var(--ro-f);color:var(--ro-t)}.b-disputa,.b-otro{background:var(--gr-f);color:var(--gr-t)}",
    "pre.borrador{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:var(--tarjeta);border:1px solid var(--borde);border-radius:8px;padding:10px 12px;margin:6px 0;user-select:all;-webkit-user-select:all}",
    ".acciones{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 0;align-items:center}",
    "a.btn,span.btn{display:inline-block;min-height:44px;line-height:44px;padding:0 16px;border-radius:8px;font-weight:600;text-decoration:none}",
    "a.btn{background:var(--acento);color:var(--fondo)}a.btn:focus-visible{outline:3px solid var(--texto);outline-offset:2px}",
    "span.btn{border:1px dashed var(--borde);color:var(--suave);font-weight:400}.nota{color:var(--suave);font-size:.9rem}footer{margin-top:28px;border-top:1px solid var(--borde);padding-top:12px}",
    "@media (max-width:380px){main{padding:12px}table{font-size:.9rem}th,td{padding:5px 5px}}",
    "@media print{a.btn{border:1px solid var(--texto);background:none;color:var(--texto)}}"
  ].join("");
  function celdaMoneda(m) {
    return ETIQUETA_MONEDA[m];
  }
  function htmlCabecera(e, empresa, titulo) {
    var h = [];
    h.push("<h1>Resumen de cobranza</h1>");
    h.push('<p class="sub">' + esc(empresa) + " \\xB7 al " + esc(Util.formatoFecha(e.fecha_corte)) + "</p>");
    if (e.opciones && e.opciones.demo) h.push('<p class="banner" role="note">EJEMPLO CON DATOS FICTICIOS. Ning\\xFAn nombre, importe, tel\\xE9fono ni correo es real, y en esta demostraci\\xF3n los botones no abren nada.</p>');
    else if (e.opciones && e.opciones.ensayo) h.push('<p class="banner" role="note">ENSAYO: este informe no es el informe real del cliente.</p>');
    return h.join("");
  }
  function htmlTotales(a) {
    var h = ["<h2>Resumen</h2>"];
    var hay = MONEDAS.filter(function(m) {
      return a.totales[m];
    });
    if (!hay.length) return h.concat(["<p>No hay facturas vencidas.</p>"]).join("");
    h.push('<div class="tarjetas">');
    hay.forEach(function(m) {
      h.push('<div class="tarjeta"><div class="det">Vencido en ' + esc(celdaMoneda(m)) + '</div><div class="cifra">' + esc(Util.formatearImporte(a.totales[m].total_centavos, m)) + '</div><div class="det">' + esc(plural(a.totales[m].n, "factura", "facturas")) + "</div></div>");
    });
    h.push("</div>");
    h.push("<h2>Por antig\\xFCedad</h2>");
    hay.forEach(function(m) {
      h.push('<table><caption class="nota">' + esc(celdaMoneda(m)) + '</caption><thead><tr><th scope="col">Atraso</th><th scope="col" class="num">Facturas</th><th scope="col" class="num">Importe</th></tr></thead><tbody>');
      a.por_tramo[m].forEach(function(t) {
        h.push("<tr><td>" + esc(nombreTramo(t)) + '</td><td class="num">' + t.n + '</td><td class="num">' + (t.n ? esc(Util.formatearImporte(t.total_centavos, m)) : "\\u2014") + "</td></tr>");
      });
      h.push("</tbody></table>");
    });
    return h.join("");
  }
  function htmlLectura(l) {
    var lineas = lineasLectura(l);
    if (!lineas.length) return "";
    var h = ['<div class="alerta" role="alert"><strong>Antes de usar este informe</strong><ul>'];
    lineas.forEach(function(x) {
      h.push("<li>" + esc(x.replace(/^\\s*\\u00b7\\s*/, "")) + "</li>");
    });
    h.push("</ul></div>");
    return h.join("");
  }
  function htmlFila(v, b, demo) {
    var h = ['<article class="fila">'];
    h.push('<div class="cab"><strong>' + esc(Util.limpiar(v.deudor_nombre)) + '</strong><span class="badge ' + clase(v.escalon) + '">' + esc(etiqueta(v.escalon)) + "</span></div>");
    h.push('<p class="datos">Factura ' + esc(v.factura_ref) + " \\xB7 " + esc(Util.formatearImporte(v.importe_centavos, v.moneda)) + " \\xB7 venci\\xF3 el " + esc(Util.formatoFecha(v.vencimiento)) + " \\xB7 " + esc(plural(v.dias_atraso, "d\\xEDa", "d\\xEDas")) + " de atraso" + (v.nueva_esta_semana ? " \\xB7 nueva esta semana" : "") + "</p>");
    if (b) {
      h.push('<pre class="borrador">' + esc(b.texto) + "</pre>");
      var wa = demo ? null : enlaceSeguro(b.enlace_wa, "wa");
      var mail = demo ? null : enlaceSeguro(b.enlace_mail, "mail");
      h.push('<p class="acciones">');
      if (wa) h.push('<a class="btn" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>');
      if (mail) h.push('<a class="btn" href="' + esc(mail) + '">Abrir correo</a>');
      if (!wa && !mail) {
        h.push('<span class="btn" aria-disabled="true">' + (demo ? "En la demostraci\\xF3n los botones no abren nada" : b.avisos.indexOf("A_TEL_EJEMPLO") >= 0 ? "N\\xFAmero de ejemplo: sin enlace" : "Sin tel\\xE9fono m\\xF3vil ni correo v\\xE1lidos: copiar el texto") + "</span>");
      } else if (!wa && b.avisos.indexOf("A_TEL_FIJO") >= 0) {
        h.push('<span class="nota">Tel\\xE9fono fijo: WhatsApp necesita un m\\xF3vil.</span>');
      }
      h.push("</p>");
    } else {
      h.push('<p class="nota">Marcada como en disputa: no se sugiere reclamar hasta resolverlo.</p>');
    }
    h.push("</article>");
    return h.join("");
  }
  function ordenGrupos(a) {
    var nombres = a.escalones.map(function(x) {
      return x.nombre;
    }).reverse();
    return nombres.concat(["en_disputa"]);
  }
  function htmlDetalle(e, maxFilas) {
    var a = e.antiguedad, b = e.borradores;
    var pares = a.vencidas.map(function(v, i) {
      return { v, b: null, i };
    });
    b.borradores.forEach(function(x) {
      pares[x.indice].b = x;
    });
    var h = [
      "<h2>Para revisar y enviar</h2>",
      '<p class="nota">Este informe no env\\xEDa nada a ning\\xFAn cliente. Antes de enviar, revisar cada mensaje; un clic sobre el texto lo selecciona para copiarlo.</p>'
    ];
    var mostrados = 0, omitidos = 0;
    ordenGrupos(a).forEach(function(grupo) {
      var del = pares.filter(function(p) {
        return p.v.escalon === grupo;
      });
      if (!del.length) return;
      var visibles = del.slice(0, Math.max(0, maxFilas - mostrados));
      omitidos += del.length - visibles.length;
      mostrados += visibles.length;
      if (!visibles.length) return;
      h.push('<section class="grupo"><h3>' + esc(etiqueta(grupo)) + " (" + del.length + ")</h3>");
      visibles.forEach(function(p) {
        h.push(htmlFila(p.v, p.b, !!(e.opciones && e.opciones.demo)));
      });
      h.push("</section>");
    });
    if (omitidos) h.push('<p class="alerta" role="note">Se muestran las ' + mostrados + " facturas m\\xE1s atrasadas de " + a.vencidas.length + ". Las " + omitidos + " restantes est\\xE1n en la planilla.</p>");
    return { html: h.join(""), mostradas: mostrados, omitidas: omitidos };
  }
  function armarInforme(e) {
    var empresa = validarEntrada(e);
    var opc = e.opciones || {};
    var maxFilas = Number.isInteger(opc.max_filas_informe) && opc.max_filas_informe >= 1 && opc.max_filas_informe <= 2e3 ? opc.max_filas_informe : MAX_FILAS_POR_DEFECTO;
    var prefijo = opc.demo === true ? "EJEMPLO \\xB7 " : opc.ensayo === true ? "[ENSAYO] " : "";
    var total = e.antiguedad.vencidas.length;
    var asunto = prefijo + "Resumen semanal de cobranza \\xB7 " + Util.formatoFecha(e.fecha_corte) + " \\xB7 " + (total === 0 ? "sin facturas vencidas" : plural(total, "factura vencida", "facturas vencidas"));
    var detalle = htmlDetalle(e, maxFilas);
    var titulo = "Cobranza \\xB7 resumen al " + Util.formatoFecha(e.fecha_corte);
    var html = \`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>\` + esc(titulo) + "</title><style>" + CSS + "</style></head><body><main>" + htmlCabecera(e, empresa) + htmlTotales(e.antiguedad) + htmlLectura(e.lectura) + detalle.html + '<footer><p class="nota">Borradores generados autom\\xE1ticamente a partir de la planilla del cliente al ' + esc(Util.formatoFecha(e.fecha_corte)) + ". Los importes no incluyen intereses ni ajustes. Si algo no cuadra con los registros propios, prevalece lo que dicen los registros propios.</p></footer></main></body></html>\\n";
    return {
      asunto,
      texto_resumen: textoResumen(e, empresa),
      html_completo: html,
      nombre_archivo: (opc.ensayo === true ? "ensayo-" : opc.demo === true ? "demo-" : "") + "informe-cobranza-" + e.fecha_corte + ".html",
      filas_mostradas: detalle.mostradas,
      filas_omitidas: detalle.omitidas
    };
  }
  function armarCorreoConEnlace(entrada) {
    if (!entrada || typeof entrada.texto_resumen !== "string" || !entrada.texto_resumen) Util.fallar("E_INFORME_INVALIDO");
    if (typeof entrada.enlace !== "string" || !URL_DRIVE_RE.test(entrada.enlace)) Util.fallar("E_ENLACE_INVALIDO");
    var prefijo = entrada.ensayo === true ? "[ENSAYO] " : "";
    return {
      asunto: prefijo + (typeof entrada.asunto === "string" ? Util.limpiar(entrada.asunto).replace(/^\\[ENSAYO\\] /, "") : "Resumen semanal de cobranza"),
      cuerpo_texto: entrada.texto_resumen + "\\n\\nInforme completo, con los borradores por cliente (solo lo abre quien tenga acceso a la carpeta):\\n" + entrada.enlace + "\\n\\nAntes de enviar, revisar cada mensaje. Este correo no se envi\\xF3 a ning\\xFAn cliente."
    };
  }
  function armarAvisoIncidencia(entrada) {
    if (!entrada || !Util.esISO(entrada.fecha_corte) || !entrada.lectura || !entrada.lectura.resumen) Util.fallar("E_INFORME_INVALIDO");
    var empresa = Util.limpiar(entrada.empresa && entrada.empresa.nombre);
    if (!empresa || empresa.length > 120) Util.fallar("E_CFG_EMPRESA");
    var l = entrada.lectura, motivo = l.resumen.motivo_bloqueo;
    var L = ["No se pudo preparar el resumen de cobranza de " + empresa + " al " + Util.formatoFecha(entrada.fecha_corte) + ".", ""];
    L.push("Motivo: " + (Object.prototype.hasOwnProperty.call(DESCRIPCION_BLOQUEO, motivo) ? DESCRIPCION_BLOQUEO[motivo] : "el archivo no se pudo leer con seguridad") + ".");
    if (l.detalle && Array.isArray(l.detalle.columnas)) {
      var nombres = l.detalle.columnas.filter(function(c) {
        return /^[a-z_]{2,20}$/.test(c);
      });
      if (nombres.length) L.push("Columnas afectadas: " + nombres.join(", ") + ".");
    }
    var lect = lineasLectura(l);
    if (lect.length) {
      L.push("");
      Array.prototype.push.apply(L, lect);
    }
    L.push("");
    L.push("No se envi\\xF3 nada a ning\\xFAn cliente. Revisar el archivo de la semana y volver a dejarlo en la carpeta.");
    return { asunto: (entrada.ensayo === true ? "[ENSAYO] " : "") + "No se pudo preparar el resumen de cobranza \\xB7 " + Util.formatoFecha(entrada.fecha_corte), cuerpo_texto: L.join("\\n") };
  }
  function armarAvisoSinArchivo(entrada) {
    if (!entrada || !Util.esISO(entrada.fecha_corte)) Util.fallar("E_INFORME_INVALIDO");
    var empresa = Util.limpiar(entrada.empresa && entrada.empresa.nombre);
    if (!empresa || empresa.length > 120) Util.fallar("E_CFG_EMPRESA");
    return {
      asunto: (entrada.ensayo === true ? "[ENSAYO] " : "") + "No encontramos la exportaci\\xF3n de esta semana \\xB7 " + Util.formatoFecha(entrada.fecha_corte),
      cuerpo_texto: "No encontramos la exportaci\\xF3n de facturas pendientes de " + empresa + " de esta semana.\\n\\nPara preparar el resumen de cobranza hace falta dejar el archivo actualizado en la carpeta compartida. Cuando est\\xE9, el resumen se prepara autom\\xE1ticamente al d\\xEDa siguiente.\\n\\nNo se envi\\xF3 nada a ning\\xFAn cliente."
    };
  }
  return {
    MAX_FILAS_POR_DEFECTO,
    DESCRIPCION_CODIGO,
    DESCRIPCION_BLOQUEO,
    armarInforme,
    armarCorreoConEnlace,
    armarAvisoIncidencia,
    armarAvisoSinArchivo
  };
})();
// ===== m5-guardia-envio.js =====
var M5 = (function() {
  "use strict";
  var TOPE_ABSOLUTO = 5;
  function resultado(accion, destinatarios, motivos, bloqueados) {
    return { accion, destinatarios, motivos, bloqueados };
  }
  function noEnviar(motivo, bloqueados) {
    return resultado("no_enviar", [], [motivo], bloqueados || []);
  }
  function esEnvioReal(guardias, modoCliente) {
    return !!guardias && typeof guardias === "object" && guardias.permitido === true && guardias.dry_run === false && modoCliente === "real";
  }
  function guardiaEnvio(e) {
    if (!e || typeof e !== "object") return noEnviar("ENTRADA_INVALIDA");
    var max = Number.isInteger(e.max_destinatarios) && e.max_destinatarios >= 1 && e.max_destinatarios <= TOPE_ABSOLUTO ? e.max_destinatarios : 3;
    if (!e.guardias || e.guardias.permitido !== true) return noEnviar("INTERRUPTOR_APAGADO");
    var lb = e.lista_blanca;
    if (!Array.isArray(lb) || lb.length < 1 || lb.length > max) return noEnviar("LISTA_BLANCA_TAMANO");
    for (var i = 0; i < lb.length; i++) {
      if (typeof lb[i] !== "string" || Util.normalizarCorreo(lb[i]) !== lb[i]) return noEnviar("LISTA_BLANCA_INVALIDA");
    }
    var sol = e.solicitados;
    if (!Array.isArray(sol) || sol.length < 1 || sol.length > max) return noEnviar("SOLICITADOS_INVALIDOS");
    var aceptados = [], bloqueados = [];
    sol.forEach(function(x, indice) {
      var n = Util.normalizarCorreo(x);
      if (!n) bloqueados.push({ indice, motivo: "DESTINATARIO_INVALIDO" });
      else if (lb.indexOf(n) < 0) bloqueados.push({ indice, motivo: "NO_EN_LISTA_BLANCA" });
      else if (aceptados.indexOf(n) < 0) aceptados.push(n);
    });
    if (bloqueados.length) return noEnviar("DESTINATARIO_BLOQUEADO", bloqueados);
    if (esEnvioReal(e.guardias, e.modo_cliente)) return resultado("enviar", aceptados, [], []);
    var rp = e.remitente_prueba;
    if (typeof rp !== "string" || Util.normalizarCorreo(rp) !== rp) return noEnviar("REMITENTE_PRUEBA_INVALIDO");
    return resultado("redirigir_ensayo", [rp], ["ENSAYO"], []);
  }
  return { TOPE_ABSOLUTO, esEnvioReal, guardiaEnvio };
})();
// ===== m6-registro.js =====
var M6 = (function() {
  "use strict";
  var ESTADOS = ["ok", "incidencia", "error", "omitida"];
  var MODOS = ["dry", "real"];
  var CLAVES_LIBRO = [
    "cliente_id",
    "semana_iso",
    "hash_archivo",
    "estado",
    "iniciada_utc",
    "terminada_utc",
    "n_filas",
    "n_vencidas",
    "n_apartadas",
    "codigo_error",
    "modo"
  ];
  var CODIGO_RE = /^E_[A-Z0-9_]{2,40}$/;
  var SEMANA_RE = /^\\d{4}-W(?:0[1-9]|[1-4]\\d|5[0-3])$/;
  var UTC_RE = /^(\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d)(?:\\.(\\d{1,3}))?Z$/;
  function contador(n) {
    return typeof n === "number" && Math.floor(n) === n && n >= 0 && n <= 1e6;
  }
  function utcValido(s) {
    return typeof s === "string" && UTC_RE.test(s) && Util.esISO(s.slice(0, 10));
  }
  function utcCanonico(s) {
    var m = UTC_RE.exec(s);
    return m[1] + "." + ((m[2] || "") + "000").slice(0, 3) + "Z";
  }
  function nombreSeguro(v) {
    var s = Util.limpiar(v).slice(0, 80);
    s = s.replace(/[^A-Za-z0-9\\u00c0-\\u00ff _.:()\\[\\]\\/\\u00b7-]/g, "?");
    return s || "desconocido";
  }
  function idEjecucion(v) {
    var s = typeof v === "number" ? String(v) : v;
    return typeof s === "string" && /^[0-9A-Za-z_-]{1,64}$/.test(s) ? s : "desconocido";
  }
  function sanearError(error, contexto) {
    var c = contexto && typeof contexto === "object" ? contexto : {};
    return {
      cliente_id: Util.idValido(c.cliente_id) ? c.cliente_id : "desconocido",
      workflow: nombreSeguro(c.workflow),
      nodo: nombreSeguro(c.nodo),
      codigo: Util.codigoDe(error),
      ejecucion_id: idEjecucion(c.ejecucion_id)
    };
  }
  function textoAlerta(sano) {
    if (!sano || typeof sano !== "object" || !CODIGO_RE.test(sano.codigo)) Util.fallar("E_ALERTA_INVALIDA");
    return {
      asunto: "Error en cobranza \\xB7 " + nombreSeguro(sano.cliente_id) + " \\xB7 " + sano.codigo,
      cuerpo_texto: "Cliente: " + nombreSeguro(sano.cliente_id) + "\\nFlujo: " + nombreSeguro(sano.workflow) + "\\nNodo: " + nombreSeguro(sano.nodo) + "\\nC\\xF3digo: " + sano.codigo + "\\nEjecuci\\xF3n: " + idEjecucion(sano.ejecucion_id) + "\\n\\nEste aviso no contiene datos del archivo del cliente. Para investigar, reproducir el caso con datos ficticios."
    };
  }
  function claveEjecucion(clienteId, fechaCorte, huella) {
    if (!Util.idValido(clienteId) || !Util.esISO(fechaCorte) || !Util.hex64(huella)) Util.fallar("E_LIBRO_INVALIDO");
    return clienteId + "|" + Util.semanaISO(fechaCorte) + "|" + huella;
  }
  function filaLibro(d) {
    if (!d || typeof d !== "object" || Array.isArray(d)) Util.fallar("E_LIBRO_INVALIDO");
    Object.keys(d).forEach(function(k) {
      if (CLAVES_LIBRO.indexOf(k) < 0) Util.fallar("E_LIBRO_INVALIDO");
    });
    var ok = Util.idValido(d.cliente_id) && SEMANA_RE.test(String(d.semana_iso)) && Util.hex64(d.hash_archivo) && ESTADOS.indexOf(d.estado) >= 0 && utcValido(d.iniciada_utc) && utcValido(d.terminada_utc) && contador(d.n_filas) && contador(d.n_vencidas) && contador(d.n_apartadas) && d.n_vencidas + d.n_apartadas <= d.n_filas && (d.codigo_error === null || d.codigo_error === void 0 || typeof d.codigo_error === "string" && CODIGO_RE.test(d.codigo_error)) && MODOS.indexOf(d.modo) >= 0;
    var conCodigo = d.codigo_error !== null && d.codigo_error !== void 0;
    if (ok && (d.estado === "error" || d.estado === "incidencia" ? !conCodigo : d.estado === "ok" && conCodigo)) ok = false;
    if (!ok) Util.fallar("E_LIBRO_INVALIDO");
    return {
      clave: d.cliente_id + "|" + d.semana_iso + "|" + d.hash_archivo,
      cliente_id: d.cliente_id,
      semana_iso: d.semana_iso,
      hash_archivo: d.hash_archivo,
      estado: d.estado,
      iniciada_utc: d.iniciada_utc,
      terminada_utc: d.terminada_utc,
      n_filas: d.n_filas,
      n_vencidas: d.n_vencidas,
      n_apartadas: d.n_apartadas,
      codigo_error: d.codigo_error === void 0 ? null : d.codigo_error,
      modo: d.modo
    };
  }
  function estadoBloqueo(fila, ahora) {
    if (fila === null || fila === void 0) return "libre";
    if (!utcValido(ahora) || typeof fila !== "object" || !utcValido(fila.expira_utc)) Util.fallar("E_BLOQUEO_INVALIDO");
    return utcCanonico(fila.expira_utc) > utcCanonico(ahora) ? "ocupado" : "vencido";
  }
  function decidirEjecucion(e) {
    if (!e || typeof e.ya_resuelto !== "boolean" || ["libre", "ocupado", "vencido"].indexOf(e.bloqueo) < 0) Util.fallar("E_DECISION_INVALIDA");
    if (e.ya_resuelto) return "omitir_ya_procesado";
    if (e.bloqueo === "ocupado") return "omitir_en_curso";
    if (e.bloqueo === "vencido") return "alertar_bloqueo_vencido";
    return "procesar";
  }
  var MAX_FILAS_BLOQUEO = 50;
  var MAX_FILAS_LIBRO = 1e3;
  var MINUTOS_BLOQUEO = 30;
  var CLAVE_LIBRO_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}\\|\\d{4}-W\\d{2}\\|[0-9a-f]{64}$/;
  function esFila(f) {
    return f !== null && typeof f === "object" && !Array.isArray(f);
  }
  function bloqueoVigente(filas, clienteId) {
    if (!Util.idValido(clienteId) || !Array.isArray(filas) || filas.length > MAX_FILAS_BLOQUEO) Util.fallar("E_BLOQUEO_INVALIDO");
    var mejor = null;
    filas.forEach(function(f) {
      if (!esFila(f) || f.cliente_id !== clienteId || !utcValido(f.expira_utc)) Util.fallar("E_BLOQUEO_INVALIDO");
      if (mejor === null || utcCanonico(f.expira_utc) > utcCanonico(mejor.expira_utc)) mejor = { cliente_id: f.cliente_id, expira_utc: f.expira_utc };
    });
    return mejor;
  }
  function yaResuelto(filas, clave) {
    if (typeof clave !== "string" || !CLAVE_LIBRO_RE.test(clave) || !Array.isArray(filas) || filas.length > MAX_FILAS_LIBRO) Util.fallar("E_LIBRO_INVALIDO");
    var cliente = clave.slice(0, clave.indexOf("|"));
    var resuelto = false;
    filas.forEach(function(f) {
      if (!esFila(f) || typeof f.clave !== "string" || f.clave.indexOf("|") !== cliente.length || f.clave.slice(0, cliente.length) !== cliente || ESTADOS.indexOf(f.estado) < 0) Util.fallar("E_LIBRO_INVALIDO");
      if (f.clave === clave && (f.estado === "ok" || f.estado === "incidencia")) resuelto = true;
    });
    return resuelto;
  }
  function filaBloqueo(e) {
    if (!esFila(e) || !Util.idValido(e.cliente_id) || !utcValido(e.ahora_utc)) Util.fallar("E_BLOQUEO_INVALIDO");
    var minutos = e.minutos === void 0 ? MINUTOS_BLOQUEO : e.minutos;
    if (!(typeof minutos === "number" && Math.floor(minutos) === minutos && minutos >= 1 && minutos <= 240)) Util.fallar("E_BLOQUEO_INVALIDO");
    var total = +e.ahora_utc.slice(11, 13) * 60 + +e.ahora_utc.slice(14, 16) + minutos;
    var dias = Math.floor(total / 1440);
    var resto = total - dias * 1440;
    var fecha = dias > 0 ? Util.sumarDias(e.ahora_utc.slice(0, 10), dias) : e.ahora_utc.slice(0, 10);
    if (!Util.esISO(fecha)) Util.fallar("E_BLOQUEO_INVALIDO");
    return {
      cliente_id: e.cliente_id,
      expira_utc: fecha + "T" + Util.pad2(Math.floor(resto / 60)) + ":" + Util.pad2(resto % 60) + ":" + e.ahora_utc.slice(17, 19) + "Z"
    };
  }
  return {
    ESTADOS,
    MODOS,
    CLAVES_LIBRO,
    MINUTOS_BLOQUEO,
    sanearError,
    textoAlerta,
    claveEjecucion,
    filaLibro,
    estadoBloqueo,
    decidirEjecucion,
    bloqueoVigente,
    yaResuelto,
    filaBloqueo
  };
})();
// ===== m7-ingesta.js =====
var M7 = (function() {
  "use strict";
  var MAX_ARCHIVOS_LISTADOS = 500;
  var MAX_BYTES_TOPE = 6e6;
  var MAX_BYTES_DEFECTO = 5e6;
  var MAX_BYTES_XLSX = 2e6;
  var ANTIGUEDAD_DEFECTO = 8;
  var DIA_AVISO_DEFECTO = 3;
  var HUELLA_SIN_ARCHIVO = new Array(65).join("0");
  var TIPOS = {
    csv: ["text/csv", "application/csv", "text/comma-separated-values", "text/plain", "application/vnd.ms-excel", "application/octet-stream"],
    tsv: ["text/tab-separated-values", "text/plain", "application/octet-stream"],
    xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"]
  };
  var ID_RE = /^[A-Za-z0-9_-]{10,128}$/;
  var INSTANTE_RE = /^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,9})?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$/;
  function esObjeto(x) {
    return x !== null && typeof x === "object" && !Array.isArray(x);
  }
  function comparable(s) {
    return Util.sinAcentos(Util.limpiar(s)).toLowerCase();
  }
  function validarConfig(cfg) {
    var c = cfg === void 0 || cfg === null ? {} : cfg;
    if (!esObjeto(c)) Util.fallar("E_CFG_INGESTA");
    var patron = c.patron_nombre_archivo === void 0 ? "*" : c.patron_nombre_archivo;
    if (typeof patron !== "string") Util.fallar("E_CFG_PATRON");
    var p = comparable(patron);
    if (!p || p.length > 60 || p.split("*").length > 4 || /[\\/\\\\]/.test(p)) Util.fallar("E_CFG_PATRON");
    var ant = c.antiguedad_maxima_archivo_dias === void 0 ? ANTIGUEDAD_DEFECTO : c.antiguedad_maxima_archivo_dias;
    if (!(Number.isInteger(ant) && ant >= 1 && ant <= 31)) Util.fallar("E_CFG_ANTIGUEDAD");
    var max = c.tamano_maximo_bytes === void 0 ? MAX_BYTES_DEFECTO : c.tamano_maximo_bytes;
    if (!(Number.isInteger(max) && max >= 1024 && max <= MAX_BYTES_TOPE)) Util.fallar("E_CFG_TAMANO");
    var zona = c.zona_horaria;
    if (typeof zona !== "string" || !/^[A-Za-z_]+(?:\\/[A-Za-z_+-]+){0,2}$/.test(zona) || Util.fechaEnZona("2026-01-01T12:00:00Z", zona) === null) Util.fallar("E_CFG_ZONA");
    return { patron: p, antiguedad: ant, maxBytes: max, zona };
  }
  function coincide(patron, texto) {
    var p = 0, t = 0, estrella = -1, marca = 0;
    while (t < texto.length) {
      if (p < patron.length && (patron.charAt(p) === "?" || patron.charAt(p) === texto.charAt(t))) {
        p++;
        t++;
      } else if (p < patron.length && patron.charAt(p) === "*") {
        estrella = p;
        marca = t;
        p++;
      } else if (estrella >= 0) {
        p = estrella + 1;
        marca++;
        t = marca;
      } else return false;
    }
    while (p < patron.length && patron.charAt(p) === "*") p++;
    return p === patron.length;
  }
  function formatoDe(nombre) {
    var m = /\\.([a-z0-9]{1,5})$/.exec(nombre);
    var ext = m ? m[1] : "";
    return ext === "csv" || ext === "tsv" || ext === "xlsx" ? ext : null;
  }
  function tamanoDe(v) {
    if (typeof v === "number") return Number.isInteger(v) && v >= 0 && v <= 9007199254740991 ? v : null;
    if (typeof v === "string" && /^\\d{1,15}$/.test(v)) return parseInt(v, 10);
    return null;
  }
  function evaluar(a, cfg, fechaCorte) {
    if (!esObjeto(a) || typeof a.id !== "string" || !ID_RE.test(a.id) || typeof a.name !== "string" || typeof a.mimeType !== "string" || typeof a.modifiedTime !== "string" || !INSTANTE_RE.test(a.modifiedTime)) return { codigo: "E_ARCHIVO_METADATOS" };
    var bytes = tamanoDe(a.size);
    if (bytes === null) return { codigo: "E_ARCHIVO_METADATOS" };
    var nombre = comparable(a.name);
    if (!nombre || nombre.length > 255) return { codigo: "E_ARCHIVO_METADATOS" };
    var formato = formatoDe(nombre);
    if (!formato || TIPOS[formato].indexOf(a.mimeType.trim().toLowerCase()) < 0) return { codigo: "E_ARCHIVO_TIPO" };
    if (!coincide(cfg.patron, nombre)) return { codigo: "E_ARCHIVO_NOMBRE" };
    if (bytes === 0) return { codigo: "E_ARCHIVO_VACIO" };
    var tope = formato === "xlsx" ? Math.min(cfg.maxBytes, MAX_BYTES_XLSX) : cfg.maxBytes;
    if (bytes > tope) return { codigo: "E_ARCHIVO_GRANDE" };
    var local = Util.fechaEnZona(a.modifiedTime, cfg.zona);
    var instante = new Date(a.modifiedTime).getTime();
    if (local === null || isNaN(instante)) return { codigo: "E_ARCHIVO_METADATOS" };
    var dias = Util.diasEntre(local, fechaCorte);
    if (dias < 0) return { codigo: "E_ARCHIVO_FUTURO" };
    if (dias > cfg.antiguedad) return { codigo: "E_ARCHIVO_VIEJO" };
    return { ok: true, id: a.id, formato, bytes, modificado_fecha: local, dias_de_antiguedad: dias, instante };
  }
  function elegirArchivo(e) {
    if (!esObjeto(e) || !Array.isArray(e.archivos) || !Util.esISO(e.fecha_corte)) Util.fallar("E_INGESTA_INVALIDA");
    if (e.archivos.length > MAX_ARCHIVOS_LISTADOS) Util.fallar("E_INGESTA_DEMASIADOS");
    var cfg = validarConfig(e.config);
    var aptos = [], descartados = [];
    e.archivos.forEach(function(a, indice) {
      var r = evaluar(a, cfg, e.fecha_corte);
      if (r.ok) {
        r.indice = indice;
        aptos.push(r);
      } else descartados.push({ indice, codigo: r.codigo });
    });
    var salida = { archivo: null, descartados, por_codigo: Util.contarPorCodigo(descartados), total: e.archivos.length };
    if (!aptos.length) {
      salida.estado = "sin_archivo";
      return salida;
    }
    aptos.sort(function(x, y) {
      return y.instante - x.instante || x.indice - y.indice;
    });
    if (aptos.length > 1 && aptos[0].instante === aptos[1].instante) {
      salida.estado = "ambiguo";
      return salida;
    }
    var g = aptos[0];
    salida.estado = "elegido";
    salida.archivo = { indice: g.indice, id: g.id, formato: g.formato, bytes: g.bytes, modificado_fecha: g.modificado_fecha, dias_de_antiguedad: g.dias_de_antiguedad };
    return salida;
  }
  function verificarDescarga(e) {
    if (!esObjeto(e) || tamanoDe(e.esperado_bytes) === null || tamanoDe(e.recibido_bytes) === null) Util.fallar("E_INGESTA_INVALIDA");
    var igual = tamanoDe(e.esperado_bytes) === tamanoDe(e.recibido_bytes);
    return { ok: igual, codigo: igual ? null : "E_DESCARGA_INCOMPLETA" };
  }
  function diaDeSemanaISO(iso) {
    if (!Util.esISO(iso)) Util.fallar("E_FECHA_INVALIDA");
    return (Util.diasEntre("2000-01-03", iso) % 7 + 7) % 7 + 1;
  }
  function decidirSinArchivo(e) {
    if (!esObjeto(e) || !Util.esISO(e.fecha_corte) || typeof e.aviso_ya_enviado !== "boolean") Util.fallar("E_INGESTA_INVALIDA");
    var dia = e.dia_aviso === void 0 ? DIA_AVISO_DEFECTO : e.dia_aviso;
    if (!(Number.isInteger(dia) && dia >= 1 && dia <= 7)) Util.fallar("E_CFG_DIA_AVISO");
    if (diaDeSemanaISO(e.fecha_corte) < dia) return "esperar";
    return e.aviso_ya_enviado ? "omitir_ya_avisado" : "avisar";
  }
  return {
    HUELLA_SIN_ARCHIVO,
    MAX_BYTES_DEFECTO,
    MAX_BYTES_XLSX,
    ANTIGUEDAD_DEFECTO,
    DIA_AVISO_DEFECTO,
    MAX_ARCHIVOS_LISTADOS,
    validarConfig,
    coincide,
    elegirArchivo,
    verificarDescarga,
    diaDeSemanaISO,
    decidirSinArchivo
  };
})();
// ===== pipeline.js =====
var Cobranza = (function() {
  "use strict";
  function esObjeto(x) {
    return x !== null && typeof x === "object" && !Array.isArray(x);
  }
  function copiaConCorte(config, fechaCorte) {
    var c = {};
    Object.keys(config).forEach(function(k) {
      c[k] = config[k];
    });
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
  function validarConfiguracion(config, fechaCorte) {
    if (!esObjeto(config)) return { ok: false, problemas: ["E_CFG_CLIENTE"] };
    var problemas = M0.validarConfigCliente(config).problemas.slice();
    function probar(fn) {
      try {
        fn();
      } catch (err) {
        problemas.push(Util.codigoDe(err));
      }
    }
    if (!Util.esISO(fechaCorte)) problemas.push("E_FECHA_CORTE_INVALIDA");
    else {
      probar(function() {
        M1.validarConfig(copiaConCorte(config, fechaCorte));
      });
      probar(function() {
        var a = M2.calcularAntiguedad({ facturas: [], fecha_corte: fechaCorte, tramos: config.tramos, escalones: config.escalones });
        var plantillas = M3.validarPlantillas(config.plantillas);
        a.escalones.forEach(function(e) {
          if (!plantillas[e.nombre]) Util.fallar("E_PLANTILLA_FALTANTE");
        });
      });
    }
    probar(function() {
      M3.validarEmpresa(config.empresa);
    });
    probar(function() {
      M7.validarConfig(configIngesta(config));
    });
    probar(function() {
      if (config.dia_aviso_sin_archivo !== void 0 && !(Number.isInteger(config.dia_aviso_sin_archivo) && config.dia_aviso_sin_archivo >= 1 && config.dia_aviso_sin_archivo <= 7)) Util.fallar("E_CFG_DIA_AVISO");
    });
    var unicos = problemas.filter(function(p, i) {
      return problemas.indexOf(p) === i;
    });
    return { ok: unicos.length === 0, problemas: unicos };
  }
  function fechaCorteDe(ahoraUtc, zona) {
    if (typeof ahoraUtc !== "string" || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$/.test(ahoraUtc)) Util.fallar("E_AHORA_INVALIDO");
    var f = Util.fechaEnZona(ahoraUtc, zona);
    if (f === null || !Util.esISO(f)) Util.fallar("E_AHORA_INVALIDO");
    return f;
  }
  function arrancar(e) {
    if (!esObjeto(e) || e.fila_bloqueo !== void 0 && e.filas_bloqueo !== void 0) Util.fallar("E_ARRANQUE_INVALIDO");
    var guardias = M0.evaluarGuardias(e.fila_control);
    if (!guardias.permitido) return { accion: "detener", motivo: guardias.motivo, problemas: [], guardias };
    var cfg = validarConfiguracion(e.config, e.fecha_corte);
    if (!cfg.ok) return { accion: "detener", motivo: "CONFIG_INVALIDA", codigo: "E_CFG_INVALIDA", problemas: cfg.problemas, guardias };
    var fila = e.filas_bloqueo !== void 0 ? M6.bloqueoVigente(e.filas_bloqueo, e.config.cliente_id) : e.fila_bloqueo === void 0 ? null : e.fila_bloqueo;
    if (fila !== null && (!esObjeto(fila) || fila.cliente_id !== e.config.cliente_id)) Util.fallar("E_BLOQUEO_INVALIDO");
    var bloqueo = M6.estadoBloqueo(fila, e.ahora_utc);
    var decision = M6.decidirEjecucion({ ya_resuelto: false, bloqueo });
    if (decision === "procesar") return { accion: "continuar", motivo: null, problemas: [], guardias };
    if (decision === "omitir_en_curso") return { accion: decision, motivo: "BLOQUEO_ACTIVO", problemas: [], guardias };
    return { accion: decision, motivo: "BLOQUEO_VENCIDO", codigo: "E_BLOQUEO_VENCIDO", problemas: [], guardias };
  }
  function iniciar(e) {
    if (!esObjeto(e) || !esObjeto(e.config) || !Array.isArray(e.filas_bloqueo)) Util.fallar("E_ARRANQUE_INVALIDO");
    var fechaCorte = fechaCorteDe(e.ahora_utc, e.config.zona_horaria);
    var control = Array.isArray(e.filas_control) && e.filas_control.length === 1 && esObjeto(e.filas_control[0]) ? e.filas_control[0] : null;
    var r;
    try {
      r = arrancar({ config: e.config, fila_control: control, fecha_corte: fechaCorte, ahora_utc: e.ahora_utc, filas_bloqueo: e.filas_bloqueo });
      if (r.accion === "continuar") r.bloqueo_nuevo = M6.filaBloqueo({ cliente_id: e.config.cliente_id, ahora_utc: e.ahora_utc });
    } catch (err) {
      r = { accion: "error", motivo: "ERROR", codigo: Util.codigoDe(err), problemas: [], guardias: null };
    }
    r.fecha_corte = fechaCorte;
    return r;
  }
  function elegirArchivo(e) {
    if (!esObjeto(e) || !esObjeto(e.config)) Util.fallar("E_INGESTA_INVALIDA");
    return M7.elegirArchivo({ archivos: e.archivos, fecha_corte: e.fecha_corte, config: configIngesta(e.config) });
  }
  function claveAviso(e) {
    if (!esObjeto(e)) Util.fallar("E_LIBRO_INVALIDO");
    return { clave: M6.claveEjecucion(e.cliente_id, e.fecha_corte, M7.HUELLA_SIN_ARCHIVO) };
  }
  function claveArchivo(e) {
    if (!esObjeto(e) || e.hash_archivo === M7.HUELLA_SIN_ARCHIVO) Util.fallar("E_LIBRO_INVALIDO");
    return { clave: M6.claveEjecucion(e.cliente_id, e.fecha_exportacion, e.hash_archivo) };
  }
  function decidirAviso(e) {
    if (!esObjeto(e) || !esObjeto(e.config)) Util.fallar("E_INGESTA_INVALIDA");
    var clave = claveAviso({ cliente_id: e.config.cliente_id, fecha_corte: e.fecha_corte }).clave;
    var decision = M7.decidirSinArchivo({ fecha_corte: e.fecha_corte, dia_aviso: e.config.dia_aviso_sin_archivo, aviso_ya_enviado: M6.yaResuelto(e.filas_libro, clave) });
    return { decision, clave };
  }
  function decidirProcesado(e) {
    if (!esObjeto(e)) Util.fallar("E_DECISION_INVALIDA");
    var descarga = M7.verificarDescarga({ esperado_bytes: e.esperado_bytes, recibido_bytes: e.recibido_bytes });
    if (!descarga.ok) Util.fallar("E_DESCARGA_INCOMPLETA");
    var clave = claveArchivo({ cliente_id: e.cliente_id, fecha_exportacion: e.fecha_exportacion, hash_archivo: e.hash_archivo }).clave;
    return { decision: M6.decidirEjecucion({ ya_resuelto: M6.yaResuelto(e.filas_libro, clave), bloqueo: "libre" }), clave };
  }
  function preparar(e) {
    if (!esObjeto(e) || !esObjeto(e.config) || !Util.esISO(e.fecha_corte) || !esObjeto(e.contenido)) Util.fallar("E_PREPARAR_INVALIDO");
    var config = e.config;
    var ensayo = !M5.esEnvioReal(e.guardias, config.modo);
    var cfgLectura = copiaConCorte(config, e.fecha_corte);
    var lectura;
    if (e.contenido.formato === "csv") lectura = M1.normalizarCSV(e.contenido.texto, cfgLectura);
    else if (e.contenido.formato === "filas") lectura = M1.normalizarObjetos(e.contenido.filas, cfgLectura);
    else Util.fallar("E_PREPARAR_INVALIDO");
    var conteos = { n_filas: lectura.resumen.total, n_vencidas: 0, n_apartadas: lectura.resumen.apartadas };
    if (lectura.resumen.bloquear) {
      return {
        tipo: "incidencia",
        codigo: lectura.resumen.motivo_bloqueo,
        aviso: M4.armarAvisoIncidencia({ fecha_corte: e.fecha_corte, empresa: config.empresa, lectura, ensayo }),
        conteos,
        ensayo
      };
    }
    var demo = e.demo === true;
    var antiguedad = M2.calcularAntiguedad({ facturas: lectura.facturas, fecha_corte: e.fecha_corte, tramos: config.tramos, escalones: config.escalones });
    var borradores = M3.generarBorradores({ vencidas: antiguedad.vencidas, empresa: config.empresa, plantillas: config.plantillas, opciones: { demo } });
    var informe = M4.armarInforme({
      fecha_corte: e.fecha_corte,
      empresa: config.empresa,
      antiguedad,
      borradores,
      lectura,
      opciones: { demo, ensayo, max_filas_informe: config.max_filas_informe }
    });
    conteos.n_vencidas = antiguedad.vencidas.length;
    return { tipo: "informe", informe, conteos, ensayo };
  }
  var SIN_CONTEOS = { n_filas: 0, n_vencidas: 0, n_apartadas: 0 };
  function armarEnvio(e) {
    if (!esObjeto(e) || !esObjeto(e.config) || !Util.esISO(e.fecha_corte)) Util.fallar("E_ENVIO_INVALIDO");
    var config = e.config;
    var real = M5.esEnvioReal(e.guardias, config.modo);
    var ensayo = !real;
    if (real && config.entrega === "correo_completo" && config.acepta_correo_completo !== true) Util.fallar("E_CFG_ENTREGA_REAL");
    var conArchivo = e.tipo === "informe" || e.tipo === "incidencia";
    if (conArchivo && (!Util.esISO(e.fecha_exportacion) || e.fecha_exportacion > e.fecha_corte)) Util.fallar("E_ENVIO_INVALIDO");
    if (conArchivo && e.hash_archivo === M7.HUELLA_SIN_ARCHIVO) Util.fallar("E_LIBRO_INVALIDO");
    var p = e.preparado;
    if (conArchivo && (!esObjeto(p) || p.tipo !== e.tipo || p.ensayo !== ensayo)) Util.fallar("E_INCONSISTENCIA_ENSAYO");
    var correo, estado, codigoError = null, conteos, hash = e.hash_archivo;
    if (e.tipo === "informe") {
      if (config.entrega === "enlace_salida") {
        correo = M4.armarCorreoConEnlace({ asunto: p.informe.asunto, texto_resumen: p.informe.texto_resumen, enlace: e.enlace_informe, ensayo });
      } else {
        correo = {
          asunto: p.informe.asunto,
          cuerpo_texto: p.informe.texto_resumen,
          adjunto: { nombre: p.informe.nombre_archivo, tipo: "text/html", contenido: p.informe.html_completo }
        };
      }
      estado = "ok";
      conteos = p.conteos;
    } else if (e.tipo === "incidencia") {
      correo = { asunto: p.aviso.asunto, cuerpo_texto: p.aviso.cuerpo_texto };
      estado = "incidencia";
      codigoError = p.codigo;
      conteos = p.conteos;
    } else if (e.tipo === "sin_archivo") {
      var aviso = M4.armarAvisoSinArchivo({ fecha_corte: e.fecha_corte, empresa: config.empresa, ensayo });
      correo = { asunto: aviso.asunto, cuerpo_texto: aviso.cuerpo_texto };
      estado = "incidencia";
      codigoError = "E_SIN_ARCHIVO";
      conteos = SIN_CONTEOS;
      hash = M7.HUELLA_SIN_ARCHIVO;
    } else Util.fallar("E_ENVIO_INVALIDO");
    var envio = M5.guardiaEnvio({
      solicitados: config.destinatarios_permitidos,
      lista_blanca: config.destinatarios_permitidos,
      guardias: e.guardias,
      modo_cliente: config.modo,
      remitente_prueba: config.remitente_prueba
    });
    if (envio.accion === "no_enviar") Util.fallar("E_ENVIO_" + envio.motivos[0]);
    if (envio.accion === "enviar" !== real) Util.fallar("E_INCONSISTENCIA_ENSAYO");
    if (ensayo) {
      correo = {
        asunto: correo.asunto,
        cuerpo_texto: "[ENSAYO] En modo real este mensaje se enviar\\xEDa a: " + config.destinatarios_permitidos.join(", ") + ".\\n\\n" + correo.cuerpo_texto,
        adjunto: correo.adjunto
      };
    }
    if (correo.adjunto === void 0) delete correo.adjunto;
    var libro = M6.filaLibro({
      cliente_id: config.cliente_id,
      semana_iso: Util.semanaISO(conArchivo ? e.fecha_exportacion : e.fecha_corte),
      hash_archivo: hash,
      estado,
      iniciada_utc: e.iniciada_utc,
      terminada_utc: e.terminada_utc,
      n_filas: conteos.n_filas,
      n_vencidas: conteos.n_vencidas,
      n_apartadas: conteos.n_apartadas,
      codigo_error: codigoError,
      modo: ensayo ? "dry" : "real"
    });
    return { correo, envio, libro };
  }
  function alertaOperador(e) {
    if (!esObjeto(e)) Util.fallar("E_ALERTA_INVALIDA");
    var sano = M6.sanearError(e.error, e.contexto);
    var texto = M6.textoAlerta(sano);
    if (e.problemas !== void 0) {
      var lista = e.problemas;
      if (!Array.isArray(lista) || lista.length > 40 || lista.some(function(c) {
        return typeof c !== "string" || !/^E_[A-Z0-9_]{2,40}$/.test(c);
      })) Util.fallar("E_ALERTA_INVALIDA");
      if (lista.length) texto = { asunto: texto.asunto, cuerpo_texto: texto.cuerpo_texto + "\\nProblemas: " + lista.join(", ") };
    }
    var envio = M5.guardiaEnvio({
      solicitados: [e.operador],
      lista_blanca: [e.operador],
      guardias: { permitido: true, dry_run: false },
      modo_cliente: "real"
    });
    return { sano, texto, envio };
  }
  function manejarError(e) {
    if (!esObjeto(e)) Util.fallar("E_ALERTA_INVALIDA");
    var alerta = alertaOperador({ error: { codigo: e.codigo }, contexto: e.contexto, operador: e.operador, problemas: e.problemas });
    var fila = null, filaCodigo = null;
    if (e.fecha_corte !== void 0 && e.fecha_corte !== null) {
      try {
        fila = filaError({
          cliente_id: e.cliente_id,
          codigo: alerta.sano.codigo,
          fecha_corte: e.fecha_corte,
          hash_archivo: e.hash_archivo,
          iniciada_utc: e.iniciada_utc,
          terminada_utc: e.terminada_utc,
          guardias: e.guardias === void 0 ? null : e.guardias,
          modo_cliente: e.modo_cliente
        });
      } catch (err) {
        filaCodigo = Util.codigoDe(err);
      }
    }
    return { alerta, fila, fila_codigo: filaCodigo };
  }
  function filaError(e) {
    if (!esObjeto(e) || e.modo !== void 0 && e.guardias !== void 0) Util.fallar("E_LIBRO_INVALIDO");
    var real = e.guardias !== void 0 ? M5.esEnvioReal(e.guardias, e.modo_cliente) : e.modo === "real";
    return M6.filaLibro({
      cliente_id: e.cliente_id,
      semana_iso: Util.semanaISO(e.fecha_corte),
      hash_archivo: e.hash_archivo === void 0 ? M7.HUELLA_SIN_ARCHIVO : e.hash_archivo,
      estado: "error",
      iniciada_utc: e.iniciada_utc,
      terminada_utc: e.terminada_utc,
      n_filas: 0,
      n_vencidas: 0,
      n_apartadas: 0,
      codigo_error: e.codigo,
      modo: real ? "real" : "dry"
    });
  }
  return {
    validarConfiguracion,
    fechaCorteDe,
    arrancar,
    iniciar,
    elegirArchivo,
    claveAviso,
    claveArchivo,
    decidirAviso,
    decidirProcesado,
    preparar,
    armarEnvio,
    alertaOperador,
    filaError,
    manejarError
  };
})();
// ===== envoltorio.js =====
var Envoltorio = (function() {
  "use strict";
  function esObjeto(x) {
    return x !== null && typeof x === "object" && !Array.isArray(x);
  }
  var OPERACIONES = {
    iniciar: function(e) {
      return Cobranza.iniciar(e);
    },
    elegir_archivo: function(e) {
      return Cobranza.elegirArchivo(e);
    },
    decidir_aviso: function(e) {
      return Cobranza.decidirAviso(e);
    },
    decidir_procesado: function(e) {
      return Cobranza.decidirProcesado(e);
    },
    preparar: function(e) {
      return Cobranza.preparar(e);
    },
    armar_envio: function(e) {
      return Cobranza.armarEnvio(e);
    },
    error: function(e) {
      return Cobranza.manejarError(e);
    }
  };
  function nombreDeOperacion(op) {
    return typeof op === "string" && /^[a-z_]{1,40}$/.test(op) ? op : "desconocida";
  }
  function operar(op, entrada) {
    try {
      if (typeof op !== "string" || !Object.prototype.hasOwnProperty.call(OPERACIONES, op)) Util.fallar("E_OPERACION_DESCONOCIDA");
      if (!esObjeto(entrada)) Util.fallar("E_ENTRADA_INVALIDA");
      var r = OPERACIONES[op](entrada);
      return { ok: true, op, resultado: r === void 0 ? null : JSON.parse(JSON.stringify(r)) };
    } catch (err) {
      return { ok: false, op: nombreDeOperacion(op), codigo: Util.codigoDe(err) };
    }
  }
  return { OPERACIONES: Object.keys(OPERACIONES), operar };
})();
// ===== entrada-n8n =====
return $input.all().map(function (item) {
  var datos = item.json;
  return { json: Envoltorio.operar(datos && datos.op, datos && datos.entrada) };
});
`
    },
    position: [540, 300]
  },
  output: [{ ok: true, op: 'iniciar', resultado: {} }]
});

const notaNucleo = sticky('Núcleo puro [COB-DEV]. Un solo nodo de código con todos los módulos probados (sin red, sin credenciales, sin reloj). Recibe {op, entrada} y devuelve {ok, resultado} o {ok:false, codigo}. Código generado por n8n/generar.js: no se edita a mano.', [nucleoPuro], { color: 4 });

export default workflow('cob-dev-nucleo', '[COB-DEV] Núcleo (puro)')
  .add(entradaNucleo)
  .to(nucleoPuro)
  .add(notaNucleo);
