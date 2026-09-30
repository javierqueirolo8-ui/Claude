'use strict';
/*
 * Prueba en un Chromium real del informe de demostración (Playwright).
 *
 * Abre demo/informe-demo.html desde disco, como lo abriría un dueño que descarga el informe de la carpeta
 * compartida, y comprueba lo que las pruebas de texto no pueden: que se ve completo SIN JavaScript, que no
 * intenta salir a la red, que no hay errores, que el móvil no desborda, que el contraste es legible en claro y
 * en oscuro, y que el contenido hostil de los datos queda inerte.
 *
 *   node tests/navegador.js                 (necesita playwright: npm i -g playwright)
 *   E2E_SALIDA=/ruta node tests/navegador.js   → guarda además capturas de pantalla
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');

function cargarPlaywright() {
  const nombres = ['playwright', 'playwright-core'];
  for (const n of nombres) { try { return require(n); } catch (e) { /* siguiente */ } }
  try {
    const raiz = execSync('npm root -g', { encoding: 'utf8' }).trim();
    for (const n of nombres) { try { return require(path.join(raiz, n)); } catch (e) { /* siguiente */ } }
  } catch (e) { /* sin npm */ }
  return null;
}
const pw = cargarPlaywright();
if (!pw) {
  console.log('  · Prueba en navegador omitida: Playwright no está instalado (npm i -g playwright).');
  process.exit(0);
}

const RAIZ = path.join(__dirname, '..');
const CAPTURAS = process.env.E2E_SALIDA || '';
if (CAPTURAS) fs.mkdirSync(CAPTURAS, { recursive: true });

let total = 0, fallos = 0;
async function paso(descripcion, fn) {
  total++;
  try { await fn(); console.log('  ✓ ' + descripcion); }
  catch (e) {
    fallos++;
    console.log('  ✗ ' + descripcion);
    console.log('      ' + String(e && e.message || e).split('\n').slice(0, 8).join('\n      '));
  }
}

// Contraste WCAG de cada texto visible contra su fondo efectivo (dentro de la página).
function medirContrastes() {
  const analizar = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const mezcla = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const fondoDe = (el) => {
    let capas = [];
    for (let n = el; n; n = n.parentElement) {
      const c = analizar(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { capas.push(c); if (c.a === 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    if (!capas.length || capas[capas.length - 1].a < 1) { const cs = analizar(getComputedStyle(document.documentElement).backgroundColor); if (cs && cs.a > 0) base = cs; }
    return capas.reverse().reduce((acc, c) => mezcla(c, acc), base);
  };
  const peores = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const vistos = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.nodeValue.trim()) continue;
    const el = t.parentElement;
    if (!el || vistos.has(el)) continue;
    vistos.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const fg = analizar(cs.color);
    if (!fg) continue;
    const bg = fondoDe(el);
    const c = mezcla(fg, bg);
    const l1 = lum(c), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const grande = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
    peores.push({ texto: t.nodeValue.trim().slice(0, 30), ratio: Math.round(ratio * 100) / 100, minimo: grande ? 3 : 4.5 });
  }
  return peores.filter((x) => x.ratio < x.minimo);
}

(async () => {
  const pagina = 'file://' + path.join(RAIZ, 'demo', 'informe-demo.html');
  const navegador = await pw.chromium.launch();
  try {
    const ctxSinJs = await navegador.newContext({ javaScriptEnabled: false, viewport: { width: 1100, height: 900 } });
    const p = await ctxSinJs.newPage();
    const externas = [];
    await ctxSinJs.route('**/*', (ruta) => { const u = ruta.request().url(); if (u.startsWith('file:') || u.startsWith('data:')) return ruta.continue(); externas.push(u); return ruta.abort(); });
    const errores = [];
    p.on('pageerror', (e) => errores.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
    await p.goto(pagina);

    await paso('se ve completo sin JavaScript: título, totales y una tarjeta por factura', async () => {
      assert.match(await p.title(), /Cobranza · resumen al 05\/10\/2026/);
      const texto = await p.innerText('body');
      assert.match(texto, /EJEMPLO/);
      assert.match(texto, /Vencido en/);
      assert.match(texto, /Por antigüedad/);
      const tarjetas = await p.locator('article.fila').count();
      assert.ok(tarjetas >= 10, 'tarjetas: ' + tarjetas);
    });
    await paso('no sale a la red y no da errores', async () => { assert.deepEqual(externas, []); assert.deepEqual(errores, []); });
    await paso('en la demostración no hay enlaces (ni WhatsApp ni correo)', async () => { assert.equal(await p.locator('a[href]').count(), 0); });
    await paso('la política de seguridad de contenido está vigente', async () => {
      assert.match(await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /default-src 'none'/);
    });
    if (CAPTURAS) await p.screenshot({ path: path.join(CAPTURAS, 'informe-escritorio.png'), fullPage: true });
    await ctxSinJs.close();

    for (const [nombre, vp, esquema] of [['escritorio claro', { width: 1280, height: 900 }, 'light'], ['móvil claro', { width: 375, height: 800 }, 'light'], ['móvil pequeño', { width: 320, height: 640 }, 'light'], ['móvil oscuro', { width: 375, height: 800 }, 'dark'], ['escritorio oscuro', { width: 1280, height: 900 }, 'dark']]) {
      const ctx = await navegador.newContext({ viewport: vp, colorScheme: esquema });
      const q = await ctx.newPage();
      await q.goto(pagina);
      await paso(nombre + ': sin desbordamiento horizontal', async () => {
        const [ancho, visible] = await q.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        assert.ok(ancho <= visible + 1, 'ancho ' + ancho + ' > ' + visible);
      });
      await paso(nombre + ': contraste de texto suficiente (WCAG AA)', async () => {
        const malos = await q.evaluate(medirContrastes);
        assert.deepEqual(malos, []);
      });
      if (CAPTURAS) await q.screenshot({ path: path.join(CAPTURAS, 'informe-' + nombre.replace(/ /g, '-') + '.png'), fullPage: true });
      await ctx.close();
    }

    // Con datos hostiles: el informe se genera desde el núcleo y se abre igual de inerte.
    const { cargar } = require('./cargar');
    const gen = require('../datos-ficticios/generador');
    const { configEjemplo } = require('../datos-ficticios/config-ejemplo');
    const { Cobranza } = cargar('util', 'm0-guardias', 'm1-normalizar', 'm2-antiguedad', 'm3-borradores', 'm4-informe', 'm5-guardia-envio', 'm6-registro', 'm7-ingesta', 'pipeline');
    const { texto } = gen.csvConHostiles(gen.crearFacturas({ semilla: 5, n: 12, fecha_corte: '2026-10-05' }), '2026-10-05');
    const hostil = JSON.parse(JSON.stringify(Cobranza.preparar({ config: { ...configEjemplo(), umbral_rechazo: 100 }, guardias: { permitido: true, dry_run: true }, fecha_corte: '2026-10-05', contenido: { formato: 'csv', texto } })));
    const archivoHostil = path.join(require('node:os').tmpdir(), 'informe-hostil-' + process.pid + '.html');
    fs.writeFileSync(archivoHostil, hostil.informe.html_completo);
    const ctxH = await navegador.newContext({ viewport: { width: 1100, height: 900 } });
    const h = await ctxH.newPage();
    const alertas = [];
    const solicitudes = [];
    h.on('dialog', async (d) => { alertas.push(d.message()); await d.dismiss(); });
    await ctxH.route('**/*', (ruta) => { const u = ruta.request().url(); if (!u.startsWith('file:')) solicitudes.push(u); return ruta.continue(); });
    await h.goto('file://' + archivoHostil);
    await paso('con datos hostiles: ningún script corre, ninguna imagen se carga y el texto se ve como texto', async () => {
      assert.deepEqual(alertas, []);
      assert.deepEqual(solicitudes, []);
      assert.equal(await h.locator('img, script, iframe, object, embed, form, input').count(), 0);
      assert.equal(await h.evaluate(() => window.__xss === undefined), true);
      const texto = await h.innerText('body');
      assert.ok(texto.includes('<img src=x onerror=alert(1)>'));
      assert.ok(texto.includes('=HYPERLINK("http://malo.example";"clic")'));
    });
    await paso('con datos hostiles: sin desbordamiento horizontal en el móvil', async () => {
      await h.setViewportSize({ width: 375, height: 800 });
      const [ancho, visible] = await h.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      assert.ok(ancho <= visible + 1, 'ancho ' + ancho + ' > ' + visible);
    });
    if (CAPTURAS) await h.screenshot({ path: path.join(CAPTURAS, 'informe-hostil-movil.png'), fullPage: true });
    fs.rmSync(archivoHostil, { force: true });
    await ctxH.close();
  } finally {
    await navegador.close();
  }
  console.log('\n' + (total - fallos) + '/' + total + ' pasos correctos');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
