'use strict';
/* Simulador del «shell» del cliente: un gemelo digital de la ejecución diaria en n8n.

   El shell real solo hace entrada y salida (listar y descargar de la carpeta, leer y escribir tablas, enviar
   correo). Aquí esas operaciones son falsas y están en memoria; todo lo demás es el código real del núcleo
   (Cobranza, M0 a M7), cargado en el mismo entorno restringido que en las demás pruebas.

   La ejecución es un generador: cada `yield` es un punto donde, en la realidad, otra ejecución podría
   intercalarse o el servidor podría caerse. Las pruebas de doble ejecución y de caída lo aprovechan. */

const crypto = require('node:crypto');
const { cargar, plano, cargarPaquete } = require('./cargar');

const M = cargar('util', 'm0-guardias', 'm1-normalizar', 'm2-antiguedad', 'm3-borradores', 'm4-informe',
  'm5-guardia-envio', 'm6-registro', 'm7-ingesta', 'pipeline');

/* Cómo habla el shell con el núcleo. Dos formas, con el mismo contrato:
   · normal: llama a las funciones de los módulos (src/);
   · NUCLEO_VIA_PAQUETE=1: manda {op, entrada} al envoltorio del paquete que irá a n8n (n8n/dist) y recibe {ok, resultado} o
     {ok:false, codigo}, igual que hará el subflujo. Con eso toda la batería de extremo a extremo prueba el código de n8n. */
const OPERACIONES = {
  iniciar: ['iniciar', (e) => M.Cobranza.iniciar(e)],
  elegir_archivo: ['elegirArchivo', (e) => M.Cobranza.elegirArchivo(e)],
  decidir_aviso: ['decidirAviso', (e) => M.Cobranza.decidirAviso(e)],
  decidir_procesado: ['decidirProcesado', (e) => M.Cobranza.decidirProcesado(e)],
  preparar: ['preparar', (e) => M.Cobranza.preparar(e)],
  armar_envio: ['armarEnvio', (e) => M.Cobranza.armarEnvio(e)],
  error: ['error', (e) => M.Cobranza.manejarError(e)]
};

function crearNucleo() {
  const paquete = process.env.NUCLEO_VIA_PAQUETE === '1' ? cargarPaquete() : null;
  const nucleo = {};
  for (const [op, [nombre, directo]] of Object.entries(OPERACIONES)) {
    nucleo[nombre] = paquete
      ? (entrada) => {
        const r = plano(paquete.Envoltorio.operar(op, plano(entrada)));
        if (!r.ok) throw Object.assign(new Error(r.codigo), { codigo: r.codigo });
        return r.resultado;
      }
      : (entrada) => plano(directo(entrada));
  }
  nucleo.viaPaquete = paquete !== null;
  return nucleo;
}
const core = crearNucleo();

const OPERADOR = 'javier@ejemplo.example';

/* ------------------------------------------------------------ piezas falsas */

let idArchivo = 0;

function archivo({ nombre = 'facturas-pendientes.csv', texto, filas, bytes, modificado, mimeType, cortarEn } = {}) {
  const contenido = bytes !== undefined ? Buffer.from(bytes) : Buffer.from(texto === undefined ? '' : texto, 'utf8');
  const esXlsx = /\.xlsx$/i.test(nombre);
  return {
    meta: {
      id: 'ArchivoSimulado' + String(++idArchivo).padStart(8, '0'),
      name: nombre,
      mimeType: mimeType || (esXlsx ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : (/\.tsv$/i.test(nombre) ? 'text/tab-separated-values' : 'text/csv')),
      size: String(filas ? Math.max(1, JSON.stringify(filas).length) : contenido.length),
      modifiedTime: modificado
    },
    contenido, filas, cortarEn
  };
}

class Drive {
  constructor(archivos = []) { this.archivos = archivos; this.consultas = 0; this.descargas = 0; this.subidos = []; this.falloSubida = false; this.falloLista = false; this.falloDescarga = false; }
  listar() {
    this.consultas++;
    if (this.falloLista) throw new Error('403 Forbidden: sin permiso sobre la carpeta de Juan Pérez S.A.');
    return this.archivos.map((a) => ({ ...a.meta }));
  }
  descargar(id) {
    this.descargas++;
    if (this.falloDescarga) throw new Error('503 fallo al descargar de la carpeta de Juan Pérez S.A.');
    const a = this.archivos.find((x) => x.meta.id === id);
    if (!a) throw new Error('404 no existe ' + id);
    const bytes = a.cortarEn !== undefined ? a.contenido.subarray(0, a.cortarEn) : a.contenido;
    return { bytes, filas: a.filas };
  }
  subir(nombre, contenido) {
    if (this.falloSubida) throw new Error('500 error al subir ' + nombre);
    const id = 'InformeSubido' + String(this.subidos.length + 1).padStart(8, '0') + 'abcdefgh';
    this.subidos.push({ id, nombre, contenido });
    return 'https://drive.google.com/file/d/' + id + '/view';
  }
}

class Correo {
  constructor() { this.enviados = []; this.caido = false; }
  enviar(msg) {
    // los errores reales de un servidor de correo suelen repetir el destinatario y parte del mensaje
    if (this.caido) throw new Error('550 5.1.1 destinatario ' + msg.para.join(',') + ' rechazado; mensaje: ' + String(msg.cuerpo_texto).slice(0, 80));
    this.enviados.push(JSON.parse(JSON.stringify(msg)));
  }
}

class Mundo {
  constructor({ config, control = { interruptor: 'on', dry_run: 'true' }, drive, correo, operador = OPERADOR, nombreFlujo = 'Cobranza · shell', etiquetaNodo = null, filasControl = null, inyectar = null } = {}) {
    this.config = config;
    this.control = control;
    this.nombreFlujo = nombreFlujo; // cómo se llama el flujo en los avisos
    this.etiquetaNodo = etiquetaNodo; // (código) → nombre del nodo con que el flujo real rotula el error; sin ella, el paso interno
    this.filasControl = filasControl; // si se da, son TAL CUAL las filas que lee la tabla de control (ninguna, varias…)
    this.inyectar = inyectar; // una pieza de infraestructura rota: 'leer_control' | 'leer_libro' | 'escribir_libro' | 'nucleo_decidir' | 'huella' | 'flujo_preparar' | 'nucleo_error'
    this.drive = drive || new Drive();
    this.correo = correo || new Correo();
    this.operador = operador;
    this.libro = [];
    this.bloqueos = new Map();
    this.ejecuciones = 0;
    this.sinEnviar = []; // alertas o mensajes que la guardia no dejó salir
    this.registros = []; // lo que dejaría el shell en sus registros (solo códigos)
  }
  // Todo lo que queda guardado de forma persistente y todo lo que viaja a Javier: no puede tener datos del cliente.
  persistente() {
    return JSON.stringify({
      libro: this.libro, bloqueos: [...this.bloqueos.values()], registros: this.registros,
      alertas: this.correo.enviados.filter((m) => m.tipo === 'operador'), sinEnviar: this.sinEnviar
    });
  }
  aDueno() { return this.correo.enviados.filter((m) => m.tipo === 'dueno'); }
  aOperador() { return this.correo.enviados.filter((m) => m.tipo === 'operador'); }
}

function sumarMinutos(iso, minutos) {
  return new Date(new Date(iso).getTime() + minutos * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/* -------------------------------------------------------------- la ejecución */

// Devuelve un generador; cada yield tiene un nombre de punto para poder intercalar o abortar en él.
function* ejecucion(mundo, ahoraUtc) {
  const { Util } = M;
  const cfg = mundo.config;
  const clienteId = cfg && cfg.cliente_id;
  const contexto = { cliente_id: clienteId, workflow: mundo.nombreFlujo, nodo: 'Inicio', ejecucion_id: ++mundo.ejecuciones };
  let fechaCorte = null, bloqueoTomado = false, hash, guardias = null;
  const iniciada = ahoraUtc;

  const soltar = () => { if (bloqueoTomado) mundo.bloqueos.delete(clienteId); bloqueoTomado = false; };
  // Todo fallo de entrada o salida se convierte en un código propio: el mensaje del servicio externo puede traer datos.
  const io = (codigo, fn) => { try { return fn(); } catch (e) { return Util.fallar(codigo); } };
  const enviar = (tipo, envio, correo) => {
    if (envio.accion === 'no_enviar') { mundo.sinEnviar.push({ tipo, motivos: envio.motivos }); return false; }
    io('E_CORREO_ENVIAR', () => mundo.correo.enviar({ tipo, para: envio.destinatarios, asunto: correo.asunto, cuerpo_texto: correo.cuerpo_texto, adjunto: correo.adjunto }));
    return true;
  };

  try {
    contexto.nodo = 'Arranque';
    if (mundo.inyectar === 'leer_control') Util.fallar('E_TABLA_LEER');
    // Como el flujo: lee la tabla de control y la de bloqueos (filas) y se las pasa tal cual a «iniciar».
    const filasBloqueo = mundo.bloqueos.has(clienteId) ? [mundo.bloqueos.get(clienteId)] : [];
    const arr = core.iniciar({ config: cfg, filas_control: mundo.filasControl || [mundo.control], filas_bloqueo: filasBloqueo, ahora_utc: ahoraUtc });
    fechaCorte = arr.fecha_corte;
    guardias = arr.guardias;
    if (arr.accion === 'error') Util.fallar(arr.codigo);
    if (arr.accion === 'detener') {
      mundo.registros.push({ evento: 'detenida', motivo: arr.motivo, problemas: arr.problemas });
      if (arr.motivo === 'CONFIG_INVALIDA') {
        // configuración mala = aviso a Javier con los códigos a corregir (nunca al dueño)
        // (solo el aviso: sin fecha de corte el núcleo no arma fila de libro, y una configuración mala no toca el libro)
        const a = core.error({ codigo: arr.codigo, contexto, operador: mundo.operador, problemas: arr.problemas }).alerta;
        enviar('operador', a.envio, a.texto);
      }
      return { estado: 'detenida', motivo: arr.motivo, fecha_corte: fechaCorte };
    }
    if (arr.accion === 'omitir_en_curso') { mundo.registros.push({ evento: 'omitida_en_curso' }); return { estado: 'omitida_en_curso', fecha_corte: fechaCorte }; }
    if (arr.accion === 'alertar_bloqueo_vencido') {
      contexto.nodo = 'Bloqueo';
      const a = core.error({ codigo: arr.codigo, contexto, operador: mundo.operador }).alerta; // el bloqueo es de otra ejecución: no se toca ni el libro
      enviar('operador', a.envio, a.texto);
      mundo.registros.push({ evento: 'bloqueo_vencido' });
      return { estado: 'bloqueo_vencido', fecha_corte: fechaCorte };
    }

    mundo.bloqueos.set(clienteId, arr.bloqueo_nuevo); // la fila la arma el núcleo; el flujo solo la escribe
    bloqueoTomado = true;
    yield 'bloqueo_tomado';
    if (mundo.inyectar === 'leer_libro') Util.fallar('E_TABLA_LEER'); // el flujo real lee el libro del cliente justo después de tomar el bloqueo

    contexto.nodo = 'Listar carpeta';
    const listado = io('E_DRIVE_LISTAR', () => mundo.drive.listar());
    const eleccion = core.elegirArchivo({ config: cfg, archivos: listado, fecha_corte: fechaCorte });
    if (eleccion.estado === 'ambiguo') Util.fallar('E_ARCHIVO_AMBIGUO');

    // El flujo lee el libro del cliente (todas sus filas) y se las entrega al núcleo sin interpretar: la decisión la toma él.
    const filasDelLibro = () => mundo.libro.filter((f) => f.cliente_id === clienteId);
    const libroYEnvio = (tipo, hashUsado, preparado, enlace, fechaExportacion) => {
      contexto.nodo = 'Armar envío';
      const r = core.armarEnvio({
        config: cfg, guardias: { permitido: guardias.permitido, dry_run: guardias.dry_run }, fecha_corte: fechaCorte, tipo, preparado, hash_archivo: hashUsado,
        fecha_exportacion: fechaExportacion, enlace_informe: enlace, iniciada_utc: iniciada, terminada_utc: ahoraUtc
      });
      return r;
    };

    if (eleccion.estado === 'sin_archivo') {
      contexto.nodo = 'Sin archivo';
      const { decision } = core.decidirAviso({ config: cfg, fecha_corte: fechaCorte, filas_libro: filasDelLibro() });
      mundo.registros.push({ evento: 'sin_archivo', decision, descartados: eleccion.por_codigo });
      if (decision !== 'avisar') { soltar(); return { estado: 'sin_archivo_' + decision, fecha_corte: fechaCorte }; }
      const r = libroYEnvio('sin_archivo', undefined, undefined);
      yield 'antes_de_enviar';
      contexto.nodo = 'Enviar';
      enviar('dueno', r.envio, r.correo);
      yield 'despues_de_enviar';
      mundo.libro.push(r.libro);
      soltar();
      return { estado: 'aviso_sin_archivo', fecha_corte: fechaCorte, envio: r.envio.accion };
    }

    contexto.nodo = 'Descargar';
    const elegido = eleccion.archivo;
    const desc = io('E_DRIVE_DESCARGAR', () => mundo.drive.descargar(elegido.id));
    if (mundo.inyectar === 'huella') Util.fallar('E_HUELLA');
    hash = crypto.createHash('sha256').update(desc.bytes).digest('hex');
    yield 'archivo_descargado';

    contexto.nodo = 'Libro';
    // verifica que la descarga llegó entera y busca en el libro la clave (semana de la EXPORTACIÓN + huella)
    if (mundo.inyectar === 'nucleo_decidir') Util.fallar('E_NUCLEO_FALLO');
    const { decision } = core.decidirProcesado({
      cliente_id: clienteId, fecha_exportacion: elegido.modificado_fecha, hash_archivo: hash, esperado_bytes: elegido.bytes,
      recibido_bytes: elegido.formato === 'xlsx' ? elegido.bytes : desc.bytes.length, filas_libro: filasDelLibro()
    });
    if (decision === 'omitir_ya_procesado') {
      mundo.registros.push({ evento: 'ya_procesado' });
      soltar();
      return { estado: 'ya_procesado', fecha_corte: fechaCorte };
    }

    contexto.nodo = 'Preparar';
    if (mundo.inyectar === 'flujo_preparar') Util.fallar('E_FLUJO_FALLO');
    const contenido = elegido.formato === 'xlsx' ? { formato: 'filas', filas: desc.filas } : { formato: 'csv', texto: desc.bytes.toString('utf8') };
    const p = core.preparar({ config: cfg, guardias: { permitido: guardias.permitido, dry_run: guardias.dry_run }, fecha_corte: fechaCorte, contenido });

    let enlace;
    if (p.tipo === 'informe' && cfg.entrega === 'enlace_salida') {
      contexto.nodo = 'Subir informe';
      enlace = io('E_DRIVE_SUBIR', () => mundo.drive.subir(p.informe.nombre_archivo, p.informe.html_completo));
    }
    const r = libroYEnvio(p.tipo, hash, p, enlace, elegido.modificado_fecha);
    yield 'antes_de_enviar';
    contexto.nodo = 'Enviar';
    enviar('dueno', r.envio, r.correo);
    yield 'despues_de_enviar';
    contexto.nodo = 'Registrar';
    if (mundo.inyectar === 'escribir_libro') Util.fallar('E_TABLA_ESCRIBIR');
    mundo.libro.push(r.libro);
    soltar();
    mundo.registros.push({ evento: p.tipo, n_filas: p.conteos.n_filas });
    return { estado: p.tipo === 'informe' ? 'informe_enviado' : 'incidencia_enviada', fecha_corte: fechaCorte, envio: r.envio.accion, hash };
  } catch (err) {
    // camino de error: aviso a Javier (solo códigos), fila de error en el libro y bloqueo liberado; todo lo arma el núcleo
    if (mundo.etiquetaNodo) contexto.nodo = mundo.etiquetaNodo(Util.codigoDe(err));
    if (mundo.inyectar === 'nucleo_error') {
      // el núcleo no responde tampoco al manejar el error: no hay fila de libro ni aviso posibles; se libera el bloqueo y el día termina
      // con un error que n8n sí muestra como fallido (en silencio sería lo peor)
      soltar();
      mundo.registros.push({ evento: 'error_sin_manejo', codigo: 'E_NUCLEO_FALLO' });
      return { estado: 'fallo_visible', codigo: 'E_NUCLEO_FALLO', nodo: 'Núcleo', fecha_corte: fechaCorte };
    }
    const r = core.error({
      codigo: Util.codigoDe(err), contexto, operador: mundo.operador, cliente_id: clienteId, fecha_corte: fechaCorte || undefined, hash_archivo: hash,
      iniciada_utc: iniciada, terminada_utc: ahoraUtc, guardias, modo_cliente: cfg && cfg.modo
    });
    const a = r.alerta;
    try { enviar('operador', a.envio, a.texto); } catch (e2) { mundo.sinEnviar.push({ tipo: 'operador', motivos: ['CORREO_CAIDO'], envio: a.envio, texto: a.texto }); }
    if (r.fila) mundo.libro.push(r.fila);
    else if (r.fila_codigo) mundo.registros.push({ evento: 'libro_error_no_escrito', codigo: r.fila_codigo });
    soltar();
    mundo.registros.push({ evento: 'error', codigo: a.sano.codigo, nodo: a.sano.nodo });
    return { estado: 'error', codigo: a.sano.codigo, nodo: a.sano.nodo, fecha_corte: fechaCorte };
  }
}

// Ejecuta hasta el final. `abortarEn`: nombre de un punto donde «se cae el servidor» (no hay camino de error).
function correr(mundo, ahoraUtc, { abortarEn } = {}) {
  const it = ejecucion(mundo, ahoraUtc);
  for (;;) {
    const paso = it.next();
    if (paso.done) return paso.value;
    if (abortarEn && paso.value === abortarEn) return { estado: 'caida', punto: paso.value };
  }
}

module.exports = { M, Mundo, Drive, Correo, archivo, correr, ejecucion, sumarMinutos, OPERADOR };
