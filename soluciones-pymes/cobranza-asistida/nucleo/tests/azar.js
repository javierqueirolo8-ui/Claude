'use strict';
/* Azar reproducible para las pruebas de propiedades: misma semilla, mismos casos.
   (Los módulos del núcleo tienen el azar prohibido; esto vive solo en las pruebas.) */

function mulberry32(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function crear(semilla) {
  const r = mulberry32(semilla);
  const az = {
    uno: r,
    entero: (min, max) => min + Math.floor(r() * (max - min + 1)),
    elegir: (lista) => lista[Math.floor(r() * lista.length)],
    prob: (p) => r() < p,
    barajar: (lista) => {
      const c = lista.slice();
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [c[i], c[j]] = [c[j], c[i]];
      }
      return c;
    },
    cadena: (largo, alfabeto) => {
      const al = alfabeto || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
      let s = '';
      for (let i = 0; i < largo; i++) s += al.charAt(Math.floor(r() * al.length));
      return s;
    }
  };
  return az;
}

// Semillas: SEMILLAS=n en el entorno multiplica los casos (para una pasada más profunda).
function semillas(base) {
  const n = Math.max(1, parseInt(process.env.SEMILLAS || '1', 10) || 1);
  const lista = [];
  for (let i = 0; i < n; i++) lista.push(base + i * 7919);
  return lista;
}

module.exports = { crear, semillas };
