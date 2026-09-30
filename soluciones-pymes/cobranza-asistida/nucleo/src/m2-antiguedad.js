/* ==========================================================================
   M2 · Antigüedad de saldos y escalón sugerido. Módulo PURO (usa solo Util).

   Entrada: las facturas normalizadas por M1 y la fecha de corte (AAAA-MM-DD) que fija el
   flujo UNA vez. Salida: las vencidas con sus días de atraso, totales por moneda y por tramo,
   y el escalón sugerido.

   Principios:
   · El atraso es objetivo: días de calendario entre el vencimiento y la fecha de corte, calculados
     en UTC sobre fechas sin hora. No hay puntaje, ranking de riesgo ni historial del deudor
     (Decreto 64/020 art. 6 exige una evaluación de impacto para el perfilado de solvencia).
   · La sugerencia depende SOLO de los días de atraso y de la marca «en disputa» que ponga el cliente.
   · Las monedas nunca se mezclan ni se convierten.
   · Sin estado: cada informe se calcula solo con la exportación de esa semana.
   ========================================================================== */
var M2 = (function () {
  'use strict';

  var MONEDAS = ['UYU', 'USD'];
  var ORDEN_MONEDA = { UYU: 0, USD: 1 };
  var TRAMOS_POR_DEFECTO = [[1, 30], [31, 60], [61, 90], [91, null]];
  var ESCALONES_POR_DEFECTO = [
    { nombre: 'amable', desde: 1, hasta: 15 },
    { nombre: 'segundo_aviso', desde: 16, hasta: 45 },
    { nombre: 'firme', desde: 46, hasta: null }
  ];
  var DIAS_NUEVA = 7; // «nueva esta semana»: venció hace 7 días o menos

  function esEntero(n, min, max) { return typeof n === 'number' && Math.floor(n) === n && n >= min && n <= max; }

  // [[1,30],[31,60],…,[91,null]] o [{desde,hasta},…]: contiguos, crecientes, desde 1 y el último abierto.
  function validarTramos(tramos) {
    if (!Array.isArray(tramos) || tramos.length < 1 || tramos.length > 8) Util.fallar('E_CFG_TRAMOS');
    var salida = [], esperado = 1;
    tramos.forEach(function (t, i) {
      var desde = Array.isArray(t) ? t[0] : (t && t.desde);
      var hasta = Array.isArray(t) ? t[1] : (t && t.hasta);
      if (hasta === undefined) hasta = null;
      var ultimo = i === tramos.length - 1;
      if (!esEntero(desde, 1, 3650) || desde !== esperado) Util.fallar('E_CFG_TRAMOS');
      if (ultimo) { if (hasta !== null) Util.fallar('E_CFG_TRAMOS'); }
      else { if (!esEntero(hasta, desde, 3650)) Util.fallar('E_CFG_TRAMOS'); esperado = hasta + 1; }
      salida.push({ desde: desde, hasta: hasta });
    });
    return salida;
  }

  function validarEscalones(escalones) {
    if (!Array.isArray(escalones) || escalones.length < 1 || escalones.length > 6) Util.fallar('E_CFG_ESCALONES');
    var vistos = {}, esperado = 1, salida = [];
    escalones.forEach(function (e, i) {
      if (!e || typeof e !== 'object') Util.fallar('E_CFG_ESCALONES');
      var nombre = e.nombre, hasta = e.hasta === undefined ? null : e.hasta;
      var ultimo = i === escalones.length - 1;
      if (typeof nombre !== 'string' || !/^[a-z][a-z_]{1,29}$/.test(nombre) || nombre === 'en_disputa' || vistos[nombre]) Util.fallar('E_CFG_ESCALONES');
      vistos[nombre] = true;
      if (!esEntero(e.desde, 1, 3650) || e.desde !== esperado) Util.fallar('E_CFG_ESCALONES');
      if (ultimo) { if (hasta !== null) Util.fallar('E_CFG_ESCALONES'); }
      else { if (!esEntero(hasta, e.desde, 3650)) Util.fallar('E_CFG_ESCALONES'); esperado = hasta + 1; }
      salida.push({ nombre: nombre, desde: e.desde, hasta: hasta });
    });
    return salida;
  }

  function buscarRango(rangos, dias) {
    for (var i = 0; i < rangos.length; i++) {
      if (dias >= rangos[i].desde && (rangos[i].hasta === null || dias <= rangos[i].hasta)) return i;
    }
    return -1;
  }

  // Un contrato incumplido por quien llama (no por el archivo) detiene el flujo con un código.
  function validarFactura(f) {
    if (!f || typeof f !== 'object' || !Util.refValida(f.factura_ref) ||
        typeof f.deudor_nombre !== 'string' || MONEDAS.indexOf(f.moneda) < 0 ||
        !(typeof f.importe_centavos === 'number' && Math.floor(f.importe_centavos) === f.importe_centavos &&
          f.importe_centavos > 0 && f.importe_centavos <= Util.LIMITE_CENTAVOS) ||
        !Util.esISO(f.vencimiento)) Util.fallar('E_FACTURA_INVALIDA');
  }

  function comparar(a, b) {
    if (ORDEN_MONEDA[a.moneda] !== ORDEN_MONEDA[b.moneda]) return ORDEN_MONEDA[a.moneda] - ORDEN_MONEDA[b.moneda];
    if (a.dias_atraso !== b.dias_atraso) return b.dias_atraso - a.dias_atraso;
    if (a.importe_centavos !== b.importe_centavos) return b.importe_centavos - a.importe_centavos;
    if (a.factura_ref !== b.factura_ref) return a.factura_ref < b.factura_ref ? -1 : 1;
    return (a.fila_origen || 0) - (b.fila_origen || 0);
  }

  /* entrada: { facturas, fecha_corte, tramos?, escalones? } */
  function calcularAntiguedad(entrada) {
    if (!entrada || typeof entrada !== 'object') Util.fallar('E_FACTURAS_INVALIDAS');
    if (!Util.esISO(entrada.fecha_corte)) Util.fallar('E_FECHA_CORTE_INVALIDA');
    if (!Array.isArray(entrada.facturas)) Util.fallar('E_FACTURAS_INVALIDAS');
    var corte = entrada.fecha_corte;
    var tramos = validarTramos(entrada.tramos === undefined ? TRAMOS_POR_DEFECTO : entrada.tramos);
    var escalones = validarEscalones(entrada.escalones === undefined ? ESCALONES_POR_DEFECTO : entrada.escalones);

    var vencidas = [], sinVencer = 0, vencenHoy = 0;
    entrada.facturas.forEach(function (f) {
      validarFactura(f);
      var dias = Util.diasEntre(f.vencimiento, corte);
      if (dias < 0) { sinVencer++; return; }
      if (dias === 0) { vencenHoy++; return; }
      var t = buscarRango(tramos, dias);
      var e = buscarRango(escalones, dias);
      var v = {};
      Object.keys(f).forEach(function (k) { v[k] = f[k]; });
      v.dias_atraso = dias;
      v.tramo = t;
      v.escalon = f.en_disputa === true ? 'en_disputa' : escalones[e].nombre;
      v.nueva_esta_semana = dias <= DIAS_NUEVA;
      vencidas.push(v);
    });
    vencidas.sort(comparar);

    var totales = {}, porTramo = {}, porEscalon = {};
    vencidas.forEach(function (v) {
      var tot = totales[v.moneda] || (totales[v.moneda] = { n: 0, total_centavos: 0 });
      tot.n++; tot.total_centavos = Util.sumarSeguro(tot.total_centavos, v.importe_centavos);
      var pt = porTramo[v.moneda] || (porTramo[v.moneda] = tramos.map(function (t) {
        return { desde: t.desde, hasta: t.hasta, n: 0, total_centavos: 0 };
      }));
      pt[v.tramo].n++; pt[v.tramo].total_centavos = Util.sumarSeguro(pt[v.tramo].total_centavos, v.importe_centavos);
      porEscalon[v.escalon] = (porEscalon[v.escalon] || 0) + 1;
    });

    return {
      fecha_corte: corte, vencidas: vencidas, totales: totales, por_tramo: porTramo, por_escalon: porEscalon,
      sin_vencer_n: sinVencer, vencen_hoy_n: vencenHoy, tramos: tramos, escalones: escalones
    };
  }

  return {
    TRAMOS_POR_DEFECTO: TRAMOS_POR_DEFECTO, ESCALONES_POR_DEFECTO: ESCALONES_POR_DEFECTO, DIAS_NUEVA: DIAS_NUEVA,
    validarTramos: validarTramos, validarEscalones: validarEscalones, calcularAntiguedad: calcularAntiguedad
  };
})();
