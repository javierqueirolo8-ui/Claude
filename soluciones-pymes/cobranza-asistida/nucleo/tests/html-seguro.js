'use strict';
/* Comprobador de HTML para las pruebas: el informe solo puede contener las etiquetas previstas, sin atributos de
   evento, sin URL peligrosas y sin refrescos automáticos. Devuelve la lista de problemas (vacía si está bien). */

// Solo las etiquetas reales del documento (el texto visible ya viene escapado y no puede abrir ninguna).
const ETIQUETAS_PERMITIDAS = new Set(['html', 'head', 'meta', 'title', 'style', 'body', 'main', 'h1', 'h2', 'h3', 'p', 'div', 'span', 'table',
  'caption', 'thead', 'tbody', 'tr', 'th', 'td', 'article', 'section', 'pre', 'a', 'footer', 'ul', 'li', 'strong']);
function problemasDeEtiquetas(html) {
  const problemas = [];
  const cuerpo = html.replace(/<style>[\s\S]*?<\/style>/, '<style></style>');
  (cuerpo.match(/<[^>]*>/g) || []).forEach((tag) => {
    if (tag.startsWith('<!doctype')) return;
    const nombre = (/^<\/?([a-zA-Z0-9]+)/.exec(tag) || [])[1];
    if (!nombre || !ETIQUETAS_PERMITIDAS.has(nombre.toLowerCase())) problemas.push('etiqueta no permitida: ' + tag.slice(0, 40));
    if (/\son[a-z]+\s*=/i.test(tag)) problemas.push('atributo de evento: ' + tag.slice(0, 40));
    if (/javascript:|data:text|vbscript:/i.test(tag)) problemas.push('URL peligrosa: ' + tag.slice(0, 40));
    if (/http-equiv="refresh"/i.test(tag)) problemas.push('refresco automático');
  });
  return problemas;
}

module.exports = { problemasDeEtiquetas, ETIQUETAS_PERMITIDAS };
