'use strict';
/* La documentación del código no puede quedar vieja sin que alguien se entere:
   · doc/REFERENCIA.md se genera desde src/ y tiene que coincidir con lo que se generaría hoy;
   · cada cosa que expone cada módulo (lo que de verdad queda definido al cargarlo) figura en la referencia, como función o como
     constante, según lo que es;
   · los enlaces de la guía del código apuntan a archivos que existen. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cargar } = require('./cargar');
const { ORDEN } = require('../n8n/generar');
const { generar, leerModulo } = require('../doc/generar-referencia');

const DOC = path.join(__dirname, '..', 'doc');
const REFERENCIA = fs.readFileSync(path.join(DOC, 'REFERENCIA.md'), 'utf8');

test('la referencia del código está al día con src/ (si no: node doc/generar-referencia.js)', () => {
  assert.equal(REFERENCIA, generar(), 'doc/REFERENCIA.md desactualizada: ejecutar «node doc/generar-referencia.js»');
});

test('todo lo que expone cada módulo figura en la referencia, como función o como constante según lo que es', () => {
  const ctx = cargar(...ORDEN);
  let n = 0;
  for (const nombre of ORDEN) {
    const m = leerModulo(nombre);
    const real = ctx[m.global];
    assert.ok(real && typeof real === 'object', m.global + ' no quedó definido al cargar ' + m.archivo);
    const documentadas = new Set(m.funciones.map((f) => f.nombre));
    const constantes = new Set(m.constantes.map((c) => c.nombre));
    for (const clave of Object.keys(real)) {
      n++;
      if (typeof real[clave] === 'function') {
        assert.ok(documentadas.has(clave), m.global + '.' + clave + ' es una función y la referencia no la documenta como tal');
        assert.ok(REFERENCIA.includes('#### `' + m.global + '.' + clave + '('), m.global + '.' + clave + ' falta en la referencia');
      } else {
        assert.ok(constantes.has(clave), m.global + '.' + clave + ' es una constante y la referencia no la lista');
        assert.ok(REFERENCIA.includes('- `' + m.global + '.' + clave + '`'), m.global + '.' + clave + ' falta en la referencia');
      }
    }
    assert.equal(documentadas.size + constantes.size, Object.keys(real).length, m.global + ': la referencia documenta algo que el módulo no expone');
  }
  assert.ok(n > 100, 'se revisaron ' + n + ' elementos públicos');
});

test('la referencia no pierde texto: los comentarios del código van en bloques de texto, no como marcado', () => {
  const bloques = REFERENCIA.split('```').length - 1;
  assert.equal(bloques % 2, 0, 'hay un bloque de texto sin cerrar');
  assert.ok(REFERENCIA.includes('E_ENVIO_<motivo>'), 'un «<…>» de un comentario debe verse tal cual dentro de su bloque');
});

test('los enlaces de la guía del código y de la referencia apuntan a archivos que existen', () => {
  for (const archivo of ['GUIA-DEL-CODIGO.md', 'REFERENCIA.md']) {
    const texto = fs.readFileSync(path.join(DOC, archivo), 'utf8');
    for (const m of texto.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/i.test(m[1])) continue; // enlaces externos
      assert.ok(fs.existsSync(path.join(DOC, decodeURI(m[1]))), archivo + ': el enlace «' + m[1] + '» no apunta a un archivo que exista');
    }
  }
});
