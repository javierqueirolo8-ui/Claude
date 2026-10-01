'use strict';
/* Cargador de módulos para las pruebas.
   Cada módulo se ejecuta en un contexto de vm SIN red, SIN archivos, SIN process, SIN require, SIN
   temporizadores, SIN eval ni new Function, con el reloj y el azar prohibidos. Si un módulo intenta usar
   cualquiera de ellos, la prueba falla: la pureza no es una promesa, se comprueba en cada ejecución.
   Lo que se prueba es el código de src/ tal cual; NUCLEO_SRC permite apuntar a otra carpeta (mutaciones). */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = process.env.NUCLEO_SRC ? path.resolve(process.env.NUCLEO_SRC) : path.join(__dirname, '..', 'src');

const VENENO = `
(function (g) {
  var RealDate = g.Date;
  g.Date = new Proxy(RealDate, {
    construct: function (t, a) { if (a.length === 0) throw new Error('RELOJ_PROHIBIDO'); return Reflect.construct(t, a); },
    apply: function () { throw new Error('RELOJ_PROHIBIDO'); },
    get: function (t, p) {
      if (p === 'now') return function () { throw new Error('RELOJ_PROHIBIDO'); };
      return Reflect.get(t, p, t);
    }
  });
  g.Math.random = function () { throw new Error('AZAR_PROHIBIDO'); };
})(this);
`;

function fuente(nombre) {
  return fs.readFileSync(path.join(SRC, nombre + '.js'), 'utf8');
}

function crearContexto() {
  const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(VENENO, ctx);
  return ctx;
}

// cargar('util', 'm1-normalizar') → contexto con Util y M1 definidos, como en un nodo de código de n8n.
function cargar(...nombres) {
  const ctx = crearContexto();
  const codigo = nombres.map(fuente).join('\n;\n');
  vm.runInContext(codigo, ctx, { filename: 'nucleo:' + nombres.join('+') });
  return ctx;
}

// Los objetos del contexto son de otro «reino»: se pasan a JSON, que es lo que viajará entre nodos de n8n.
function plano(x) {
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
}

// Ejecuta fn y devuelve { ok:true, valor } o { ok:false, codigo, mensaje }.
function capturar(fn) {
  try {
    return { ok: true, valor: plano(fn()) };
  } catch (e) {
    return { ok: false, codigo: e && e.codigo, mensaje: e && e.message };
  }
}

// El paquete que va a n8n (n8n/dist/nucleo-bundle.js) menos su última parte (la que lee $input): define todos los módulos y el
// envoltorio en el mismo entorno restringido. Sirve para correr las pruebas contra EXACTAMENTE el código que ejecutará n8n.
function cargarPaquete() {
  const paquete = fs.readFileSync(path.join(__dirname, '..', 'n8n', 'dist', 'nucleo-bundle.js'), 'utf8');
  const corte = paquete.indexOf('// ===== entrada-n8n =====');
  if (corte < 0) throw new Error('el paquete no tiene su parte de entrada');
  const ctx = crearContexto();
  vm.runInContext(paquete.slice(0, corte), ctx, { filename: 'nucleo-bundle.js' });
  return ctx;
}

module.exports = { cargar, fuente, plano, capturar, SRC, crearContexto, cargarPaquete };
