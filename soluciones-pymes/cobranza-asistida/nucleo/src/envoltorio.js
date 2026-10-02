/* ==========================================================================
   Envoltorio · la puerta de entrada del nodo de código de n8n. PURO (usa Util y Cobranza).

   El subflujo «Núcleo (puro)» tiene un único nodo de código con todos los módulos y este envoltorio. El flujo de
   cada cliente le manda {op, entrada} y recibe {ok, op, resultado} o {ok:false, op, codigo}:
   · solo existen las operaciones de la lista (cualquier otra es un error con código);
   · ningún mensaje de error sale jamás: solo el código (Util.codigoDe), así que una excepción con datos
     del cliente no puede viajar entre nodos ni quedar en los registros de n8n;
   · el resultado se devuelve como JSON plano (lo que viajará entre nodos).
   Sin reloj, sin red, sin credenciales: todo lo que hace ya está en los módulos y se prueba allí.
   ========================================================================== */
var Envoltorio = (function () {
  'use strict';

  function esObjeto(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  // Las siete cosas que el flujo de un cliente le pide al núcleo, en el orden en que las usa. Cada una es una función del
  // pipeline (o de un módulo); aquí solo se nombran.
  var OPERACIONES = {
    iniciar: function (e) { return Cobranza.iniciar(e); },
    elegir_archivo: function (e) { return Cobranza.elegirArchivo(e); },
    decidir_aviso: function (e) { return Cobranza.decidirAviso(e); },
    decidir_procesado: function (e) { return Cobranza.decidirProcesado(e); },
    preparar: function (e) { return Cobranza.preparar(e); },
    armar_envio: function (e) { return Cobranza.armarEnvio(e); },
    error: function (e) { return Cobranza.manejarError(e); }
  };

  function nombreDeOperacion(op) { return typeof op === 'string' && /^[a-z_]{1,40}$/.test(op) ? op : 'desconocida'; }

  /* op: nombre de la operación · entrada: objeto con sus datos.
     → { ok: true, op, resultado } | { ok: false, op, codigo }. Nunca lanza. */
  function operar(op, entrada) {
    try {
      if (typeof op !== 'string' || !Object.prototype.hasOwnProperty.call(OPERACIONES, op)) Util.fallar('E_OPERACION_DESCONOCIDA');
      if (!esObjeto(entrada)) Util.fallar('E_ENTRADA_INVALIDA');
      var r = OPERACIONES[op](entrada);
      return { ok: true, op: op, resultado: r === undefined ? null : JSON.parse(JSON.stringify(r)) };
    } catch (err) {
      return { ok: false, op: nombreDeOperacion(op), codigo: Util.codigoDe(err) };
    }
  }

  return { OPERACIONES: Object.keys(OPERACIONES), operar: operar };
})();
