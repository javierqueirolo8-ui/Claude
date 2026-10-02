'use strict';
/* Casos de entrada para cada operación del envoltorio del núcleo (las siete que usa el flujo de un cliente), y la forma de
   llamar directamente a los módulos para compararlas. Los usan envoltorio.test.js (fuentes y paquete) y bundle.test.js. */
const { plano } = require('./cargar');
const gen = require('../datos-ficticios/generador');
const { configEjemplo } = require('../datos-ficticios/config-ejemplo');

const CORTE = '2026-10-05';
const AHORA = '2026-10-05T11:30:00Z';
const FIN = '2026-10-05T11:30:04Z';
const HUELLA = 'c'.repeat(64);
const GUARDIAS = { permitido: true, dry_run: true };
const CONTROL_ON = { interruptor: 'on', dry_run: 'true' };
const ENLACE = 'https://drive.google.com/file/d/EjemploFicticioDeInforme0001/view';
const CLAVE_A = 'demo-01|2026-W41|' + HUELLA;

const config = () => configEjemplo();
const csv = gen.renderizar(gen.crearFacturas({ semilla: 7, n: 24, fecha_corte: CORTE, prob_disputa: 0.1 }), 'A').texto;
const contenido = () => ({ formato: 'csv', texto: csv });
const archivoDrive = () => ({ id: 'ArchivoFicticio0000000001', name: 'facturas-pendientes.csv', mimeType: 'text/csv', size: '4096', modifiedTime: '2026-10-05T09:00:00Z' });

// D: contexto con los módulos cargados (fuentes o paquete). Devuelve { operacion: { directo, validos } }.
function crearCasos(D) {
  const preparado = () => plano(D.Cobranza.preparar({ config: config(), guardias: GUARDIAS, fecha_corte: CORTE, contenido: contenido() }));
  const armado = (extra = {}) => ({
    config: config(), guardias: GUARDIAS, fecha_corte: CORTE, fecha_exportacion: '2026-10-04', tipo: 'informe', preparado: preparado(), enlace_informe: ENLACE,
    hash_archivo: HUELLA, iniciada_utc: AHORA, terminada_utc: FIN, ...extra
  });
  return {
    iniciar: { directo: (e) => D.Cobranza.iniciar(e), validos: () => [
      { config: config(), filas_control: [CONTROL_ON], filas_bloqueo: [], ahora_utc: AHORA },
      { config: config(), filas_control: [{ interruptor: 'off' }], filas_bloqueo: [], ahora_utc: AHORA },
      { config: config(), filas_control: [CONTROL_ON], filas_bloqueo: [{ cliente_id: 'demo-01', expira_utc: '2026-10-05T11:45:00Z' }], ahora_utc: AHORA },
      { config: config(), filas_control: [CONTROL_ON], filas_bloqueo: [{ cliente_id: 'demo-01', expira_utc: '2026-10-05T11:00:00Z' }], ahora_utc: AHORA },
      { config: { ...config(), entrega: 'papel' }, filas_control: [CONTROL_ON], filas_bloqueo: [], ahora_utc: AHORA }
    ] },
    elegir_archivo: { directo: (e) => D.Cobranza.elegirArchivo(e), validos: () => [
      { config: config(), archivos: [archivoDrive()], fecha_corte: CORTE },
      { config: config(), archivos: [], fecha_corte: CORTE }
    ] },
    decidir_aviso: { directo: (e) => D.Cobranza.decidirAviso(e), validos: () => [
      { config: config(), fecha_corte: '2026-10-07', filas_libro: [] },
      { config: config(), fecha_corte: '2026-10-05', filas_libro: [] },
      { config: config(), fecha_corte: '2026-10-07', filas_libro: [{ clave: 'demo-01|2026-W41|' + '0'.repeat(64), estado: 'incidencia' }] }
    ] },
    decidir_procesado: { directo: (e) => D.Cobranza.decidirProcesado(e), validos: () => [
      { cliente_id: 'demo-01', fecha_exportacion: CORTE, hash_archivo: HUELLA, esperado_bytes: 4096, recibido_bytes: 4096, filas_libro: [] },
      { cliente_id: 'demo-01', fecha_exportacion: CORTE, hash_archivo: HUELLA, esperado_bytes: '4096', recibido_bytes: 4096, filas_libro: [{ clave: CLAVE_A, estado: 'ok' }] },
      { cliente_id: 'demo-01', fecha_exportacion: CORTE, hash_archivo: HUELLA, esperado_bytes: 4096, recibido_bytes: 100, filas_libro: [] }
    ] },
    preparar: { directo: (e) => D.Cobranza.preparar(e), validos: () => [
      { config: config(), guardias: GUARDIAS, fecha_corte: CORTE, contenido: contenido() },
      { config: { ...config(), modo: 'real' }, guardias: { permitido: true, dry_run: false }, fecha_corte: CORTE, contenido: contenido() },
      { config: config(), guardias: GUARDIAS, fecha_corte: CORTE, contenido: { formato: 'csv', texto: 'Columna ajena\n1\n' } }
    ] },
    armar_envio: { directo: (e) => D.Cobranza.armarEnvio(e), validos: () => [
      armado(), armado({ tipo: 'sin_archivo', preparado: undefined, enlace_informe: undefined, fecha_exportacion: undefined, hash_archivo: undefined })
    ] },
    error: { directo: (e) => D.Cobranza.manejarError(e), validos: () => [
      { codigo: 'E_DRIVE_LISTAR', contexto: { cliente_id: 'demo-01', workflow: '[COB-DEV] Shell demo-01', nodo: 'Listar carpeta', ejecucion_id: 4711 }, operador: 'javier@ejemplo.example',
        cliente_id: 'demo-01', fecha_corte: CORTE, iniciada_utc: AHORA, terminada_utc: FIN, guardias: GUARDIAS, modo_cliente: 'dry_run' },
      { codigo: 'E_CFG_INVALIDA', contexto: { cliente_id: 'demo-01' }, operador: 'javier@ejemplo.example', problemas: ['E_CFG_ENTREGA', 'E_CFG_ZONA'] },
      { codigo: 'E_DESCARGA_INCOMPLETA', contexto: { cliente_id: 'demo-01' }, operador: 'javier@ejemplo.example', cliente_id: 'demo-01', fecha_corte: CORTE, hash_archivo: HUELLA,
        iniciada_utc: AHORA, terminada_utc: FIN }
    ] }
  };
}

module.exports = { crearCasos, CORTE, AHORA, FIN, HUELLA, GUARDIAS, CONTROL_ON, ENLACE, CLAVE_A, config, contenido, archivoDrive };
