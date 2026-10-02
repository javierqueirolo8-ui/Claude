#!/usr/bin/env node
'use strict';
/* Genera doc/REFERENCIA.md a partir del código de src/: qué expone cada módulo, la firma y el comentario de cada función
   pública, las constantes, de qué otros módulos depende y qué códigos de error puede devolver (con la descripción de CODIGOS.md).

   La referencia sale del código y no se edita a mano: una prueba (tests/documentacion.test.js) exige que esté al día, así que
   no puede quedar vieja sin que alguien se entere.

   Uso:  node doc/generar-referencia.js              escribe doc/REFERENCIA.md
         node doc/generar-referencia.js --verificar  no escribe: sale con error si doc/REFERENCIA.md no está al día
   No usa red ni dependencias. Se apoya en el formato del código (sangría de dos espacios, un módulo por archivo, lo público en
   el «return { … }» final), que ya vigilan las pruebas de guardarraíles. */

const fs = require('node:fs');
const path = require('node:path');
const { ORDEN } = require('../n8n/generar');

const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(__dirname, 'REFERENCIA.md');
const GLOBALES = ['Util', 'M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'Cobranza', 'Envoltorio'];

/* ------------------------------------------------------------ catálogo de códigos */

function catalogo() {
  const desc = new Map();
  let seccion = '';
  for (const linea of fs.readFileSync(path.join(RAIZ, 'CODIGOS.md'), 'utf8').split('\n')) {
    const s = /^## (\d+)\./.exec(linea);
    if (s) seccion = s[1];
    // una fila puede nombrar varios códigos en la primera celda («`E_X` / `E_Y`»); todos comparten la descripción
    const m = /^\|([^|]*)\|([^|]*)\|/.exec(linea);
    if (m) for (const c of m[1].matchAll(/`([EA]_[A-Z0-9_]+)`/g)) if (!desc.has(c[1])) desc.set(c[1], { texto: m[2].trim(), seccion });
  }
  return desc;
}

/* ------------------------------------------------------------ lectura de un módulo */

function limpiarComentario(lineas) {
  let texto = lineas.join('\n').trim();
  if (texto.startsWith('/*')) texto = texto.replace(/^\/\*+\s?/, '').replace(/\s*\*+\/$/, '');
  else texto = texto.split('\n').map((l) => l.trim().replace(/^\/\/\s?/, '')).join('\n');
  const filas = texto.split('\n');
  const sangria = Math.min(...filas.slice(1).filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length), 99);
  return filas.map((l, i) => (i === 0 ? l.trim() : l.slice(Math.min(sangria, l.match(/^ */)[0].length)))).join('\n').trim();
}

// El comentario pegado encima de la línea i (sin líneas en blanco en medio), o '' si no hay.
function comentarioEncima(lineas, i) {
  let j = i - 1;
  if (j < 0) return '';
  if (/\*\/\s*$/.test(lineas[j])) {
    let k = j;
    while (k >= 0 && !/^\s*\/\*/.test(lineas[k])) k--;
    if (k < 0) return '';
    if (/^\s*\/\*\s*-{6,}/.test(lineas[k])) return ''; // separador de sección, no documentación
    return limpiarComentario(lineas.slice(k, j + 1));
  }
  const acumuladas = [];
  while (j >= 0 && /^\s*\/\//.test(lineas[j])) { acumuladas.unshift(lineas[j]); j--; }
  return acumuladas.length ? limpiarComentario(acumuladas) : '';
}

function cuerpoDe(lineas, i) {
  if (/\}\s*;?\s*$/.test(lineas[i]) && /\{/.test(lineas[i]) && !/\{\s*$/.test(lineas[i])) return [lineas[i]]; // función de una línea
  const fin = lineas.findIndex((l, k) => k > i && /^ {2}\}/.test(l));
  return lineas.slice(i, fin < 0 ? lineas.length : fin + 1);
}

const unicos = (xs) => [...new Set(xs)].sort();

function leerModulo(nombre) {
  const archivo = 'src/' + nombre + '.js';
  const texto = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
  const lineas = texto.split('\n');
  const global = (/^var (\w+) = \(function \(\) \{/m.exec(texto) || [])[1];
  if (!global) throw new Error(archivo + ': no se encontró «var X = (function () {»');
  const fin = texto.indexOf('*/');
  const cabecera = limpiarComentario(texto.slice(0, fin + 2).split('\n')).replace(/^=+\s*/, '').replace(/\s*=+$/, '').trim();

  const inicioReturn = texto.lastIndexOf('\n  return {');
  const finReturn = texto.indexOf('\n  };', inicioReturn);
  const unaLinea = texto.indexOf('};', inicioReturn);
  const bloque = texto.slice(inicioReturn + '\n  return {'.length, finReturn > 0 && finReturn < unaLinea + 3 ? finReturn : unaLinea).replace(/\s+/g, ' ');
  const exportados = [...bloque.matchAll(/(\w+)\s*:\s*([^,]+?)\s*(?=,|$)/g)].map((m) => ({ clave: m[1], valor: m[2].trim() }));

  const funciones = [];
  const constantes = [];
  for (const { clave, valor } of exportados) {
    const iFun = lineas.findIndex((l) => new RegExp('^  function ' + valor + '\\(').test(l));
    if (/^\w+$/.test(valor) && iFun >= 0) {
      const params = (/\(([^)]*)\)/.exec(lineas[iFun]) || [])[1] || '';
      const cuerpo = cuerpoDe(lineas, iFun).join('\n');
      funciones.push({
        nombre: clave, params, linea: iFun + 1, doc: comentarioEncima(lineas, iFun),
        lanza: unicos([...cuerpo.matchAll(/fallar\('([EA]_[A-Z0-9_]+)'\)/g)].map((m) => m[1])),
        devuelve: unicos([...cuerpo.matchAll(/codigo:\s*'([EA]_[A-Z0-9_]+)'/g)].map((m) => m[1]))
      });
      continue;
    }
    const iVar = /^\w+$/.test(valor) ? lineas.findIndex((l) => new RegExp('^  var ' + valor + ' = ').test(l)) : -1;
    if (iVar >= 0) {
      let inicial = lineas[iVar].replace(/^ {2}var \w+ = /, '');
      const enLinea = /\s\/\/\s?(.*)$/.exec(inicial);
      if (enLinea) inicial = inicial.slice(0, enLinea.index);
      inicial = inicial.trim().replace(/;$/, '');
      if (/[[{(]$/.test(inicial)) inicial += ' …';
      constantes.push({ nombre: clave, valor: inicial.length > 140 ? inicial.slice(0, 137) + '…' : inicial, linea: iVar + 1,
        doc: enLinea ? enLinea[1].trim() : comentarioEncima(lineas, iVar) });
    } else {
      constantes.push({ nombre: clave, valor, linea: null, doc: '' });
    }
  }

  const depende = GLOBALES.filter((g) => g !== global && new RegExp('\\b' + g + '\\.').test(texto));
  const codigos = unicos([...texto.matchAll(/'([EA]_[A-Z0-9_]*[A-Z0-9])'/g)].map((m) => m[1]));
  const dinamicos = unicos([...texto.matchAll(/'([EA]_[A-Z0-9_]+_)'\s*\+/g)].map((m) => m[1]));
  return { nombre, archivo, global, cabecera, lineas: lineas.length - (texto.endsWith('\n') ? 1 : 0), funciones, constantes, depende, codigos, dinamicos };
}

/* ------------------------------------------------------------ armado del documento */

// Los comentarios del código se muestran tal cual, en un bloque de texto: así no se pierde la sangría y nada se interpreta como
// marcado (por ejemplo «E_ENVIO_<motivo>» desaparecería como si fuera una etiqueta HTML).
const bloque = (t) => '```text\n' + t.replace(/```/g, "'''") + '\n```';
const textoPlano = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\|/g, '/');
const codigosEnLinea = (xs) => xs.map((c) => '`' + c + '`').join(', ');

function generar() {
  const cat = catalogo();
  const modulos = ORDEN.map(leerModulo);
  const p = [];
  p.push('# Referencia del núcleo');
  p.push('');
  p.push('**Generada a partir del código** con `node doc/generar-referencia.js`: no se edita a mano. Una prueba (`tests/documentacion.test.js`)');
  p.push('falla si no coincide con `src/`. La explicación de cómo está pensado el código y cómo modificarlo está en [`GUIA-DEL-CODIGO.md`](GUIA-DEL-CODIGO.md).');
  p.push('');
  p.push('Cada módulo es un archivo de `src/` que define **una** variable global (por ejemplo `M2`) con sus funciones públicas. Los módulos se');
  p.push('cargan en este orden (cada uno puede usar a los anteriores), que es también el orden del paquete que corre en n8n.');
  p.push('');
  p.push('| Módulo | Archivo | Líneas | Funciones públicas | Constantes | Usa |');
  p.push('|---|---|---|---|---|---|');
  for (const m of modulos) {
    p.push('| [`' + m.global + '`](#' + m.global.toLowerCase() + ') | `' + m.archivo + '` | ' + m.lineas + ' | ' + m.funciones.length + ' | ' + m.constantes.length + ' | ' +
      (m.depende.length ? m.depende.join(', ') : '—') + ' |');
  }
  const sinDoc = modulos.flatMap((m) => m.funciones.filter((f) => !f.doc).map((f) => m.global + '.' + f.nombre));
  p.push('');
  p.push('**Funciones públicas sin comentario propio en el código** (' + sinDoc.length + ' de ' + modulos.reduce((n, m) => n + m.funciones.length, 0) + '): ' +
    (sinDoc.length ? sinDoc.map((x) => '`' + x + '`').join(', ') + '. Se documentan aquí por su firma y sus códigos; conviene agregarles un comentario en el próximo cambio funcional de ese módulo.' : 'ninguna.'));

  for (const m of modulos) {
    p.push('');
    p.push('---');
    p.push('');
    p.push('<a id="' + m.global.toLowerCase() + '"></a>');
    p.push('## ' + m.global + ' · `' + m.archivo + '`');
    p.push('');
    p.push(bloque(m.cabecera));
    p.push('');
    p.push('**Usa:** ' + (m.depende.length ? m.depende.map((d) => '`' + d + '`').join(', ') : 'nada (es la base)') + ' · **Líneas:** ' + m.lineas);
    p.push('');
    p.push('### Funciones públicas');
    for (const f of m.funciones) {
      p.push('');
      p.push('#### `' + m.global + '.' + f.nombre + '(' + f.params + ')`');
      p.push('');
      p.push(f.doc ? bloque(f.doc) : '_Sin comentario en el código._');
      const detalle = [];
      if (f.lanza.length) detalle.push('lanza ' + codigosEnLinea(f.lanza));
      if (f.devuelve.length) detalle.push('devuelve como resultado ' + codigosEnLinea(f.devuelve));
      p.push('');
      p.push('_Definida en la línea ' + f.linea + '._' + (detalle.length ? ' Códigos que usa directamente: ' + detalle.join('; ') + '.' : ''));
    }
    if (m.constantes.length) {
      p.push('');
      p.push('### Constantes públicas');
      p.push('');
      for (const c of m.constantes) {
        p.push('- `' + m.global + '.' + c.nombre + '` = `' + c.valor.replace(/`/g, "'") + '`' + (c.doc ? ' — ' + textoPlano(c.doc.replace(/\n/g, ' ')) : ''));
      }
    }
    const conDesc = m.codigos.filter((c) => cat.has(c));
    if (conDesc.length || m.dinamicos.length) {
      p.push('');
      p.push('### Códigos que puede usar este módulo');
      p.push('');
      p.push('| Código | Qué significa (de `CODIGOS.md`) |');
      p.push('|---|---|');
      for (const c of conDesc) p.push('| `' + c + '` | ' + textoPlano(cat.get(c).texto) + ' |');
      for (const d of m.dinamicos) p.push('| `' + d + '…` | Familia de códigos que se arma en tiempo de ejecución; ver `CODIGOS.md`. |');
    }
  }
  p.push('');
  return p.join('\n');
}

function main() {
  const texto = generar();
  const actual = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, 'utf8') : null;
  if (actual === texto) { console.log('  igual      doc/REFERENCIA.md  (' + texto.length + ' caracteres)'); return; }
  if (process.argv.includes('--verificar')) { console.error('  DIFERENTE  doc/REFERENCIA.md: ejecutar «node doc/generar-referencia.js»'); process.exit(1); }
  fs.writeFileSync(SALIDA, texto);
  console.log('  escrito    doc/REFERENCIA.md  (' + texto.length + ' caracteres)');
}

if (require.main === module) main();
module.exports = { generar, leerModulo };
