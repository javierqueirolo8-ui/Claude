'use strict';
/* Simulador del «shell» del cliente: un gemelo digital de la ejecución diaria en n8n.

   El shell real solo hace entrada y salida (listar y descargar de la carpeta, leer y escribir tablas, enviar
   correo). Aquí esas operaciones son falsas y están en memoria; todo lo demás es el código real del núcleo
   (Cobranza, M0 a M7), cargado en el mismo entorno restringido que en las demás pruebas.

   La ejecución es un generador: cada `yield` es un punto donde, en la realidad, otra ejecución podría
   intercalarse o el servidor podría caerse. Las pruebas de doble ejecución y de caída lo aprovechan. */

const crypto = require('node:crypto');
const { cargar, plano } = require('./cargar');

const M = cargar('util', 'm0-guardias', 'm1-normalizar', 'm2-antiguedad', 'm3-borradores', 'm4-informe',
  'm5-guardia-envio', 'm6-registro', 'm7-ingesta', 'pipeline');

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
  constructor(archivos = []) { this.archivos = archivos; this.consultas = 0; this.descargas = 0; this.subidos = []; this.falloSubida = false; this.falloLista = false; }
  listar() {
    this.consultas++;
    if (this.falloLista) throw new Error('403 Forbidden: sin permiso sobre la carpeta de Juan Pérez S.A.');
    return this.archivos.map((a) => ({ ...a.meta }));
  }
  descargar(id) {
    this.descargas++;
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
  constructor({ config, control = { interruptor: 'on', dry_run: 'true' }, drive, correo, operador = OPERADOR } = {}) {
    this.config = config;
    this.control = control;
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
  const { Cobranza, M6, M7, Util } = M;
  const cfg = mundo.config;
  const clienteId = cfg && cfg.cliente_id;
  const contexto = { cliente_id: clienteId, workflow: 'Cobranza · shell', nodo: 'Inicio', ejecucion_id: ++mundo.ejecuciones };
  let fechaCorte = null, bloqueoTomado = false, hash = M7.HUELLA_SIN_ARCHIVO, guardias = null;
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
    fechaCorte = Cobranza.fechaCorteDe(ahoraUtc, cfg.zona_horaria);
    const arr = plano(Cobranza.arrancar({ config: cfg, fila_control: mundo.control, fecha_corte: fechaCorte, ahora_utc: ahoraUtc, fila_bloqueo: mundo.bloqueos.get(clienteId) || null }));
    guardias = arr.guardias;
    if (arr.accion === 'detener') {
      mundo.registros.push({ evento: 'detenida', motivo: arr.motivo, problemas: arr.problemas });
      if (arr.motivo === 'CONFIG_INVALIDA') {
        // configuración mala = aviso a Javier con los códigos a corregir (nunca al dueño)
        const a = plano(Cobranza.alertaOperador({ error: Object.assign(new Error('config'), { codigo: arr.problemas[0] }), contexto, operador: mundo.operador }));
        enviar('operador', a.envio, { asunto: a.texto.asunto, cuerpo_texto: a.texto.cuerpo_texto + '\nProblemas: ' + arr.problemas.join(', ') });
      }
      return { estado: 'detenida', motivo: arr.motivo, fecha_corte: fechaCorte };
    }
    if (arr.accion === 'omitir_en_curso') { mundo.registros.push({ evento: 'omitida_en_curso' }); return { estado: 'omitida_en_curso', fecha_corte: fechaCorte }; }
    if (arr.accion === 'alertar_bloqueo_vencido') {
      contexto.nodo = 'Bloqueo';
      const a = plano(Cobranza.alertaOperador({ error: Object.assign(new Error('x'), { codigo: 'E_BLOQUEO_VENCIDO' }), contexto, operador: mundo.operador }));
      enviar('operador', a.envio, a.texto);
      mundo.registros.push({ evento: 'bloqueo_vencido' });
      return { estado: 'bloqueo_vencido', fecha_corte: fechaCorte };
    }

    mundo.bloqueos.set(clienteId, { cliente_id: clienteId, expira_utc: sumarMinutos(ahoraUtc, 30) });
    bloqueoTomado = true;
    yield 'bloqueo_tomado';

    contexto.nodo = 'Listar carpeta';
    const listado = io('E_DRIVE_LISTAR', () => mundo.drive.listar());
    const eleccion = plano(M7.elegirArchivo({
      archivos: listado, fecha_corte: fechaCorte,
      config: { patron_nombre_archivo: cfg.patron_nombre_archivo, antiguedad_maxima_archivo_dias: cfg.antiguedad_maxima_archivo_dias, tamano_maximo_bytes: cfg.tamano_maximo_bytes, zona_horaria: cfg.zona_horaria }
    }));
    if (eleccion.estado === 'ambiguo') Util.fallar('E_ARCHIVO_AMBIGUO');

    const semana = Util.semanaISO(fechaCorte);
    const yaResuelto = (h) => mundo.libro.some((f) => f.clave === clienteId + '|' + semana + '|' + h && (f.estado === 'ok' || f.estado === 'incidencia'));
    const libroYEnvio = (tipo, hashUsado, preparado, enlace) => {
      contexto.nodo = 'Armar envío';
      const r = plano(Cobranza.armarEnvio({
        config: cfg, guardias: { permitido: guardias.permitido, dry_run: guardias.dry_run }, fecha_corte: fechaCorte, tipo, preparado, hash_archivo: hashUsado,
        enlace_informe: enlace, iniciada_utc: iniciada, terminada_utc: ahoraUtc
      }));
      return r;
    };

    if (eleccion.estado === 'sin_archivo') {
      contexto.nodo = 'Sin archivo';
      const decision = M7.decidirSinArchivo({ fecha_corte: fechaCorte, dia_aviso: cfg.dia_aviso_sin_archivo, aviso_ya_enviado: yaResuelto(M7.HUELLA_SIN_ARCHIVO) });
      mundo.registros.push({ evento: 'sin_archivo', decision, descartados: eleccion.por_codigo });
      if (decision !== 'avisar') { soltar(); return { estado: 'sin_archivo_' + decision, fecha_corte: fechaCorte }; }
      const r = libroYEnvio('sin_archivo', M7.HUELLA_SIN_ARCHIVO, undefined);
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
    const ver = plano(M7.verificarDescarga({ esperado_bytes: elegido.bytes, recibido_bytes: elegido.formato === 'xlsx' ? elegido.bytes : desc.bytes.length }));
    if (!ver.ok) Util.fallar(ver.codigo);
    hash = crypto.createHash('sha256').update(desc.bytes).digest('hex');
    yield 'archivo_descargado';

    contexto.nodo = 'Libro';
    const decision = M6.decidirEjecucion({ ya_resuelto: yaResuelto(hash), bloqueo: 'libre' });
    if (decision === 'omitir_ya_procesado') {
      mundo.registros.push({ evento: 'ya_procesado' });
      soltar();
      return { estado: 'ya_procesado', fecha_corte: fechaCorte };
    }

    contexto.nodo = 'Preparar';
    const contenido = elegido.formato === 'xlsx' ? { formato: 'filas', filas: desc.filas } : { formato: 'csv', texto: desc.bytes.toString('utf8') };
    const p = plano(Cobranza.preparar({ config: cfg, guardias: { permitido: guardias.permitido, dry_run: guardias.dry_run }, fecha_corte: fechaCorte, contenido }));

    let enlace;
    if (p.tipo === 'informe' && cfg.entrega === 'enlace_salida') {
      contexto.nodo = 'Subir informe';
      enlace = io('E_DRIVE_SUBIR', () => mundo.drive.subir(p.informe.nombre_archivo, p.informe.html_completo));
    }
    const r = libroYEnvio(p.tipo, hash, p, enlace);
    yield 'antes_de_enviar';
    contexto.nodo = 'Enviar';
    enviar('dueno', r.envio, r.correo);
    yield 'despues_de_enviar';
    contexto.nodo = 'Registrar';
    mundo.libro.push(r.libro);
    soltar();
    mundo.registros.push({ evento: p.tipo, n_filas: p.conteos.n_filas });
    return { estado: p.tipo === 'informe' ? 'informe_enviado' : 'incidencia_enviada', fecha_corte: fechaCorte, envio: r.envio.accion, hash };
  } catch (err) {
    // camino de error: alerta a Javier (solo códigos), fila de error en el libro y bloqueo liberado
    const a = plano(Cobranza.alertaOperador({ error: err, contexto, operador: mundo.operador }));
    try { enviar('operador', a.envio, a.texto); } catch (e2) { mundo.sinEnviar.push({ tipo: 'operador', motivos: ['CORREO_CAIDO'] }); }
    if (fechaCorte && clienteId) {
      try {
        mundo.libro.push(plano(Cobranza.filaError({ cliente_id: clienteId, codigo: a.sano.codigo, fecha_corte: fechaCorte, hash_archivo: hash, iniciada_utc: iniciada, terminada_utc: ahoraUtc, modo: guardias && guardias.dry_run === false && cfg.modo === 'real' ? 'real' : 'dry' })));
      } catch (e3) { mundo.registros.push({ evento: 'libro_error_no_escrito', codigo: M.Util.codigoDe(e3) }); }
    }
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
