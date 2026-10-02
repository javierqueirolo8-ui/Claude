#!/usr/bin/env node
'use strict';
/* Genera la demostración y los archivos de ejemplo, TODO con datos inventados y de forma reproducible.

   · demo/informe-demo.html: el informe tal como lo vería el dueño de una empresa, en modo «EJEMPLO»
     (sin enlaces de WhatsApp ni de correo). Sirve para enseñar el producto sin datos de nadie.
   · demo/correo-demo.txt: el correo que acompaña al informe cuando se entrega por enlace de salida.
   · datos-ficticios/ejemplos/: una exportación de ejemplo de cada «sistema de facturación» simulado.

   Uso:   node demo/generar-demo.js              escribe los archivos
          node demo/generar-demo.js --verificar   no escribe: sale con error si algún archivo difiere
   Una prueba (tests/demo.test.js) hace la verificación en cada ejecución: los ejemplos no pueden quedar
   desactualizados respecto del código. */

const fs = require('node:fs');
const path = require('node:path');
const { cargar, plano } = require('../tests/cargar');
const gen = require('../datos-ficticios/generador');
const { configEjemplo } = require('../datos-ficticios/config-ejemplo');

const RAIZ = path.join(__dirname, '..');
const FECHA_CORTE = '2026-10-05';
const SEMILLA_DEMO = 20261005;
const SEMILLA_EJEMPLOS = 20260930;
const ENLACE_EJEMPLO = 'https://drive.google.com/file/d/1EjemploFicticioDeInforme0001/view';

function todos() {
  return cargar('util', 'm0-guardias', 'm1-normalizar', 'm2-antiguedad', 'm3-borradores', 'm4-informe', 'm5-guardia-envio', 'm6-registro', 'm7-ingesta', 'pipeline');
}

function construir() {
  const { Cobranza } = todos();
  // Se arma el mensaje como lo verá el dueño en producción (sin prefijo de ensayo). Este script no envía nada:
  // el núcleo no tiene forma de hacerlo; solo construye textos.
  const guardias = { permitido: true, dry_run: false };
  const facturas = gen.crearFacturas({ semilla: SEMILLA_DEMO, n: 14, fecha_corte: FECHA_CORTE, prob_disputa: 0.1, prob_usd: 0.2, prob_correo: 0.7, prob_tel: 0.8 });
  const config = { ...configEjemplo(), modo: 'real' };
  const csv = gen.renderizar(facturas, 'A').texto;

  const p = plano(Cobranza.preparar({ config, guardias, fecha_corte: FECHA_CORTE, contenido: { formato: 'csv', texto: csv }, demo: true }));
  if (p.tipo !== 'informe') throw new Error('la demostración no produjo un informe');
  const envio = plano(Cobranza.armarEnvio({
    config, guardias, fecha_corte: FECHA_CORTE, fecha_exportacion: FECHA_CORTE, tipo: 'informe', preparado: p, hash_archivo: 'e'.repeat(64), enlace_informe: ENLACE_EJEMPLO,
    iniciada_utc: '2026-10-05T11:30:00Z', terminada_utc: '2026-10-05T11:30:02Z'
  }));

  const archivos = {};
  archivos['demo/informe-demo.html'] = p.informe.html_completo;
  archivos['demo/correo-demo.txt'] = 'Asunto: ' + envio.correo.asunto + '\nPara: ' + envio.envio.destinatarios.join(', ') + '\n\n' + envio.correo.cuerpo_texto + '\n';

  // Una exportación de ejemplo de cada sistema simulado, con las mismas facturas.
  const ej = gen.crearFacturas({ semilla: SEMILLA_EJEMPLOS, n: 18, fecha_corte: FECHA_CORTE, prob_disputa: 0.1 });
  archivos['datos-ficticios/ejemplos/sistema-a-facturas-pendientes.csv'] = gen.renderizar(ej, 'A').texto;
  archivos['datos-ficticios/ejemplos/sistema-b-export_facturas.csv'] = gen.renderizar(ej, 'B').texto;
  archivos['datos-ficticios/ejemplos/sistema-c-pendientes.tsv'] = gen.renderizar(ej, 'C').texto;
  archivos['datos-ficticios/ejemplos/sistema-x-filas.json'] = JSON.stringify(gen.renderizar(ej, 'X').filas, null, 2) + '\n';
  archivos['datos-ficticios/ejemplos/configuracion-ejemplo.json'] = JSON.stringify(configEjemplo(), null, 2) + '\n';
  return { archivos, informe: p, envio, facturas, ejemplos: ej };
}

function main() {
  const verificar = process.argv.includes('--verificar');
  const { archivos } = construir();
  let distintos = 0;
  for (const [rel, contenido] of Object.entries(archivos)) {
    const ruta = path.join(RAIZ, rel);
    const actual = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : null;
    if (actual === contenido) { console.log('  igual      ' + rel); continue; }
    distintos++;
    if (verificar) { console.log('  DIFERENTE  ' + rel); continue; }
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(ruta, contenido);
    console.log('  escrito    ' + rel);
  }
  if (verificar && distintos) { console.error('\n' + distintos + ' archivo(s) desactualizados: ejecutar «node demo/generar-demo.js».'); process.exit(1); }
}

if (require.main === module) main();
module.exports = { construir, FECHA_CORTE, SEMILLA_DEMO, SEMILLA_EJEMPLOS, ENLACE_EJEMPLO };
