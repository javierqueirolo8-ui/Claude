'use strict';
/* El envoltorio del nodo de código de n8n (src/envoltorio.js): las siete operaciones que el flujo de un cliente le pide al núcleo.
   Las mismas pruebas se ejecutan dos veces: contra las FUENTES y contra el PAQUETE que va a n8n (n8n/dist). Con NUCLEO_SRC
   (mutaciones, paquete transformado) solo se prueban las fuentes indicadas.
   · cada operación da lo mismo que llamar directamente a los módulos, también con entradas estropeadas de mil maneras;
   · ningún error saca otra cosa que un código, aunque la excepción traiga datos del cliente;
   · el resultado es JSON plano, las entradas no se modifican y todo es determinista. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { cargar, cargarPaquete, plano, crearContexto, fuente } = require('./cargar');
const azar = require('./azar');
const { crearCasos, AHORA, CONTROL_ON, config, contenido, GUARDIAS, CORTE } = require('./casos-nucleo');

const MODULOS = ['util', 'm0-guardias', 'm1-normalizar', 'm2-antiguedad', 'm3-borradores', 'm4-informe', 'm5-guardia-envio', 'm6-registro', 'm7-ingesta', 'pipeline', 'envoltorio'];
const D = cargar(...MODULOS);          // fuentes (o NUCLEO_SRC): de aquí salen las respuestas esperadas
const CASOS = crearCasos(D);
const CODIGO_RE = /^E_[A-Z0-9_]{2,40}$/;

// Lo que debería devolver el envoltorio llamando directamente a los módulos: {ok, op, resultado} o {ok:false, op, codigo}.
function esperado(op, entrada) {
  try {
    const r = CASOS[op].directo(entrada);
    return { ok: true, op, resultado: r === undefined ? null : plano(r) };
  } catch (e) {
    return { ok: false, op, codigo: D.Util.codigoDe(e) };
  }
}

function pruebas(etiqueta, ctx) {
  const operar = (op, entrada) => plano(ctx.Envoltorio.operar(op, entrada));
  const t = (nombre, fn) => test(etiqueta + ': ' + nombre, fn);

  t('declara exactamente las siete operaciones que el flujo usa, y aquí se prueban todas', () => {
    assert.deepEqual(plano(ctx.Envoltorio.OPERACIONES).sort(), ['armar_envio', 'decidir_aviso', 'decidir_procesado', 'elegir_archivo', 'error', 'iniciar', 'preparar']);
    assert.deepEqual(plano(ctx.Envoltorio.OPERACIONES).sort(), Object.keys(CASOS).sort());
  });

  t('cada operación devuelve lo mismo que llamar directamente a los módulos', () => {
    let comparados = 0;
    for (const op of Object.keys(CASOS)) {
      for (const entrada of CASOS[op].validos()) {
        assert.deepEqual(operar(op, plano(entrada)), esperado(op, entrada), op + ' ' + JSON.stringify(entrada).slice(0, 120));
        comparados++;
      }
    }
    assert.ok(comparados >= 20, 'se compararon ' + comparados);
    // si todos los casos fallaran, la comparación no probaría nada: cada operación debe tener al menos un caso que funcione y uno que falle o decida distinto
    for (const op of Object.keys(CASOS)) assert.ok(CASOS[op].validos().some((e) => esperado(op, e).ok), op + ' sin caso que funcione');
  });

  t('propiedad: con entradas estropeadas de mil maneras, da lo mismo que los módulos (resultado o código)', () => {
    const az = azar.crear(31337);
    const malos = [null, undefined, '', 'x', 0, -1, 1.5, true, false, [], {}, [1, 2], { a: 1 }, 'E_FALSO', '2026-02-30', NaN, Infinity];
    let comparados = 0;
    let fallos = 0;
    const estropear = (valor) => {
      const copia = plano(valor);
      const rutas = [];
      (function recorrer(nodo, ruta) {
        if (nodo && typeof nodo === 'object') Object.keys(nodo).forEach((k) => { rutas.push(ruta.concat(k)); recorrer(nodo[k], ruta.concat(k)); });
      })(copia, []);
      if (!rutas.length) return copia;
      const ruta = az.elegir(rutas);
      let padre = copia;
      for (const k of ruta.slice(0, -1)) padre = padre[k];
      const ultimo = ruta[ruta.length - 1];
      const v = az.elegir(malos);
      if (az.prob(0.35)) delete padre[ultimo]; else padre[ultimo] = v === undefined ? null : v;
      return copia;
    };
    for (const op of Object.keys(CASOS)) {
      for (const base of CASOS[op].validos()) {
        for (let i = 0; i < 120; i++) {
          const entrada = estropear(base);
          const e = esperado(op, entrada);
          assert.deepEqual(operar(op, entrada), e, op + ' ' + JSON.stringify(entrada).slice(0, 200));
          comparados++;
          if (!e.ok) fallos++;
        }
      }
    }
    assert.ok(comparados > 2500, 'se compararon ' + comparados);
    assert.ok(fallos > 200, 'solo ' + fallos + ' fallos: las entradas no estropean lo suficiente');
  });

  t('una operación que no existe o una entrada que no es un objeto fallan con su código, sin más', () => {
    for (const op of ['nada', '', 'INICIAR', 'iniciar ', 'constructor', '__proto__', 'hasOwnProperty', 'toString', 'valueOf', 'OPERACIONES', 'bloqueo_nuevo', 'alerta', 5, null, undefined, {}, []]) {
      const r = operar(op, {});
      assert.equal(r.ok, false, String(op));
      assert.equal(r.codigo, 'E_OPERACION_DESCONOCIDA', String(op));
      assert.deepEqual(Object.keys(r).sort(), ['codigo', 'ok', 'op']);
    }
    for (const entrada of [undefined, null, 'texto', 5, true, [], [{}]]) {
      assert.deepEqual(operar('iniciar', entrada), { ok: false, op: 'iniciar', codigo: 'E_ENTRADA_INVALIDA' }, JSON.stringify(entrada));
    }
  });

  t('el nombre de la operación se repite en la respuesta solo si tiene forma de nombre; nunca un texto libre', () => {
    assert.equal(operar('Juan Perez, factura A-1001, tel 099123456', {}).op, 'desconocida');
    assert.equal(operar('iniciar', {}).op, 'iniciar');
    assert.equal(operar('x'.repeat(41), {}).op, 'desconocida');
  });

  t('una excepción con datos del cliente no sale: solo el código genérico (canario)', () => {
    const CANARIO = 'CANARIO-Juan-Perez-A-1001-099123456';
    const trampas = [
      { get config() { throw new Error(CANARIO); } },
      { config: config(), get filas_control() { throw new TypeError(CANARIO); }, filas_bloqueo: [], ahora_utc: AHORA },
      { config: config(), filas_control: [CONTROL_ON], filas_bloqueo: [], get ahora_utc() { throw Object.assign(new Error(CANARIO), { codigo: 'texto libre ' + CANARIO }); } },
      { config: config(), filas_control: [CONTROL_ON], filas_bloqueo: [], ahora_utc: AHORA, get extra() { throw new Error(CANARIO); } },
      { get codigo() { throw new Error(CANARIO); }, contexto: {}, operador: 'javier@ejemplo.example' },
      { get contexto() { throw new Error(CANARIO); }, codigo: 'E_X1', operador: 'javier@ejemplo.example' }
    ];
    for (const op of Object.keys(CASOS)) {
      for (const tr of trampas) {
        const r = plano(ctx.Envoltorio.operar(op, tr));
        assert.equal(JSON.stringify(r).includes('CANARIO'), false, op);
        if (!r.ok) assert.match(r.codigo, CODIGO_RE);
      }
    }
    assert.deepEqual(plano(ctx.Envoltorio.operar('iniciar', trampas[0])), { ok: false, op: 'iniciar', codigo: 'E_DESCONOCIDO' });
    assert.deepEqual(plano(ctx.Envoltorio.operar('error', trampas[4])), { ok: false, op: 'error', codigo: 'E_DESCONOCIDO' });
  });

  t('un error con código propio conserva el código; el mensaje libre nunca viaja', () => {
    const r = operar('preparar', { config: config(), guardias: GUARDIAS, fecha_corte: 'hoy', contenido: contenido() });
    assert.equal(r.ok, false);
    assert.match(r.codigo, CODIGO_RE);
    assert.deepEqual(Object.keys(r).sort(), ['codigo', 'ok', 'op']);
  });

  t('una alerta con un «código» que trae datos no lo repite: queda como «desconocido»', () => {
    const r = operar('error', { codigo: 'Fallo al leer a Juan Pérez, factura A-1001', contexto: { cliente_id: 'demo-01' }, operador: 'javier@ejemplo.example' });
    assert.equal(r.ok, true);
    assert.equal(r.resultado.alerta.sano.codigo, 'E_DESCONOCIDO');
    assert.equal(JSON.stringify(r).includes('Juan'), false);
  });

  t('los resultados son JSON plano: sin funciones, sin undefined, sin prototipos raros', () => {
    for (const op of Object.keys(CASOS)) {
      for (const entrada of CASOS[op].validos()) {
        const r = ctx.Envoltorio.operar(op, plano(entrada));
        assert.equal(JSON.stringify(r), JSON.stringify(JSON.parse(JSON.stringify(r))), op);
        assert.equal(Object.getPrototypeOf(JSON.parse(JSON.stringify(r))), Object.prototype);
      }
    }
  });

  t('no modifica sus entradas (aunque vengan congeladas) y es determinista', () => {
    const congelar = (x) => { if (x && typeof x === 'object') { Object.values(x).forEach(congelar); Object.freeze(x); } return x; };
    for (const op of Object.keys(CASOS)) {
      for (const base of CASOS[op].validos()) {
        const entrada = congelar(plano(base));
        const antes = JSON.stringify(entrada);
        const a = operar(op, entrada);
        const b = operar(op, entrada);
        assert.deepEqual(a, b, op);
        assert.equal(JSON.stringify(entrada), antes, op);
        assert.notEqual(a.codigo, 'E_DESCONOCIDO', op + ' falló con una excepción inesperada con la entrada congelada');
      }
    }
  });

  t('un día completo hablando solo por el envoltorio: lo que devuelve una operación alimenta a la siguiente', () => {
    const ini = operar('iniciar', { config: config(), filas_control: [CONTROL_ON], filas_bloqueo: [], ahora_utc: AHORA });
    assert.equal(ini.ok, true);
    assert.equal(ini.resultado.accion, 'continuar');
    assert.equal(ini.resultado.fecha_corte, CORTE);
    const e = operar('elegir_archivo', { config: config(), archivos: CASOS.elegir_archivo.validos()[0].archivos, fecha_corte: ini.resultado.fecha_corte });
    assert.equal(e.resultado.estado, 'elegido');
    const dec = operar('decidir_procesado', { cliente_id: 'demo-01', fecha_exportacion: e.resultado.archivo.modificado_fecha, hash_archivo: 'a'.repeat(64), esperado_bytes: e.resultado.archivo.bytes, recibido_bytes: e.resultado.archivo.bytes, filas_libro: [] });
    assert.deepEqual(dec.resultado.decision, 'procesar');
    const prep = operar('preparar', { config: config(), guardias: ini.resultado.guardias, fecha_corte: ini.resultado.fecha_corte, contenido: contenido() });
    assert.equal(prep.resultado.tipo, 'informe');
    const env = operar('armar_envio', { config: config(), guardias: ini.resultado.guardias, fecha_corte: ini.resultado.fecha_corte, fecha_exportacion: e.resultado.archivo.modificado_fecha, tipo: 'informe',
      preparado: prep.resultado, enlace_informe: 'https://drive.google.com/file/d/EjemploFicticioDeInforme0001/view', hash_archivo: 'a'.repeat(64), iniciada_utc: AHORA, terminada_utc: AHORA });
    assert.equal(env.ok, true);
    assert.equal(env.resultado.libro.clave, dec.resultado.clave); // la clave con la que se decidió es la del libro que se escribe
  });
}

/* El envoltorio solo, con módulos de mentira: devuelve JSON plano aunque un módulo entregue cosas que JSON no conserva (campos undefined, funciones,
   NaN) o referencias a su propio estado. Con los módulos reales hoy ninguno lo hace, y por eso esta prueba no los usa: la garantía es del
   envoltorio y tiene que cumplirse también el día que un módulo cambie. */
test('envoltorio solo: el resultado se convierte en JSON plano y no comparte objetos con el estado del módulo', () => {
  const ctx = crearContexto();
  vm.runInContext(`
    var Util = {
      fallar: function (c) { var e = new Error('mensaje libre'); e.codigo = c; throw e; },
      codigoDe: function (e) { return e && e.codigo ? e.codigo : 'E_DESCONOCIDO'; }
    };
    var INTERNO = { lista: [1, 2, 3], dentro: { a: 1 } };
    var Cobranza = {
      iniciar: function () { return { interno: INTERNO, sin_valor: undefined, funcion: function () { return 1; }, no_numero: NaN, infinito: Infinity }; },
      elegirArchivo: function () { return undefined; },
      decidirAviso: function () { return {}; }, decidirProcesado: function () { return {}; }, preparar: function () { return {}; }, armarEnvio: function () { return {}; }, manejarError: function () { return {}; }
    };`, ctx);
  vm.runInContext(fuente('envoltorio'), ctx, { filename: 'envoltorio:suelto' });
  const r = ctx.Envoltorio.operar('iniciar', {});
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(r.resultado), JSON.stringify({ interno: { lista: [1, 2, 3], dentro: { a: 1 } }, no_numero: null, infinito: null }));
  assert.equal('sin_valor' in r.resultado, false, 'un campo undefined no debe viajar');
  assert.equal('funcion' in r.resultado, false, 'una función no debe viajar');
  assert.notEqual(r.resultado.interno, ctx.INTERNO, 'el resultado comparte el objeto interno del módulo');
  r.resultado.interno.lista.push(99);
  assert.equal(ctx.INTERNO.lista.length, 3, 'cambiar el resultado cambió el estado del módulo');
  assert.equal(ctx.Envoltorio.operar('elegir_archivo', {}).resultado, null, 'sin resultado, null');
});

pruebas('fuentes', D);
if (!process.env.NUCLEO_SRC) pruebas('paquete', cargarPaquete());
