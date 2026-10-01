#!/usr/bin/env node
'use strict';
/* Comprueba que un flujo guardado en n8n es EXACTAMENTE el que se generó aquí (el texto del SDK de dist/).

   El flujo se sube a n8n copiando su texto en una llamada; esta comprobación detecta cualquier diferencia entre lo que
   está en el servidor y lo generado (una letra mal copiada, un nodo de más o de menos, una conexión cambiada a mano):
     · mismos nodos (nombre, tipo, versión); ninguno de más;
     · cada valor que fija el SDK (código, expresiones, tablas, reglas…) está igual en el servidor (el servidor puede
       agregar valores por defecto, no cambiar los nuestros);
     · mismos ajustes por nodo (onError, executeOnce, alwaysOutputData);
     · mismas conexiones, con la misma salida (principal, error, verdadero/falso, caso N);
     · el flujo está inactivo, sin versión activa, sin datos fijados y sin archivar.

   Uso:  node n8n/comparar-despliegue.js <detalles.json> [flujo.workflow.ts] [--ops]
         --ops imprime, en JSON, las operaciones de «update_workflow» que corrigen los parámetros que difieren
         detalles.json = la respuesta de «get_workflow_details» (get_workflow_details guarda las respuestas largas en un
         archivo); flujo.workflow.ts = por defecto dist/shell-demo.workflow.ts.
   Sale con error si hay cualquier diferencia. No usa red, no toca n8n, no lee datos reales. */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TIPO_IF = 'n8n-nodes-base.if';
const TIPO_SWITCH = 'n8n-nodes-base.switch';
const TIPO_NOTA = 'n8n-nodes-base.stickyNote';
const AJUSTES_DE_NODO = ['onError', 'executeOnce', 'alwaysOutputData'];
// n8n no guarda los parámetros que valen lo mismo que el valor por defecto del tipo de nodo: se dan por presentes.
const VALORES_POR_DEFECTO = { 'n8n-nodes-base.code': { mode: 'runOnceForAllItems', language: 'javaScript' } };

/* Ejecuta el texto del SDK con un SDK de mentira que solo anota nodos y conexiones (y exige lo mismo que el real:
   «.onError» solo en nodos con salida de error, «.onTrue/.onFalse» solo en IF, «.onCase» solo en Switch). */
function evaluarSdk(texto) {
  const nodos = new Map();
  const aristas = new Set();
  const notas = [];
  const alcanzados = new Set();
  const flujo = { id: null, nombre: null };

  function arista(de, salida, a) {
    if (!a || typeof a.nombre !== 'string' || !nodos.has(a.nombre)) throw new Error('conexión a algo que no es un nodo, desde «' + de.nombre + '»');
    aristas.add(de.nombre + ' --' + salida + '--> ' + a.nombre);
    alcanzados.add(de.nombre);
    alcanzados.add(a.nombre);
  }

  function nuevo(def, fabrica) {
    const cfg = def.config || {};
    if (typeof cfg.name !== 'string' || !cfg.name) throw new Error('nodo sin nombre');
    if (nodos.has(cfg.name)) throw new Error('nombre repetido: ' + cfg.name);
    const ajustes = {};
    AJUSTES_DE_NODO.forEach((k) => { if (cfg[k] !== undefined) ajustes[k] = cfg[k]; });
    const n = {
      nombre: cfg.name,
      tipo: fabrica === 'ifElse' ? TIPO_IF : fabrica === 'switchCase' ? TIPO_SWITCH : def.type,
      version: def.version,
      parametros: cfg.parameters || {},
      ajustes,
      fabrica
    };
    const solo = (quien, ok) => { if (!ok) throw new Error('«' + n.nombre + '» (' + fabrica + ') no admite ' + quien); };
    // «.to» devuelve una cadena: en el SDK real, un «.onError» escrito sobre ella se engancha al último nodo de la cadena y no
    // a este nodo (comprobado contra n8n), así que aquí es un error. El «.onError» va sobre el nodo, antes del «.to».
    n.to = (d) => {
      solo('.to', fabrica === 'node' || fabrica === 'trigger');
      arista(n, 'main', d);
      return { nombre: n.nombre, onError: () => { throw new Error('«' + n.nombre + '»: «.onError» después de «.to» se engancha al nodo equivocado; escribir nodo.onError(...).to(...)'); } };
    };
    n.onError = (d) => { solo('.onError sin onError:continueErrorOutput', (fabrica === 'node') && ajustes.onError === 'continueErrorOutput'); arista(n, 'error', d); return n; };
    n.onTrue = (d) => { solo('.onTrue', fabrica === 'ifElse'); arista(n, 'true', d); return n; };
    n.onFalse = (d) => { solo('.onFalse', fabrica === 'ifElse'); arista(n, 'false', d); return n; };
    n.onCase = (i, d) => { solo('.onCase', fabrica === 'switchCase'); arista(n, 'caso ' + i, d); return n; };
    nodos.set(cfg.name, n);
    return n;
  }

  function workflow(id, nombre) {
    flujo.id = id;
    flujo.nombre = nombre;
    let ultimo = null;
    const w = {
      add(x) {
        if (x && x.esNota) return w;
        ultimo = x;
        alcanzados.add(x.nombre);
        return w;
      },
      to(x) {
        if (!ultimo) throw new Error('.to() sin un nodo anterior');
        arista(ultimo, 'main', x);
        ultimo = x;
        return w;
      }
    };
    return w;
  }

  const sandbox = {
    workflow,
    node: (d) => nuevo(d, 'node'),
    trigger: (d) => nuevo(d, 'trigger'),
    ifElse: (d) => nuevo(d, 'ifElse'),
    switchCase: (d) => nuevo(d, 'switchCase'),
    sticky: (contenido, anclados, opciones) => { const nota = { esNota: true, contenido, anclados, opciones }; notas.push(nota); return nota; },
    expr: (s) => '=' + s,
    resultado: null
  };
  const cuerpo = texto.replace(/^import .*\n/m, '').replace(/^export default /m, 'resultado = ');
  vm.runInNewContext(cuerpo, sandbox, { filename: 'flujo.workflow.ts' });
  const sinConectar = [...nodos.keys()].filter((nombre) => !alcanzados.has(nombre));
  if (sinConectar.length) throw new Error('nodos sin conectar: ' + sinConectar.join(', '));
  return { flujo, nodos, aristas, notas };
}

// Todo lo que fija el esperado debe estar igual en lo real (lo real puede traer más: valores por defecto del servidor).
function contiene(esperado, real, ruta, dif) {
  if (esperado !== null && typeof esperado === 'object') {
    if (Array.isArray(esperado)) {
      if (!Array.isArray(real) || real.length !== esperado.length) { dif.push(ruta + ': distinta cantidad de elementos'); return; }
      esperado.forEach((e, i) => contiene(e, real[i], ruta + '[' + i + ']', dif));
      return;
    }
    if (real === null || typeof real !== 'object' || Array.isArray(real)) { dif.push(ruta + ': se esperaba un objeto'); return; }
    Object.keys(esperado).forEach((k) => {
      if (!(k in real)) dif.push(ruta + '.' + k + ': falta');
      else contiene(esperado[k], real[k], ruta + '.' + k, dif);
    });
    return;
  }
  if (esperado !== real) dif.push(ruta + ': se esperaba ' + JSON.stringify(esperado).slice(0, 100) + ' y hay ' + JSON.stringify(real).slice(0, 100));
}

function aristasDesplegadas(conexiones, tipoPorNombre) {
  const salida = new Set();
  Object.keys(conexiones || {}).forEach((de) => {
    const tipo = tipoPorNombre.get(de);
    Object.keys(conexiones[de]).forEach((clase) => {
      if (clase !== 'main') { salida.add(de + ' --' + clase + '--> (tipo de conexión no previsto)'); return; }
      conexiones[de].main.forEach((lista, i) => (lista || []).forEach((c) => {
        let nombre;
        if (tipo === TIPO_SWITCH) nombre = 'caso ' + i;
        else if (tipo === TIPO_IF) nombre = i === 0 ? 'true' : i === 1 ? 'false' : 'salida ' + i;
        else nombre = i === 0 ? 'main' : i === 1 ? 'error' : 'salida ' + i;
        if (c.type !== 'main' || c.index !== 0) nombre += ' (entrada ' + c.type + '/' + c.index + ')';
        salida.add(de + ' --' + nombre + '--> ' + c.node);
      }));
    });
  });
  return salida;
}

// detalles = {workflow: {...}} (respuesta de get_workflow_details) o el flujo solo. Devuelve la lista de diferencias.
function compararDespliegue(detalles, textoSdk) {
  const dif = [];
  const ops = []; // para los nodos que solo difieren en sus parámetros: la operación de «update_workflow» que los deja como el SDK
  const w = detalles && detalles.workflow ? detalles.workflow : detalles;
  const ref = evaluarSdk(textoSdk);

  if (w.active !== false) dif.push('el flujo no está inactivo (active=' + w.active + ')');
  if (w.activeVersionId !== null && w.activeVersionId !== undefined) dif.push('el flujo tiene una versión activa: ' + w.activeVersionId);
  if (w.isArchived) dif.push('el flujo está archivado');
  if (w.pinData && Object.keys(w.pinData).length) dif.push('el flujo tiene datos fijados (pinData) en: ' + Object.keys(w.pinData).join(', '));
  if (ref.flujo.nombre !== w.name) dif.push('nombre del flujo: se esperaba «' + ref.flujo.nombre + '» y hay «' + w.name + '»');

  const reales = new Map();
  (w.nodes || []).forEach((n) => { if (reales.has(n.name)) dif.push('nombre repetido en el servidor: ' + n.name); reales.set(n.name, n); });
  const notasReales = (w.nodes || []).filter((n) => n.type === TIPO_NOTA);
  if (notasReales.length !== ref.notas.length) dif.push('notas: se esperaban ' + ref.notas.length + ' y hay ' + notasReales.length);
  else ref.notas.forEach((nota, i) => { if (notasReales[i].parameters.content !== nota.contenido) dif.push('el texto de la nota ' + (i + 1) + ' es distinto'); });

  ref.nodos.forEach((n, nombre) => {
    const real = reales.get(nombre);
    if (!real) { dif.push('falta el nodo «' + nombre + '»'); return; }
    if (real.type !== n.tipo) dif.push('«' + nombre + '»: tipo ' + real.type + ' en vez de ' + n.tipo);
    if (real.typeVersion !== n.version) dif.push('«' + nombre + '»: versión ' + real.typeVersion + ' en vez de ' + n.version);
    if (real.disabled) dif.push('«' + nombre + '»: está desactivado');
    AJUSTES_DE_NODO.forEach((k) => {
      const defecto = k === 'onError' ? null : false;
      const e = n.ajustes[k] === undefined ? defecto : n.ajustes[k];
      const r = real[k] === undefined ? defecto : real[k];
      if (e !== r) dif.push('«' + nombre + '»: ' + k + ' = ' + JSON.stringify(r) + ' en vez de ' + JSON.stringify(e));
    });
    const d = [];
    contiene(n.parametros, Object.assign({}, VALORES_POR_DEFECTO[real.type] || {}, real.parameters || {}), 'parameters', d);
    d.forEach((x) => dif.push('«' + nombre + '» ' + x));
    if (d.length && real.type === n.tipo) ops.push({ type: 'updateNodeParameters', nodeName: nombre, parameters: n.parametros, replace: true });
  });
  reales.forEach((n, nombre) => { if (n.type !== TIPO_NOTA && !ref.nodos.has(nombre)) dif.push('nodo de más en el servidor: «' + nombre + '»'); });

  const tipoPorNombre = new Map([...reales].map(([nombre, n]) => [nombre, n.type]));
  const reales_a = aristasDesplegadas(w.connections, tipoPorNombre);
  ref.aristas.forEach((a) => { if (!reales_a.has(a)) dif.push('falta la conexión ' + a); });
  reales_a.forEach((a) => { if (!ref.aristas.has(a)) dif.push('conexión de más: ' + a); });

  return { diferencias: dif, ops, nodos: ref.nodos.size, aristas: ref.aristas.size };
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--ops');
  const [archivo, flujo] = args;
  if (!archivo) { console.error('Uso: node n8n/comparar-despliegue.js <detalles.json> [flujo.workflow.ts] [--ops]'); process.exit(2); }
  const detalles = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const sdk = fs.readFileSync(flujo || path.join(__dirname, 'dist', 'shell-demo.workflow.ts'), 'utf8');
  const r = compararDespliegue(detalles, sdk);
  if (process.argv.includes('--ops')) { console.log(JSON.stringify(r.ops)); return; }
  if (r.diferencias.length) {
    console.log('DIFERENCIAS (' + r.diferencias.length + '):');
    r.diferencias.slice(0, 60).forEach((x) => console.log('  - ' + x));
    process.exit(1);
  }
  console.log('IGUAL: ' + r.nodos + ' nodos y ' + r.aristas + ' conexiones; inactivo, sin versión activa, sin datos fijados.');
}

if (require.main === module) main();
module.exports = { evaluarSdk, compararDespliegue, contiene, aristasDesplegadas };
