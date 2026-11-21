import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { datosGenerales, tarjetasSesion, textoDuracion, reducirMediciones, indiceDesde } from '../../compartido/detalle-sesion.js';
import { crearLibro } from '../../compartido/libro-excel.js';
import { SIN_MEDIR, aceleracionTotal } from '../../compartido/exportacion.js';
import { PULSOS_POR_VUELTA } from '../../compartido/parametros-firmware.js';

// Sesión de 60 s a 50 Hz: inclinación lateral, inclinación frontal negativa, un golpe aislado y un
// vuelco; 10 pulsos de rueda; un hueco de 2 s sin datos (38–40 s).
function sesion({ conRueda = true, conReloj = true } = {}) {
  const mediciones = [];
  let pulsos = 0;
  for (let n = 1, t = 0; t <= 60000; t += 20) {
    if (t > 38000 && t < 40000) continue;
    let roll = 0, pitch = 0, ax = 0;
    if (t >= 5000 && t <= 7000) roll = 25;
    if (t >= 12000 && t <= 13000) pitch = -31.5;
    if (t === 21040) ax = 30;                     // golpe de una sola muestra
    if (t >= 30000 && t <= 33000) roll = 170;
    if (t >= 1000 && t < 6000 && t % 500 === 0) pulsos++;
    const r = roll * Math.PI / 180, p = pitch * Math.PI / 180;
    mediciones.push({ numero: n++, t_ms: t, ax: ax || 9.81 * Math.sin(p), ay: 9.81 * Math.sin(r) * Math.cos(p), az: 9.81 * Math.cos(r) * Math.cos(p),
      roll_deg: roll, pitch_deg: pitch, rueda_rps: conRueda ? 0 : null, rueda_pulsos: conRueda ? pulsos : null });
  }
  const ev = (id, tipo, t) => ({ id, sesion_id: 'S-1', tipo, gravedad: 'media', estado: 'confirmado', t_inicio_ms: t - 1000, t_deteccion_ms: t, t_fin_ms: t + 2000, t_activacion_ms: t + 1, ubicacion: null });
  return {
    version: 1, sesion: { id: 'S-1', origen: 'real' }, mediciones,
    eventos: [ev('S-1-EV3', 'vuelco', 30200), ev('S-1-EV1', 'inclinacion', 5200), ev('S-1-EV2', 'golpe', 21040), ev('S-1-EV4', 'inclinacion', 12200)],
    // Última medición (t = 60 000 ms) recibida el 21/11/2026 a las 10:01:00 en Ecuador (UTC−5).
    reloj: conReloj ? { ultima_recepcion_ms: Date.UTC(2026, 10, 21, 15, 1, 0), t_ultima_medicion_ms: 60000 } : null
  };
}

test('datos generales: duración, mediciones, eventos por tipo, máximos con su instante y vueltas', () => {
  const d = datosGenerales(sesion());
  assert.equal(d.sesion_id, 'S-1');
  assert.equal(d.duracion_ms, 60000);
  assert.equal(d.mediciones, 3001 - 99);           // 99 muestras en el hueco de 2 s
  assert.deepEqual([d.golpes, d.inclinaciones, d.vuelcos], [1, 2, 1]);
  assert.deepEqual(d.max_roll, { valor: 170, t_ms: 30000 });
  assert.deepEqual(d.max_pitch, { valor: -31.5, t_ms: 12000 }, 'conserva el signo');
  assert.equal(d.max_aceleracion.t_ms, 21040);
  assert.ok(Math.abs(d.max_aceleracion.valor - aceleracionTotal({ ax: 30, ay: 0, az: 9.81 })) < 1e-9);
  assert.equal(d.vueltas, 10 / PULSOS_POR_VUELTA);
  assert.equal(d.rueda_fuente, 'contador rueda_pulsos');
});

test('datos generales: hora de inicio y fin con el reloj de la API', () => {
  const d = datosGenerales(sesion());
  assert.equal(d.hora_fin_ms, Date.UTC(2026, 10, 21, 15, 1, 0));
  assert.equal(d.hora_inicio_ms, Date.UTC(2026, 10, 21, 15, 0, 0));
  const t = Object.fromEntries(tarjetasSesion(d).map(x => [x.id, x]));
  assert.equal(t.inicio.valor, '10:00:00');
  assert.equal(t.fin.valor, '10:01:00');
  assert.match(t.inicio.detalle, /aprox/);
});

test('datos generales: sin reloj ni rueda se escribe «sin medir», nunca 0', () => {
  const d = datosGenerales(sesion({ conRueda: false, conReloj: false }));
  assert.equal(d.hora_inicio_ms, null);
  assert.equal(d.vueltas, null);
  const t = Object.fromEntries(tarjetasSesion(d).map(x => [x.id, x]));
  assert.equal(t.inicio.valor, SIN_MEDIR);
  assert.equal(t.fin.valor, SIN_MEDIR);
  assert.equal(t.vueltas.valor, SIN_MEDIR);
});

test('datos generales: sesión vacía y sin eventos', () => {
  const d = datosGenerales({ sesion: { id: 'V', origen: 'simulado' }, mediciones: [] });
  assert.equal(d.mediciones, 0);
  assert.equal(d.duracion_ms, null);
  assert.deepEqual([d.golpes, d.inclinaciones, d.vuelcos], [0, 0, 0]);
  assert.equal(d.max_roll, null);
  const t = Object.fromEntries(tarjetasSesion(d).map(x => [x.id, x]));
  assert.equal(t.duracion.valor, SIN_MEDIR);
  assert.equal(t.roll.valor, SIN_MEDIR);
  assert.equal(t.roll.t_ms, undefined, 'sin instante no hay salto');
});

test('datos generales: un paquete con «evento» suelto se trata como sesión completa', () => {
  const p = sesion();
  const d = datosGenerales({ ...p, evento: p.eventos[0] });
  assert.equal(d.duracion_ms, 60000);
  assert.equal(d.golpes + d.inclinaciones + d.vuelcos, 4);
});

test('tarjetas: textos de eventos, máximos e instantes para saltar', () => {
  const t = Object.fromEntries(tarjetasSesion(datosGenerales(sesion())).map(x => [x.id, x]));
  assert.equal(t.eventos.valor, '4');
  assert.equal(t.eventos.detalle, '1 golpe · 2 inclinaciones · 1 vuelco');
  assert.equal(t.roll.valor, '170,0°');
  assert.equal(t.pitch.valor, '-31,5°');
  assert.equal(t.roll.t_ms, 30000);
  assert.equal(t.aceleracion.t_ms, 21040);
  assert.equal(t.duracion.valor, '1 min 00 s');
  assert.equal(t.mediciones.valor, (2902).toLocaleString('es-EC'));
});

test('textoDuracion', () => {
  assert.equal(textoDuracion(12400), '12,4 s');
  assert.equal(textoDuracion(187000), '3 min 07 s');
  assert.equal(textoDuracion(3725000), '1 h 02 min 05 s');
  assert.equal(textoDuracion(null), SIN_MEDIR);
});

test('reducirMediciones: pocas mediciones se devuelven todas', () => {
  const m = sesion().mediciones.slice(0, 100);
  const r = reducirMediciones(m, { maxPuntos: 1500 });
  assert.equal(r.length, 100);
  assert.equal(r[0], m[0], 'sin copiar si no hay corte');
});

test('reducirMediciones: limita los puntos y conserva el golpe de una sola muestra y los extremos', () => {
  const m = sesion().mediciones;
  const r = reducirMediciones(m, { maxPuntos: 300 });
  assert.ok(r.length <= 300 + 4, `dibuja ${r.length}`);
  assert.ok(r.length < m.length / 5);
  assert.ok(r.some(x => x.t_ms === 21040), 'el pico de golpe sigue');
  assert.equal(Math.max(...r.map(aceleracionTotal)), Math.max(...m.map(aceleracionTotal)));
  assert.equal(Math.max(...r.map(x => x.roll_deg)), 170);
  assert.equal(Math.min(...r.map(x => x.pitch_deg)), -31.5);
  assert.equal(r[0].t_ms, 0); assert.equal(r.at(-1).t_ms, 60000);
  for (let i = 1; i < r.length; i++) assert.ok(r[i].t_ms > r[i - 1].t_ms, 'ordenadas y sin duplicados');
});

test('reducirMediciones: marca el corte del hueco real aunque los puntos estén separados', () => {
  const m = sesion().mediciones;
  const r = reducirMediciones(m, { maxPuntos: 300 });
  const cortes = r.filter(x => x.corte);
  assert.equal(cortes.length, 1);
  assert.ok(cortes[0].t_ms >= 40000 && cortes[0].t_ms < 41500, `corte en ${cortes[0].t_ms}`);
  assert.equal(m.some(x => x.corte), false, 'no modifica las originales');
  const todas = reducirMediciones(m, { maxPuntos: 5000 });
  assert.deepEqual(todas.filter(x => x.corte).map(x => x.t_ms), [40000]);
});

test('reducirMediciones: rango de zoom y puntos fijos en los eventos', () => {
  const m = sesion().mediciones;
  const r = reducirMediciones(m, { desde: 20000, hasta: 22000, maxPuntos: 40, fijos: [21000, 90000] });
  assert.ok(r[0].t_ms <= 20000 && r[0].t_ms >= 19980, 'incluye el borde izquierdo (una muestra de margen)');
  assert.ok(r.at(-1).t_ms >= 22000 && r.at(-1).t_ms <= 22020);
  assert.ok(r.some(x => x.t_ms === 21000), 'conserva la detección del evento');
  assert.ok(r.some(x => x.t_ms === 21040), 'y el golpe');
  assert.ok(r.length <= 40 + 4);
});

test('indiceDesde: búsqueda binaria por t_ms', () => {
  const m = [{ t_ms: 0 }, { t_ms: 20 }, { t_ms: 40 }];
  assert.deepEqual([-5, 0, 10, 20, 41].map(t => indiceDesde(m, t)), [0, 0, 1, 1, 3]);
});

test('libro completo («Exportar sesión»): resumen y datos técnicos de todas las muestras en un solo archivo', async () => {
  const p = sesion();
  const buffer = await crearLibro(ExcelJS, p, { fuente: 'web', formato: 'completo' }).xlsx.writeBuffer();
  const libro = new ExcelJS.Workbook(); await libro.xlsx.load(buffer);
  assert.deepEqual(libro.worksheets.map(h => h.name),
    ['Resumen', 'Eventos', 'Inclinaciones', 'Rueda', 'Datos', 'Eventos (detalle)', 'Parámetros del firmware', 'Columnas', 'Léeme', 'Metadatos']);
  assert.equal(libro.getWorksheet('Datos').rowCount, p.mediciones.length + 1, 'todas las muestras');
  assert.equal(libro.getWorksheet('Eventos').rowCount, 5);
  assert.equal(libro.getWorksheet('Eventos (detalle)').rowCount, 5);
  const columnas = libro.getWorksheet('Columnas').getSheetValues().filter(Boolean).map(f => f[4]);
  assert.ok(columnas.includes('Eventos (detalle)') && !columnas.includes('Eventos'));
});
