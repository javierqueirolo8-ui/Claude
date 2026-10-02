'use strict';
/* Forma canónica de lo que un cliente de prueba deja en las tablas [COB-DEV] (correos, libro, carpeta de salida y bloqueos).

   Sirve para comparar, sin copiar textos largos de un lado a otro, lo que dejó el flujo real en n8n con lo que dejó el
   simulador (el gemelo digital) en la misma prueba: los dos lados convierten sus filas con ESTA función y comparan la huella
   SHA-256 del resultado. El mismo texto de la función va dentro del flujo de utilidades de n8n (n8n/generar-utilidades.js).

   Lo que se normaliza porque depende de la ejecución real y no del comportamiento que se quiere comparar:
     · el identificador del archivo subido dentro del enlace («file/d/<ID>/view»);
     · el número de ejecución del aviso a Javier («Ejecución: #»);
     · texto vacío y ausencia de valor son lo mismo (null);
     · el orden de las filas (se ordenan).
   Las columnas propias de la tabla (id, createdAt, updatedAt) y el identificador del archivo subido no se comparan. */

// <canonico>
var COLUMNAS = {
  correos: ['tipo', 'cliente_id', 'para', 'asunto', 'cuerpo_texto', 'adjunto_nombre', 'adjunto_bytes', 'creado_utc'],
  libro: ['clave', 'cliente_id', 'semana_iso', 'hash_archivo', 'estado', 'iniciada_utc', 'terminada_utc', 'n_filas', 'n_vencidas', 'n_apartadas', 'codigo_error', 'modo'],
  salida: ['cliente_id', 'nombre', 'contenido', 'creado_utc'],
  bloqueos: ['cliente_id', 'expira_utc']
};

function textoNormalizado(s) {
  return String(s).replace(/file\/d\/[A-Za-z0-9_-]+\/view/g, 'file/d/<ID>/view').replace(/\nEjecución: [^\n]*/g, '\nEjecución: #');
}

function filaCanonica(tabla, f) {
  var o = {};
  COLUMNAS[tabla].forEach(function (c) {
    var v = f && f[c] !== undefined && f[c] !== '' ? f[c] : null;
    if (v !== null && c === 'cuerpo_texto') v = textoNormalizado(v);
    o[c] = v;
  });
  return JSON.stringify(o);
}

// tablas: { correos: [fila], libro: [fila], salida: [fila], bloqueos: [fila] } → { correos: texto, libro: texto, salida: texto, bloqueos: texto }
function canonico(tablas) {
  var salida = {};
  Object.keys(COLUMNAS).forEach(function (t) {
    var filas = tablas && Array.isArray(tablas[t]) ? tablas[t] : [];
    salida[t] = filas.map(function (f) { return filaCanonica(t, f); }).sort().join('\n');
  });
  return salida;
}
// </canonico>

// El texto entre las marcas, tal cual, para incrustarlo en el flujo de n8n.
function fuente() {
  var texto = require('node:fs').readFileSync(__filename, 'utf8');
  var a = texto.indexOf('// <canonico>\n') + '// <canonico>\n'.length;
  var b = texto.indexOf('// </canonico>');
  return texto.slice(a, b);
}

module.exports = { canonico: canonico, COLUMNAS: COLUMNAS, fuente: fuente };
