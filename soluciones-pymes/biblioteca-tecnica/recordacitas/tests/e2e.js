'use strict';
/*
 * Prueba de extremo a extremo en un Chromium real (Playwright).
 *
 * Abre recordacitas.html desde disco (file://), como lo abriría un negocio, y comprueba lo que
 * las pruebas unitarias no pueden: que la página arranca sin errores, que no sale a la red,
 * que los enlaces de WhatsApp se generan y se abren, que un nombre malicioso queda inerte,
 * que copiar y descargar funcionan, que el móvil no desborda y que el contraste es legible.
 * WhatsApp está sustituido por un stub: no se envía ni se consulta nada fuera de esta máquina.
 *
 *   node tests/e2e.js              (necesita playwright: npm i -g playwright)
 *   E2E_SALIDA=/ruta node tests/e2e.js    → guarda además capturas de pantalla
 */
const fs = require('node:fs');
const os = require('node:os');
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

const RUTA = process.env.RECORDACITAS_HTML || path.join(__dirname, '..', 'recordacitas.html');
const PAGINA = 'file://' + RUTA;
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

const UNA_CITA = (c) => `${c.nombre}\t${c.tel}\t${c.fecha}\t${c.hora}\t${c.servicio}`;
const CABECERA = 'Nombre\tTeléfono\tFecha\tHora\tServicio';

// Los teléfonos de los ejemplos (600 000 00x / 099 000 00x) están bloqueados a propósito: aquí no se usan.
const DATOS = [
  { nombre: 'LAURA GARCÍA', tel: '612 345 678', fecha: '30/09/2026', hora: '10:30', servicio: 'Corte y peinado' },
  { nombre: 'Marcos Pérez', tel: '+34 655 123 456', fecha: '30/09/2026', hora: '9:00', servicio: 'Revisión' },
  { nombre: 'Error de teléfono', tel: '12345', fecha: '30/09/2026', hora: '12:00', servicio: 'x' },
  { nombre: 'Otro día', tel: '612 000 111', fecha: '01/10/2026', hora: '10:00', servicio: 'y' },
  { nombre: 'Ana<img src=x onerror="window.__xss=1">', tel: '699 111 222', fecha: '30/09/2026', hora: '11:00', servicio: '<b>negrita</b>' }
];
const AGENDA = [CABECERA].concat(DATOS.map(UNA_CITA)).join('\n');

const MENSAJE_LAURA =
  'Hola Laura 👋\n' +
  'Te recordamos tu cita en Peluquería Sol:\n' +
  '📅 miércoles 30 de septiembre a las 10:30\n' +
  'Servicio: Corte y peinado\n' +
  '¿Nos confirmas que vienes? Responde SÍ y listo. Si no puedes venir, avísanos con tiempo para ofrecer el hueco a otra persona. ¡Gracias!';
const ENLACE_LAURA = 'https://api.whatsapp.com/send?phone=34612345678&text=' + encodeURIComponent(MENSAJE_LAURA);

async function abrir(browser, opciones) {
  const o = Object.assign({ tz: 'America/Montevideo', ahora: '2026-09-29T21:30:00-03:00', viewport: { width: 1280, height: 900 }, esquema: 'light' }, opciones);
  const context = await browser.newContext({ timezoneId: o.tz, locale: 'es-UY', viewport: o.viewport, colorScheme: o.esquema, acceptDownloads: true });
  try { await context.grantPermissions(['clipboard-read', 'clipboard-write']); } catch (e) { /* algunas versiones no lo admiten */ }
  if (o.inicio) await context.addInitScript(o.inicio);
  const waPeticiones = [];
  await context.route('https://api.whatsapp.com/**', (route) => {
    waPeticiones.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>WhatsApp (simulado)</title>' });
  });
  const page = await context.newPage();
  const errores = [], peticiones = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errores.push('console.' + m.type() + ': ' + m.text()); });
  page.on('requestfailed', (r) => errores.push('requestfailed: ' + r.url()));
  page.on('request', (r) => peticiones.push(r.url()));
  // La página junta las ráfagas de eventos input en un único repintado (setTimeout 0): tras cada fill
  // se espera a un temporizador posterior, que por orden de programación corre después de ese repintado.
  const llenar = page.fill.bind(page);
  page.fill = async (selector, valor, opciones) => {
    await llenar(selector, valor, opciones);
    await page.evaluate(() => new Promise((ok) => setTimeout(ok, 0)));
  };
  await page.clock.setFixedTime(new Date(o.ahora));
  await page.goto(PAGINA);
  return { context, page, errores, peticiones, waPeticiones };
}

const tarjetas = (page) => page.locator('#lista-contenedor li.cita');
const tarjeta = (page, texto) => page.locator('#lista-contenedor li.cita', { hasText: texto });
const textos = (loc) => loc.allInnerTexts();
async function ponerNegocio(page, nombre) { await page.fill('#negocio', nombre); }

/* Contraste WCAG (AA = 4,5) calculado sobre los colores realmente pintados. */
async function contrastes(page, selectores) {
  return page.evaluate((sels) => {
    const analizar = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const fondo = (el) => {
      let e = el;
      while (e) { const c = analizar(getComputedStyle(e).backgroundColor); if (c.a > 0) return c; e = e.parentElement; }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    return sels.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, ausente: true };
      const cs = getComputedStyle(el);
      const t = analizar(cs.color), f = fondo(el);
      const l1 = lum(t), l2 = lum(f);
      return { sel, ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) };
    });
  }, selectores);
}

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  console.log('  Navegador: Chromium ' + browser.version());

  /* ============================ arranque y red ============================ */
  {
    const { context, page, errores, peticiones } = await abrir(browser);

    await paso('arranca sin errores ni avisos en la consola', async () => {
      assert.deepEqual(errores, []);
      assert.equal(await page.title(), 'RecordaCitas · recordatorios de cita por WhatsApp');
    });

    await paso('no sale a la red: todas las peticiones son locales (file:// o data:)', async () => {
      assert.ok(peticiones.length >= 1);
      for (const u of peticiones) assert.ok(/^(file:|data:)/.test(u), 'petición externa: ' + u);
    });

    await paso('«mañana» es el día siguiente del calendario local aunque en UTC ya sea otro día (21:30 en Montevideo)', async () => {
      assert.equal(await page.evaluate(() => new Date().toISOString().slice(0, 10)), '2026-09-30', 'en UTC ya es el 30: un cálculo con toISOString daría el 1 de octubre');
      assert.equal(await page.inputValue('#dia'), '2026-09-30');
      assert.equal(await page.inputValue('#m-fecha'), '2026-09-30');
    });

    await paso('estado inicial: sin citas, vista previa del mensaje y aviso de que falta el nombre del negocio', async () => {
      assert.match(await page.textContent('.vacio'), /Aún no hay citas/);
      assert.match(await page.textContent('#vista'), /^Hola Laura 👋\nTe recordamos tu cita en \(nombre de tu negocio\):/);
      assert.match(await page.textContent('#avisos-mensaje'), /Escribe el nombre de tu negocio/);
      assert.match(await page.textContent('#avisos'), /bloqueado/);
    });

    await paso('al escribir el negocio desaparece el bloqueo y la vista previa usa ese nombre', async () => {
      await ponerNegocio(page, 'Peluquería Sol');
      assert.equal(await page.locator('#avisos-mensaje .nota.error').count(), 0);
      assert.match(await page.textContent('#vista'), /Te recordamos tu cita en Peluquería Sol:\n📅 miércoles 30 de septiembre a las 10:30/);
    });

    /* ========================== pegar la agenda ========================== */
    await paso('pegar la agenda: ordena por hora, señala el error y oculta lo de otro día', async () => {
      await page.fill('#pegado', AGENDA);
      const nombres = await textos(page.locator('#lista-contenedor li.cita .nombre'));
      assert.deepEqual(nombres, ['Marcos Pérez', 'Laura García', 'Ana<img src=x onerror="window.__xss=1">', 'Error de teléfono']);
      assert.equal(await page.textContent('#resumen'), '4 citas · 3 listas para enviar · 1 con errores · 0 abiertas');
      assert.match(await page.textContent('#avisos'), /Hay 1 cita de otras fechas/);
      const error = tarjeta(page, 'Error de teléfono');
      assert.match(await error.textContent(), /Un teléfono de España tiene 9 dígitos/);
      assert.equal(await error.locator('button[disabled]').count(), 1);
      assert.equal(await error.locator('a.primario').count(), 0);
    });

    await paso('el enlace de Laura es exactamente api.whatsapp.com/send?phone=34612345678 con el mensaje codificado', async () => {
      const laura = tarjeta(page, 'Laura García');
      assert.equal(await laura.locator('a.primario').getAttribute('href'), ENLACE_LAURA);
      assert.equal(await laura.locator('a.primario').getAttribute('target'), '_blank');
      assert.equal(await laura.locator('a.primario').getAttribute('rel'), 'noopener noreferrer');
      await laura.locator('summary').click();
      assert.equal(await laura.locator('pre').textContent(), MENSAJE_LAURA);
      assert.match(await laura.textContent(), /\+34 612 345 678/);
      assert.match(await laura.textContent(), /miércoles 30 de septiembre/);
    });

    await paso('un nombre con HTML se muestra como texto y no se ejecuta (XSS inerte)', async () => {
      assert.equal(await page.evaluate(() => window.__xss), undefined);
      assert.equal(await page.locator('#lista-contenedor img, #lista-contenedor b').count(), 0);
      const xss = tarjeta(page, 'onerror');
      assert.match(await xss.textContent(), /Ana<img src=x onerror="window.__xss=1">/);
      assert.match(await xss.textContent(), /<b>negrita<\/b>/);
    });

    await paso('pulsar «Abrir WhatsApp» abre WhatsApp con ese enlace, sin opener, y marca la cita como abierta', async () => {
      const laura = tarjeta(page, 'Laura García');
      const [nueva] = await Promise.all([context.waitForEvent('page'), laura.locator('a.primario').click()]);
      await nueva.waitForLoadState();
      assert.equal(nueva.url(), ENLACE_LAURA);
      assert.equal(await nueva.evaluate(() => window.opener), null, 'la pestaña abierta no debe poder controlar la nuestra');
      await nueva.close();
      assert.equal(await laura.locator('a.primario').textContent(), 'Abrir de nuevo');
      assert.equal(await laura.locator('.etiq.abierta').isVisible(), true);
      assert.match(await laura.getAttribute('class'), /abierta/);
      assert.equal(await page.textContent('#resumen'), '4 citas · 3 listas para enviar · 1 con errores · 1 abiertas');
    });

    await paso('lo ya abierto se mantiene marcado al seguir editando la agenda', async () => {
      await page.fill('#pegado', AGENDA + '\nAna\t612 999 888\t30/09/2026\t18:00\tTinte');
      assert.equal(await tarjetas(page).count(), 5);
      assert.match(await page.textContent('#resumen'), /1 abiertas/);
      assert.equal(await tarjeta(page, 'Laura García').locator('.etiq.abierta').isVisible(), true);
    });

    await paso('«Copiar mensaje» deja en el portapapeles el texto exacto', async () => {
      const laura = tarjeta(page, 'Laura García');
      await laura.getByRole('button', { name: 'Copiar mensaje' }).click();
      assert.match(await laura.getByRole('button', { name: /Copiado/ }).textContent(), /Copiado ✓/);
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), MENSAJE_LAURA);
    });

    await paso('«Ver todas las fechas» agrupa por día y desactiva el selector de fecha', async () => {
      await page.check('#todas');
      assert.deepEqual(await textos(page.locator('h3.grupo')), ['Miércoles 30 de septiembre', 'Jueves 1 de octubre']);
      assert.equal(await tarjetas(page).count(), 6);
      assert.equal(await page.isDisabled('#dia'), true);
      await page.uncheck('#todas');
      assert.equal(await page.isDisabled('#dia'), false);
    });

    await paso('cambiar el día filtra; un día vacío ofrece las fechas que sí tienen citas', async () => {
      await page.fill('#dia', '2026-10-01');
      assert.deepEqual(await textos(page.locator('#lista-contenedor li.cita .nombre')), ['Otro día']);
      assert.match(await page.textContent('#avisos'), /Hay 5 citas de otras fechas/);
      await page.fill('#dia', '2026-12-25');
      assert.equal(await tarjetas(page).count(), 0);
      const botones = await textos(page.locator('.vacio .fechas button'));
      assert.deepEqual(botones, ['miércoles 30 de septiembre (5)', 'jueves 1 de octubre (1)']);
      await page.locator('.vacio .fechas button').first().click();
      assert.equal(await page.inputValue('#dia'), '2026-09-30');
      assert.equal(await tarjetas(page).count(), 5);
    });

    /* ============================ el mensaje ============================= */
    await paso('un dato mal escrito en el mensaje bloquea el envío y lo explica', async () => {
      await page.fill('#mensaje', 'Hola {nombr}, tu cita es {fecha}');
      assert.match(await page.textContent('#avisos-mensaje'), /\{nombr\}/);
      assert.equal(await page.locator('#lista-contenedor a.primario').count(), 0);
      assert.match(await page.textContent('#avisos'), /bloqueado/);
      assert.equal(await page.inputValue('#plantilla'), 'personalizada');
      assert.equal(await page.locator('#lista-contenedor button.primario[disabled]').count(), 5);
    });

    await paso('elegir un modelo restaura el texto y desbloquea el envío', async () => {
      await page.selectOption('#plantilla', 'cita');
      assert.equal((await page.inputValue('#mensaje')).split('\n')[0], 'Hola {nombre} 👋');
      assert.equal(await page.locator('#lista-contenedor a.primario').count(), 4);
      await page.selectOption('#plantilla', 'reserva');
      assert.match(await page.inputValue('#mensaje'), /Personas: \{personas\}/);
      await page.selectOption('#plantilla', 'cita');
    });

    await paso('sin nombre de negocio no se puede enviar (el mensaje lo usa)', async () => {
      await ponerNegocio(page, '');
      assert.equal(await page.locator('#lista-contenedor a.primario').count(), 0);
      await ponerNegocio(page, 'Peluquería Sol');
      assert.equal(await page.locator('#lista-contenedor a.primario').count(), 4);
    });

    await paso('los botones de datos insertan {campo} donde está el cursor', async () => {
      await page.fill('#mensaje', 'Hola ');
      await page.locator('#mensaje').evaluate((ta) => { ta.focus(); ta.setSelectionRange(5, 5); });
      await page.getByRole('button', { name: '{nombre}', exact: true }).click();
      assert.equal(await page.inputValue('#mensaje'), 'Hola {nombre}');
      await page.getByRole('button', { name: '{hora}', exact: true }).click();
      assert.equal(await page.inputValue('#mensaje'), 'Hola {nombre}{hora}');
      assert.match(await page.textContent('#avisos-mensaje'), /no incluye \{fecha\} ni \{hora\}|^$/);
      await page.selectOption('#plantilla', 'cita');
    });

    /* ========================= añadir a mano ============================= */
    await paso('añadir una cita a mano: valida, aparece con su enlace y se puede quitar', async () => {
      await page.locator('#manual summary').click();
      await page.click('#btn-anadir');
      assert.match(await page.textContent('#avisos-manual'), /^Falta el teléfono, la hora\.$/);
      await page.fill('#m-nombre', 'Carmen Ruiz');
      await page.fill('#m-tel', '677 000 999');
      await page.fill('#m-fecha', '2026-09-30');
      await page.fill('#m-hora', '16:45');
      await page.fill('#m-servicio', 'Manicura');
      await page.click('#btn-anadir');
      const carmen = tarjeta(page, 'Carmen Ruiz');
      assert.equal(await carmen.count(), 1);
      assert.match(await carmen.textContent(), /añadida a mano/);
      assert.match(await carmen.locator('a.primario').getAttribute('href'), /^https:\/\/api\.whatsapp\.com\/send\?phone=34677000999&text=/);
      assert.equal(await page.inputValue('#m-tel'), '', 'se limpia para la siguiente');
      await carmen.getByRole('button', { name: 'Quitar' }).click();
      assert.equal(await tarjeta(page, 'Carmen Ruiz').count(), 0);
    });

    /* ======================= archivos y descargas ======================== */
    await paso('un CSV de Excel en Windows-1252 conserva las tildes', async () => {
      const csv = 'Nombre;Teléfono;Fecha;Hora;Servicio\r\nJosé Peña;612345670;30/09/2026;10:30;Corte\r\n';
      await page.setInputFiles('#archivo', { name: 'agenda.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'latin1') });
      await page.waitForFunction(() => document.querySelector('#pegado').value.includes('José Peña'));
      assert.deepEqual(await textos(page.locator('#lista-contenedor li.cita .nombre')), ['José Peña']);
      assert.match(await tarjeta(page, 'José Peña').textContent(), /Corte/);
    });

    await paso('un CSV en UTF-8 con BOM y comas también se entiende', async () => {
      const csv = '﻿Cliente,Móvil,Día,Hora\n"Peña, Lucía",699888777,30/09/2026,17:15\n';
      await page.setInputFiles('#archivo', { name: 'agenda2.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
      await page.waitForFunction(() => document.querySelector('#pegado').value.includes('Lucía'));
      assert.deepEqual(await textos(page.locator('#lista-contenedor li.cita .nombre')), ['Lucía Peña']);
      assert.match(await page.textContent('#lista-contenedor'), /\+34 699 888 777/);
    });

    await paso('un libro de Excel (.xlsx) se rechaza con una explicación y no ensucia la agenda', async () => {
      const antes = await page.inputValue('#pegado');
      await page.setInputFiles('#archivo', { name: 'agenda.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0, 6, 0, 8, 0, 0, 0]) });
      await page.waitForFunction(() => document.querySelector('#avisos-carga').textContent.includes('libro de Excel'));
      assert.equal(await page.inputValue('#pegado'), antes);
    });

    await paso('un archivo de más de 2 MB se rechaza', async () => {
      await page.setInputFiles('#archivo', { name: 'enorme.csv', mimeType: 'text/csv', buffer: Buffer.alloc(2 * 1024 * 1024 + 10, 0x61) });
      await page.waitForFunction(() => document.querySelector('#avisos-carga').textContent.includes('demasiado grande'));
    });

    await paso('«Descargar plantilla» entrega plantilla-citas.csv con BOM y cabecera', async () => {
      const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('#btn-plantilla')]);
      assert.equal(descarga.suggestedFilename(), 'plantilla-citas.csv');
      const contenido = fs.readFileSync(await descarga.path());
      assert.deepEqual([...contenido.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
      assert.equal(contenido.subarray(3).toString('utf8'), 'Nombre;Teléfono;Fecha;Hora;Servicio;Personas\r\n');
    });

    /* ============================== ejemplo ============================== */
    await paso('«Cargar ejemplo»: 5 citas, teléfonos ficticios sin envío y aviso claro', async () => {
      await page.click('#btn-vaciar');
      await page.click('#btn-ejemplo');
      assert.equal(await tarjetas(page).count(), 5);
      assert.equal(await page.locator('#lista-contenedor a.primario').count(), 0, 'ningún enlace de WhatsApp para números ficticios');
      assert.equal(await page.locator('#lista-contenedor button.primario[disabled]').count(), 5);
      assert.equal(await page.locator('.etiq.ejemplo').count(), 4);
      assert.match(await page.textContent('#avisos'), /citas de ejemplo con teléfonos ficticios/);
      assert.match(await page.textContent('#lista-contenedor'), /Ejemplo: sin envío/);
      assert.match(await page.textContent('#resumen'), /^5 citas · 4 listas para enviar · 1 con errores · 0 abiertas$/);
    });

    await paso('el ejemplo sigue bloqueado aunque se edite el texto; los números reales sí se pueden enviar', async () => {
      await page.fill('#pegado', (await page.inputValue('#pegado')) + '\nAna Real;612 555 444;30/09/2026;19:00;Tinte');
      assert.equal(await page.locator('#lista-contenedor a.primario').count(), 1);
      assert.match(await tarjeta(page, 'Ana Real').locator('a.primario').getAttribute('href'), /phone=34612555444&/);
      assert.equal(await page.locator('#lista-contenedor li.cita button.primario[disabled]').count(), 5);
    });

    await paso('con Uruguay elegido el ejemplo usa móviles 099… y con «Otro país» pide prefijo o usa +', async () => {
      await page.click('#btn-vaciar');
      await page.selectOption('#pais', 'UY');
      await page.click('#btn-ejemplo');
      assert.match(await page.textContent('#lista-contenedor'), /\+598 99 000 001/);
      assert.equal(await page.isVisible('#campo-prefijo'), false);
      await page.selectOption('#pais', 'OTRO');
      assert.equal(await page.isVisible('#campo-prefijo'), true);
      await page.click('#btn-vaciar');
      await page.fill('#pegado', 'Nombre;Teléfono;Fecha;Hora\nBea;11 5555 1234;30/09/2026;10:00');
      assert.match(await page.textContent('#lista-contenedor'), /Indica el prefijo de tu país/);
      await page.fill('#prefijo', '54');
      assert.match(await tarjeta(page, 'Bea').locator('a.primario').getAttribute('href'), /^https:\/\/api\.whatsapp\.com\/send\?phone=541155551234&text=/);
      await page.selectOption('#pais', 'ES');
      await page.click('#btn-vaciar');
    });

    /* ============================ persistencia =========================== */
    await paso('se recuerdan negocio y mensaje, pero nunca datos de clientes', async () => {
      await ponerNegocio(page, 'Peluquería Sol');
      await page.fill('#pegado', AGENDA);
      const guardado = await page.evaluate(() => localStorage.getItem('recordacitas:v1'));
      const obj = JSON.parse(guardado);
      assert.deepEqual(Object.keys(obj).sort(), ['mensaje', 'negocio', 'pais', 'plantilla', 'prefijo']);
      assert.ok(!/612|655|Laura|Marcos|onerror/.test(guardado), 'no debe haber datos de clientes en el almacenamiento');
      const todo = await page.evaluate(() => JSON.stringify({ l: Object.assign({}, localStorage), s: Object.assign({}, sessionStorage), c: document.cookie }));
      assert.ok(!/612|655|Laura|Marcos|onerror/.test(todo));
      await page.reload();
      assert.equal(await page.inputValue('#negocio'), 'Peluquería Sol');
      assert.equal(await page.inputValue('#plantilla'), 'cita');
      assert.equal(await page.inputValue('#pegado'), '', 'la agenda no se conserva al recargar');
      assert.equal(await tarjetas(page).count(), 0);
    });

    await paso('sigue sin errores de consola tras todo el recorrido', async () => {
      // La petición fallida de la prueba de tamaño no cuenta: solo errores de la propia página.
      assert.deepEqual(errores.filter((e) => !/whatsapp/.test(e)), []);
    });

    await context.close();
  }

  /* ======================= mensajes y almacenamiento ==================== */
  await paso('una plantilla natural sigue enviando la fecha y la hora aunque a una cita le falte el nombre', async () => {
    const { context, page } = await abrir(browser);
    await ponerNegocio(page, 'Peluquería Sol');
    await page.fill('#mensaje', 'Hola {nombre}, tu cita en {negocio} es {fecha} a las {hora}.');
    await page.fill('#pegado', 'Nombre;Teléfono;Fecha;Hora\n;612345678;30/09/2026;10:30\nLaura;612345679;30/09/2026;11:00');
    assert.equal(await tarjetas(page).count(), 2);
    const sinNombre = tarjetas(page).nth(0);
    await sinNombre.locator('summary').click();
    assert.equal(await sinNombre.locator('pre').textContent(), 'Hola, tu cita en Peluquería Sol es miércoles 30 de septiembre a las 10:30.');
    assert.match(await sinNombre.textContent(), /Aviso: Sin nombre/);
    const href = await sinNombre.locator('a.primario').getAttribute('href');
    assert.equal(new URL(href).searchParams.get('text'), 'Hola, tu cita en Peluquería Sol es miércoles 30 de septiembre a las 10:30.');
    await context.close();
  });

  await paso('avisa cuando un dato opcional comparte línea con otros, sin bloquear el envío', async () => {
    const { context, page } = await abrir(browser);
    await ponerNegocio(page, 'Sol');
    await page.fill('#mensaje', 'Tu cita de {servicio} es {fecha} a las {hora}');
    assert.match(await page.textContent('#avisos-mensaje'), /mezcla \{servicio\}/);
    assert.equal(await page.locator('#avisos-mensaje .nota.error').count(), 0);
    await page.fill('#pegado', 'Nombre;Teléfono;Fecha;Hora;Servicio\nAna;612345678;30/09/2026;9:00;Corte');
    assert.equal(await page.locator('#lista-contenedor a.primario').count(), 1);
    await context.close();
  });

  await paso('la vista previa usa una cita del día mostrado, no una pasada', async () => {
    const { context, page } = await abrir(browser);
    await ponerNegocio(page, 'Sol');
    await page.fill('#pegado', 'Nombre;Teléfono;Fecha;Hora\nPasado;612345671;25/09/2026;9:00\nMañana;612345672;30/09/2026;9:00');
    assert.match(await page.textContent('#vista-titulo'), /Mañana/);
    assert.match(await page.textContent('#vista'), /^Hola Mañana/);
    await context.close();
  });

  await paso('almacenamiento corrupto o con tipos raros: la página arranca con los valores por defecto', async () => {
    for (const valor of ['{malformado', '[]', 'null', '"texto"', '{"negocio":123,"pais":"XX","prefijo":["a"],"plantilla":{},"mensaje":42}']) {
      const { context, page, errores } = await abrir(browser, { inicio: `localStorage.setItem('recordacitas:v1', ${JSON.stringify(valor)})` });
      assert.deepEqual(errores, [], 'errores con ' + valor);
      assert.equal(await page.inputValue('#negocio'), '');
      assert.equal(await page.inputValue('#pais'), 'ES');
      assert.equal(await page.inputValue('#plantilla'), 'cita');
      assert.equal((await page.inputValue('#mensaje')).split('\n')[0], 'Hola {nombre} 👋');
      await context.close();
    }
  });

  await paso('valores guardados demasiado largos se recortan', async () => {
    const enorme = JSON.stringify({ negocio: 'N'.repeat(500), pais: 'OTRO', prefijo: '54abc9999', plantilla: 'personalizada', mensaje: 'M{fecha}'.repeat(1000) });
    const { context, page } = await abrir(browser, { inicio: `localStorage.setItem('recordacitas:v1', ${JSON.stringify(enorme)})` });
    assert.equal((await page.inputValue('#negocio')).length, 80);
    assert.equal(await page.inputValue('#pais'), 'OTRO');
    assert.equal(await page.inputValue('#prefijo'), '5499');
    assert.equal((await page.inputValue('#mensaje')).length, 2000);
    await context.close();
  });

  await paso('con el almacenamiento bloqueado (modo privado) la herramienta sigue funcionando', async () => {
    const { context, page, errores } = await abrir(browser, { inicio: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('bloqueado', 'SecurityError'); } });` });
    await ponerNegocio(page, 'Sol');
    await page.fill('#pegado', 'Nombre;Teléfono;Fecha;Hora\nAna;612345678;30/09/2026;9:00');
    assert.equal(await page.locator('#lista-contenedor a.primario').count(), 1);
    assert.deepEqual(errores, []);
    await context.close();
  });

  /* ========================== zonas horarias ============================ */
  for (const [tz, ahora, esperado, descripcion] of [
    ['Europe/Madrid', '2026-09-30T00:30:00+02:00', '2026-10-01', 'Madrid, 00:30 (en UTC aún es el 29)'],
    ['Pacific/Kiritimati', '2026-09-30T23:50:00+14:00', '2026-10-01', 'Kiritimati (UTC+14), 23:50'],
    ['Pacific/Pago_Pago', '2026-09-29T00:10:00-11:00', '2026-09-30', 'Pago Pago (UTC−11), 00:10'],
    ['America/Montevideo', '2026-12-31T22:00:00-03:00', '2027-01-01', 'Montevideo, fin de año']
  ]) {
    await paso('el día por defecto es el siguiente del calendario local: ' + descripcion, async () => {
      const { context, page } = await abrir(browser, { tz, ahora });
      assert.equal(await page.inputValue('#dia'), esperado);
      await context.close();
    });
  }

  await paso('el mensaje indica el año cuando la cita es de otro año', async () => {
    const { context, page } = await abrir(browser, { tz: 'America/Montevideo', ahora: '2026-12-30T20:00:00-03:00' });
    await ponerNegocio(page, 'Sol');
    await page.fill('#pegado', 'Nombre;Teléfono;Fecha;Hora\nAna;612345678;02/01/2027;9:00');
    assert.equal(await page.inputValue('#dia'), '2026-12-31');
    await page.check('#todas');
    await tarjeta(page, 'Ana').locator('summary').click();
    assert.match(await tarjeta(page, 'Ana').locator('pre').textContent(), /📅 sábado 2 de enero de 2027 a las 9:00/);
    await context.close();
  });

  /* ============================== seguridad ============================= */
  await paso('la política CSP funciona: ni fetch, ni eval, ni imágenes externas, ni envío de formularios', async () => {
    const { context, page } = await abrir(browser);
    // Un <script> insertado en la página se rige por su CSP; page.evaluate (protocolo de depuración) se la salta.
    await page.evaluate((codigo) => { setTimeout(() => { const el = document.createElement('script'); el.textContent = codigo; document.head.appendChild(el); }, 0); }, `
      window.__csp = { violaciones: [] };
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.violaciones.push(e.violatedDirective));
      try { eval('1+1'); window.__csp.eval = 'permitido'; } catch (e) { window.__csp.eval = 'bloqueado'; }
      try { new Function('return 1')(); window.__csp.func = 'permitido'; } catch (e) { window.__csp.func = 'bloqueado'; }
      fetch('https://example.com/').then(() => { window.__csp.fetch = 'permitido'; }, () => { window.__csp.fetch = 'bloqueado'; });
      const img = new Image(); img.onload = () => { window.__csp.img = 'permitido'; }; img.onerror = () => { window.__csp.img = 'bloqueado'; };
      img.src = 'https://example.com/x.png';
      const f = document.createElement('form'); f.action = 'https://example.com/'; document.body.appendChild(f); f.submit();
    `);
    await page.waitForFunction(() => window.__csp && window.__csp.fetch && window.__csp.img);
    const r = await page.evaluate(() => window.__csp);
    assert.deepEqual({ eval: r.eval, func: r.func, fetch: r.fetch, img: r.img }, { eval: 'bloqueado', func: 'bloqueado', fetch: 'bloqueado', img: 'bloqueado' });
    assert.ok(r.violaciones.includes('form-action'), 'el envío de formularios debe estar bloqueado: ' + r.violaciones);
    assert.ok(page.url().startsWith('file:'), 'la página no debe haber navegado a otro sitio');
    await context.close();
  });

  /* ================= móvil, escritorio, oscuro y contraste ============== */
  const MUCHAS = [CABECERA].concat(DATOS.filter((d) => d.nombre !== 'Otro día').map(UNA_CITA),
    'Pasada\t612 000 222\t28/09/2026\t10:00\tRevisión', 'Sin año\t612 000 333\t30/09\t13:00\tCorte').join('\n');

  for (const [nombre, viewport, esquema] of [
    ['móvil claro', { width: 375, height: 812 }, 'light'], ['móvil oscuro', { width: 375, height: 812 }, 'dark'],
    ['escritorio claro', { width: 1280, height: 900 }, 'light'], ['escritorio oscuro', { width: 1280, height: 900 }, 'dark'],
    ['móvil pequeño', { width: 320, height: 640 }, 'light']
  ]) {
    await paso(`diseño en ${nombre} (${viewport.width}px): sin desbordes, botones táctiles y contraste AA`, async () => {
      const { context, page } = await abrir(browser, { viewport, esquema });
      await ponerNegocio(page, 'Peluquería Sol');
      await page.check('#todas');
      await page.fill('#pegado', MUCHAS + '\nEjemplo\t600 000 001\t30/09/2026\t14:00\tx');
      await tarjeta(page, 'Laura García').locator('a.primario').evaluate((a) => { a.removeAttribute('target'); a.addEventListener('click', (e) => e.preventDefault()); });
      await tarjeta(page, 'Laura García').locator('a.primario').click();
      await tarjeta(page, 'Laura García').locator('summary').click();

      const medidas = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, visible: document.documentElement.clientWidth }));
      assert.ok(medidas.ancho <= medidas.visible, `desborde horizontal: ${medidas.ancho}px > ${medidas.visible}px`);

      const alturas = await page.$$eval('#lista-contenedor .btn:not(.chico), #btn-ejemplo, #btn-vaciar, #btn-anadir', (bs) => bs.filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().height)));
      assert.ok(alturas.length >= 4 && alturas.every((h) => h >= 44), 'botones demasiado bajos: ' + alturas);

      const pares = await contrastes(page, ['body', 'h1', '.lema', 'label', '.ayuda-texto', '#negocio', '#mensaje', '.btn', '.btn.primario',
        '#lista-contenedor button.primario[disabled]', '.cita .datos', '.cita .nombre', '.cita .hora', '.problemas .e', '.problemas .a', '.vista', 'summary',
        '.etiq.abierta', '.etiq.ejemplo', '.grupo', '#resumen', 'footer p', '.nota.aviso', 'h2 .n']);
      for (const p of pares) {
        if (p.ausente) continue;
        const minimo = p.sel.includes('[disabled]') ? 3 : 4.5; // los controles desactivados no exigen contraste (WCAG 1.4.3)
        assert.ok(p.ratio >= minimo, `contraste ${p.ratio.toFixed(2)} < ${minimo} en «${p.sel}» (${nombre})`);
      }
      assert.ok(pares.filter((p) => !p.ausente).length >= 20, 'se midieron pocos elementos');

      if (CAPTURAS) await page.screenshot({ path: path.join(CAPTURAS, `captura-${nombre.replace(/\s+/g, '-')}.png`), fullPage: true });
      await context.close();
    });
  }

  await paso('el bloqueo por mensaje roto también es legible (contraste de los avisos en rojo)', async () => {
    for (const esquema of ['light', 'dark']) {
      const { context, page } = await abrir(browser, { esquema });
      await page.fill('#mensaje', 'Hola {nombr}');
      const pares = await contrastes(page, ['.nota.error', '.nota.error p']);
      for (const p of pares) assert.ok(p.ratio >= 4.5, `contraste ${p.ratio.toFixed(2)} en ${p.sel} (${esquema})`);
      await context.close();
    }
  });

  /* ============================ teclado y foco ========================== */
  await paso('con el teclado: el foco se ve y se puede recorrer y activar el flujo completo', async () => {
    const { context, page } = await abrir(browser);
    await page.fill('#negocio', 'Sol');
    await page.fill('#pegado', 'Nombre;Teléfono;Fecha;Hora\nAna;612345678;30/09/2026;9:00');
    await page.locator('#negocio').focus();
    let alcanzoEnlace = false;
    for (let i = 0; i < 40 && !alcanzoEnlace; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const e = document.activeElement; const cs = getComputedStyle(e);
        // el selector de archivo es un <input> oculto: su foco se pinta en la etiqueta que lo sigue
        const visual = e.id === 'archivo' ? getComputedStyle(e.nextElementSibling) : cs;
        return { enlace: e.matches('#lista-contenedor a.primario'), desc: e.tagName + (e.id ? '#' + e.id : '') + '.' + e.className,
          contorno: visual.outlineStyle !== 'none' && parseFloat(visual.outlineWidth) >= 2 };
      });
      assert.ok(info.contorno, 'sin contorno de foco visible en ' + info.desc);
      alcanzoEnlace = info.enlace;
    }
    assert.equal(alcanzoEnlace, true, 'no se llega al enlace de WhatsApp con Tab');
    await context.close();
  });

  /* =============================== volumen ============================== */
  await paso('con 1.500 citas se pinta en menos de 2,5 s y sin errores', async () => {
    const { context, page, errores } = await abrir(browser);
    await ponerNegocio(page, 'Sol');
    const filas = [CABECERA];
    for (let i = 0; i < 1500; i++) filas.push(`Cliente ${i}\t6${String(20000000 + i).slice(-8)}\t30/09/2026\t${8 + (i % 12)}:${String(i % 60).padStart(2, '0')}\tCorte`);
    const t0 = Date.now();
    // Un pegado real dispara un único evento input; page.fill() inserta línea a línea y mide a Chromium, no a la página.
    await page.evaluate((texto) => { const ta = document.querySelector('#pegado'); ta.value = texto; ta.dispatchEvent(new Event('input', { bubbles: true })); }, filas.join('\n'));
    await page.waitForFunction(() => document.querySelectorAll('#lista-contenedor li.cita').length === 1500);
    const ms = Date.now() - t0;
    assert.ok(ms < 2500, `tardó ${ms} ms`);
    assert.match(await page.textContent('#resumen'), /^1500 citas · 1500 listas para enviar · 0 abiertas$/);
    assert.deepEqual(errores, []);
    await context.close();
  });

  await browser.close();
  console.log(`\n  ${total - fallos}/${total} pasos correctos${fallos ? ' · ' + fallos + ' con fallos' : ''}`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('Error inesperado en la prueba:', e); process.exit(1); });
