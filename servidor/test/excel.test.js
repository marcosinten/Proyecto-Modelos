import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { crearLibro } from '../../compartido/libro-excel.js';
import { calcularResumen } from '../../compartido/resumen.js';
import { SIN_MEDIR, tramosInclinacion, resumenRueda, resumenSesion, analizarEvento } from '../../compartido/exportacion.js';
import { PULSOS_POR_VUELTA } from '../../compartido/parametros-firmware.js';
import { crearExcel } from '../src/aplicacion/excel.js';
import { generarEscenario } from '../../web/src/simulation.js';

const leerJSON = async nombre => JSON.parse(await fs.readFile(new URL('../../ejemplos/' + nombre, import.meta.url)));
const ev1 = await leerJSON('vuelco.json');
const ev2 = await leerJSON('vuelco-002.json');
const leer = async buffer => { const l = new ExcelJS.Workbook(); await l.xlsx.load(buffer); return l; };
const libroDe = async (paquete, formato, fuente = 'web') => leer(await crearLibro(ExcelJS, paquete, { fuente, formato }).xlsx.writeBuffer());
const celdas = libro => libro.worksheets.map(h => [h.name, h.getSheetValues()]);
const filas = hoja => hoja.getSheetValues().filter(Boolean).map(f => f.slice(1));
const conceptos = hoja => Object.fromEntries(filas(hoja).map(f => [f[0], f]));
const CONTRATO = ['numero', 't_ms', 'ax', 'ay', 'az', 'roll_deg', 'pitch_deg', 'rueda_rps', 'rueda_pulsos'];

// Sesión sintética de 30 s a 50 Hz con varios eventos, tramos y rueda con contador.
function sesionSintetica() {
  const mediciones = [];
  let pulsos = 0;
  for (let n = 1, t = 0; t <= 30000; n++, t += 20) {
    let roll = 0, pitch = 0, ax = 0;
    if (t >= 5000 && t <= 8200) roll = 24.5;                                    // inclinación lateral de 3,2 s
    if ((t >= 10000 && t <= 10400) || (t >= 10500 && t <= 11000)) pitch = 22;  // hueco de 100 ms: un solo tramo
    if (t >= 13000 && t <= 13100) roll = -30;                                   // 100 ms: se descarta
    if (t === 15000) ax = 20;                                                   // golpe
    if (t >= 20000 && t <= 24000) roll = 95;                                    // vuelco de 4 s
    if (t >= 1000 && t <= 4000 && t % 500 === 0) pulsos++;                      // 7 pulsos
    const r = roll * Math.PI / 180, p = pitch * Math.PI / 180;
    mediciones.push({ numero: n, t_ms: t, ax: ax || 9.81 * Math.sin(p), ay: 9.81 * Math.sin(r) * Math.cos(p), az: 9.81 * Math.cos(r) * Math.cos(p),
      roll_deg: roll, pitch_deg: pitch, rueda_rps: t >= 1000 && t < 4000 ? 2 : 0, rueda_pulsos: pulsos });
  }
  const ev = (id, tipo, t_inicio_ms, t_deteccion_ms, t_fin_ms, t_activacion_ms) =>
    ({ id, sesion_id: 'SINT-1', tipo, gravedad: 'alta', estado: 'confirmado', t_inicio_ms, t_fin_ms, t_deteccion_ms, t_activacion_ms, ubicacion: null });
  return {
    version: 1, sesion: { id: 'SINT-1', origen: 'real' }, mediciones,
    eventos: [ev('SINT-1-EV001', 'inclinacion', 4000, 5150, 8700, 5151), ev('SINT-1-EV002', 'golpe', 14000, 15000, 15500, null), ev('SINT-1-EV003', 'vuelco', 19000, 20150, 25000, 20151)],
    // 10:00:30 en Ecuador para la última medición (t = 30 s).
    reloj: { ultima_recepcion_ms: Date.UTC(2026, 10, 20, 15, 0, 30), t_ultima_medicion_ms: 30000 }
  };
}

test('tramos de inclinación: une huecos < 200 ms y descarta tramos < 150 ms', () => {
  const t = tramosInclinacion(sesionSintetica().mediciones);
  assert.deepEqual(t.map(x => [x.t_inicio_ms, x.duracion_ms, x.eje, x.maximo_deg]), [
    [5000, 3200, 'lateral', 24.5], [10000, 1000, 'frontal', 22], [20000, 4000, 'lateral', 95]
  ]);
  assert.equal(t[0].direccion, 'lado izquierdo elevado');
  assert.equal(t[1].direccion, 'trompa elevada');
});

test('rueda con sensor: vueltas del contador, tiempo girando y detenida, distancia sin medir', () => {
  const r = resumenRueda(sesionSintetica().mediciones);
  assert.equal(r.pulsos, 7); assert.equal(r.vueltas, 7 / PULSOS_POR_VUELTA);
  assert.equal(r.fuente, 'contador rueda_pulsos');
  assert.equal(r.t_girando_ms, 3000); assert.equal(r.t_detenida_ms, 27000);
  assert.deepEqual(r.maximo_rps, { valor: 2, t_ms: 1000 });
  assert.equal(r.distancia_m, null); assert.equal(r.velocidad_media_m_s, null);
  const sinRueda = resumenRueda(ev2.mediciones);
  assert.equal(sinRueda.con_dato, false); assert.equal(sinRueda.vueltas, null);
});

test('frases de cada evento con las convenciones de explanation.js', () => {
  const s = sesionSintetica();
  const frases = s.eventos.map(e => analizarEvento(e, s.mediciones).frase);
  assert.deepEqual(frases, [
    'Se inclinó 24,5° hacia un lado (lado izquierdo elevado) durante 3,2 s.',
    'Golpe de 22,3 m/s² de aceleración total (2,3 veces la gravedad).',
    'Se volcó: llegó a 95,0° de lado (lado izquierdo elevado) y pasó 4,0 s sobre 90°.'
  ]);
  assert.match(analizarEvento(ev2.evento, ev2.mediciones).frase, /^Se volcó: llegó a 90,0° de lado/);
  assert.equal(analizarEvento({ ...ev2.evento, tipo: 'golpe' }, []).frase, 'Golpe registrado; no hay mediciones guardadas en su ventana.');
});

test('resumen de la sesión sintética: eventos por tipo, máximos y hora aproximada', async () => {
  const s = sesionSintetica();
  const r = resumenSesion(s);
  assert.deepEqual(r.eventos_por_tipo, { golpe: 1, inclinacion: 1, vuelco: 1 });
  assert.equal(r.duracion_ms, 30000); assert.equal(r.max_roll.valor, 95);
  assert.equal(r.hora_inicio_ms, Date.UTC(2026, 10, 20, 15, 0, 0));
  const libro = await libroDe(s, 'resumen');
  assert.deepEqual(libro.worksheets.map(h => h.name), ['Resumen', 'Eventos', 'Inclinaciones', 'Rueda']);
  const ev = filas(libro.getWorksheet('Eventos'));
  assert.equal(ev.length, 4);
  assert.deepEqual(ev[1].slice(0, 8), ['SINT-1-EV001', 'Inclinación', '10:00:05', 4, 4.7, 24.5, 9.8, 1]);
  assert.equal(ev[2][7], SIN_MEDIR, 'respuesta de la alarma ausente');
  assert.deepEqual(ev[3].slice(8, 10), [SIN_MEDIR, SIN_MEDIR], 'tiempo de detección y latencia de activación sin medir');
  assert.equal(ev[3].at(-1), 'Se volcó: llegó a 95,0° de lado (lado izquierdo elevado) y pasó 4,0 s sobre 90°.');
  const res = conceptos(libro.getWorksheet('Resumen'));
  assert.equal(res['Golpes'][1], 1); assert.equal(res['Vuelcos'][1], 1); assert.equal(res['Tramos inclinados'][1], 3);
  assert.match(res['Hora aproximada de inicio'][1], /10:00:00 \(aprox\. ±1 s\)/);
  assert.equal(filas(libro.getWorksheet('Inclinaciones')).length, 4);
  const rueda = conceptos(libro.getWorksheet('Rueda'));
  assert.equal(rueda['Vueltas'][1], 7); assert.equal(rueda['Distancia recorrida'][1], SIN_MEDIR);
  assert.match(libro.getWorksheet('Rueda').getCell('A1').value, /Rueda con sensor \(trasera\)/);
});

test('técnico: todas las muestras con rueda_pulsos y nombres del contrato en la fila 1', async () => {
  const s = sesionSintetica();
  const libro = await libroDe(s, 'tecnico');
  assert.deepEqual(libro.worksheets.map(h => h.name), ['Datos', 'Eventos', 'Parámetros del firmware', 'Columnas', 'Léeme', 'Metadatos']);
  const datos = libro.getWorksheet('Datos');
  assert.deepEqual(datos.getRow(1).values.slice(1), CONTRATO);
  assert.equal(datos.rowCount, s.mediciones.length + 1);
  assert.deepEqual(datos.getRow(datos.rowCount).values.slice(1), Object.values(s.mediciones.at(-1)));
  const eventos = libro.getWorksheet('Eventos'), claves = eventos.getRow(1).values;
  const dato = (fila, clave) => eventos.getRow(fila).getCell(claves.indexOf(clave)).value;
  assert.equal(eventos.rowCount, 4);
  assert.equal(dato(3, 't_activacion_ms'), SIN_MEDIR); assert.equal(dato(3, 'respuesta_ms'), SIN_MEDIR);
  assert.equal(dato(2, 'respuesta_ms'), 1); assert.match(dato(2, 'hora_aprox'), /10:00:05 \(aprox\. ±1 s\)/);
  const parametros = Object.fromEntries(filas(libro.getWorksheet('Parámetros del firmware')).map(f => [f[3], f[1]]));
  assert.equal(parametros.UMBRAL_GOLPE_MS2, 16); assert.equal(parametros.PULSOS_POR_VUELTA, PULSOS_POR_VUELTA);
  const leeme = filas(libro.getWorksheet('Léeme')).map(f => f[0]).join('\n');
  for (const texto of ['X hacia adelante', 'quieto durante 2 s', 'solo con el acelerómetro', 'ventana de 20 ms', 'desde el arranque del ESP32'])
    assert.ok(leeme.includes(texto), texto);
});

test('compatibilidad con df_from_web_excel del cuaderno: Datos y Metadatos campo/valor', async () => {
  for (const paquete of [ev1, sesionSintetica()]) {
    const libro = await libroDe(paquete, 'tecnico');
    const requeridas = ['t_ms', 'ax', 'ay', 'az', 'roll_deg', 'pitch_deg'];
    const cab = libro.getWorksheet('Datos').getRow(1).values;
    for (const c of requeridas) assert.ok(cab.includes(c), c);
    const meta = filas(libro.getWorksheet('Metadatos'));
    assert.deepEqual(meta[0].slice(0, 2), ['campo', 'valor']);
    const m = Object.fromEntries(meta.slice(1).map(f => [f[0], f[1]]));
    assert.equal(m.sesion_id, paquete.sesion.id); assert.equal(m.origen, paquete.sesion.origen);
    assert.equal(meta[1][2], paquete.sesion.id, 'formato de la web: columna sesion');
  }
});

test('la web y el servidor generan los mismos libros para el mismo paquete', async () => {
  for (const formato of ['resumen', 'tecnico']) {
    const servidor = await leer(await crearExcel(ev2, { formato }));
    const web = await libroDe(ev2, formato, 'web');
    const sinFuente = l => JSON.parse(JSON.stringify(celdas(l)).replace(/(exportado_desde|exportado desde)[":, ]+(web|servidor)/g, 'x'));
    assert.deepEqual(sinFuente(web), sinFuente(servidor), formato);
  }
  const datos = (await leer(await crearExcel(ev2))).getWorksheet('Datos');
  assert.deepEqual(datos.views[0], { ...datos.views[0], state: 'frozen', ySplit: 1 }); assert.ok(datos.autoFilter);
});

test('ejemplos sin reloj de la API: la hora queda «sin medir», nunca inventada', async () => {
  const libro = await libroDe(ev1, 'resumen');
  const res = conceptos(libro.getWorksheet('Resumen'));
  assert.equal(res['Hora aproximada de inicio'][1], SIN_MEDIR);
  assert.equal(res['Alcance'][1], 'Evento EV-001');
  assert.equal(filas(libro.getWorksheet('Eventos'))[1][2], SIN_MEDIR);
  assert.match(libro.getWorksheet('Resumen').getCell('A2').value, /SIMULADOS/);
  assert.equal(conceptos(libro.getWorksheet('Rueda'))['Datos de la rueda'][1], 'sin dato');
});

test('simulación: activación ausente «sin medir» y parámetros de la corrida en el técnico', async () => {
  const corrida = generarEscenario('vuelco');
  const libro = await libroDe(corrida, 'tecnico');
  assert.deepEqual(libro.worksheets.map(h => h.name), ['Datos', 'Eventos', 'Parámetros del firmware', 'Parámetros simulación', 'Columnas', 'Léeme', 'Metadatos']);
  const e = libro.getWorksheet('Eventos'); const claves = e.getRow(1).values;
  for (const clave of ['t_activacion_ms', 'respuesta_ms']) assert.equal(e.getRow(2).getCell(claves.indexOf(clave)).value, SIN_MEDIR);
  const m = corrida.mediciones[250];
  assert.deepEqual(libro.getWorksheet('Datos').getRow(252).values.slice(1), [m.numero, m.t_ms, m.ax, m.ay, m.az, m.roll_deg, m.pitch_deg, m.rueda_rps]);
  const p = filas(libro.getWorksheet('Parámetros simulación')).map(f => [f[0], f[1]]);
  assert.deepEqual(p.slice(1), Object.entries(corrida.parametros));
});

test('corrida sin incidente y sesión vacía: sin eventos inventados', async () => {
  const libro = await libroDe(generarEscenario('normal'), 'resumen');
  assert.equal(filas(libro.getWorksheet('Eventos')).length, 1, 'solo encabezado');
  assert.equal(conceptos(libro.getWorksheet('Resumen'))['Golpes'][1], 0);
  const vacia = await libroDe({ version: 1, sesion: { id: 'S', origen: 'real' }, evento: null, mediciones: [] }, 'resumen');
  assert.match(vacia.getWorksheet('Resumen').getCell('A2').value, /REALES/);
  assert.equal(conceptos(vacia.getWorksheet('Resumen'))['Aceleración total máxima'][1], SIN_MEDIR);
  assert.equal((await libroDe({ version: 1, sesion: { id: 'S', origen: 'real' }, mediciones: [] }, 'tecnico')).getWorksheet('Datos').rowCount, 1);
});

test('resumen de EV-002 (calcularResumen sigue disponible)', () => {
  const r = calcularResumen(ev2);
  assert.equal(r.respuesta_ms, 20); assert.equal(r.duracion_ms, 2000);
  assert.deepEqual(r.pico_roll, { valor: 90, t_ms: 2200 });
});
