'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargar, plano } = require('./cargar');
const azar = require('./azar');
const gen = require('../datos-ficticios/generador');
const { configEjemplo } = require('../datos-ficticios/config-ejemplo');

const { Util, M1 } = cargar('util', 'm1-normalizar');
const CORTE = '2026-10-05';

const leer = (r, estilo, extra = {}) => plano(r.formato === 'csv'
  ? M1.normalizarCSV(r.texto, { ...gen.configPara(estilo, configEjemplo()), fecha_corte: CORTE, ...extra })
  : M1.normalizarObjetos(r.filas, { ...gen.configPara(estilo, configEjemplo()), fecha_corte: CORTE, ...extra }));
const sinFila = (f) => { const { fila_origen, ...resto } = f; return resto; };

test('determinista: la misma semilla da las mismas facturas y los mismos archivos', () => {
  const a = gen.crearFacturas({ semilla: 42, n: 60, fecha_corte: CORTE });
  const b = gen.crearFacturas({ semilla: 42, n: 60, fecha_corte: CORTE });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, gen.crearFacturas({ semilla: 43, n: 60, fecha_corte: CORTE }));
  for (const e of gen.ESTILOS) assert.deepEqual(gen.renderizar(a, e), gen.renderizar(b, e));
});

test('todo es ficticio: nombres «Ficticia…», correos en «.example» y solo teléfonos de ejemplo', () => {
  const fs = gen.crearFacturas({ semilla: 5, n: 400, fecha_corte: CORTE, prob_correo: 1, prob_tel: 1 });
  const adjetivos = ['Ficticia', 'Imaginaria', 'Inventada', 'Ejemplar', 'Modelo', 'Muestra', 'Simulada', 'Ilustrativa'];
  fs.forEach((f) => {
    assert.ok(adjetivos.some((a) => f.cliente.includes(a)), f.cliente);
    assert.match(f.correo, /^compras@[a-z0-9-]+\.example$/);
    assert.ok(Util.esNumeroDeEjemplo(f.tel), f.tel);
  });
  // el generador y Util comparten la misma lista de números de ejemplo
  assert.deepEqual(gen.TELEFONOS_EJEMPLO, plano(Util.NUMEROS_EJEMPLO));
});

test('las facturas cubren todos los casos que el núcleo debe tratar', () => {
  const fs = gen.crearFacturas({ semilla: 8, n: 600, fecha_corte: CORTE });
  const atraso = (f) => Util.diasEntre(f.vencimiento, CORTE);
  assert.ok(fs.some((f) => atraso(f) < 0), 'sin vencer');
  assert.ok(fs.some((f) => atraso(f) >= 1 && atraso(f) <= 15), 'escalón amable');
  assert.ok(fs.some((f) => atraso(f) >= 16 && atraso(f) <= 45), 'segundo aviso');
  assert.ok(fs.some((f) => atraso(f) >= 46), 'aviso firme');
  assert.ok(fs.some((f) => atraso(f) >= 91), 'tramo de más de 90 días');
  assert.ok(fs.some((f) => f.moneda === 'USD') && fs.some((f) => f.moneda === 'UYU'));
  assert.ok(fs.some((f) => f.disputa));
  assert.equal(new Set(fs.map((f) => f.serie + '-' + f.numero)).size, fs.length, 'números de factura únicos');
  fs.forEach((f) => { assert.ok(f.centavos >= 100 && Number.isInteger(f.centavos)); assert.ok(f.emision < f.vencimiento); });
});

test('el mismo dato en los cuatro formatos de exportación da exactamente el mismo resultado (30 semillas)', () => {
  const az = azar.crear(77);
  for (let semilla = 1; semilla <= 30; semilla++) {
    const n = az.entero(1, 80);
    const fs = gen.crearFacturas({ semilla, n, fecha_corte: CORTE, prob_disputa: 0.1 });
    const base = leer(gen.renderizar(fs, 'A'), 'A');
    assert.equal(base.resumen.aceptadas, n, 'semilla ' + semilla);
    assert.equal(base.resumen.apartadas, 0);
    for (const estilo of ['B', 'X']) {
      const r = leer(gen.renderizar(fs, estilo), estilo);
      assert.deepEqual(r.facturas.map(sinFila), base.facturas.map(sinFila), estilo + ' semilla ' + semilla);
      assert.deepEqual(r.avisos, base.avisos, estilo);
    }
    // el estilo C no trae emisión ni disputa: se compara todo lo demás
    const c = leer(gen.renderizar(fs, 'C'), 'C');
    const sinOpcionales = (f) => { const { emision, en_disputa, ...resto } = sinFila(f); return resto; };
    assert.deepEqual(c.facturas.map(sinOpcionales), base.facturas.map(sinOpcionales), 'C semilla ' + semilla);
  }
});

test('las filas hostiles se comportan como está previsto: aceptadas o apartadas con alguno de los códigos esperados', () => {
  const fs = gen.crearFacturas({ semilla: 3, n: 12, fecha_corte: CORTE });
  const { texto, marcas } = gen.csvConHostiles(fs, CORTE);
  const r = leer({ formato: 'csv', texto }, 'A', { umbral_rechazo: 100 });
  assert.equal(r.error, null);
  const aceptadasPorFila = new Map(r.facturas.map((f) => [f.fila_origen, f]));
  const apartadasPorFila = new Map(r.apartadas.map((a) => [a.fila, a]));
  marcas.forEach((m) => {
    if (m.esperado === 'aceptada') {
      assert.ok(aceptadasPorFila.has(m.linea), m.ref + ' debía aceptarse (línea ' + m.linea + ')');
    } else {
      const a = apartadasPorFila.get(m.linea);
      assert.ok(a, m.ref + ' debía apartarse (línea ' + m.linea + ')');
      assert.ok(m.codigos.includes(a.codigo), m.ref + ' → ' + a.codigo + ' no está en ' + m.codigos.join(','));
    }
  });
  const apartables = marcas.filter((m) => m.esperado === 'apartada').length;
  assert.equal(r.resumen.apartadas, apartables);
  assert.equal(r.resumen.aceptadas, marcas.length - apartables + fs.length);
  assert.equal(r.resumen.totales_ignorados, 1); // la fila «Total»
  assert.equal(r.resumen.vacias, 1); // la fila en blanco
  assert.equal(r.resumen.total, r.resumen.aceptadas + r.resumen.apartadas);
});

test('los nombres hostiles llegan tal cual (sin controles ni invisibles) y sin haber sido interpretados', () => {
  const { texto } = gen.csvConHostiles([], CORTE);
  const r = leer({ formato: 'csv', texto }, 'A', { umbral_rechazo: 100 });
  const nombres = r.facturas.map((f) => f.deudor_nombre);
  assert.ok(nombres.includes('=HYPERLINK("http://malo.example";"clic")'));
  assert.ok(nombres.includes('<img src=x onerror=alert(1)>'));
  assert.ok(nombres.includes('Cliente con {factura} {importe} {vencimiento} de plantilla'));
  const invisibles = new RegExp('[' + String.fromCharCode(0x200B) + String.fromCharCode(0x202E) + String.fromCharCode(0) + ']');
  nombres.forEach((nm) => assert.equal(invisibles.test(nm), false));
  assert.ok(nombres.includes('Cliente con salto de línea'), 'el salto de línea interno se vuelve un espacio');
});

test('corromper: no modifica el original, es determinista por semilla y casi siempre cambia el texto', () => {
  const fs = gen.crearFacturas({ semilla: 1, n: 20, fecha_corte: CORTE });
  const original = gen.renderizar(fs, 'A').texto;
  const copia = original.slice();
  let distintos = 0;
  for (let i = 1; i <= 200; i++) {
    const a = gen.corromper(original, azar.crear(i));
    const b = gen.corromper(original, azar.crear(i));
    assert.equal(a, b);
    if (a !== original) distintos++;
  }
  assert.equal(original, copia);
  assert.ok(distintos > 150, 'cambió ' + distintos + ' de 200');
});

test('este archivo y el generador no contienen caracteres invisibles ni bidireccionales', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const malo = new RegExp('[' + [[0, 8], [11, 12], [14, 31], [127, 159], [0x200B, 0x200F], [0x2028, 0x202E], [0x2060, 0x2069], [0xFEFF, 0xFEFF]]
    .map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']');
  for (const f of ['datos-ficticios/generador.js', 'datos-ficticios/config-ejemplo.js', 'tests/generador.test.js']) {
    const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.equal(malo.test(t), false, f);
  }
});
