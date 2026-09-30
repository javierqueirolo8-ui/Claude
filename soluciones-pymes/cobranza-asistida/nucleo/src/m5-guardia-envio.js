/* ==========================================================================
   M5 · Guardia de envío. Módulo PURO (usa solo Util).

   Es el ÚNICO paso que decide a quién se puede escribir. El nodo de envío del flujo recibe sus
   destinatarios de aquí y de ningún otro lado; jamás de datos del archivo del cliente.

   Reglas (todas fallan cerradas):
   · Interruptor apagado o desconocido → no se envía.
   · La lista blanca (1 a 3 direcciones, ya en forma canónica) la fija quien configura, no el archivo.
   · Cada destinatario pedido debe ser una dirección estricta Y estar en la lista blanca. Si UNO no lo
     está, no se envía a NINGUNO: algo aguas arriba está mal y hay que mirarlo.
   · Solo hay envío real si el interruptor general permite el modo real (dry_run = false) Y el cliente
     está en modo «real». En cualquier otro caso el mensaje se redirige a la bandeja de pruebas.
   · No existen copia (Cc) ni copia oculta (Bcc).
   ========================================================================== */
var M5 = (function () {
  'use strict';

  var TOPE_ABSOLUTO = 5;

  function resultado(accion, destinatarios, motivos, bloqueados) {
    return { accion: accion, destinatarios: destinatarios, motivos: motivos, bloqueados: bloqueados };
  }

  function noEnviar(motivo, bloqueados) { return resultado('no_enviar', [], [motivo], bloqueados || []); }

  /* entrada: { solicitados, lista_blanca, guardias:{permitido, dry_run}, modo_cliente, remitente_prueba, max_destinatarios? } */
  function guardiaEnvio(e) {
    if (!e || typeof e !== 'object') return noEnviar('ENTRADA_INVALIDA');
    var max = Number.isInteger(e.max_destinatarios) && e.max_destinatarios >= 1 && e.max_destinatarios <= TOPE_ABSOLUTO ? e.max_destinatarios : 3;

    if (!e.guardias || e.guardias.permitido !== true) return noEnviar('INTERRUPTOR_APAGADO');

    var lb = e.lista_blanca;
    if (!Array.isArray(lb) || lb.length < 1 || lb.length > max) return noEnviar('LISTA_BLANCA_TAMANO');
    for (var i = 0; i < lb.length; i++) {
      if (typeof lb[i] !== 'string' || Util.normalizarCorreo(lb[i]) !== lb[i]) return noEnviar('LISTA_BLANCA_INVALIDA');
    }

    var sol = e.solicitados;
    if (!Array.isArray(sol) || sol.length < 1 || sol.length > max) return noEnviar('SOLICITADOS_INVALIDOS');
    var aceptados = [], bloqueados = [];
    sol.forEach(function (x, indice) {
      var n = Util.normalizarCorreo(x);
      if (!n) bloqueados.push({ indice: indice, motivo: 'DESTINATARIO_INVALIDO' });
      else if (lb.indexOf(n) < 0) bloqueados.push({ indice: indice, motivo: 'NO_EN_LISTA_BLANCA' });
      else if (aceptados.indexOf(n) < 0) aceptados.push(n);
    });
    if (bloqueados.length) return noEnviar('DESTINATARIO_BLOQUEADO', bloqueados);

    var real = e.guardias.dry_run === false && e.modo_cliente === 'real';
    if (real) return resultado('enviar', aceptados, [], []);

    var rp = e.remitente_prueba;
    if (typeof rp !== 'string' || Util.normalizarCorreo(rp) !== rp) return noEnviar('REMITENTE_PRUEBA_INVALIDO');
    return resultado('redirigir_ensayo', [rp], ['ENSAYO'], []);
  }

  return { TOPE_ABSOLUTO: TOPE_ABSOLUTO, guardiaEnvio: guardiaEnvio };
})();
