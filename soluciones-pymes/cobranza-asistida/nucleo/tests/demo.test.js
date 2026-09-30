'use strict';
/* La demostración y los archivos de ejemplo se generan con el propio código: estas pruebas garantizan que lo
   publicado en el repositorio no se queda atrás cuando el código cambia, y que todo es inequívocamente ficticio. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cargar, plano } = require('./cargar');
const { problemasDeEtiquetas } = require('./html-seguro');
const gen = require('../datos-ficticios/generador');
const { configEjemplo } = require('../datos-ficticios/config-ejemplo');
const { construir, FECHA_CORTE } = require('../demo/generar-demo');

const RAIZ = path.join(__dirname, '..');
const { Util, M1, Cobranza } = cargar('util', 'm0-guardias', 'm1-normalizar', 'm2-antiguedad', 'm3-borradores', 'm4-informe', 'm5-guardia-envio', 'm6-registro', 'm7-ingesta', 'pipeline');
const generado = construir();

test('los archivos de demostración y de ejemplo publicados coinciden con lo que genera el código', () => {
  for (const [rel, contenido] of Object.entries(generado.archivos)) {
    const ruta = path.join(RAIZ, rel);
    assert.ok(fs.existsSync(ruta), rel + ' no existe: ejecutar «node demo/generar-demo.js»');
    assert.equal(fs.readFileSync(ruta, 'utf8'), contenido, rel + ' está desactualizado: ejecutar «node demo/generar-demo.js»');
  }
});

test('la demostración: informe seguro, marcado como ejemplo, sin enlaces y sin datos que no sean inventados', () => {
  const html = generado.archivos['demo/informe-demo.html'];
  assert.deepEqual(problemasDeEtiquetas(html), []);
  assert.ok(html.includes('EJEMPLO CON DATOS FICTICIOS'));
  assert.equal(/href=|src=|<script|<img|<a /.test(html), false, 'la demostración no tiene enlaces ni recursos');
  assert.equal(html.includes('api.whatsapp.com'), false);
  assert.equal(html.includes('mailto:'), false);
  assert.ok(html.length < 200000);
  assert.ok(generado.informe.informe.asunto.startsWith('EJEMPLO · '));
  // todos los clientes de la demostración son inventados
  const nombres = [...new Set(generado.facturas.map((f) => f.cliente))];
  assert.ok(nombres.length >= 5);
  nombres.forEach((n) => assert.ok(html.includes(n.replace(/&/g, '&amp;')), n));
});

test('el correo de la demostración lleva totales y un enlace, y ningún nombre ni número de factura', () => {
  const correo = generado.archivos['demo/correo-demo.txt'];
  for (const f of generado.facturas) {
    assert.equal(correo.includes(f.cliente), false, f.cliente);
    assert.equal(correo.includes(f.serie + '-' + f.numero), false);
  }
  assert.match(correo, /https:\/\/drive\.google\.com\/file\/d\/1EjemploFicticioDeInforme0001\/view/);
  assert.match(correo, /Este correo no se envió a ningún cliente\./);
});

test('las cuatro exportaciones de ejemplo se leen con su configuración y dan las mismas facturas', () => {
  const cfg = configEjemplo();
  const leer = (estilo, contenido) => {
    const c = { ...gen.configPara(estilo, cfg), fecha_corte: FECHA_CORTE };
    return plano(contenido.formato === 'csv' ? M1.normalizarCSV(contenido.texto, c) : M1.normalizarObjetos(contenido.filas, c));
  };
  const dir = path.join(RAIZ, 'datos-ficticios', 'ejemplos');
  const a = leer('A', { formato: 'csv', texto: fs.readFileSync(path.join(dir, 'sistema-a-facturas-pendientes.csv'), 'utf8') });
  const b = leer('B', { formato: 'csv', texto: fs.readFileSync(path.join(dir, 'sistema-b-export_facturas.csv'), 'utf8') });
  const c = leer('C', { formato: 'csv', texto: fs.readFileSync(path.join(dir, 'sistema-c-pendientes.tsv'), 'utf8') });
  const x = leer('X', { formato: 'filas', filas: JSON.parse(fs.readFileSync(path.join(dir, 'sistema-x-filas.json'), 'utf8')) });
  for (const [nombre, r] of [['A', a], ['B', b], ['C', c], ['X', x]]) {
    assert.equal(r.error, null, nombre);
    assert.equal(r.resumen.aceptadas, 18, nombre);
    assert.equal(r.resumen.apartadas, 0, nombre);
  }
  const sinFila = (f) => { const { fila_origen, ...r } = f; return r; };
  assert.deepEqual(b.facturas.map(sinFila), a.facturas.map(sinFila));
  assert.deepEqual(x.facturas.map(sinFila), a.facturas.map(sinFila));
  const sinOpc = (f) => { const { emision, en_disputa, ...r } = sinFila(f); return r; }; // el sistema C no trae emisión ni disputa
  assert.deepEqual(c.facturas.map(sinOpc), a.facturas.map(sinOpc));
});

test('la configuración de ejemplo publicada es válida para el pipeline', () => {
  const publicada = JSON.parse(fs.readFileSync(path.join(RAIZ, 'datos-ficticios', 'ejemplos', 'configuracion-ejemplo.json'), 'utf8'));
  assert.deepEqual(publicada, configEjemplo());
  assert.deepEqual(plano(Cobranza.validarConfiguracion(publicada, FECHA_CORTE)), { ok: true, problemas: [] });
  // y es una configuración de ensayo: nunca real por defecto
  assert.equal(publicada.modo, 'dry_run');
});

test('los archivos de ejemplo no contienen nada que no sea inventado (correos .example y teléfonos reservados)', () => {
  const dir = path.join(RAIZ, 'datos-ficticios', 'ejemplos');
  for (const f of fs.readdirSync(dir)) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of t.matchAll(/[A-Za-z0-9._+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)) assert.match(m[1], /\.example$/, f);
    for (const m of t.matchAll(/(?<![\d])(?:\+?598[ -]?|0)(9\d)[ -]?(\d{3})[ -]?(\d{3})(?![\d])/g)) assert.ok(Util.esNumeroDeEjemplo('598' + m[1] + m[2] + m[3]), f + ' ' + m[0]);
  }
});
