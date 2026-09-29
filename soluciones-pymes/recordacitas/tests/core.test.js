'use strict';
/*
 * Pruebas del núcleo de RecordaCitas.
 *
 * No prueban una copia: extraen el bloque <script id="core"> del propio
 * recordacitas.html y lo ejecutan, así que lo que pasa aquí es lo que se entrega.
 *
 *   node --test tests/
 *   TZ=America/Montevideo node --test tests/     # las fechas dependen de la zona: ver verificar.sh
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(process.env.RECORDACITAS_HTML || path.join(__dirname, '..', 'recordacitas.html'), 'utf8');
const bloque = /<script id="core">([\s\S]*?)<\/script>/.exec(html);
assert.ok(bloque, 'No se encontró <script id="core"> en recordacitas.html');
const RC = new Function(bloque[1] + '\nreturn RecordaCitas;')();

const HOY = '2026-09-29'; // martes

/* ------------------------------------------------------------------ fechas */

test('sumarDias: fronteras de mes, año y bisiesto (independiente de horarios de verano)', () => {
  const casos = [
    ['2026-09-29', 1, '2026-09-30'], ['2026-09-30', 1, '2026-10-01'], ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'], ['2028-02-29', 1, '2028-03-01'], ['2027-02-28', 1, '2027-03-01'],
    ['2026-03-01', -1, '2026-02-28'], ['2026-01-01', -1, '2025-12-31'], ['2026-09-29', 0, '2026-09-29'],
    ['2026-09-29', 30, '2026-10-29'], ['2026-09-29', -30, '2026-08-30'],
    // cambios de hora en Europa y EE. UU.: el día siguiente sigue siendo el día siguiente
    ['2026-03-28', 1, '2026-03-29'], ['2026-03-29', 1, '2026-03-30'], ['2026-10-24', 1, '2026-10-25'],
    ['2026-10-25', 1, '2026-10-26'], ['2026-03-07', 1, '2026-03-08'], ['2026-11-01', 1, '2026-11-02']
  ];
  for (const [iso, n, esperado] of casos) assert.equal(RC.sumarDias(iso, n), esperado, `${iso} ${n >= 0 ? '+' : ''}${n}`);
});

test('diaSemana y formatoFecha: días de la semana correctos', () => {
  const casos = [['2026-09-29', 2, 'martes'], ['2026-09-30', 3, 'miércoles'], ['2026-10-01', 4, 'jueves'],
    ['2027-01-01', 5, 'viernes'], ['2027-01-02', 6, 'sábado'], ['2028-02-29', 2, 'martes'], ['2026-11-01', 0, 'domingo'],
    ['2026-09-28', 1, 'lunes']];
  for (const [iso, n, nombre] of casos) {
    assert.equal(RC.diaSemana(iso), n, iso);
    assert.ok(RC.formatoFecha(iso).startsWith(nombre + ' '), iso);
  }
  assert.equal(RC.formatoFecha('2026-09-30', HOY), 'miércoles 30 de septiembre');
  assert.equal(RC.formatoFecha('2026-10-01', HOY), 'jueves 1 de octubre');
  assert.equal(RC.formatoFecha('2027-01-02', '2026-12-30'), 'sábado 2 de enero de 2027'); // otro año: se indica
  assert.equal(RC.formatoFecha('2026-09-30'), 'miércoles 30 de septiembre'); // sin «hoy» no se añade año
  assert.equal(RC.formatoNumerico('2026-10-01'), '01/10/2026');
});

test('hoyISO usa la fecha LOCAL: nunca adelanta el día por la noche (no es toISOString)', () => {
  assert.equal(RC.hoyISO(new Date(2026, 8, 29, 23, 59, 59)), '2026-09-29');
  assert.equal(RC.hoyISO(new Date(2026, 8, 29, 0, 0, 0)), '2026-09-29');
  assert.equal(RC.hoyISO(new Date(2026, 0, 1, 0, 0, 0)), '2026-01-01');
  assert.equal(RC.hoyISO(new Date(2028, 1, 29, 12)), '2028-02-29');
  assert.match(RC.hoyISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test('hoyISO en la zona horaria del proceso (verificar.sh repite esto con varias TZ)', () => {
  // 2026-09-30 00:30 UTC: en América todavía es 29; en Europa/Asia ya es 30.
  const instante = new Date(Date.UTC(2026, 8, 30, 0, 30));
  const esperado = {
    'America/Montevideo': '2026-09-29', 'Europe/Madrid': '2026-09-30', 'UTC': '2026-09-30',
    'Pacific/Kiritimati': '2026-09-30', 'America/Los_Angeles': '2026-09-29', 'Pacific/Pago_Pago': '2026-09-29'
  };
  const tz = process.env.TZ;
  if (!tz || !(tz in esperado)) return; // sin TZ conocida no hay expectativa fija
  assert.equal(RC.hoyISO(instante), esperado[tz], `TZ=${tz}`);
  // El «mañana» que ve el usuario es el día siguiente de SU calendario:
  assert.equal(RC.sumarDias(RC.hoyISO(instante), 1), RC.sumarDias(esperado[tz], 1));
});

test('parsearFecha: formatos válidos', () => {
  const casos = [
    ['30/09/2026', '2026-09-30'], ['30/9/2026', '2026-09-30'], ['1/10/26', '2026-10-01'], ['01/10/2026', '2026-10-01'],
    ['30-09-2026', '2026-09-30'], ['30.09.2026', '2026-09-30'], ['2026-09-30', '2026-09-30'], ['2026/09/30', '2026-09-30'],
    ['30 sep 2026', '2026-09-30'], ['30 de septiembre de 2026', '2026-09-30'], ['30 de septiembre 2026', '2026-09-30'],
    ['30 SEPT. 2026', '2026-09-30'], ['30 setiembre 2026', '2026-09-30'], ['30sep2026', '2026-09-30'],
    ['1 mayo 26', '2026-05-01'], ['15 de marzo de 2027', '2027-03-15'], ['29/02/2028', '2028-02-29'],
    ['  30 / 09 / 2026 ', null], // espacios alrededor de las barras: no es un formato admitido
    ['miércoles 30/09/2026', '2026-09-30'], ['mié. 30/09/2026', '2026-09-30'], ['MIÉ, 30/09/2026', '2026-09-30'],
    ['miércoles 30 de septiembre de 2026', '2026-09-30'], ['lun 28/09/2026', '2026-09-28']
  ];
  for (const [entrada, esperado] of casos) {
    const r = RC.parsearFecha(entrada, HOY);
    if (esperado === null) { assert.equal(r.ok, false, entrada); continue; }
    assert.equal(r.ok, true, `«${entrada}» → ${r.motivo}`);
    assert.equal(r.iso, esperado, entrada);
    assert.equal(r.anioSupuesto, false, entrada);
  }
});

test('parsearFecha: reconoce el día de la semana escrito', () => {
  assert.equal(RC.parsearFecha('miércoles 30/09/2026', HOY).diaSemanaTexto, 3);
  assert.equal(RC.parsearFecha('mié. 30/09/2026', HOY).diaSemanaTexto, 3);
  assert.equal(RC.parsearFecha('sáb 03/10/2026', HOY).diaSemanaTexto, 6);
  assert.equal(RC.parsearFecha('dom 04/10/2026', HOY).diaSemanaTexto, 0);
  assert.equal(RC.parsearFecha('30/09/2026', HOY).diaSemanaTexto, null);
});

test('parsearFecha: sin año se supone el actual o el siguiente, y se avisa', () => {
  let r = RC.parsearFecha('30/09', HOY);
  assert.deepEqual([r.ok, r.iso, r.anioSupuesto], [true, '2026-09-30', true]);
  r = RC.parsearFecha('28/09', HOY); // ayer: sigue siendo este año (aparecerá como pasada)
  assert.deepEqual([r.iso, r.anioSupuesto], ['2026-09-28', true]);
  r = RC.parsearFecha('5 de enero', '2026-12-28'); // ya pasó hace casi un año: es el siguiente
  assert.equal(r.iso, '2027-01-05');
  r = RC.parsearFecha('2/1', '2026-12-30');
  assert.equal(r.iso, '2027-01-02');
  r = RC.parsearFecha('15/08', '2026-09-29'); // hace 45 días: se interpreta como el año que viene
  assert.equal(r.iso, '2027-08-15');
  r = RC.parsearFecha('30/09'); // sin «hoy» no se puede suponer el año
  assert.equal(r.ok, false);
  assert.match(r.motivo, /año/);
});

test('parsearFecha: rechaza lo que no es una fecha real (no adivina)', () => {
  const malas = ['', '   ', '31/02/2026', '31/04/2026', '29/02/2027', '00/09/2026', '32/01/2026', '30/13/2026',
    '09/30/2026', '2026-13-01', '2026-02-30', '30/09/1999', '30/09/2100', 'mañana', 'hoy', '46295', '30/09/2026 extra',
    'sep 30 2026', '30 sepx 2026', '30/09/202', '3009/2026', '30/09/26/1', 'abc'];
  for (const entrada of malas) {
    const r = RC.parsearFecha(entrada, HOY);
    assert.equal(r.ok, false, `«${entrada}» no debería ser válida (dio ${r.iso})`);
    assert.ok(r.motivo && r.motivo.length > 5, entrada);
  }
  assert.match(RC.parsearFecha('', HOY).motivo, /Falta la fecha/);
  assert.match(RC.parsearFecha('31/02/2026', HOY).motivo, /no existe/);
  assert.match(RC.parsearFecha('mañana', HOY).motivo, /No se entiende/);
});

test('separarFechaHora: celdas con fecha y hora juntas', () => {
  const casos = [
    ['30/09/2026 10:30', '30/09/2026', '10:30'], ['30/09/2026, 10:30', '30/09/2026', '10:30'],
    ['2026-09-30T10:30:00', '2026-09-30', '10:30:00'], ['2026-09-30 10:30', '2026-09-30', '10:30'],
    ['30 de septiembre de 2026 10:30', '30 de septiembre de 2026', '10:30'], ['30/09/2026 5:30 pm', '30/09/2026', '5:30 pm'],
    ['30/09/2026 10h30', '30/09/2026', '10h30'], ['30/09/2026', '30/09/2026', ''], ['30.09.2026', '30.09.2026', ''],
    ['30 oct 10:30', '30 oct', '10:30'], ['', '', '']
  ];
  for (const [entrada, fecha, hora] of casos) assert.deepEqual(RC.separarFechaHora(entrada), { fecha, hora }, entrada);
});

/* ------------------------------------------------------------------- horas */

test('parsearHora: formatos válidos', () => {
  const casos = [
    ['10:30', '10:30'], ['9:05', '9:05'], ['09:05', '9:05'], ['9.15', '9:15'], ['10h30', '10:30'], ['10h', '10:00'],
    ['10 hs', '10:00'], ['10 h', '10:00'], ['10:30:00', '10:30'], ['10:30 h', '10:30'], ['10:30 hs', '10:30'], ['10:30 hrs', '10:30'],
    ['5:30 pm', '17:30'], ['5:30pm', '17:30'], ['5 pm', '17:00'], ['5 PM', '17:00'], ['5:30 p.m.', '17:30'], ['5:30 p. m.', '17:30'],
    ['12 am', '0:00'], ['12:15 pm', '12:15'], ['12:15 a.m.', '0:15'], ['1 am', '1:00'], ['11:59 pm', '23:59'],
    ['1730', '17:30'], ['930', '9:30'], ['0930', '9:30'], ['9', '9:00'], ['0:00', '0:00'], ['00:00', '0:00'], ['23:59', '23:59'],
    ['  10:30  ', '10:30']
  ];
  for (const [entrada, esperado] of casos) {
    const r = RC.parsearHora(entrada);
    assert.equal(r.ok, true, `«${entrada}» → ${r.motivo}`);
    assert.equal(r.texto, esperado, entrada);
    assert.equal(r.minutos, r.h * 60 + r.m, entrada);
  }
});

test('parsearHora: rechaza lo dudoso', () => {
  const malas = ['', ' ', '24:00', '10:60', '25', '13 pm', '0 am', '13 am', '10:3', 'diez', '10:30-11:30', '0.4375', '0,4375',
    '10:30 xx', '1260', '2460', '10:30:99x', '10::30', '1:2:3', 'a las 10', '10:30 pm am'];
  for (const entrada of malas) {
    const r = RC.parsearHora(entrada);
    assert.equal(r.ok, false, `«${entrada}» no debería ser válida (dio ${r.texto})`);
  }
  assert.match(RC.parsearHora('').motivo, /Falta la hora/);
  assert.match(RC.parsearHora('25').motivo, /no es válida/);
  assert.match(RC.parsearHora('diez').motivo, /No se entiende/);
});

/* --------------------------------------------------------------- teléfonos */

test('teléfono España: formatos válidos → 34 + 9 dígitos', () => {
  for (const t of ['612345678', '612 345 678', '612-345-678', '(612) 345 678', '+34 612 345 678', '0034 612 345 678',
    '34612345678', '+34-612-345-678', '612.345.678', ' 612345678 ', '612345678.0', '+34612345678', '34 612 345 678', '00 34 612345678']) {
    const r = RC.normalizarTelefono(t, 'ES');
    assert.equal(r.ok, true, `«${t}» → ${r.motivo}`);
    assert.equal(r.digitos, '34612345678', t);
    assert.equal(r.visible, '+34 612 345 678', t);
    assert.equal(r.aviso, null, t);
  }
  assert.equal(RC.normalizarTelefono('712345678', 'ES').digitos, '34712345678');
});

test('teléfono España: errores y avisos', () => {
  const malas = ['', '   ', '61234567', '6123456789', '512345678', '012345678', '112345678', 'abc', '612 345 678 ext 3', '612/345678',
    '6.12346E+08', '6,12346E+08', '+34 6123456', '+34 0612345678', '+34 612 345 678 9', '++34612345678', '612+345678', '612345678a'];
  for (const t of malas) assert.equal(RC.normalizarTelefono(t, 'ES').ok, false, `«${t}» no debería ser válido`);
  assert.match(RC.normalizarTelefono('6.12346E+08', 'ES').motivo, /notación científica/);
  assert.match(RC.normalizarTelefono('61234567', 'ES').motivo, /9 dígitos/);
  assert.match(RC.normalizarTelefono('512345678', 'ES').motivo, /empiezan por 6, 7, 8 o 9/);
  assert.match(RC.normalizarTelefono('', 'ES').motivo, /Falta el teléfono/);
  for (const fijo of ['912345678', '812345678', '+34 913 456 789']) {
    const r = RC.normalizarTelefono(fijo, 'ES');
    assert.equal(r.ok, true, fijo);
    assert.match(r.aviso, /fijo/, fijo);
  }
});

test('teléfono Uruguay: móvil con 0, sin 0, con prefijo y fijos', () => {
  for (const t of ['099 123 456', '099123456', '99123456', '99 123 456', '+598 99 123 456', '00598 99 123 456', '59899123456',
    '+598 099 123 456', '(099) 123-456']) {
    const r = RC.normalizarTelefono(t, 'UY');
    assert.equal(r.ok, true, `«${t}» → ${r.motivo}`);
    assert.equal(r.digitos, '59899123456', t);
    assert.equal(r.visible, '+598 99 123 456', t);
    assert.equal(r.aviso, null, t);
  }
  for (const fijo of ['2412 3456', '24123456', '4522 4999']) {
    const r = RC.normalizarTelefono(fijo, 'UY');
    assert.equal(r.ok, true, fijo);
    assert.match(r.aviso, /fijo/, fijo);
  }
  for (const t of ['9912345', '0991234567', '', 'abc', '99 123 456 78', '598991234']) {
    assert.equal(RC.normalizarTelefono(t, 'UY').ok, false, `«${t}» no debería ser válido`);
  }
});

test('teléfono: los números internacionales completos valen con cualquier país elegido', () => {
  assert.equal(RC.normalizarTelefono('34612345678', 'UY').digitos, '34612345678'); // ES escrito sin + con UY elegido
  assert.equal(RC.normalizarTelefono('59899123456', 'ES').digitos, '59899123456'); // UY escrito sin + con ES elegido
  assert.equal(RC.normalizarTelefono('+34 612 345 678', 'UY').digitos, '34612345678');
  assert.equal(RC.normalizarTelefono('+598 99 123 456', 'ES').digitos, '59899123456');
  assert.equal(RC.normalizarTelefono('+54 9 11 5555 1234', 'ES').digitos, '5491155551234');
  assert.equal(RC.normalizarTelefono('+1 415 555 0132', 'UY').digitos, '14155550132');
  assert.equal(RC.normalizarTelefono('0054 9 11 5555 1234', 'UY').digitos, '5491155551234');
  assert.equal(RC.normalizarTelefono('+123', 'ES').ok, false);          // demasiado corto
  assert.equal(RC.normalizarTelefono('+1234567890123456', 'ES').ok, false); // 16 dígitos: más de 15
  assert.equal(RC.normalizarTelefono('+12345678', 'ES').ok, true);       // 8 dígitos: mínimo admitido
  assert.equal(RC.normalizarTelefono('+123456789012345', 'ES').ok, true); // 15 dígitos: máximo E.164
});

test('teléfono en «otro país»: prefijo escrito a mano', () => {
  assert.equal(RC.normalizarTelefono('11 5555 1234', 'OTRO', '54').digitos, '541155551234');
  assert.equal(RC.normalizarTelefono('011 5555 1234', 'OTRO', '54').digitos, '541155551234'); // se quita el 0 inicial
  assert.equal(RC.normalizarTelefono('11 5555 1234', 'OTRO', ' +54 ').digitos, '541155551234');
  assert.equal(RC.normalizarTelefono('+52 55 1234 5678', 'OTRO', '').digitos, '525512345678'); // con +, el prefijo no hace falta
  for (const pref of ['', '0', 'abc', '12345', undefined]) {
    const r = RC.normalizarTelefono('11 5555 1234', 'OTRO', pref);
    assert.equal(r.ok, false, `prefijo «${pref}»`);
    assert.match(r.motivo, /prefijo/);
  }
  assert.equal(RC.normalizarTelefono('123', 'OTRO', '54').ok, false); // longitud total < 8
});

/* ----------------------------------------------------------------- nombres */

test('normalizarNombre y primerNombre', () => {
  const nombres = [
    ['MARÍA LÓPEZ', 'María López'], ['maría lópez', 'María López'], ['María lópez', 'María lópez'],
    ['GARCÍA PÉREZ, LAURA', 'Laura García Pérez'], ['García Pérez, Laura', 'Laura García Pérez'],
    ['JOSÉ DE LA CRUZ', 'José de la Cruz'], ["D'ANGELO", "D'Angelo"], ['ANA-BELÉN RUIZ', 'Ana-Belén Ruiz'],
    ['  Ana   López ', 'Ana López'], ['', ''], ['   ', ''], ['ÑANDÚ PEÑA', 'Ñandú Peña'], ['ana,', 'Ana,'], [null, ''], [undefined, ''],
    ['Ana\nLópez', 'Ana López']
  ];
  for (const [entrada, esperado] of nombres) assert.equal(RC.normalizarNombre(entrada), esperado, String(entrada));
  const pilas = [['Laura García', 'Laura'], ['Mª José Ruiz', 'Mª José'], ['J. Carlos Pérez', 'J. Carlos'], ['Ana', 'Ana'],
    ['', ''], ['Li Wei', 'Li Wei'], ['José Luis Pérez', 'José'], ['Ma. Elena Soto', 'Ma. Elena']];
  for (const [entrada, esperado] of pilas) assert.equal(RC.primerNombre(entrada), esperado, entrada);
});

/* ------------------------------------------------------------------- tabla */

test('analizarTabla: delimitadores, comillas, saltos de línea y BOM', () => {
  let t = RC.analizarTabla('a\tb\tc\r\n1\t2\t3\r\n');
  assert.equal(t.delimitador, '\t');
  assert.deepEqual(t.filas.map(f => f.celdas), [['a', 'b', 'c'], ['1', '2', '3']]);

  t = RC.analizarTabla('﻿a;b;c\n1;2;3');
  assert.equal(t.delimitador, ';');
  assert.deepEqual(t.filas.map(f => f.celdas), [['a', 'b', 'c'], ['1', '2', '3']]);

  t = RC.analizarTabla('a,b\n"García, Laura",x\n"dice ""hola""",y\n"línea 1\nlínea 2",z');
  assert.equal(t.delimitador, ',');
  assert.deepEqual(t.filas.map(f => f.celdas), [['a', 'b'], ['García, Laura', 'x'], ['dice "hola"', 'y'], ['línea 1\nlínea 2', 'z']]);
  assert.deepEqual(t.filas.map(f => f.linea), [1, 2, 3, 4]); // número de línea de origen, contando saltos entre comillas

  // el punto y coma manda si la primera línea tiene más ; que , (comas dentro de un texto)
  t = RC.analizarTabla('Nombre;Servicio\nAna;Corte, barba');
  assert.equal(t.delimitador, ';');
  assert.deepEqual(t.filas[1].celdas, ['Ana', 'Corte, barba']);

  // comas dentro de comillas en la primera línea no cuentan
  t = RC.analizarTabla('"a,b,c";d\n1;2');
  assert.equal(t.delimitador, ';');

  // empates en la primera línea: el tabulador (pegado desde Excel) gana al punto y coma, y éste a la coma
  t = RC.analizarTabla('Nombre, apellidos\tTeléfono\nAna, Pérez\t612345678');
  assert.equal(t.delimitador, '\t');
  assert.deepEqual(t.filas[1].celdas, ['Ana, Pérez', '612345678']);
  t = RC.analizarTabla('Nombre;Teléfono, móvil\nAna;612345678');
  assert.equal(t.delimitador, ';');
  assert.deepEqual(t.filas[0].celdas, ['Nombre', 'Teléfono, móvil']);

  // líneas vacías, sólo con separadores o sólo con espacios se descartan; las líneas siguen numeradas bien
  t = RC.analizarTabla('\n\na;b\n\n;;\n   \nc;d\n');
  assert.deepEqual(t.filas.map(f => f.celdas), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(t.filas.map(f => f.linea), [3, 7]);

  // sin salto de línea final, con \r sueltos y un solo campo
  assert.deepEqual(RC.analizarTabla('a;b\rc;d').filas.map(f => f.celdas), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(RC.analizarTabla('solo\notro').filas.map(f => f.celdas), [['solo'], ['otro']]);
  assert.deepEqual(RC.analizarTabla('').filas, []);
  assert.deepEqual(RC.analizarTabla('  \n \t \n').filas, []);
  assert.deepEqual(RC.analizarTabla(null).filas, []);

  // comillas sueltas dentro de un campo sin entrecomillar: se respetan
  assert.deepEqual(RC.analizarTabla('a;5" tubo;c').filas[0].celdas, ['a', '5" tubo', 'c']);
  // comillas precedidas de espacios
  assert.deepEqual(RC.analizarTabla('a; "x;y";c').filas[0].celdas, ['a', 'x;y', 'c']);
});

test('analizarTabla: comillas sin cerrar → aviso, sin romper', () => {
  const t = RC.analizarTabla('a;b\n"sin cerrar;c\nd;e');
  assert.equal(t.avisos.length, 1);
  assert.match(t.avisos[0], /comillas/);
  assert.ok(t.filas.length >= 1);
});

test('leerAgenda: títulos en cualquier orden y con sinónimos', () => {
  const a = RC.leerAgenda('Cliente\tMóvil\tDía\tHora\tTratamiento\tNº personas\n' +
    'Laura\t612345678\t30/09/2026\t10:30\tCorte\t2');
  assert.equal(a.encabezado, true);
  assert.equal(a.error, null);
  assert.deepEqual(a.columnas, { nombre: 0, telefono: 1, fecha: 2, hora: 3, servicio: 4, personas: 5 });
  assert.deepEqual(a.filas[0], { _linea: 2, nombre: 'Laura', telefono: '612345678', fecha: '30/09/2026', hora: '10:30', servicio: 'Corte', personas: '2' });

  const b = RC.leerAgenda('HORA;FECHA;TELÉFONO;NOMBRE\n10:30;30/09/2026;612345678;Laura');
  assert.deepEqual(b.columnas, { hora: 0, fecha: 1, telefono: 2, nombre: 3 });
  assert.deepEqual([b.filas[0].nombre, b.filas[0].telefono, b.filas[0].fecha, b.filas[0].hora], ['Laura', '612345678', '30/09/2026', '10:30']);

  const c = RC.leerAgenda('Nombre;Teléfono;Fecha y hora\nLaura;612345678;30/09/2026 10:30');
  assert.deepEqual(c.columnas, { nombre: 0, telefono: 1, fecha: 2 });
  const [cita] = RC.construirCitas(c.filas, { pais: 'ES', hoy: HOY });
  assert.equal(cita.lista, true);
  assert.deepEqual([cita.fecha.iso, cita.hora.texto], ['2026-09-30', '10:30']);
});

test('leerAgenda: sin títulos se usa el orden Nombre, Teléfono, Fecha, Hora, Servicio, Personas', () => {
  const a = RC.leerAgenda('Laura;612345678;30/09/2026;10:30;Corte;2');
  assert.equal(a.encabezado, false);
  assert.deepEqual(a.filas[0], { _linea: 1, nombre: 'Laura', telefono: '612345678', fecha: '30/09/2026', hora: '10:30', servicio: 'Corte', personas: '2' });
  const b = RC.leerAgenda('Laura;612345678;30/09/2026'); // faltan columnas: quedan vacías
  assert.equal(b.filas[0].hora, '');
  assert.equal(b.filas[0].servicio, '');
});

test('leerAgenda: errores claros cuando faltan columnas obligatorias', () => {
  const a = RC.leerAgenda('Nombre;Fecha;Hora\nLaura;30/09/2026;10:30');
  assert.match(a.error, /Falta la columna «Teléfono»/);
  assert.match(a.error, /«Nombre», «Fecha», «Hora»/);
  assert.deepEqual(a.filas, []);
  const b = RC.leerAgenda('Nombre;Teléfono;Hora\nLaura;612345678;10:30');
  assert.match(b.error, /Falta la columna «Fecha»/);
  const c = RC.leerAgenda('Nombre;Hora\nLaura;10:30');
  assert.match(c.error, /«Teléfono» y «Fecha»/);
  assert.equal(RC.leerAgenda('').filas.length, 0);
  assert.equal(RC.leerAgenda('Nombre;Teléfono;Fecha;Hora\n').filas.length, 0); // solo títulos
});

test('leerAgenda: los saltos de línea dentro de una celda no rompen la fila', () => {
  const a = RC.leerAgenda('Nombre;Teléfono;Fecha;Hora;Servicio\n"Laura\nGarcía";612345678;30/09/2026;10:30;"Corte\ny peinado"');
  assert.equal(a.filas.length, 1);
  assert.equal(a.filas[0].nombre, 'Laura García');
  assert.equal(a.filas[0].servicio, 'Corte y peinado');
});

/* ------------------------------------------------------------------- citas */

const AGENDA = [
  'Nombre;Teléfono;Fecha;Hora;Servicio',
  'Marcos;612345679;30/09/2026;11:00;Revisión',
  'Laura;612345678;30/09/2026;9:30;Corte',
  'Sofía;612345670;01/10/2026;10:00;Masaje',
  'Error;12345;30/09/2026;10:00;Test',
  'SinFecha;612345671;;10:00;Test',
  'Duplicada;612345678;30/09/2026;9:30;Corte'
].join('\n');

test('construirCitas: orden cronológico, errores al final y duplicadas señaladas', () => {
  const citas = RC.construirCitas(RC.leerAgenda(AGENDA).filas, { pais: 'ES', hoy: HOY });
  // Cada fila ocupa su hueco cronológico (también la de teléfono erróneo, para verla en su sitio);
  // solo las de fecha inválida van al final.
  assert.deepEqual(citas.map(c => c.nombre), ['Laura', 'Duplicada', 'Error', 'Marcos', 'Sofía', 'SinFecha']);
  const por = Object.fromEntries(citas.map(c => [c.nombre, c]));
  assert.equal(por.Laura.lista, true);
  assert.equal(por.Error.lista, false);
  assert.equal(por.SinFecha.lista, false);
  assert.ok(por.Duplicada.problemas.some(p => /duplicada/i.test(p.texto)), 'la segunda cita idéntica se marca');
  assert.ok(!por.Laura.problemas.some(p => /duplicada/i.test(p.texto)), 'la primera no');
  assert.ok(por.Error.problemas.some(p => p.nivel === 'error' && /9 dígitos/.test(p.texto)));
  assert.ok(por.SinFecha.problemas.some(p => p.nivel === 'error' && /Falta la fecha/.test(p.texto)));
  assert.equal(por.Laura.origen, 'pegado');
  assert.equal(por.Laura.linea, 3);
});

test('construirCitas: avisos de día de la semana, fecha pasada, año supuesto y nombre vacío', () => {
  const filas = [
    { nombre: 'A', telefono: '612345678', fecha: 'lunes 30/09/2026', hora: '10:00' },  // 30/09/2026 es miércoles
    { nombre: 'B', telefono: '612345678', fecha: 'miércoles 30/09/2026', hora: '10:00' },
    { nombre: 'C', telefono: '612345678', fecha: '28/09/2026', hora: '10:00' },        // ya pasó
    { nombre: 'D', telefono: '612345678', fecha: '30/09', hora: '10:00' },             // sin año
    { nombre: '', telefono: '612345678', fecha: '30/09/2026', hora: '10:00' },
    { nombre: 'F', telefono: '912345678', fecha: '30/09/2026', hora: '10:00' }         // fijo
  ];
  const por = Object.fromEntries(RC.construirCitas(filas, { pais: 'ES', hoy: HOY }).map(c => [c.nombre || '(vacío)', c]));
  const textos = c => c.problemas.map(p => p.texto).join(' | ');
  assert.match(textos(por.A), /día de la semana/);
  assert.doesNotMatch(textos(por.B), /día de la semana/);
  assert.match(textos(por.C), /ya ha pasado/);
  assert.equal(por.C.lista, true, 'una fecha pasada avisa pero no bloquea');
  assert.match(textos(por.D), /supuesto 2026/);
  assert.match(textos(por['(vacío)']), /Sin nombre/);
  assert.match(textos(por.F), /fijo/);
  assert.ok(por.F.problemas.every(p => p.nivel === 'aviso'));
});

test('construirCitas: la hora de su columna manda sobre la que venga dentro de la fecha', () => {
  const [a, b] = RC.construirCitas([
    { nombre: 'A', telefono: '612345678', fecha: '30/09/2026 10:30', hora: '' },
    { nombre: 'B', telefono: '612345678', fecha: '30/09/2026 10:30', hora: '11:45' }
  ], { pais: 'ES', hoy: HOY });
  assert.equal(a.hora.texto, '10:30');
  assert.equal(b.hora.texto, '11:45');
});

test('filtrarPorFecha: oculta otras fechas pero nunca esconde las filas con fecha inválida', () => {
  const citas = RC.construirCitas(RC.leerAgenda(AGENDA).filas, { pais: 'ES', hoy: HOY });
  const f = RC.filtrarPorFecha(citas, '2026-09-30');
  assert.deepEqual(f.visibles.map(c => c.nombre), ['Laura', 'Duplicada', 'Error', 'Marcos', 'SinFecha']);
  assert.equal(f.ocultas, 1);
  assert.equal(RC.filtrarPorFecha(citas, '').visibles.length, citas.length);
  assert.equal(RC.filtrarPorFecha(citas, '2026-10-05').visibles.length, 1); // solo la de fecha inválida
  assert.deepEqual(RC.fechasEncontradas(citas), [{ iso: '2026-09-30', n: 4 }, { iso: '2026-10-01', n: 1 }]);
});

test('diagnostico: columnas en otro orden y sin títulos', () => {
  const a = RC.leerAgenda('Ana;612345678;10:30;30/09/2026');
  const citas = RC.construirCitas(a.filas, { pais: 'ES', hoy: HOY });
  assert.equal(citas[0].lista, false);
  assert.equal(RC.diagnostico(a, citas).length, 1);
  assert.match(RC.diagnostico(a, citas)[0], /otro orden/);
  const b = RC.leerAgenda('Ana;612345678;30/09/2026;10:30');
  assert.deepEqual(RC.diagnostico(b, RC.construirCitas(b.filas, { pais: 'ES', hoy: HOY })), []);
});

/* ----------------------------------------------------------------- mensaje */

test('renderizar: sustituye datos y omite la línea a la que le falta alguno', () => {
  const p = 'Hola {nombre}\nCita: {fecha} {hora}\nServicio: {servicio}\nGracias';
  assert.equal(RC.renderizar(p, { nombre: 'Ana', fecha: 'jueves 1', hora: '10:30', servicio: 'Corte' }),
    'Hola Ana\nCita: jueves 1 10:30\nServicio: Corte\nGracias');
  assert.equal(RC.renderizar(p, { nombre: 'Ana', fecha: 'jueves 1', hora: '10:30', servicio: '' }),
    'Hola Ana\nCita: jueves 1 10:30\nGracias');
  assert.equal(RC.renderizar(p, { nombre: '  ', fecha: 'x', hora: 'y', servicio: 'z' }), 'Cita: x y\nServicio: z\nGracias');
  assert.equal(RC.renderizar('{NOMBRE} y {Nombre}', { nombre: 'Ana' }), 'Ana y Ana', 'los datos no distinguen mayúsculas');
  assert.equal(RC.renderizar('a\r\nb\r\n\r\n\r\n\r\nc  \n', {}), 'a\nb\n\nc', 'CRLF, líneas en blanco repetidas y espacios finales');
  assert.equal(RC.renderizar('Hola {desconocido}', { nombre: 'x' }), 'Hola {desconocido}', 'un dato inexistente queda a la vista');
  assert.equal(RC.renderizar('{constructor} {__proto__} {toString}', {}), '{constructor} {__proto__} {toString}');
  // un valor con forma de dato no se vuelve a expandir
  assert.equal(RC.renderizar('Hola {nombre} {fecha}', { nombre: '{fecha}', fecha: '1 de mayo' }), 'Hola {fecha} 1 de mayo');
  // saltos de línea o tabuladores dentro de un valor se aplanan
  assert.equal(RC.renderizar('{nombre}', { nombre: 'Ana\n\tLópez' }), 'Ana López');
});

test('renderizar: si falta un dato pero hay otros en la línea, la línea se conserva (la fecha nunca se pierde)', () => {
  const v = { nombre: '', fecha: 'jueves 1 de octubre', hora: '10:30', servicio: '', personas: '', negocio: 'Sol' };
  assert.equal(RC.renderizar('Hola {nombre}, tu cita es {fecha} a las {hora}.', v), 'Hola, tu cita es jueves 1 de octubre a las 10:30.');
  assert.equal(RC.renderizar('{nombre}, tu cita es {fecha} a las {hora}', v), 'tu cita es jueves 1 de octubre a las 10:30');
  assert.equal(RC.renderizar('Hola {nombre} , {fecha}!', v), 'Hola, jueves 1 de octubre!');
  assert.equal(RC.renderizar('Cita en {negocio}: {fecha} ({servicio})', v), 'Cita en Sol: jueves 1 de octubre ()');
  assert.equal(RC.renderizar('Hola {nombre}\nServicio: {servicio}\nPersonas: {personas}\n{fecha}', v), 'jueves 1 de octubre',
    'una línea con todos sus datos ausentes se omite');
  assert.equal(RC.renderizar('Hola {nombre}, {servicio}\n{fecha}', v), 'jueves 1 de octubre', 'si faltan todos sus datos, la línea desaparece');
  // línea sin datos: siempre se conserva; línea con un dato desconocido: tampoco cuenta como dato
  assert.equal(RC.renderizar('Gracias\n{desconocido}', v), 'Gracias\n{desconocido}');
  assert.equal(RC.renderizar('Hola {nombre}', { nombre: 'Ana' }), 'Hola Ana');
});

test('problemasPlantilla: avisa (sin bloquear) cuando un dato opcional comparte línea con otros', () => {
  const ok = { negocio: 'Sol' };
  let r = RC.problemasPlantilla('Tu cita de {servicio} es {fecha} a las {hora}', ok);
  assert.deepEqual(r.bloqueantes, []);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /mezcla \{servicio\}/);
  assert.match(r.avisos[0], /su propia línea/);
  r = RC.problemasPlantilla('{fecha}\nPersonas: {personas}\nServicio: {servicio}', ok);
  assert.deepEqual(r, { bloqueantes: [], avisos: [] }, 'cada dato opcional en su línea: sin aviso');
  r = RC.problemasPlantilla('Hola {nombre}, tu cita es {fecha}', ok);
  assert.deepEqual(r.avisos, [], 'un nombre ausente se maneja bien y no da aviso');
  r = RC.problemasPlantilla('{fecha} {servicio} {personas}', ok);
  assert.equal(r.avisos.length, 1);
});

test('mensajeDe: plantillas de serie con resultado exacto', () => {
  const [c] = RC.construirCitas(RC.leerAgenda('Nombre\tTeléfono\tFecha\tHora\tServicio\tPersonas\n' +
    'LAURA GARCÍA\t612 345 678\t30/09/2026\t10:30\tCorte y peinado\t2').filas, { pais: 'ES', hoy: HOY });
  const cfg = { negocio: 'Peluquería Sol', hoy: HOY };
  assert.equal(RC.mensajeDe(c, Object.assign({ plantilla: RC.PLANTILLAS.cita.texto }, cfg)),
    'Hola Laura 👋\n' +
    'Te recordamos tu cita en Peluquería Sol:\n' +
    '📅 miércoles 30 de septiembre a las 10:30\n' +
    'Servicio: Corte y peinado\n' +
    '¿Nos confirmas que vienes? Responde SÍ y listo. Si no puedes venir, avísanos con tiempo para ofrecer el hueco a otra persona. ¡Gracias!');
  assert.equal(RC.mensajeDe(c, Object.assign({ plantilla: RC.PLANTILLAS.reserva.texto }, cfg)),
    'Hola Laura 👋\n' +
    'Te recordamos tu reserva en Peluquería Sol:\n' +
    '📅 miércoles 30 de septiembre a las 10:30\n' +
    'Personas: 2\n' +
    '¿Nos confirmas tu asistencia? Responde SÍ. Si no puedes venir, avísanos para liberar la mesa. ¡Gracias!');
  // sin servicio, la línea del servicio desaparece sin dejar huecos
  const [sinServicio] = RC.construirCitas(RC.leerAgenda('Laura;612345678;30/09/2026;10:30').filas, { pais: 'ES', hoy: HOY });
  assert.equal(RC.mensajeDe(sinServicio, Object.assign({ plantilla: RC.PLANTILLAS.cita.texto }, cfg)).split('\n').length, 4);
  assert.ok(!RC.mensajeDe(sinServicio, Object.assign({ plantilla: RC.PLANTILLAS.cita.texto }, cfg)).includes('Servicio'));
  // otro año: se indica
  const [navidad] = RC.construirCitas([{ nombre: 'Ana', telefono: '612345678', fecha: '02/01/2027', hora: '9:00' }], { pais: 'ES', hoy: '2026-12-30' });
  assert.match(RC.mensajeDe(navidad, { negocio: 'X', plantilla: '{fecha}', hoy: '2026-12-30' }), /^sábado 2 de enero de 2027$/);
  // {nombre_completo}
  assert.equal(RC.mensajeDe(c, { negocio: 'X', plantilla: '{nombre_completo}|{nombre}', hoy: HOY }), 'Laura García|Laura');
});

test('problemasPlantilla: bloquea lo que enviaría un mensaje roto', () => {
  const ok = { negocio: 'Peluquería Sol' };
  for (const k of Object.keys(RC.PLANTILLAS)) {
    const r = RC.problemasPlantilla(RC.PLANTILLAS[k].texto, ok);
    assert.deepEqual(r, { bloqueantes: [], avisos: [] }, `la plantilla «${k}» no debe dar problemas`);
  }
  let r = RC.problemasPlantilla('Hola {nombr}, tu cita es {fecha}', ok);
  assert.equal(r.bloqueantes.length, 1);
  assert.match(r.bloqueantes[0], /\{nombr\}/);
  assert.match(r.bloqueantes[0], /\{nombre_completo\}/, 'lista los datos disponibles');
  for (const roto of ['Hola {nombre', 'Hola nombre}', 'Hola { nombre }', 'Hola {{nombre}} {fecha}', 'Hola {} {fecha}', 'Hola {nom bre} {fecha}']) {
    r = RC.problemasPlantilla(roto, ok);
    assert.ok(r.bloqueantes.length >= 1, `«${roto}» debe bloquear`);
  }
  assert.match(RC.problemasPlantilla('', ok).bloqueantes[0], /vacío/);
  assert.match(RC.problemasPlantilla('  \n ', ok).bloqueantes[0], /vacío/);
  r = RC.problemasPlantilla('Cita en {negocio} el {fecha}', { negocio: '   ' });
  assert.match(r.bloqueantes[0], /nombre de tu negocio/);
  assert.deepEqual(RC.problemasPlantilla('Cita en {negocio} el {fecha}', { negocio: 'X' }).bloqueantes, []);
  assert.deepEqual(RC.problemasPlantilla('Sin negocio {fecha}', { negocio: '' }).bloqueantes, [], 'si no usa {negocio}, no hace falta');
  r = RC.problemasPlantilla('Te esperamos, {nombre}', ok);
  assert.deepEqual(r.bloqueantes, []);
  assert.match(r.avisos[0], /no incluye \{fecha\} ni \{hora\}/);
  assert.deepEqual(RC.problemasPlantilla('Tu cita: {hora}', ok).avisos, []);
  for (const campo of RC.CAMPOS) assert.deepEqual(RC.problemasPlantilla('{' + campo + '} {fecha}', { negocio: 'X' }).bloqueantes, [], campo);
});

/* ------------------------------------------------------------------ enlace */

test('enlaceWhatsApp: formato de api.whatsapp.com y codificación exacta', () => {
  const base = 'https://api.whatsapp.com/send?phone=34612345678&text=';
  assert.equal(RC.enlaceWhatsApp('34612345678', 'Hola Ana'), base + 'Hola%20Ana');
  assert.equal(RC.enlaceWhatsApp('34612345678', 'a\nb'), base + 'a%0Ab');
  assert.equal(RC.enlaceWhatsApp('34612345678', 'Hola 👋'), base + 'Hola%20%F0%9F%91%8B');
  assert.equal(RC.enlaceWhatsApp('34612345678', '📅'), base + '%F0%9F%93%85');
  assert.equal(RC.enlaceWhatsApp('34612345678', '¿Sí? ¡Gracias!'), base + '%C2%BFS%C3%AD%3F%20%C2%A1Gracias!');
  assert.equal(RC.enlaceWhatsApp('34612345678', '50% & más #1 =+/'), base + '50%25%20%26%20m%C3%A1s%20%231%20%3D%2B%2F');
  assert.equal(RC.enlaceWhatsApp('34612345678', ''), base);
  for (const m of ['Hola', 'a&b=c?d#e', 'línea 1\nlínea 2\n\n📅 x', '100% "seguro" <b>', 'ñandú 你好', '✅ ❤ ✂ 👋']) {
    const url = RC.enlaceWhatsApp('59899123456', m);
    const u = new URL(url);
    assert.equal(u.searchParams.get('text'), m, 'un navegador lo lee igual');
    assert.equal(u.searchParams.get('phone'), '59899123456');
    assert.equal(u.hostname, 'api.whatsapp.com');
    assert.equal(u.pathname, '/send');
    assert.deepEqual([...u.searchParams.keys()], ['phone', 'text'], 'sin parámetros de más');
  }
});

test('enlaceWhatsApp: no usa wa.me (su redirección destruye los emojis)', () => {
  assert.ok(!RC.enlaceWhatsApp('34612345678', 'Hola 👋').includes('wa.me'));
  assert.ok(!bloque[1].includes("'https://wa.me"), 'el código no debe construir enlaces wa.me');
});

test('enlaceWhatsApp: no genera enlaces con números o textos inválidos', () => {
  for (const d of ['', '1234567', '1234567890123456', '+34612345678', '34 612345678', undefined, null, 'abc', '34612345678\n']) {
    assert.equal(RC.enlaceWhatsApp(d, 'x'), null, String(d));
  }
  assert.equal(RC.enlaceWhatsApp('34612345678', '\uD800'), null, 'carácter Unicode incompleto');
  assert.equal(RC.enlaceWhatsApp('12345678', 'x'), 'https://api.whatsapp.com/send?phone=12345678&text=x');
  assert.equal(RC.enlaceWhatsApp('123456789012345', 'x'), 'https://api.whatsapp.com/send?phone=123456789012345&text=x');
});

test('de la agenda al enlace, de extremo a extremo', () => {
  const entrada = 'Nombre\tTeléfono\tFecha\tHora\tServicio\nLAURA GARCÍA\t612 345 678\t30/09/2026\t10:30\tCorte y peinado\n';
  const [c] = RC.construirCitas(RC.leerAgenda(entrada).filas, { pais: 'ES', hoy: HOY });
  const msg = RC.mensajeDe(c, { negocio: 'Peluquería Sol', plantilla: RC.PLANTILLAS.cita.texto, hoy: HOY });
  const url = RC.enlaceWhatsApp(c.telefono.digitos, msg);
  assert.equal(url.split('?')[0], 'https://api.whatsapp.com/send');
  assert.equal(new URL(url).searchParams.get('phone'), '34612345678');
  const decodificado = new URL(url).searchParams.get('text');
  assert.equal(decodificado.split('\n')[0], 'Hola Laura 👋');
  assert.ok(decodificado.includes('📅 miércoles 30 de septiembre a las 10:30'));
  assert.ok(decodificado.includes('Peluquería Sol'));
});

/* ------------------------------------------------------- archivos y ejemplos */

test('decodificarTexto: UTF-8, Windows-1252 (CSV de Excel) y UTF-16', () => {
  const texto = 'José;Peña;Ñandú;¿Sí? €';
  assert.equal(RC.decodificarTexto(Buffer.from(texto, 'utf8')), texto);
  assert.equal(RC.decodificarTexto(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(texto, 'utf8')])), texto, 'quita el BOM');
  // Windows-1252: é=E9, ñ=F1, Ñ=D1, ¿=BF, €=80
  const cp1252 = Buffer.from([0x4A, 0x6F, 0x73, 0xE9, 0x3B, 0x50, 0x65, 0xF1, 0x61, 0x3B, 0xD1, 0x3B, 0xBF, 0x80]);
  assert.equal(RC.decodificarTexto(cp1252), 'José;Peña;Ñ;¿€');
  const utf16le = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(texto, 'utf16le')]);
  assert.equal(RC.decodificarTexto(utf16le), texto);
  const utf16be = Buffer.from(Buffer.from(texto, 'utf16le')).swap16();
  assert.equal(RC.decodificarTexto(Buffer.concat([Buffer.from([0xFE, 0xFF]), utf16be])), texto);
  assert.equal(RC.decodificarTexto(new Uint8Array(0)), '');
});

test('esExcel: detecta .xlsx y .xls para no interpretarlos como texto', () => {
  assert.equal(RC.esExcel(Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00])), true);
  assert.equal(RC.esExcel(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1])), true);
  assert.equal(RC.esExcel(Buffer.from('Nombre;Teléfono')), false);
  assert.equal(RC.esExcel(Buffer.from([0x50, 0x4B])), false);
  assert.equal(RC.esExcel(new Uint8Array(0)), false);
});

test('plantillaCSV y ejemploAgenda producen agendas que la propia herramienta entiende', () => {
  const p = RC.plantillaCSV();
  assert.ok(p.startsWith('﻿'), 'lleva BOM para que Excel respete las tildes');
  const a = RC.leerAgenda(p);
  assert.equal(a.encabezado, true);
  assert.equal(a.error, null);
  assert.equal(a.filas.length, 0);
  assert.equal(a.delimitador, ';');

  for (const pais of ['ES', 'UY', 'OTRO']) {
    for (const tipo of ['cita', 'reserva']) {
      const ag = RC.leerAgenda(RC.ejemploAgenda('2026-09-30', pais, tipo));
      assert.equal(ag.error, null);
      const citas = RC.construirCitas(ag.filas, { pais, prefijo: '', hoy: HOY });
      assert.equal(citas.length, 5, `${pais}/${tipo}`);
      assert.equal(citas.filter(c => c.lista).length, 4, `${pais}/${tipo}: 4 válidas y 1 con teléfono erróneo`);
      assert.ok(citas.every(c => c.fecha.ok && c.fecha.iso === '2026-09-30'), `${pais}/${tipo}`);
      const cfg = { negocio: 'Negocio', plantilla: RC.PLANTILLAS[tipo].texto, hoy: HOY };
      assert.deepEqual(RC.problemasPlantilla(cfg.plantilla, cfg).bloqueantes, []);
      for (const c of citas.filter(x => x.lista)) {
        assert.equal(RC.esNumeroDeEjemplo(c.telefono.digitos), true, 'los teléfonos del ejemplo son ficticios y quedan bloqueados para el envío');
        const msg = RC.mensajeDe(c, cfg);
        assert.ok(!/[{}]/.test(msg), msg);
        assert.ok(RC.enlaceWhatsApp(c.telefono.digitos, msg));
        if (tipo === 'reserva') assert.match(msg, /Personas: \d/);
        else assert.match(msg, /Servicio: /);
      }
    }
  }
});

test('esNumeroDeEjemplo: solo los ficticios están bloqueados', () => {
  for (const d of RC.NUMEROS_EJEMPLO) assert.equal(RC.esNumeroDeEjemplo(d), true, d);
  for (const d of ['34612345678', '59899123456', '', undefined, '34600000005', '346000000011']) assert.equal(RC.esNumeroDeEjemplo(d), false, String(d));
  assert.equal(RC.NUMEROS_EJEMPLO.length, 8);
  assert.equal(RC.normalizarTelefono('600 000 001', 'ES').digitos, '34600000001');
  assert.equal(RC.normalizarTelefono('099 000 004', 'UY').digitos, '59899000004');
});

/* ---------------------------------------- propiedades: ida y vuelta y ruido */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260929); // semilla fija: si falla, falla siempre igual
const entero = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const elegir = (lista) => lista[Math.floor(rnd() * lista.length)];
const p2 = (n) => (n < 10 ? '0' : '') + n;

const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function fechaAleatoria() {
  const y = entero(2000, 2099), m = entero(1, 12);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate(); // Date como oráculo independiente
  return { y, m, d: entero(1, ultimo) };
}

test('propiedad: cualquier fecha real, escrita en cualquiera de los formatos admitidos, se lee igual', () => {
  for (let i = 0; i < 3000; i++) {
    const { y, m, d } = fechaAleatoria();
    const iso = `${y}-${p2(m)}-${p2(d)}`;
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const formatos = [
      `${d}/${m}/${y}`, `${p2(d)}/${p2(m)}/${y}`, `${d}-${m}-${y}`, `${p2(d)}.${p2(m)}.${y}`, `${d}/${m}/${String(y).slice(2)}`,
      iso, `${y}/${p2(m)}/${p2(d)}`, `${d} de ${MES_LARGO[m - 1]} de ${y}`, `${d} ${MES_LARGO[m - 1]} ${y}`, `${d} ${MES_CORTO[m - 1]} ${y}`,
      `${d} ${MES_CORTO[m - 1].toUpperCase()}. ${y}`, `${DIA_CORTO[dow]} ${d}/${m}/${y}`, `${DIA_LARGO[dow]} ${p2(d)}/${p2(m)}/${y}`,
      `${DIA_LARGO[dow].toUpperCase()}, ${d} de ${MES_LARGO[m - 1]} de ${y}`
    ];
    for (const f of formatos) {
      const r = RC.parsearFecha(f, HOY);
      assert.equal(r.ok, true, `«${f}» → ${r.motivo}`);
      assert.equal(r.iso, iso, f);
      assert.equal(RC.diaSemana(r.iso), dow, f);
      if (/^[a-záéíóú]/i.test(f)) assert.equal(r.diaSemanaTexto, dow, `día de la semana de «${f}»`);
    }
    // y una fecha imposible cercana nunca se acepta: día 32 o mes 13
    assert.equal(RC.parsearFecha(`32/${m}/${y}`, HOY).ok, false);
    assert.equal(RC.parsearFecha(`${d}/13/${y}`, HOY).ok, false);
  }
});

test('propiedad: los días que no existen en el calendario se rechazan', () => {
  for (let i = 0; i < 2000; i++) {
    const y = entero(2000, 2099), m = entero(1, 12);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (ultimo === 31) continue;
    const d = entero(ultimo + 1, 31);
    assert.equal(RC.parsearFecha(`${d}/${m}/${y}`, HOY).ok, false, `${d}/${m}/${y}`);
    assert.equal(RC.parsearFecha(`${y}-${p2(m)}-${p2(d)}`, HOY).ok, false, `${y}-${p2(m)}-${p2(d)}`);
  }
});

test('propiedad: cualquier hora del día, en los formatos admitidos, se lee igual', () => {
  for (let i = 0; i < 3000; i++) {
    const h = entero(0, 23), mi = entero(0, 59);
    const h12 = h % 12 === 0 ? 12 : h % 12, ap = h < 12 ? 'a' : 'p';
    const formatos = [
      `${h}:${p2(mi)}`, `${p2(h)}:${p2(mi)}`, `${h}.${p2(mi)}`, `${h}h${p2(mi)}`, `${p2(h)}:${p2(mi)}:00`, `${h}:${p2(mi)} h`,
      `${h}:${p2(mi)} hs`, `${h12}:${p2(mi)} ${ap}m`, `${h12}:${p2(mi)}${ap.toUpperCase()}M`, `${h12}:${p2(mi)} ${ap}.m.`,
      `${h12}:${p2(mi)} ${ap}. m.`, `${h}${p2(mi)}`
    ];
    for (const f of formatos) {
      const r = RC.parsearHora(f);
      assert.equal(r.ok, true, `«${f}» → ${r.motivo}`);
      assert.equal(r.minutos, h * 60 + mi, f);
      assert.equal(r.texto, `${h}:${p2(mi)}`, f);
    }
  }
  // fuera de rango: nunca se acepta
  for (let i = 0; i < 500; i++) {
    assert.equal(RC.parsearHora(`${entero(24, 99)}:${p2(entero(0, 59))}`).ok, false);
    assert.equal(RC.parsearHora(`${entero(0, 23)}:${entero(60, 99)}`).ok, false);
  }
});

test('propiedad: fecha y hora en la misma celda se separan y se leen igual', () => {
  for (let i = 0; i < 1500; i++) {
    const { y, m, d } = fechaAleatoria();
    const h = entero(0, 23), mi = entero(0, 59);
    const iso = `${y}-${p2(m)}-${p2(d)}`;
    for (const celda of [`${d}/${m}/${y} ${h}:${p2(mi)}`, `${p2(d)}/${p2(m)}/${y}, ${p2(h)}:${p2(mi)}`, `${iso}T${p2(h)}:${p2(mi)}:00`,
      `${iso} ${p2(h)}:${p2(mi)}`, `${d} de ${MES_LARGO[m - 1]} de ${y} ${h}:${p2(mi)}`]) {
      const [c] = RC.construirCitas([{ nombre: 'A', telefono: '612345678', fecha: celda, hora: '' }], { pais: 'ES', hoy: HOY });
      assert.equal(c.lista, true, `«${celda}» → ${c.problemas.map(p => p.texto)}`);
      assert.equal(c.fecha.iso, iso, celda);
      assert.equal(c.hora.minutos, h * 60 + mi, celda);
    }
  }
});

test('propiedad: móviles de España y Uruguay escritos de muchas maneras dan siempre los mismos dígitos', () => {
  for (let i = 0; i < 2000; i++) {
    const es = String(entero(6, 7)) + String(entero(0, 99999999)).padStart(8, '0');
    const formasES = [es, `${es.slice(0, 3)} ${es.slice(3, 6)} ${es.slice(6)}`, `+34 ${es}`, `0034${es}`, `34${es}`, `(+34) ${es.slice(0, 3)}-${es.slice(3)}`,
      `${es.slice(0, 3)}.${es.slice(3, 6)}.${es.slice(6)}`, ` ${es} `, `+34-${es.slice(0, 3)}-${es.slice(3, 6)}-${es.slice(6)}`];
    for (const f of formasES) {
      for (const pais of ['ES', 'UY']) {
        if (pais === 'UY' && !/^(\+|00|34)/.test(f.trim())) continue; // sin prefijo, con Uruguay elegido sería otro país
        const r = RC.normalizarTelefono(f, pais);
        assert.equal(r.ok, true, `«${f}» (${pais}) → ${r.motivo}`);
        assert.equal(r.digitos, '34' + es, `${f} (${pais})`);
      }
    }
    const uy = '9' + String(entero(0, 9999999)).padStart(7, '0');
    const formasUY = [uy, '0' + uy, `+598 ${uy}`, `00598${uy}`, `598${uy}`, `+598 0${uy}`, `0${uy.slice(0, 2)} ${uy.slice(2, 5)} ${uy.slice(5)}`,
      `${uy.slice(0, 2)}-${uy.slice(2, 5)}-${uy.slice(5)}`, `(0${uy.slice(0, 2)}) ${uy.slice(2)}`];
    for (const f of formasUY) {
      const r = RC.normalizarTelefono(f, 'UY');
      assert.equal(r.ok, true, `«${f}» (UY) → ${r.motivo}`);
      assert.equal(r.digitos, '598' + uy, f);
      assert.equal(r.aviso, null, f);
    }
  }
});

test('propiedad: un teléfono aceptado siempre da 8–15 dígitos y uno rechazado nunca da dígitos', () => {
  const alfabeto = '0123456789 +-.()/abE,';
  for (let i = 0; i < 20000; i++) {
    let s = '';
    for (let j = entero(0, 16); j > 0; j--) s += alfabeto[entero(0, alfabeto.length - 1)];
    for (const [pais, pref] of [['ES', ''], ['UY', ''], ['OTRO', '54']]) {
      const r = RC.normalizarTelefono(s, pais, pref);
      if (r.ok) {
        assert.match(r.digitos, /^\d{8,15}$/, `«${s}» (${pais})`);
        assert.ok(r.visible.startsWith('+'), s);
      } else {
        assert.equal(r.digitos, undefined, `«${s}» (${pais})`);
        assert.ok(r.motivo, s);
      }
    }
  }
});

test('robustez: entradas casi reales pero estropeadas nunca lanzan y los invariantes se cumplen', () => {
  const alfabeto = ['0', '1', '5', '9', '/', '-', '.', ':', ' ', '\t', ';', ',', '"', '\n', '+', '(', ')', 'a', 'h', 'p', 'm', 'T', 'ñ', 'é',
    '€', '👋', '\u0000', ' ', '​', '{', '}', '#', '%', '&', 'E', '\uD800'];
  const mutar = (s) => {
    if (rnd() < 0.5) return s; // la mitad de los campos llegan sin tocar, para que haya citas válidas
    let r = s;
    for (let n = entero(1, 3); n > 0; n--) {
      const pos = entero(0, r.length), op = entero(0, 2);
      if (op === 0) r = r.slice(0, pos) + elegir(alfabeto) + r.slice(pos);
      else if (op === 1) r = r.slice(0, pos) + r.slice(pos + 1);
      else r = r.slice(0, pos) + elegir(alfabeto) + r.slice(pos + 1);
    }
    return r;
  };
  const nombres = ['Laura García', 'MARCOS PÉREZ', 'García Pérez, Ana', 'Mª José', 'D\'Angelo', ''];
  const telefonos = ['612345678', '+34 612 345 678', '099123456', '+598 99 123 456', '(612) 345-678', '0034612345678', '912345678', '+54 9 11 5555 1234'];
  const fechas = ['30/09/2026', '2026-09-30', '30 sep 2026', '30/09', 'mié 30/09/2026', '30/09/2026 10:30', '30 de septiembre de 2026'];
  const horas = ['10:30', '9h15', '5:30 pm', '1730', '9', '10.30 h', ''];
  const cfg = { negocio: 'Negocio', plantilla: RC.PLANTILLAS.cita.texto, hoy: HOY };
  let listas = 0, conEnlace = 0;
  for (let i = 0; i < 8000; i++) {
    const fila = { nombre: mutar(elegir(nombres)), telefono: mutar(elegir(telefonos)), fecha: mutar(elegir(fechas)),
      hora: mutar(elegir(horas)), servicio: mutar('Corte'), personas: mutar('2') };
    const [c] = RC.construirCitas([fila], { pais: elegir(['ES', 'UY', 'OTRO']), prefijo: elegir(['', '54', '598']), hoy: HOY });
    assert.equal(c.lista, c.telefono.ok && c.fecha.ok && c.hora.ok);
    if (!c.lista) { assert.ok(c.problemas.some(p => p.nivel === 'error'), 'una fila no lista siempre explica por qué'); continue; }
    listas++;
    assert.match(c.telefono.digitos, /^\d{8,15}$/);
    assert.match(c.fecha.iso, /^20\d\d-\d\d-\d\d$/);
    assert.equal(new Date(c.fecha.iso + 'T00:00:00Z').toISOString().slice(0, 10), c.fecha.iso, 'existe en el calendario');
    assert.ok(c.hora.h >= 0 && c.hora.h <= 23 && c.hora.m >= 0 && c.hora.m <= 59);
    const msg = RC.mensajeDe(c, cfg);
    assert.ok(msg.includes('Te recordamos tu cita en Negocio'), 'el mensaje conserva su texto fijo');
    assert.ok(msg.includes(RC.formatoFecha(c.fecha.iso, HOY)) && msg.includes(c.hora.texto));
    const url = RC.enlaceWhatsApp(c.telefono.digitos, msg);
    if (url) { conEnlace++; assert.equal(new URL(url).searchParams.get('text'), msg); }
  }
  assert.ok(listas > 300, `pocas citas válidas (${listas}): la prueba no ejercita los invariantes`);
  assert.ok(conEnlace > 300, `pocos enlaces (${conEnlace})`);
});

test('robustez: basura aleatoria no hace fallar ninguna función', () => {
  const alfabeto = ['0', '1', '2', '3', '9', '/', '-', '.', ':', ' ', '\t', ';', ',', '"', '\n', '\r', '\r\n', '+', '(', 'a', 'h', 'p', 'm', 'T', 'Z',
    'ñ', '€', '👋', '\u0000', ' ', '﻿', '{', '}', '{nombre}', '{fecha}', '%', 'E', '\uD800', '\uDC00', '́'];
  const cadena = (max) => { let s = ''; for (let n = entero(0, max); n > 0; n--) s += elegir(alfabeto); return s; };
  for (let i = 0; i < 6000; i++) {
    const bruto = cadena(120);
    const agenda = RC.leerAgenda(bruto);
    RC.construirCitas(agenda.filas, { pais: 'ES', hoy: HOY }).forEach(c => RC.mensajeDe(c, { negocio: cadena(10), plantilla: cadena(60), hoy: HOY }));
    RC.analizarTabla(bruto); RC.separarFechaHora(bruto);
    RC.parsearFecha(bruto, HOY); RC.parsearFecha(bruto); RC.parsearHora(bruto);
    RC.normalizarTelefono(bruto, 'ES'); RC.normalizarTelefono(bruto, 'OTRO', cadena(5));
    RC.normalizarNombre(bruto); RC.primerNombre(bruto);
    RC.renderizar(bruto, { nombre: cadena(8), fecha: cadena(8) }); RC.problemasPlantilla(bruto, { negocio: cadena(5) });
    RC.enlaceWhatsApp('34612345678', bruto);
    RC.decodificarTexto(Buffer.from(bruto, 'utf8'));
  }
});

test('rendimiento: 5.000 filas se leen y procesan en un tiempo razonable', () => {
  const filas = ['Nombre;Teléfono;Fecha;Hora;Servicio'];
  for (let i = 0; i < 5000; i++) filas.push(`Cliente ${i};6${String(10000000 + i).slice(-8)};30/09/2026;${9 + (i % 9)}:${p2(i % 60)};Corte`);
  const t0 = Date.now();
  const agenda = RC.leerAgenda(filas.join('\n'));
  const citas = RC.construirCitas(agenda.filas, { pais: 'ES', hoy: HOY });
  const msgs = citas.map(c => RC.enlaceWhatsApp(c.telefono.digitos, RC.mensajeDe(c, { negocio: 'X', plantilla: RC.PLANTILLAS.cita.texto, hoy: HOY })));
  const ms = Date.now() - t0;
  assert.equal(citas.length, 5000);
  assert.equal(msgs.filter(Boolean).length, 5000);
  assert.ok(ms < 5000, `tardó ${ms} ms`);
});

test('propiedad: con cualquier plantilla y cualquier dato ausente, la fecha y la hora siempre llegan al mensaje', () => {
  const trozos = ['Hola', 'Te recordamos', 'tu cita', 'en', ',', '.', ':', '¡Gracias!', '👋', '-', '(', ')'];
  const datos = ['{nombre}', '{nombre_completo}', '{servicio}', '{personas}', '{negocio}', '{fecha}', '{hora}'];
  let comprobadas = 0;
  for (let i = 0; i < 6000; i++) {
    const lineas = [];
    for (let l = entero(1, 5); l > 0; l--) {
      const partes = [];
      for (let k = entero(1, 6); k > 0; k--) partes.push(rnd() < 0.5 ? elegir(trozos) : elegir(datos));
      lineas.push(partes.join(elegir([' ', '  ', ', ', ''])));
    }
    const plantilla = lineas.join('\n');
    const usa = (campo) => plantilla.includes('{' + campo + '}');
    const cita = RC.construirCitas([{
      nombre: rnd() < 0.5 ? '' : 'María López', telefono: '612345678', fecha: '30/09/2026', hora: '10:30',
      servicio: rnd() < 0.5 ? '' : 'Corte', personas: rnd() < 0.5 ? '' : '3'
    }], { pais: 'ES', hoy: HOY })[0];
    const msg = RC.mensajeDe(cita, { negocio: 'Sol', plantilla, hoy: HOY });
    if (usa('fecha')) { assert.ok(msg.includes('miércoles 30 de septiembre'), `falta la fecha\n--plantilla--\n${plantilla}\n--mensaje--\n${msg}`); comprobadas++; }
    if (usa('hora')) assert.ok(msg.includes('10:30'), `falta la hora\n${plantilla}\n→\n${msg}`);
    if (usa('negocio')) assert.ok(msg.includes('Sol'), `falta el negocio\n${plantilla}\n→\n${msg}`);
    assert.ok(!/[{}]/.test(msg), `quedaron llaves\n${plantilla}\n→\n${msg}`);
    assert.ok(!/\n{3,}/.test(msg) && msg === msg.trim(), 'sin líneas en blanco de más ni espacios sobrantes en los extremos');
  }
  assert.ok(comprobadas > 1500, `pocas plantillas con {fecha} (${comprobadas})`);
});
