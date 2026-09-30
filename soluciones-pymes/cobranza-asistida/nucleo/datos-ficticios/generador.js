'use strict';
/* Generador de datos FICTICIOS para probar el núcleo de cobranza.

   · Determinista: la misma semilla produce siempre el mismo archivo.
   · Todo es inventado: empresas «Ficticia», direcciones en el dominio reservado «.example» y solo los
     números de teléfono de ejemplo de Util.NUMEROS_EJEMPLO (99 000 001 a 99 000 010).
   · Reproduce distintos «sistemas de facturación» (A, B, C, X) para comprobar que el mismo dato en formatos
     diferentes da el mismo resultado, más una lista de filas hostiles y un mutador para pruebas de robustez.

   Nunca se usa con datos reales, no lee ni escribe archivos por su cuenta. */

const azarMod = require('../tests/azar');

const RUBROS = ['Distribuidora', 'Comercial', 'Transportes', 'Ferretería', 'Panadería', 'Estudio', 'Servicios', 'Constructora',
  'Agropecuaria', 'Librería', 'Farmacia', 'Taller', 'Almacén', 'Imprenta', 'Mueblería', 'Papelería'];
const ADJETIVOS = ['Ficticia', 'Imaginaria', 'Inventada', 'Ejemplar', 'Modelo', 'Muestra', 'Simulada', 'Ilustrativa'];
const SUFIJOS = ['S.A.', 'S.R.L.', 'Ltda.', 'y Asociados', ''];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Números de teléfono de ejemplo (los mismos que Util.NUMEROS_EJEMPLO): 598 99 000 001 … 010
const TELEFONOS_EJEMPLO = Array.from({ length: 10 }, (_, i) => '598990000' + String(i + 1).padStart(2, '0'));

const pad2 = (n) => String(n).padStart(2, '0');

function sumarDias(iso, d) {
  const [y, m, dd] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, dd + d));
  return f.getUTCFullYear() + '-' + pad2(f.getUTCMonth() + 1) + '-' + pad2(f.getUTCDate());
}

function serialExcel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

const MARCAS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36F) + ']', 'g'); // marcas de acento combinadas
function sinAcentos(s) { return s.normalize('NFD').replace(MARCAS, ''); }

function agrupar(entero, sep) { return String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, sep); }

/* ---------------------------------------------------------------- facturas */

// opc: { semilla, n, fecha_corte, prob_usd?, prob_disputa?, prob_tel?, prob_correo? }
function crearFacturas(opc) {
  const az = azarMod.crear(opc.semilla);
  const n = opc.n;
  const nClientes = Math.max(1, Math.round(n / 2.5));
  const clientes = Array.from({ length: nClientes }, (_, i) => {
    const rubro = az.elegir(RUBROS), adj = az.elegir(ADJETIVOS), suf = az.elegir(SUFIJOS);
    const nn = pad2(i + 1);
    const slug = sinAcentos((rubro + '-' + adj + '-' + nn).toLowerCase()).replace(/[^a-z0-9-]/g, '');
    return {
      nombre: (rubro + ' ' + adj + ' ' + nn + (suf ? ' ' + suf : '')),
      correo: az.prob(opc.prob_correo === undefined ? 0.6 : opc.prob_correo) ? 'compras@' + slug + '.example' : null,
      tel: az.prob(opc.prob_tel === undefined ? 0.8 : opc.prob_tel) ? az.elegir(TELEFONOS_EJEMPLO) : null
    };
  });
  const facturas = [];
  let numero = 1000 + az.entero(0, 500);
  for (let i = 0; i < n; i++) {
    const c = az.elegir(clientes);
    const usd = az.prob(opc.prob_usd === undefined ? 0.15 : opc.prob_usd);
    // importes entre unos cientos y unos cientos de miles de pesos (en dólares, menos), con distribución sesgada a lo chico
    const base = Math.exp(az.uno() * (usd ? 5.5 : 7.5)) * (usd ? 100 : 800);
    const centavos = Math.max(100, Math.round(base * 100));
    // vencimientos: parte sin vencer, la mayoría vencidos hace 1 a 140 días
    const delta = az.prob(0.12) ? az.entero(1, 30) : -Math.floor(Math.pow(az.uno(), 1.6) * 140) - 1;
    const vencimiento = sumarDias(opc.fecha_corte, delta);
    const emision = sumarDias(vencimiento, -az.elegir([30, 45, 60, 90]));
    numero += az.entero(1, 3);
    facturas.push({
      serie: az.prob(0.85) ? 'A' : 'B', numero: numero, cliente: c.nombre, moneda: usd ? 'USD' : 'UYU', centavos: centavos,
      emision: emision, vencimiento: vencimiento, tel: c.tel, correo: c.correo, disputa: az.prob(opc.prob_disputa === undefined ? 0.05 : opc.prob_disputa)
    });
  }
  return facturas;
}

/* --------------------------------------------------------------- formatos */

function importeEsUY(c) { return agrupar(Math.floor(c / 100), '.') + ',' + pad2(c % 100); }
function importePunto(c) { return Math.floor(c / 100) + '.' + pad2(c % 100); }
function fechaDMY(iso) { const [y, m, d] = iso.split('-'); return d + '/' + m + '/' + y; }
function fechaTexto(iso) { const [y, m, d] = iso.split('-').map(Number); return d + ' ' + MESES[m - 1] + ' ' + y; }
function telNacional(t) { return '0' + t.slice(3, 5) + ' ' + t.slice(5, 8) + ' ' + t.slice(8); } // «099 000 001»
function telInternacional(t) { return '+598 ' + t.slice(3, 5) + ' ' + t.slice(5, 8) + ' ' + t.slice(8); }

function celdaCSV(v, delim, siempreComillas) {
  const s = String(v);
  const necesita = siempreComillas || s.includes(delim) || s.includes('"') || s.includes('\n') || s.includes('\r');
  return necesita ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function aCSV(cabeceras, filas, delim, opc) {
  const o = opc || {};
  const lineas = [cabeceras, ...filas].map((f) => f.map((v) => celdaCSV(v, delim, o.comillas)).join(delim));
  const fin = o.crlf ? '\r\n' : '\n';
  return (o.bom ? String.fromCharCode(0xFEFF) : '') + lineas.join(fin) + fin;
}

const ESTILOS = ['A', 'B', 'C', 'X'];

const CABECERAS = {
  A: ['Nro Factura', 'Cliente', 'Saldo', 'Moneda', 'Fecha Emisión', 'Vencimiento', 'Teléfono', 'Email', 'En disputa'],
  B: ['factura', 'cliente', 'saldo', 'moneda', 'emision', 'vencimiento', 'telefono', 'email', 'disputa'],
  C: ['Serie', 'Número', 'Deudor', 'Importe', 'Vence', 'Celular', 'Correo'],
  X: ['Factura', 'Razón social', 'Saldo pendiente', 'Moneda', 'Emitida', 'Vencimiento', 'Celular', 'Mail', 'Disputa']
};

const MAPEOS = {
  A: { factura: ['Nro Factura'], deudor: ['Cliente'], importe: ['Saldo'], moneda: ['Moneda'], emision: ['Fecha Emisión'], vencimiento: ['Vencimiento'], telefono: ['Teléfono'], correo: ['Email'], en_disputa: ['En disputa'] },
  B: { factura: ['factura'], deudor: ['cliente'], importe: ['saldo'], moneda: ['moneda'], emision: ['emision'], vencimiento: ['vencimiento'], telefono: ['telefono'], correo: ['email'], en_disputa: ['disputa'] },
  C: { serie: ['Serie'], factura: ['Número'], deudor: ['Deudor'], importe: ['Importe'], vencimiento: ['Vence'], telefono: ['Celular'], correo: ['Correo'] },
  X: { factura: ['Factura'], deudor: ['Razón social'], importe: ['Saldo pendiente'], moneda: ['Moneda'], emision: ['Emitida'], vencimiento: ['Vencimiento'], telefono: ['Celular'], correo: ['Mail'], en_disputa: ['Disputa'] }
};

const FORMATO_IMPORTE = { A: { decimal: ',', miles: '.' }, B: { decimal: '.', miles: ',' }, C: { decimal: ',', miles: '.' }, X: { decimal: ',', miles: '.' } };

// Configuración de cliente con el mapeo y el formato numérico de cada estilo.
function configPara(estilo, base) {
  if (!ESTILOS.includes(estilo)) throw new Error('estilo desconocido');
  const c = JSON.parse(JSON.stringify(base));
  c.mapeo_columnas = JSON.parse(JSON.stringify(MAPEOS[estilo]));
  c.formato_importe = Object.assign({}, FORMATO_IMPORTE[estilo]);
  if (estilo === 'C') c.moneda_por_defecto = 'UYU';
  return c;
}

// facturas lógicas → { estilo, formato:'csv'|'filas', texto|filas, nombre, mimeType }
function renderizar(facturas, estilo) {
  if (!ESTILOS.includes(estilo)) throw new Error('estilo desconocido');
  if (estilo === 'A') {
    const filas = facturas.map((f) => [f.serie + '-' + f.numero, f.cliente, importeEsUY(f.centavos), f.moneda, fechaDMY(f.emision), fechaDMY(f.vencimiento),
      f.tel ? telNacional(f.tel) : '', f.correo || '', f.disputa ? 'SI' : '']);
    return { estilo, formato: 'csv', texto: aCSV(CABECERAS.A, filas, ';', { crlf: true }), nombre: 'facturas-pendientes.csv', mimeType: 'text/csv' };
  }
  if (estilo === 'B') {
    const filas = facturas.map((f) => [f.serie + '-' + f.numero, f.cliente, importePunto(f.centavos), f.moneda === 'USD' ? 'Dólares' : 'Pesos', f.emision, f.vencimiento,
      f.tel ? telInternacional(f.tel) : '', f.correo || '', f.disputa ? 'sí' : 'no']);
    return { estilo, formato: 'csv', texto: aCSV(CABECERAS.B, filas, ',', { bom: true, comillas: true }), nombre: 'export_facturas.csv', mimeType: 'text/csv' };
  }
  if (estilo === 'C') {
    const filas = facturas.map((f) => [f.serie, String(f.numero), f.cliente, (f.moneda === 'USD' ? 'US$ ' : '$ ') + importeEsUY(f.centavos), fechaTexto(f.vencimiento),
      f.tel ? f.tel.slice(3) : '', f.correo || '']);
    return { estilo, formato: 'csv', texto: aCSV(CABECERAS.C, filas, '\t'), nombre: 'pendientes.tsv', mimeType: 'text/tab-separated-values' };
  }
  // X: lo que entrega la extracción de una hoja XLSX: números como números, fechas como serie de Excel
  const filasX = facturas.map((f) => ({
    'Factura': f.serie + '-' + f.numero, 'Razón social': f.cliente, 'Saldo pendiente': f.centavos / 100, 'Moneda': f.moneda,
    'Emitida': serialExcel(f.emision), 'Vencimiento': serialExcel(f.vencimiento),
    'Celular': f.tel ? Number(f.tel.slice(3)) : '', 'Mail': f.correo || '', 'Disputa': f.disputa ? 'SI' : ''
  }));
  return { estilo, formato: 'filas', filas: filasX, nombre: 'facturas.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

/* ----------------------------------------------------------------- hostiles */

// Caracteres peligrosos construidos en tiempo de ejecución para que este archivo no los contenga.
const RLO = String.fromCharCode(0x202E); // inicio de texto de derecha a izquierda
const CERO_ANCHO = String.fromCharCode(0x200B);
const NULO = String.fromCharCode(0);

// Filas «de estilo A» (array de celdas) con lo peor que puede traer una exportación.
// `esperado`: «aceptada» (pasa, escapada) o «apartada» (con alguno de los `codigos`).
function hostilesA(fechaCorte) {
  const venc = fechaDMY(sumarDias(fechaCorte, -20));
  const fila = (ref, cliente, saldo, moneda, emision, vence, tel, mail, disputa) => [ref, cliente, saldo, moneda, emision, vence, tel, mail, disputa];
  return [
    { esperado: 'aceptada', celdas: fila('H-9001', '=HYPERLINK("http://malo.example";"clic")', '1.000,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'aceptada', celdas: fila('H-9002', '<img src=x onerror=alert(1)>', '1.000,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'aceptada', celdas: fila('H-9003', '"><script>alert(document.cookie)</script>', '1.000,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'aceptada', celdas: fila('H-9004', 'Nombre ' + RLO + 'invertido' + CERO_ANCHO + ' con invisibles', '1.000,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'aceptada', celdas: fila('H-9005', "Cliente con 'comillas' y \"dobles\" y & ampersand", '1.000,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'aceptada', celdas: fila('H-9006', 'Cliente con {factura} {importe} {vencimiento} de plantilla', '1.000,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'aceptada', celdas: fila('H-9007', 'Cliente\ncon salto de línea', '1.000,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'aceptada', celdas: fila('H-9008', 'Cliente con emoji \u{1F600} y ñandú', '1.000,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'aceptada', celdas: fila('H-9009', 'Cliente con aviso', '1.000,00', 'UYU', '', venc, '099 000 002', 'no-es-un-correo', 'quizás') },
    { esperado: 'aceptada', celdas: fila('H-9010', 'Cliente con teléfono raro', '1.000,00', 'UYU', '', venc, '12345', 'a@b.c', '') },
    { esperado: 'apartada', codigos: ['E_IMPORTE_NO_POSITIVO'], celdas: fila('H-9011', 'Cliente', '-1.000,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'apartada', codigos: ['E_IMPORTE_NO_POSITIVO'], celdas: fila('H-9012', 'Cliente', '0,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'apartada', codigos: ['E_IMPORTE_INVALIDO', 'E_MONEDA_DESCONOCIDA'], celdas: fila('H-9013', 'Cliente', 'mucho', 'UYU', '', venc, '', '', '') },
    { esperado: 'apartada', codigos: ['E_IMPORTE_INVALIDO', 'E_MONEDA_DESCONOCIDA'], celdas: fila('H-9014', 'Cliente', '1e6', 'UYU', '', venc, '', '', '') },
    { esperado: 'apartada', codigos: ['E_IMPORTE_INVALIDO'], celdas: fila('H-9015', 'Cliente', '99999999999999999999,99', 'UYU', '', venc, '', '', '') },
    { esperado: 'apartada', codigos: ['E_IMPORTE_INVALIDO'], celdas: fila('H-9016', 'Cliente', '1,234.50', 'UYU', '', venc, '', '', '') },
    { esperado: 'apartada', codigos: ['E_IMPORTE_INVALIDO', 'E_MONEDA_DESCONOCIDA'], celdas: fila('H-9017', 'Cliente', 'NaN', 'UYU', '', venc, '', '', '') },
    { esperado: 'apartada', codigos: ['E_FECHA_INVALIDA'], celdas: fila('H-9018', 'Cliente', '1.000,00', 'UYU', '', '31/02/2026', '', '', '') },
    { esperado: 'apartada', codigos: ['E_FECHA_INVALIDA'], celdas: fila('H-9019', 'Cliente', '1.000,00', 'UYU', '', '2026-13-05', '', '', '') },
    { esperado: 'apartada', codigos: ['E_FECHA_VACIA'], celdas: fila('H-9020', 'Cliente', '1.000,00', 'UYU', '', '', '', '', '') },
    { esperado: 'apartada', codigos: ['E_REF_VACIA'], celdas: fila('', 'Cliente sin número de factura', '1.000,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'apartada', codigos: ['E_DEUDOR_VACIO'], celdas: fila('H-9021', '', '1.000,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'apartada', codigos: ['E_MONEDA_DESCONOCIDA'], celdas: fila('H-9022', 'Cliente', '1.000,00', 'EUR', '', venc, '', '', '') },
    { esperado: 'apartada', codigos: ['E_CELDA_LARGA'], celdas: fila('H-9023', 'x'.repeat(400), '1.000,00', 'UYU', '', venc, '', '', '') },
    { esperado: 'apartada', codigos: ['E_REF_INVALIDA'], celdas: fila('<b>ref</b>', 'Cliente', '1.000,00', 'UYU', '', venc, '', '', '') }
  ];
}

// Fila de totales y fila en blanco, que no son facturas ni errores.
function ruidoA() {
  return [
    ['Total', '', '123.456.789,00', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '']
  ];
}

// Un CSV de estilo A con las facturas dadas, los hostiles al principio y una fila de total y otra en blanco al final.
// Devuelve { texto, marcas: [{ linea, ref, esperado, codigos }] } con la línea donde empieza cada fila hostil.
function csvConHostiles(facturas, fechaCorte) {
  let texto = CABECERAS.A.join(';') + '\r\n';
  const marcas = [];
  const linea = () => (texto.match(/\n/g) || []).length + 1;
  for (const h of hostilesA(fechaCorte)) {
    marcas.push({ linea: linea(), ref: h.celdas[0], esperado: h.esperado, codigos: h.codigos || [] });
    texto += h.celdas.map((v) => celdaCSV(v, ';', false)).join(';') + '\r\n';
  }
  for (const f of facturas) texto += renderizar([f], 'A').texto.split('\r\n')[1] + '\r\n';
  for (const r of ruidoA()) texto += r.join(';') + '\r\n';
  return { texto, marcas };
}

/* ---------------------------------------------------------------- mutador */

// Estropea un texto CSV de formas realistas y no tanto. Devuelve otro texto (nunca modifica el original).
function corromper(texto, az) {
  let t = texto;
  const veces = az.entero(1, 4);
  for (let k = 0; k < veces; k++) {
    const pos = az.entero(0, Math.max(0, t.length - 1));
    switch (az.entero(0, 13)) {
      case 0: t = t.slice(0, pos) + t.slice(pos + az.entero(1, 30)); break; // borrar un tramo
      case 1: t = t.slice(0, pos) + t.slice(pos, pos + az.entero(1, 60)) + t.slice(pos); break; // duplicar un tramo
      case 2: t = t.slice(0, pos); break; // cortar el archivo
      case 3: t = t.slice(0, pos) + '"' + t.slice(pos); break; // comilla suelta
      case 4: t = t.slice(0, pos) + az.elegir([';', ',', '\t', '|']) + t.slice(pos); break; // separador de más
      case 5: t = t.slice(0, pos) + az.elegir(['\n', '\r', '\r\n']) + t.slice(pos); break; // salto de línea de más
      case 6: t = t.slice(0, pos) + az.elegir([NULO, String.fromCharCode(7), RLO, CERO_ANCHO, String.fromCharCode(0xFFFD)]) + t.slice(pos); break; // control o invisible
      case 7: t = t.replace(/;/g, ','); break; // cambia el separador en todo el archivo
      case 8: t = t.replace(/,/g, '.'); break; // cambia los decimales
      case 9: t = t.toUpperCase(); break;
      case 10: t = t + t.split('\n').slice(0, az.entero(1, 5)).join('\n'); break; // repite filas al final
      case 11: t = az.cadena(az.entero(1, 200)) + '\n' + t; break; // basura antes de la cabecera
      case 12: t = t.split('\n').reverse().join('\n'); break; // orden invertido
      default: t = t.replace(/\d/, az.elegir(['x', '-', ' ', '9'])); break; // un dígito alterado
    }
  }
  return t;
}

module.exports = {
  ESTILOS, CABECERAS, MAPEOS, TELEFONOS_EJEMPLO,
  crearFacturas, renderizar, configPara, hostilesA, ruidoA, csvConHostiles, corromper,
  sumarDias, importeEsUY, fechaDMY, aCSV
};
