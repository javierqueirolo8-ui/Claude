'use strict';
/*
 * Garantías que la documentación promete y que no deben romperse sin darse cuenta:
 * sin red, sin HTML inyectado, sin guardar datos de clientes, enlaces seguros,
 * y sin referencias a elementos que no existan (un id mal escrito rompería la página).
 *
 * Son comprobaciones estáticas sobre recordacitas.html; el comportamiento real en un
 * navegador lo cubre tests/e2e.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(process.env.RECORDACITAS_HTML || path.join(__dirname, '..', 'recordacitas.html'), 'utf8');
// El código de los scripts sin comentarios: los comentarios pueden nombrar lo prohibido («nunca innerHTML»).
const sinComentarios = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const scripts = sinComentarios([...html.matchAll(/<script id="(\w+)">([\s\S]*?)<\/script>/g)].map(m => m[2]).join('\n'));
const marcado = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');

test('la página no puede hablar con la red: ninguna API de red y CSP restrictiva', () => {
  for (const api of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'importScripts', 'serviceWorker', 'RTCPeerConnection', 'postMessage']) {
    assert.ok(!scripts.includes(api), `el script usa ${api}`);
  }
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  assert.ok(csp, 'falta la política de seguridad de contenido');
  assert.match(csp[1], /default-src 'none'/);
  assert.match(csp[1], /form-action 'none'/);
  assert.match(csp[1], /base-uri 'none'/);
  assert.doesNotMatch(csp[1], /unsafe-eval/);
  assert.doesNotMatch(csp[1], /https?:/, 'la CSP no debe abrir ningún origen externo');
  assert.doesNotMatch(csp[1], /connect-src/);
});

test('sin restos de depuración en el código entregado', () => {
  assert.ok(!/console\.|debugger/.test(scripts), 'console.* o debugger en los scripts');
  assert.ok(!/\b(TODO|FIXME|XXX)\b/.test(html), 'marcas de trabajo pendiente');
});

test('no carga recursos externos: solo aparecen api.whatsapp.com (enlace que abre el usuario) y el espacio de nombres SVG', () => {
  const urls = [...html.matchAll(/https?:\/\/[^\s"'<>)\\]+/g)].map(m => m[0]);
  const permitidas = urls.filter(u => u.startsWith('https://api.whatsapp.com/send') || u === 'http://www.w3.org/2000/svg');
  assert.deepEqual(urls, permitidas, 'hay URLs externas no previstas: ' + urls.filter(u => !permitidas.includes(u)));
  assert.ok(!/<script[^>]+\bsrc=/i.test(html), 'no debe haber <script src>');
  assert.ok(!/<link[^>]+rel=["']?stylesheet/i.test(html), 'no debe haber hojas de estilo externas');
  assert.ok(!/<(img|iframe|frame|embed|object|audio|video|source|form)\b/i.test(marcado), 'sin elementos que carguen o envíen contenido');
  assert.ok(!/@import|url\(/i.test(html.match(/<style>([\s\S]*?)<\/style>/)[1]), 'el CSS no carga nada');
});

test('el contenido de los clientes nunca entra como HTML', () => {
  const app = sinComentarios(/<script id="app">([\s\S]*?)<\/script>/.exec(html)[1]);
  for (const peligro of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'setTimeout("', "setTimeout('", 'srcdoc']) {
    assert.ok(!scripts.includes(peligro), `se usa ${peligro}`);
  }
  assert.ok(!/\son(click|error|load)=/i.test(marcado), 'sin manejadores en línea');
  assert.ok(!/javascript:/i.test(html), 'sin URLs javascript:');
  // el único href dinámico hacia fuera es el de WhatsApp, construido por enlaceWhatsApp
  const hrefs = [...app.matchAll(/href:\s*([^,}\n]+)/g)].map(m => m[1].trim());
  assert.deepEqual(hrefs.sort(), ['enlace', 'url'].sort(), 'los únicos href dinámicos son el enlace de WhatsApp y la descarga de la plantilla');
});

test('los enlaces a otra pestaña no filtran el origen ni dan control a la página abierta', () => {
  const app = sinComentarios(/<script id="app">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.ok(/target:\s*'_blank',\s*rel:\s*'noopener noreferrer'/.test(app));
  assert.equal((app.match(/_blank/g) || []).length, 1);
  assert.ok(!/target=["']_blank/.test(marcado), 'ningún enlace estático a _blank');
});

test('solo se guardan ajustes del negocio en el navegador, nunca datos de clientes', () => {
  const app = sinComentarios(/<script id="app">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.equal((app.match(/localStorage/g) || []).length, 2, 'localStorage solo en leerConfig y guardarConfig');
  assert.ok(!/sessionStorage|indexedDB|document\.cookie|caches\./.test(scripts));
  const guardar = /localStorage\.setItem\(CLAVE, JSON\.stringify\(\{([\s\S]*?)\}\)\)/.exec(app);
  assert.ok(guardar, 'no se encontró guardarConfig');
  const claves = [...guardar[1].matchAll(/(\w+):\s*\$\('([\w-]+)'\)\.value/g)].map(m => m[2]).sort();
  assert.deepEqual(claves, ['mensaje', 'negocio', 'pais', 'plantilla', 'prefijo'], 'solo negocio, país, prefijo y mensaje');
  assert.ok(!/try\s*\{\s*localStorage/.test(app) || /catch/.test(app), 'el acceso a localStorage está protegido con try/catch');
});

test('cada $(\'id\') del script existe en el HTML y no hay ids repetidos', () => {
  const ids = [...marcado.matchAll(/\sid="([\w-]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos: ' + ids.filter((x, i) => ids.indexOf(x) !== i));
  const usados = [...new Set([...scripts.matchAll(/\$\('([\w-]+)'\)/g)].map(m => m[1]))];
  const faltan = usados.filter(id => !ids.includes(id));
  assert.deepEqual(faltan, [], 'el script busca ids que no existen: ' + faltan);
  assert.ok(usados.length > 20);
});

test('accesibilidad básica: idioma, título, viewport y cada campo con su etiqueta', () => {
  assert.match(html, /<html lang="es">/);
  assert.match(html, /<title>[^<]{5,}<\/title>/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  const campos = [...marcado.matchAll(/<(input|select|textarea)\b([^>]*)>/g)].map(m => ({ tag: m[1], attrs: m[2] }));
  assert.ok(campos.length >= 14);
  for (const { tag, attrs } of campos) {
    const id = /\bid="([\w-]+)"/.exec(attrs);
    assert.ok(id, `${tag} sin id: ${attrs}`);
    const conFor = new RegExp(`<label[^>]*\\bfor="${id[1]}"`).test(marcado);
    const envuelto = new RegExp(`<label[^>]*>\\s*<${tag}[^>]*\\bid="${id[1]}"`).test(marcado);
    assert.ok(conFor || envuelto || /aria-label=/.test(attrs), `el campo #${id[1]} no tiene etiqueta`);
  }
  // los botones y enlaces tienen texto o nombre accesible
  for (const m of marcado.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) assert.ok(m[1].trim().length > 0, 'botón vacío');
  // el foco es visible y hay tema oscuro
  assert.match(html, /:focus-visible/);
  assert.match(html, /prefers-color-scheme: dark/);
});
