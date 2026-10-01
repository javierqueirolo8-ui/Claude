#!/usr/bin/env node
'use strict';
/* Escenarios de prueba del flujo «[COB-DEV] Shell demo-01» en n8n (Etapa 2), con lo que DEBE dejar cada uno.

   Cada escenario es un cliente ficticio («esc-…») y una secuencia de pasos (cada paso = una corrida del flujo del día): en qué
   momento corre, qué archivos aparecen en su carpeta antes, qué falla, qué dice la tabla de control. Los mismos pasos se corren en
   el simulador (el gemelo digital de tests/simulador.js) y de ahí sale lo esperado: el estado final del día y la huella
   SHA-256 de lo que queda en las tablas (correos, libro, carpeta de salida, bloqueos; forma canónica de n8n/canonico.js).
   Después se corren los mismos pasos en n8n y el flujo «[COB-DEV] Utilidades de prueba» compara las huellas.

   Uso:  node n8n/escenarios.js lista                       todos los pasos y su resultado esperado
         node n8n/escenarios.js capa <k> <fase>             todo lo que hay que cargar y correr en el paso k (1, 2…) de la fase 1 o 2
         node n8n/escenarios.js paso <id> <k>               un paso suelto
         node n8n/escenarios.js roturas                     las roturas de la fase 3 (todas de una vez, y cómo deshacerlas) y qué debe pasar con cada cliente
   No usa red, no lee datos reales y no toca n8n: solo imprime (JSON solo ASCII, para copiarlo sin perder caracteres). */

const crypto = require('node:crypto');
const gen = require('../datos-ficticios/generador');
const { configEjemplo } = require('../datos-ficticios/config-ejemplo');
const { Mundo, Drive, archivo, correr, OPERADOR } = require('../tests/simulador');
const { canonico } = require('./canonico');
const { ID_NUCLEO } = require('./generar-shell');

const NOMBRE_FLUJO = '[COB-DEV] Shell demo-01';
const CORTE = '2026-10-05';
const T = {
  lun: '2026-10-05T11:30:00Z', mar: '2026-10-06T11:30:00Z', mie: '2026-10-07T11:30:00Z', jue: '2026-10-08T11:30:00Z',
  vie: '2026-10-09T11:30:00Z', dom: '2026-10-11T11:30:00Z', lun2: '2026-10-12T11:30:00Z'
};
const EXPORTADO = '2026-10-05T10:00:00.000Z';
const TABLAS_N8N = {
  drive_entrada: 'gx9QucLTIVK0kNPj', bloqueos: 'NQNeSCk8tT6X5Xi0', config_global: 'QwqxYPJEHhvOrd7I',
  correos: 'QVZ4CUDQV3IDDfVl', ejecuciones: '2GT1BchlLsjE7l7l', drive_salida: 'lwZctpwq1ExDRTYY'
};
const FLUJOS_N8N = { shell: 'T4jgwUA1GTF4W84h', utilidades: '2jlMgjv2cYV7FcoA' };

// Cómo rotula el flujo real el nodo de cada error (mapa fijo de códigos → nombre; lo demás viene del núcleo).
const NODO_DEL_SHELL = {
  E_TABLA_LEER: 'Tablas', E_TABLA_ESCRIBIR: 'Tablas', E_DRIVE_LISTAR: 'Carpeta de entrada', E_DRIVE_DESCARGAR: 'Carpeta de entrada',
  E_ARCHIVO_AMBIGUO: 'Carpeta de entrada', E_DRIVE_SUBIR: 'Carpeta de salida', E_CORREO_ENVIAR: 'Correo', E_HUELLA: 'Huella',
  E_NUCLEO_FALLO: 'Núcleo', E_FLUJO_FALLO: 'Flujo'
};
const etiquetaNodo = (codigo) => NODO_DEL_SHELL[codigo] || 'Núcleo';

/* ------------------------------------------------------------ piezas de los escenarios */

const facs = (semilla, n = 4, extra = {}) => gen.crearFacturas({ semilla, n, fecha_corte: CORTE, ...extra });
const csv = (fs) => gen.renderizar(fs, 'A').texto;
const CABECERA = gen.CABECERAS.A.join(';') + '\r\n';
// Corte de una descarga en un byte que no parte un carácter (así el texto cortado vuelve a dar los mismos bytes).
function corteAscii(texto, cerca) {
  const b = Buffer.from(texto, 'utf8');
  for (let i = Math.min(cerca, b.length - 1); i > 0; i--) if (b[i - 1] < 0x80 && b[i] < 0x80) return i;
  throw new Error('sin corte posible');
}
const MALO = (texto) => texto.split('\r\n').map((l, i) => (i === 0 || l === '' ? l : l.split(';').map((c, k) => (k === 5 ? '31/02/2026' : c)).join(';'))).join('\r\n');
const X = gen.renderizar(facs(4, 4), 'X');
const CONFIG_X = (() => { const c = gen.configPara('X', configEjemplo()); delete c.cliente_id; return c; })();
const ARCH = (texto, modificado = EXPORTADO, extra = {}) => ({ texto, modificado, ...extra });
const ON = [{ interruptor: 'on', dry_run: 'true' }];
const CORTE_19 = corteAscii(csv(facs(9, 5)), 400);
// El archivo hostil del generador, con la fila de texto larguísimo acortada a 150 caracteres (sigue pasando el límite, y se puede copiar sin errores).
const HOSTIL = gen.csvConHostiles(facs(6, 3), CORTE).texto.replace(/x{100,}/, '0123456789'.repeat(15));

/* Los escenarios. `espera` = estado del día que se espera en cada paso (se comprueba contra el simulador al cargar este módulo:
   si el escenario está mal armado, falla acá y no contra n8n). fase 1 = tabla de control normal («on», «true»); fase 2 = el paso
   cambia la tabla de control (global) y por eso se corre uno por vez. */
// Cómo se rompe cada pieza en el flujo real (y cómo se vuelve a dejar): se cambia UN valor de UN nodo.
const ORIGINAL_PREPARAR_INFORME = "const ctx = $(\"DEV · Entrada\").first(0).json;\nconst ini = $(\"Núcleo · iniciar\").first(0).json.resultado;\nconst descarga = $(\"Drive · descargar (simulado)\").first(0).json;\nconst contenido = descarga.formato === 'xlsx' ? { formato: 'filas', filas: descarga.filas } : { formato: 'csv', texto: descarga.texto };\nreturn [{ json: { op: 'preparar', entrada: { config: ctx.config, guardias: { permitido: ini.guardias.permitido, dry_run: ini.guardias.dry_run }, fecha_corte: ini.fecha_corte, contenido: contenido } } }];\n";
// Una rotura vale SOLO para su cliente de prueba: el valor del nodo pasa a ser una expresión que, para ese cliente, apunta a algo que NO existe
// (una tabla o un subflujo con ese nombre no existen: el servicio de n8n responde «no encontrado») y, para cualquier otro, vale lo de siempre.
// Así las roturas de todos los escenarios se aplican de una vez, se corren en cualquier orden y se deshacen de una vez.
// Lección de la primera corrida contra n8n: una expresión que FALLA al evaluarse (`$json.no_existe.x`) NO hace fallar el nodo de tablas: n8n leyó
// OTRA tabla (la de bloqueos) y la lectura salió «bien», con datos ajenos (el núcleo los rechazó por su forma: E_LIBRO_INVALIDO). Por eso lo roto es un
// nombre que no existe, nunca una expresión que falla. (Y por eso el flujo real usa SIEMPRE nombres fijos, nunca expresiones.)
const CLIENTE_ACTUAL = "$('DEV · Entrada').first(0).json.config.cliente_id";
const TABLA_INEXISTENTE = 'cob_dev_no_existe';
const SUBFLUJO_INEXISTENTE = 'NoExisteElSubflujo01';
const rotura = (cliente, roto, original) => '={{ ' + CLIENTE_ACTUAL + " === '" + cliente + "' ? '" + roto + "' : '" + original + "' }}";
const MUT = {
  leerControl: { cliente: 'esc-f7', nodo: 'Leer interruptor general', ruta: '/dataTableId/value', original: 'cob_dev_config_global', malo: TABLA_INEXISTENTE, roto: rotura('esc-f7', TABLA_INEXISTENTE, 'cob_dev_config_global') },
  leerLibro: { cliente: 'esc-f6', nodo: 'Leer libro del cliente', ruta: '/dataTableId/value', original: 'cob_dev_ejecuciones', malo: TABLA_INEXISTENTE, roto: rotura('esc-f6', TABLA_INEXISTENTE, 'cob_dev_ejecuciones') },
  escribirLibro: { cliente: 'esc-f2', nodo: 'Escribir libro', ruta: '/dataTableId/value', original: 'cob_dev_ejecuciones', malo: TABLA_INEXISTENTE, roto: rotura('esc-f2', TABLA_INEXISTENTE, 'cob_dev_ejecuciones') },
  nucleoDecidir: { cliente: 'esc-f3', nodo: 'Núcleo · decidir procesado', ruta: '/workflowId/value', original: ID_NUCLEO, malo: SUBFLUJO_INEXISTENTE, roto: rotura('esc-f3', SUBFLUJO_INEXISTENTE, ID_NUCLEO) },
  huella: { cliente: 'esc-f4', nodo: 'Huella SHA-256', ruta: '/type', original: 'SHA256', malo: 'SHA999', roto: rotura('esc-f4', 'SHA999', 'SHA256') },
  flujoPreparar: { cliente: 'esc-f5', nodo: 'Preparar informe', ruta: '/jsCode', original: ORIGINAL_PREPARAR_INFORME,
    roto: 'if (' + CLIENTE_ACTUAL + " === 'esc-f5') throw new Error('inyectado');\n" + ORIGINAL_PREPARAR_INFORME },
  nucleoError: { cliente: 'esc-f8', nodo: 'Núcleo · error', ruta: '/workflowId/value', original: ID_NUCLEO, malo: SUBFLUJO_INEXISTENTE, roto: rotura('esc-f8', SUBFLUJO_INEXISTENTE, ID_NUCLEO) }
};

const ESCENARIOS = [
  { id: 'esc-01', titulo: 'Camino feliz, repeticiones, archivo corregido y semana siguiente', pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(1)))], espera: 'informe_enviado' },
    { ahora: T.lun, espera: 'ya_procesado' },
    { ahora: T.mar, espera: 'ya_procesado' },
    { ahora: T.mar, archivos: [ARCH(csv(facs(1, 5)), '2026-10-05T13:00:00.000Z')], espera: 'informe_enviado' },
    { ahora: T.mie, espera: 'ya_procesado' },
    { ahora: T.lun2, archivos: [ARCH(csv(facs(2, 4)), '2026-10-12T10:00:00.000Z')], espera: 'informe_enviado' }
  ] },
  { id: 'esc-02', titulo: 'Hoja de cálculo (.xlsx) por el mismo camino', config: CONFIG_X, pasos: [
    { ahora: T.lun, archivos: [{ nombre: 'facturas.xlsx', filas: X.filas, modificado: EXPORTADO }], espera: 'informe_enviado' }
  ] },
  { id: 'esc-04', titulo: 'Informe completo por correo, en ensayo: el adjunto solo a la bandeja de pruebas', config: { entrega: 'correo_completo' }, pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(5)))], espera: 'informe_enviado' }
  ] },
  { id: 'esc-06', titulo: 'Configuración inválida: Javier recibe los códigos, el dueño nada', config: { entrega: 'papel', destinatarios_permitidos: [] }, pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(6)))], espera: 'detenida' }
  ] },
  { id: 'esc-06b', titulo: 'Zona horaria inválida: ni siquiera se puede calcular la fecha', config: { entrega: 'papel', zona_horaria: 'Marte/Olimpo', destinatarios_permitidos: [] }, pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(6)))], espera: 'error' }
  ] },
  { id: 'esc-07', titulo: 'Columna ausente: incidencia, no se repite, y el cliente corrige', pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(3)).replace('Saldo', 'Monto total'))], espera: 'incidencia_enviada' },
    { ahora: T.mar, espera: 'ya_procesado' },
    { ahora: T.jue, archivos: [ARCH(csv(facs(3)), '2026-10-07T10:00:00.000Z')], espera: 'informe_enviado' }
  ] },
  { id: 'esc-08', titulo: 'Demasiadas filas ilegibles: incidencia y no un informe engañoso', pasos: [
    { ahora: T.lun, archivos: [ARCH(MALO(csv(facs(2, 4))))], espera: 'incidencia_enviada' }
  ] },
  { id: 'esc-09', titulo: 'Archivo solo con cabecera: incidencia', pasos: [
    { ahora: T.lun, archivos: [ARCH(CABECERA)], espera: 'incidencia_enviada' }
  ] },
  { id: 'esc-10', titulo: 'Sin archivo: espera lunes y martes, avisa el miércoles, no repite, semana siguiente desde cero', pasos: [
    { ahora: T.lun, espera: 'sin_archivo_esperar' },
    { ahora: T.mar, espera: 'sin_archivo_esperar' },
    { ahora: T.mie, espera: 'aviso_sin_archivo' },
    { ahora: T.jue, espera: 'sin_archivo_omitir_ya_avisado' },
    { ahora: T.vie, espera: 'sin_archivo_omitir_ya_avisado' },
    { ahora: T.lun2, espera: 'sin_archivo_esperar' }
  ] },
  { id: 'esc-10b', titulo: 'El archivo llega después del aviso y se procesa con normalidad', pasos: [
    { ahora: T.mie, espera: 'aviso_sin_archivo' },
    { ahora: T.jue, archivos: [ARCH(csv(facs(7)), '2026-10-08T10:00:00.000Z')], espera: 'informe_enviado' }
  ] },
  { id: 'esc-11', titulo: 'Un archivo demasiado viejo cuenta como «no llegó»', pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(8)), '2026-09-20T10:00:00.000Z')], espera: 'sin_archivo_esperar' },
    { ahora: T.mie, espera: 'aviso_sin_archivo' }
  ] },
  { id: 'esc-12', titulo: 'El día del aviso es configurable', config: { dia_aviso_sin_archivo: 1 }, pasos: [
    { ahora: T.lun, espera: 'aviso_sin_archivo' }
  ] },
  { id: 'esc-13', titulo: 'Archivos que no sirven (tipo, vacío) no se leen y no impiden avisar', pasos: [
    { ahora: T.mie, archivos: [{ nombre: 'notas.pdf', mimeType: 'application/pdf', texto: 'x', modificado: EXPORTADO }, { nombre: 'facturas.csv', texto: '', modificado: EXPORTADO }], espera: 'aviso_sin_archivo' }
  ] },
  { id: 'esc-14', titulo: 'Con un bloqueo activo no se hace nada', pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(1)))], bloqueo: '2026-10-05T12:00:00Z', espera: 'omitida_en_curso' }
  ] },
  { id: 'esc-15', titulo: 'Con un bloqueo vencido se avisa a Javier cada día hasta que se limpia', pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(1)))], bloqueo: '2026-10-05T11:00:00Z', espera: 'bloqueo_vencido' },
    { ahora: T.mar, espera: 'bloqueo_vencido' },
    { ahora: T.mie, soltarBloqueos: true, espera: 'informe_enviado' }
  ] },
  { id: 'esc-16', titulo: 'Correo caído: error, libro de error, sin aviso posible; al volver se envía UNA vez', pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(1)))], fallos: ['enviar'], espera: 'error' },
    { ahora: T.mar, espera: 'informe_enviado' },
    { ahora: T.mie, espera: 'ya_procesado' }
  ] },
  { id: 'esc-17', titulo: 'Carpeta sin permiso: código propio', pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(1)))], fallos: ['listar'], espera: 'error' }
  ] },
  { id: 'esc-18', titulo: 'Falla la descarga del archivo', pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(1)))], fallos: ['descargar'], espera: 'error' }
  ] },
  { id: 'esc-19', titulo: 'Descarga cortada a mitad: no se procesa un archivo incompleto; el siguiente intento sí', pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(9, 5)), EXPORTADO, { corte: CORTE_19 })], espera: 'error' },
    { ahora: T.mar, archivos: [ARCH(csv(facs(9, 5)), '2026-10-06T09:00:00.000Z')], espera: 'informe_enviado' }
  ] },
  { id: 'esc-20', titulo: 'Dos archivos igual de recientes: no se elige a ciegas', pasos: [
    { ahora: T.lun, archivos: [{ nombre: 'facturas-uyu.csv', texto: csv(facs(1, 4)), modificado: EXPORTADO }, { nombre: 'facturas-usd.csv', texto: csv(facs(2, 4)), modificado: EXPORTADO }], espera: 'error' }
  ] },
  { id: 'esc-21', titulo: 'Falla al subir el informe: no se envía nada al dueño', pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(1)))], fallos: ['subir'], espera: 'error' }
  ] },
  { id: 'esc-22', titulo: 'Sin operador válido la alerta no sale, pero queda constancia', pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(1)))], fallos: ['listar'], operador: 'Javier@Mal Escrito', espera: 'error' }
  ] },
  { id: 'esc-23', titulo: 'Un archivo guardado el domingo 23:30 en Montevideo es de la semana anterior', pasos: [
    { ahora: '2026-10-12T11:30:00Z', archivos: [ARCH(csv(facs(1)), '2026-10-12T02:30:00.000Z')], espera: 'informe_enviado' }
  ] },
  { id: 'esc-24', titulo: 'La fecha de corte es la local del cliente (domingo 20:30)', pasos: [
    { ahora: '2026-10-11T23:30:00Z', archivos: [ARCH(csv(facs(1)), '2026-10-11T12:00:00.000Z')], espera: 'informe_enviado' }
  ] },
  { id: 'esc-25', titulo: 'Un archivo con filas hostiles produce un informe seguro', config: { umbral_rechazo: 100 }, pasos: [
    { ahora: T.lun, archivos: [ARCH(HOSTIL)], espera: 'informe_enviado' }
  ] },
  { id: 'esc-26', titulo: 'Modo real con informe completo por correo exige aceptación expresa antes de arrancar', config: { modo: 'real', entrega: 'correo_completo' }, pasos: [
    { ahora: T.lun, archivos: [ARCH(csv(facs(1)))], espera: 'detenida' }
  ] },
  // ---- fase 3: una pieza de infraestructura rota a propósito (el flujo se modifica un rato y se vuelve a dejar como estaba)
  ...[
    ['f7', 'leer_control', 'Falla la lectura de la tabla de control, lo primero de todo', MUT.leerControl, {}],
    ['f6', 'leer_libro', 'Falla la lectura del libro con el bloqueo ya tomado', MUT.leerLibro, {}],
    ['f2', 'escribir_libro', 'Falla la escritura del libro DESPUÉS de enviar', MUT.escribirLibro, {}],
    ['f3', 'nucleo_decidir', 'Falla la llamada al núcleo (el subflujo no responde)', MUT.nucleoDecidir, {}],
    ['f4', 'huella', 'Falla el cálculo de la huella', MUT.huella, {}],
    ['f5', 'flujo_preparar', 'Falla un nodo propio del flujo', MUT.flujoPreparar, {}],
    ['f8', 'nucleo_error', 'Falla la carpeta y TAMBIÉN el manejo del error (el núcleo no responde): día en error visible, sin aviso posible y con el bloqueo liberado', MUT.nucleoError,
      { fallos: ['listar'], espera: 'fallo_visible' }]
  ].map(([n, punto, titulo, mutacion, paso]) => ({
    id: 'esc-' + n, fase: 3, titulo, inyectar: punto, mutacion, pasos: [Object.assign({ ahora: T.lun, archivos: [ARCH(csv(facs(1)))], espera: 'error' }, paso)]
  })),
  // ---- fase 2: cambian la tabla de control (global)
  ...[['a', 'true', 'dry_run'], ['b', 'true', 'real'], ['c', 'false', 'dry_run'], ['d', 'false', 'real']].map(([l, dry, modo]) => ({
    id: 'esc-03' + l, fase: 2, titulo: 'Llave doble: control dry_run=' + dry + ' y cliente en modo ' + modo, config: { modo }, pasos: [
      { ahora: T.lun, control: [{ interruptor: 'on', dry_run: dry }], archivos: [ARCH(csv(facs(3)))], espera: 'informe_enviado' }
    ] })),
  { id: 'esc-05a', fase: 2, titulo: 'Interruptor general apagado: no se toca nada', pasos: [
    { ahora: T.lun, control: [{ interruptor: 'off', dry_run: 'false' }], archivos: [ARCH(csv(facs(1)))], espera: 'detenida' }
  ] },
  { id: 'esc-05b', fase: 2, titulo: 'Tabla de control vacía: falla cerrada', pasos: [
    { ahora: T.lun, control: [], archivos: [ARCH(csv(facs(1)))], espera: 'detenida' }
  ] },
  { id: 'esc-05c', fase: 2, titulo: 'Tabla de control con dos filas: falla cerrada', pasos: [
    { ahora: T.lun, control: [{ interruptor: 'on', dry_run: 'true' }, { interruptor: 'on', dry_run: 'true' }], archivos: [ARCH(csv(facs(1)))], espera: 'detenida' }
  ] },
  { id: 'esc-05d', fase: 2, titulo: 'Valor desconocido en el interruptor: falla cerrada', pasos: [
    { ahora: T.lun, control: [{ interruptor: 'quizás', dry_run: 'true' }], archivos: [ARCH(csv(facs(1)))], espera: 'detenida' }
  ] },
  { id: 'esc-26b', fase: 2, titulo: 'Modo real aceptado: el informe completo va al dueño (correo simulado)', config: { modo: 'real', entrega: 'correo_completo', acepta_correo_completo: true }, pasos: [
    { ahora: T.lun, control: [{ interruptor: 'on', dry_run: 'false' }], archivos: [ARCH(csv(facs(1)))], espera: 'informe_enviado' }
  ] }
];

/* ------------------------------------------------------------ el simulador corre los escenarios */

const sha256 = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

function filaEntrada(cliente, a) {
  return {
    cliente_id: cliente, archivo_id: a.meta.id, nombre: a.meta.name, mime_type: a.meta.mimeType, tamano: a.meta.size, modificado: a.meta.modifiedTime,
    contenido: a.filas ? '' : a.contenido.toString('utf8'), filas_json: a.filas ? JSON.stringify(a.filas) : '', corte_bytes: a.cortarEn !== undefined ? a.cortarEn : null
  };
}

// Lo que dejó el simulador, en las mismas tablas y columnas que deja n8n.
function tablasDeMundo(m, cliente) {
  const correos = [];
  m.correo.enviados.forEach((msg) => msg.para.forEach((para) => correos.push({
    tipo: msg.tipo, cliente_id: cliente, para, asunto: msg.asunto, cuerpo_texto: msg.cuerpo_texto,
    adjunto_nombre: msg.adjunto ? msg.adjunto.nombre : '', adjunto_bytes: msg.adjunto ? Buffer.byteLength(msg.adjunto.contenido, 'utf8') : 0, creado_utc: msg.creado_utc
  })));
  // con el correo caído el aviso a Javier no sale: el flujo de pruebas deja una fila «operador_fallido» con el intento
  m.sinEnviar.filter((s) => s.motivos && s.motivos.join() === 'CORREO_CAIDO').forEach((s) => correos.push({
    tipo: 'operador_fallido', cliente_id: cliente, para: s.envio.destinatarios.join(','), asunto: s.texto.asunto, cuerpo_texto: s.texto.cuerpo_texto,
    adjunto_nombre: '', adjunto_bytes: 0, creado_utc: s.creado_utc
  }));
  return {
    correos, libro: m.libro.slice(),
    salida: m.drive.subidos.map((s) => ({ cliente_id: cliente, nombre: s.nombre, contenido: s.contenido, creado_utc: s.creado_utc })),
    bloqueos: [...m.bloqueos.values()]
  };
}

function simular(esc) {
  const cliente = esc.id;
  const base = { ...configEjemplo(), ...(esc.config || {}), cliente_id: cliente };
  const m = new Mundo({ config: base, drive: new Drive([]), nombreFlujo: NOMBRE_FLUJO, etiquetaNodo, inyectar: esc.inyectar || null });
  let nArchivo = 0;
  return esc.pasos.map((p, i) => {
    const filas = { drive_entrada: [], bloqueos: [] };
    (p.archivos || []).forEach((spec) => {
      const a = archivo({ nombre: spec.nombre, texto: spec.texto, filas: spec.filas, modificado: spec.modificado, mimeType: spec.mimeType, cortarEn: spec.corte });
      a.meta.id = 'ArchSim' + cliente.replace(/[^a-z0-9]/gi, '') + 'N' + String(++nArchivo).padStart(3, '0');
      m.drive.archivos.push(a);
      filas.drive_entrada.push(filaEntrada(cliente, a));
    });
    if (p.bloqueo) { m.bloqueos.set(cliente, { cliente_id: cliente, expira_utc: p.bloqueo }); filas.bloqueos.push({ cliente_id: cliente, expira_utc: p.bloqueo }); }
    if (p.soltarBloqueos) m.bloqueos.delete(cliente);
    const fallos = p.fallos || [];
    m.config = { ...base, ...(p.config || {}) };
    if (p.control) m.filasControl = p.control;
    m.drive.falloLista = fallos.includes('listar');
    m.drive.falloDescarga = fallos.includes('descargar');
    m.drive.falloSubida = fallos.includes('subir');
    m.correo.caido = fallos.includes('enviar');
    m.operador = p.operador !== undefined ? p.operador : OPERADOR;

    const antes = { c: m.correo.enviados.length, s: m.sinEnviar.length, u: m.drive.subidos.length };
    const fin = correr(m, p.ahora);
    m.correo.enviados.slice(antes.c).forEach((x) => { x.creado_utc = p.ahora; });
    m.sinEnviar.slice(antes.s).forEach((x) => { x.creado_utc = p.ahora; });
    m.drive.subidos.slice(antes.u).forEach((x) => { x.creado_utc = p.ahora; });

    const texto = canonico(tablasDeMundo(m, cliente));
    const n = { correos: tablasDeMundo(m, cliente).correos.length, libro: m.libro.length, salida: m.drive.subidos.length, bloqueos: m.bloqueos.size };
    const esperado = {};
    Object.keys(texto).forEach((t) => { esperado[t] = { n: n[t], hash: sha256(texto[t]) }; });
    const pedido = { config: { cliente_id: cliente, ...(esc.config || {}), ...(p.config || {}) }, ahora_utc: p.ahora, fallos, operador: p.operador !== undefined ? p.operador : OPERADOR };
    return { id: cliente, paso: i + 1, fase: esc.fase || 1, mutacion: esc.mutacion || null, titulo: esc.titulo, ahora: p.ahora, control: p.control, soltarBloqueos: !!p.soltarBloqueos, insertar: filas, pedido, fin, esperado, espera: p.espera };
  });
}

const SIMULADO = {};
ESCENARIOS.forEach((esc) => {
  if (!/^esc-[a-z0-9-]{1,30}$/.test(esc.id)) throw new Error('id de escenario inválido: ' + esc.id);
  if (SIMULADO[esc.id]) throw new Error('escenario repetido: ' + esc.id);
  SIMULADO[esc.id] = simular(esc);
  SIMULADO[esc.id].forEach((p) => {
    if (p.espera && p.fin.estado !== p.espera) throw new Error(p.id + ' paso ' + p.paso + ': el simulador dio «' + p.fin.estado + '» y el escenario esperaba «' + p.espera + '»');
  });
});

/* ------------------------------------------------------------ salida para copiar */

const ascii = (x) => JSON.stringify(x).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

function imprimirPaso(p) {
  const fin = Object.assign({}, p.fin);
  console.log('### ' + p.id + ' · paso ' + p.paso + ' · ' + p.ahora + ' · ' + p.titulo);
  if (p.control) console.log('  0) poner_control (utilidades): ' + ascii({ accion: 'poner_control', filas: p.control.map((f) => ({ ...f, actualizado_utc: '2026-10-05T00:00:00Z' })) }));
  if (p.mutacion) {
    console.log('  M) romper:    ' + ascii([{ type: 'setNodeParameter', nodeName: p.mutacion.nodo, path: p.mutacion.ruta, value: p.mutacion.roto }]));
    console.log('  R) restaurar: ' + ascii([{ type: 'setNodeParameter', nodeName: p.mutacion.nodo, path: p.mutacion.ruta, value: p.mutacion.original }]));
  }
  if (p.soltarBloqueos) console.log('  0) limpiar_bloqueos (utilidades): ' + ascii({ accion: 'limpiar_bloqueos', cliente_id: p.id }));
  console.log('  1) shell, pin del disparador: ' + ascii({ 'Disparador manual': [{ json: p.pedido }] }));
  console.log('  2) fin esperado: ' + ascii(fin));
  console.log('  3) verificar (utilidades), pin del disparador: ' + ascii({ 'Disparador manual': [{ json: { accion: 'verificar', cliente_id: p.id, esperado: p.esperado } }] }));
}

function main() {
  const [cmd, a, b] = process.argv.slice(2);
  const todos = Object.values(SIMULADO).flat();
  if (cmd === 'lista') {
    todos.forEach((p) => console.log((p.id + ' #' + p.paso).padEnd(12) + ' fase ' + p.fase + '  ' + p.ahora + '  ' + JSON.stringify(p.fin).slice(0, 110)));
    console.log('\n' + Object.keys(SIMULADO).length + ' escenarios, ' + todos.length + ' pasos');
  } else if (cmd === 'capa') {
    const k = Number(a), fase = Number(b || 1), parte = process.argv[5];
    const ya = new Set((process.env.YA || '').split(',').filter(Boolean));
    const pasos = todos.filter((p) => p.paso === k && p.fase === fase && !ya.has(p.id + '#' + p.paso));
    const ent = pasos.flatMap((p) => p.insertar.drive_entrada), blo = pasos.flatMap((p) => p.insertar.bloqueos);
    console.log('## CAPA ' + k + ' · fase ' + fase + ' · ' + pasos.length + ' pasos' + (parte ? ' · parte ' + parte : ''));
    if ((!parte || parte === 'entrada') && ent.length) console.log('-- add_data_table_rows drive_entrada (' + TABLAS_N8N.drive_entrada + '), ' + ent.length + ' filas:\n[' + ent.map((f) => ascii(f)).join(',\n') + ']');
    if ((!parte || parte === 'bloqueos') && blo.length) console.log('-- add_data_table_rows bloqueos (' + TABLAS_N8N.bloqueos + '), ' + blo.length + ' filas:\n' + ascii(blo));
    if (!parte || parte === 'pasos') pasos.forEach(imprimirPaso);
  } else if (cmd === 'roturas') {
    const f3 = todos.filter((p) => p.fase === 3);
    const ops = (campo) => Object.values(MUT).map((m) => ({ type: 'setNodeParameter', nodeName: m.nodo, path: m.ruta, value: m[campo] }));
    console.log('## ROMPER todo de una vez (update_workflow del shell ' + FLUJOS_N8N.shell + '):\n' + ascii(ops('roto')));
    console.log('\n## RESTAURAR todo de una vez:\n' + ascii(ops('original')));
    f3.forEach((p) => {
      console.log('\n### ' + p.id + ' · ' + p.titulo + '\n  1) shell, pin del disparador: ' + ascii({ 'Disparador manual': [{ json: p.pedido }] }) + '\n  2) fin esperado: ' + ascii(p.fin));
      console.log('  3) tablas esperadas: ' + ascii(p.esperado));
    });
  } else if (cmd === 'paso') {
    const p = (SIMULADO[a] || [])[Number(b) - 1];
    if (!p) { console.error('no existe ' + a + ' paso ' + b); process.exit(2); }
    if (p.insertar.drive_entrada.length) console.log('-- drive_entrada:\n' + ascii(p.insertar.drive_entrada));
    if (p.insertar.bloqueos.length) console.log('-- bloqueos:\n' + ascii(p.insertar.bloqueos));
    imprimirPaso(p);
  } else {
    console.error('Uso: node n8n/escenarios.js lista | capa <k> <fase> | paso <id> <k> | roturas');
    process.exit(2);
  }
}

if (require.main === module) main();
module.exports = { ESCENARIOS, SIMULADO, simular, tablasDeMundo, etiquetaNodo, NODO_DEL_SHELL, TABLAS_N8N, FLUJOS_N8N, T, MUT };
