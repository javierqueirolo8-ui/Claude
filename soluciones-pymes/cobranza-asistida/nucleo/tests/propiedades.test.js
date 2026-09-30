'use strict';
/* Nivel 2 y 3 del plan de pruebas (doc 03 §11): propiedades sobre miles de archivos generados, contra un cálculo
   independiente («oráculo») que no usa ningún código del núcleo, y pruebas de robustez con archivos estropeados.
   SEMILLAS=n en el entorno multiplica los casos para una pasada más profunda. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, plano, capturar } = require('./cargar');
const azar = require('./azar');
const { problemasDeEtiquetas } = require('./html-seguro');
const gen = require('../datos-ficticios/generador');
const { configEjemplo } = require('../datos-ficticios/config-ejemplo');

const { Util, M1, M2, M3, Cobranza } = cargar('util', 'm0-guardias', 'm1-normalizar', 'm2-antiguedad', 'm3-borradores', 'm4-informe',
  'm5-guardia-envio', 'm6-registro', 'm7-ingesta', 'pipeline');

const CORTE = '2026-10-05';
const ENSAYO = { permitido: true, dry_run: true };

/* ----------------------------------------------------------- el oráculo */

const dias = (venc) => Math.round((Date.UTC(2026, 9, 5) - Date.UTC(+venc.slice(0, 4), +venc.slice(5, 7) - 1, +venc.slice(8, 10))) / 86400000);
const tramoDe = (d) => (d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3);
const escalonDe = (d) => (d <= 15 ? 'amable' : d <= 45 ? 'segundo_aviso' : 'firme');
const agr = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dinero = (c, m) => (m === 'USD' ? 'US$ ' : '$U ') + agr(Math.floor(c / 100)) + (c % 100 ? ',' + String(c % 100).padStart(2, '0') : '');

function esperado(fs) {
  const venc = fs.filter((f) => dias(f.vencimiento) >= 1);
  const r = { n: venc.length, sinVencer: fs.filter((f) => dias(f.vencimiento) < 0).length, hoy: fs.filter((f) => dias(f.vencimiento) === 0).length, totales: {}, tramos: {}, escalones: {} };
  venc.forEach((f) => {
    const d = dias(f.vencimiento);
    const t = (r.totales[f.moneda] = r.totales[f.moneda] || { n: 0, total_centavos: 0 });
    t.n++; t.total_centavos += f.centavos;
    const tr = (r.tramos[f.moneda] = r.tramos[f.moneda] || [0, 1, 2, 3].map(() => ({ n: 0, total_centavos: 0 })));
    tr[tramoDe(d)].n++; tr[tramoDe(d)].total_centavos += f.centavos;
    const e = f.disputa ? 'en_disputa' : escalonDe(d);
    r.escalones[e] = (r.escalones[e] || 0) + 1;
  });
  return r;
}

const contenidoDe = (r) => (r.formato === 'csv' ? { formato: 'csv', texto: r.texto } : { formato: 'filas', filas: r.filas });
const lectura = (r, estilo) => {
  const c = { ...gen.configPara(estilo, configEjemplo()), fecha_corte: CORTE };
  return plano(r.formato === 'csv' ? M1.normalizarCSV(r.texto, c) : M1.normalizarObjetos(r.filas, c));
};

test('oráculo: totales, tramos, escalones y conteos coinciden con el cálculo directo (4 formatos × cientos de semillas)', () => {
  for (const base of azar.semillas(11)) {
    const az = azar.crear(base);
    for (let i = 0; i < 60; i++) {
      const fs = gen.crearFacturas({ semilla: az.entero(1, 1e6), n: az.entero(0, 90), fecha_corte: CORTE, prob_disputa: az.elegir([0, 0.05, 0.3]), prob_usd: az.elegir([0, 0.15, 0.6]) });
      const estilo = az.elegir(gen.ESTILOS);
      const l = lectura(gen.renderizar(fs, estilo), estilo);
      const disputaVisible = estilo !== 'C';
      const base2 = disputaVisible ? fs : fs.map((f) => ({ ...f, disputa: false })); // el estilo C no trae la columna
      if (fs.length === 0) { assert.equal(l.resumen.bloquear, true); continue; }
      assert.equal(l.resumen.aceptadas, fs.length);
      const a = plano(M2.calcularAntiguedad({ facturas: l.facturas, fecha_corte: CORTE }));
      const e = esperado(base2);
      assert.equal(a.vencidas.length, e.n);
      assert.equal(a.sin_vencer_n, e.sinVencer);
      assert.equal(a.vencen_hoy_n, e.hoy);
      assert.deepEqual(a.totales, e.totales);
      assert.deepEqual(a.por_escalon, e.escalones);
      for (const m of Object.keys(e.tramos)) {
        assert.deepEqual(a.por_tramo[m].map((t) => ({ n: t.n, total_centavos: t.total_centavos })), e.tramos[m], m);
        // la suma de los tramos es el total de la moneda
        assert.equal(a.por_tramo[m].reduce((s, t) => s + t.total_centavos, 0), a.totales[m].total_centavos);
      }
      // ninguna factura duplicada; atraso siempre positivo; cada vencida coincide con su original
      const refs = a.vencidas.map((v) => v.factura_ref + '|' + v.moneda);
      assert.equal(new Set(refs).size, refs.length);
      const porRef = new Map(fs.map((f) => [f.serie + '-' + f.numero, f]));
      a.vencidas.forEach((v) => {
        assert.ok(v.dias_atraso >= 1);
        const f = porRef.get(v.factura_ref);
        assert.ok(f, v.factura_ref);
        assert.equal(v.importe_centavos, f.centavos);
        assert.equal(v.moneda, f.moneda);
        assert.equal(v.dias_atraso, dias(f.vencimiento));
        assert.equal(v.deudor_nombre, f.cliente);
      });
    }
  }
});

test('oráculo: cada borrador nombra SU factura, SU importe y SU vencimiento, y solo esas', () => {
  for (const base of azar.semillas(12)) {
    const az = azar.crear(base);
    for (let i = 0; i < 40; i++) {
      const fs = gen.crearFacturas({ semilla: az.entero(1, 1e6), n: az.entero(1, 60), fecha_corte: CORTE, prob_disputa: 0.1 });
      const l = lectura(gen.renderizar(fs, 'A'), 'A');
      const a = plano(M2.calcularAntiguedad({ facturas: l.facturas, fecha_corte: CORTE }));
      const b = plano(M3.generarBorradores({ vencidas: a.vencidas, empresa: { nombre: 'Ferretería Ficticia S.R.L.' } }));
      const porRef = new Map(fs.map((f) => [f.serie + '-' + f.numero, f]));
      assert.equal(b.borradores.length + b.sin_borrador.length, a.vencidas.length);
      b.borradores.forEach((br) => {
        const f = porRef.get(br.factura_ref);
        assert.equal(f.disputa, false, 'una factura en disputa no lleva borrador');
        assert.ok(br.texto.includes(br.factura_ref));
        assert.ok(br.texto.includes(dinero(f.centavos, f.moneda)), br.texto);
        assert.ok(br.texto.includes(gen.fechaDMY(f.vencimiento)));
        // no menciona ninguna otra factura del mismo archivo
        fs.filter((o) => o !== f).forEach((o) => assert.equal(br.texto.includes(o.serie + '-' + o.numero + ' '), false));
        assert.equal(br.escalon, escalonDe(dias(f.vencimiento)));
      });
      b.sin_borrador.forEach((s) => assert.equal(porRef.get(s.factura_ref).disputa, true));
    }
  }
});

test('el orden de las filas del archivo no cambia el resultado', () => {
  const az = azar.crear(31);
  for (let i = 0; i < 60; i++) {
    const fs = gen.crearFacturas({ semilla: az.entero(1, 1e6), n: az.entero(2, 50), fecha_corte: CORTE });
    const estilo = az.elegir(['A', 'B', 'X']);
    const uno = lectura(gen.renderizar(fs, estilo), estilo);
    const dos = lectura(gen.renderizar(az.barajar(fs), estilo), estilo);
    const a1 = plano(M2.calcularAntiguedad({ facturas: uno.facturas, fecha_corte: CORTE }));
    const a2 = plano(M2.calcularAntiguedad({ facturas: dos.facturas, fecha_corte: CORTE }));
    const sinFila = (a) => a.vencidas.map((v) => { const { fila_origen, ...resto } = v; return resto; });
    assert.deepEqual(sinFila(a1), sinFila(a2));
    assert.deepEqual(a1.totales, a2.totales);
    assert.deepEqual(a1.por_tramo, a2.por_tramo);
  }
});

test('mismo archivo, mismo resultado: dos pasadas completas son idénticas, byte a byte', () => {
  const az = azar.crear(32);
  for (let i = 0; i < 25; i++) {
    const estilo = az.elegir(gen.ESTILOS);
    const r = gen.renderizar(gen.crearFacturas({ semilla: az.entero(1, 1e6), n: az.entero(1, 60), fecha_corte: CORTE }), estilo);
    const cfg = gen.configPara(estilo, configEjemplo());
    const a = JSON.stringify(plano(Cobranza.preparar({ config: cfg, guardias: ENSAYO, fecha_corte: CORTE, contenido: contenidoDe(r) })));
    const b = JSON.stringify(plano(Cobranza.preparar({ config: cfg, guardias: ENSAYO, fecha_corte: CORTE, contenido: contenidoDe(r) })));
    assert.equal(a, b);
  }
});

/* -------------------------------------------------------------- robustez */

const CANARIOS = (fs) => fs.flatMap((f) => [f.cliente, f.serie + '-' + f.numero, f.correo, f.tel && f.tel.slice(3)].filter(Boolean));
const control = new RegExp('[' + [[0, 8], [11, 12], [14, 31], [127, 159], [0x200B, 0x200F], [0x2028, 0x202E], [0x2060, 0x2069], [0xFEFF, 0xFEFF]]
  .map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']');

test('robustez: archivos estropeados de mil maneras dan un informe o una incidencia, nunca un error sin código ni un HTML inseguro', () => {
  const cuenta = { informe: 0, incidencia: 0, error: 0 };
  for (const base of azar.semillas(41)) {
    const az = azar.crear(base);
    for (let i = 0; i < 700; i++) {
      const estilo = az.elegir(['A', 'B', 'C']);
      const fs = gen.crearFacturas({ semilla: az.entero(1, 1e6), n: az.entero(0, 50), fecha_corte: CORTE, prob_correo: az.uno(), prob_tel: az.uno() });
      let texto = gen.renderizar(fs, estilo).texto;
      if (az.prob(0.85)) texto = gen.corromper(texto, az);
      const cfg = gen.configPara(estilo, { ...configEjemplo(), umbral_rechazo: az.elegir([0, 5, 20, 100]), modo: az.elegir(['dry_run', 'real']) });
      const r = capturar(() => Cobranza.preparar({ config: cfg, guardias: az.elegir([ENSAYO, { permitido: true, dry_run: false }]), fecha_corte: CORTE, contenido: { formato: 'csv', texto } }));
      if (!r.ok) {
        cuenta.error++;
        assert.match(String(r.codigo), /^E_[A-Z0-9_]{2,40}$/, 'error sin código: ' + r.mensaje);
        assert.notEqual(r.codigo, 'E_DESCONOCIDO');
        assert.notEqual(r.codigo, 'E_INTERNO');
        continue;
      }
      const p = r.valor;
      cuenta[p.tipo]++;
      assert.ok(['informe', 'incidencia'].includes(p.tipo));
      if (p.tipo === 'incidencia') {
        assert.match(p.codigo, /^E_[A-Z0-9_]{2,40}$/);
        assert.equal(control.test(p.aviso.asunto + p.aviso.cuerpo_texto), false);
        for (const c of CANARIOS(fs)) assert.equal((p.aviso.asunto + p.aviso.cuerpo_texto).includes(c), false, 'incidencia filtra ' + c);
        continue;
      }
      assert.deepEqual(problemasDeEtiquetas(p.informe.html_completo), []);
      assert.equal(control.test(p.informe.asunto), false);
      assert.equal(p.informe.asunto.includes('\n'), false);
      assert.equal(control.test(p.informe.html_completo), false);
      // el resumen para el correo lleva totales y contadores, nada del archivo
      for (const c of CANARIOS(fs)) assert.equal(p.informe.texto_resumen.includes(c), false, 'el resumen filtra ' + c);
      assert.equal(p.conteos.n_apartadas <= p.conteos.n_filas, true);
      assert.ok(p.conteos.n_vencidas + p.conteos.n_apartadas <= p.conteos.n_filas);
    }
  }
  assert.ok(cuenta.informe > 100 && cuenta.incidencia > 50, JSON.stringify(cuenta)); // la prueba no es vacía
});

test('robustez: contenido que no es un CSV (binarios, HTML, JSON, texto suelto) se trata como incidencia y nunca como informe', () => {
  const basura = [
    Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 37) % 256)).toString('latin1'),
    '<html><body><h1>Error 403</h1></body></html>',
    '{"facturas": [1, 2, 3]}',
    'Esto es un texto cualquiera\ncon varias líneas\nsin separadores',
    '\u0000\u0000\u0000', 'a'.repeat(100000), ';'.repeat(2000), '"'.repeat(50), '\n'.repeat(500),
    'Nro Factura;Cliente;Saldo;Vencimiento\n' + 'x;y;z;w\n'.repeat(200)
  ];
  for (const texto of basura) {
    const p = plano(Cobranza.preparar({ config: configEjemplo(), guardias: ENSAYO, fecha_corte: CORTE, contenido: { formato: 'csv', texto } }));
    assert.equal(p.tipo, 'incidencia', texto.slice(0, 30));
  }
});

test('robustez: tamaño grande pero dentro del límite se procesa rápido; por encima del límite de filas se rechaza', () => {
  const fs = gen.crearFacturas({ semilla: 9, n: 4000, fecha_corte: CORTE });
  const t0 = Date.now();
  const p = plano(Cobranza.preparar({ config: configEjemplo(), guardias: ENSAYO, fecha_corte: CORTE, contenido: contenidoDe(gen.renderizar(fs, 'A')) }));
  assert.equal(p.tipo, 'informe');
  assert.equal(p.conteos.n_filas, 4000);
  assert.ok(Date.now() - t0 < 8000, 'tardó ' + (Date.now() - t0) + ' ms');
  assert.ok(p.informe.filas_omitidas > 0, 'el informe limita cuántas filas dibuja');
  const de6000 = gen.crearFacturas({ semilla: 9, n: 6000, fecha_corte: CORTE });
  const q = plano(Cobranza.preparar({ config: configEjemplo(), guardias: ENSAYO, fecha_corte: CORTE, contenido: contenidoDe(gen.renderizar(de6000, 'A')) }));
  assert.equal(q.tipo, 'incidencia');
  assert.equal(q.codigo, 'E_DEMASIADAS_FILAS');
});

test('el redondeo de importes es exacto: ida y vuelta del formato con separadores, con miles de importes', () => {
  const az = azar.crear(51);
  for (let i = 0; i < 20000; i++) {
    const c = az.elegir([az.entero(1, 999), az.entero(1000, 99999), az.entero(100000, 99999999), az.entero(1e8, 9e11), az.entero(1, 1e6) * 100]);
    const texto = gen.importeEsUY(c);
    const p = plano(Util.parsearImporte(texto, { decimal: ',', miles: '.' }));
    assert.equal(p.ok, true, texto);
    assert.equal(p.centavos, c, texto);
  }
});
