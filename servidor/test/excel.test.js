import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { crearLibro } from '../../compartido/libro-excel.js';
import { calcularResumen, SIN_MEDIR } from '../../compartido/resumen.js';
import { crearExcel } from '../src/aplicacion/excel.js';
import { generarEscenario } from '../../web/src/simulation.js';

const ev2 = JSON.parse(await fs.readFile(new URL('../../ejemplos/vuelco-002.json', import.meta.url)));
const leer = async buffer => { const l = new ExcelJS.Workbook(); await l.xlsx.load(buffer); return l; };
const celdas = libro => libro.worksheets.map(h => [h.name, h.getSheetValues()]);
const resumen = libro => Object.fromEntries(libro.getWorksheet('Resumen').getSheetValues().filter(Boolean).map(f => [f[1], f]));

test('resumen de EV-002: picos, respuesta y rueda salen de las mediciones y del evento', () => {
  const r = calcularResumen(ev2);
  assert.equal(r.respuesta_ms, 20); assert.equal(r.duracion_ms, 2000); assert.equal(r.t_deteccion_ms, 1500);
  assert.deepEqual(r.pico_aceleracion, { valor: Math.hypot(-1.5, 18.2, 3.5), t_ms: 1500 });
  assert.deepEqual(r.pico_roll, { valor: 90, t_ms: 2200 }); assert.deepEqual(r.pico_pitch, { valor: 12, t_ms: 2200 });
  assert.equal(r.rueda.estado, 'sin dato'); assert.equal(r.rueda.maximo, null);
});

test('la web y el servidor generan el mismo libro para el mismo paquete', async () => {
  const servidor = await leer(await crearExcel(ev2));
  const web = await leer(await crearLibro(ExcelJS, ev2, { fuente: 'web' }).xlsx.writeBuffer());
  const sinFuente = l => JSON.parse(JSON.stringify(celdas(l)).replace(/"exportado_desde","(web|servidor)"/, '"exportado_desde","x"'));
  assert.deepEqual(sinFuente(web), sinFuente(servidor));
  const datos = servidor.getWorksheet('Datos');
  assert.deepEqual(datos.views[0], { ...datos.views[0], state: 'frozen', ySplit: 1 }); assert.ok(datos.autoFilter);
});

test('una activación ausente se escribe como «sin medir», nunca como 0', async () => {
  const corrida = generarEscenario('vuelco');
  const libro = await leer(await crearLibro(ExcelJS, corrida, { fuente: 'web' }).xlsx.writeBuffer());
  assert.deepEqual(libro.worksheets.map(h => h.name), ['Resumen', 'Evento', 'Datos', 'Parámetros', 'Columnas', 'Metadatos']);
  const r = resumen(libro);
  assert.equal(r['Instante de activación'][2], SIN_MEDIR); assert.equal(r['Tiempo de respuesta'][2], SIN_MEDIR);
  assert.equal(r['Tiempo de respuesta'][4], SIN_MEDIR);
  assert.equal(r['Instante de detección'][2], corrida.evento.t_deteccion_ms);
  const e = libro.getWorksheet('Evento'); const claves = e.getRow(1).values;
  for (const clave of ['t_activacion_ms', 'respuesta_ms', 't_activacion_s', 'respuesta_s']) assert.equal(e.getRow(2).getCell(claves.indexOf(clave)).value, SIN_MEDIR);
  const datos = libro.getWorksheet('Datos');
  assert.equal(datos.rowCount, corrida.mediciones.length + 1);
  const m = corrida.mediciones[250];
  assert.deepEqual(datos.getRow(252).values.slice(1), [m.numero, m.t_ms, m.ax, m.ay, m.az, m.roll_deg, m.pitch_deg, m.rueda_rps]);
  const p = libro.getWorksheet('Parámetros').getSheetValues().filter(Boolean).map(f => [f[1], f[2]]);
  assert.deepEqual(p.slice(1), Object.entries(corrida.parametros));
});

test('corrida sin incidente: sin hoja Evento y resumen sin tiempos inventados', async () => {
  const corrida = generarEscenario('normal');
  const libro = await leer(await crearLibro(ExcelJS, corrida, { fuente: 'web' }).xlsx.writeBuffer());
  assert.equal(libro.getWorksheet('Evento'), undefined);
  const r = resumen(libro);
  assert.equal(r['Evento'][2], 'Sin incidente detectado'); assert.equal(r['Instante de detección'], undefined);
  const vacia = await leer(await crearLibro(ExcelJS, { version: 1, sesion: { id: 'S', origen: 'real' }, evento: null, mediciones: [] }).xlsx.writeBuffer());
  assert.match(vacia.getWorksheet('Resumen').getCell('A2').value, /REALES/);
  assert.equal(resumen(vacia)['Pico de aceleración total'][2], 'sin mediciones');
});
