// Fase 3: comparación simulación vs. prototipo y métricas del detector (web/src/resultados.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { calcularResultados, claseDetectada, estadistica, errores, matrizConfusion, repeticion, valoresSimulados, PARAMETROS_SIMULACION } from '../../web/src/resultados.js';
import { crearLibroResultados } from '../../compartido/libro-excel.js';
import { CONSTANTES_INO } from '../../compartido/parametros-firmware.js';

const ev = (tipo, extra = {}) => ({ id: 'E-' + tipo, sesion_id: 'S', tipo, gravedad: 'alta', estado: 'confirmado', t_inicio_ms: 0, t_fin_ms: 10, t_deteccion_ms: 5, t_activacion_ms: 5, ubicacion: null, ...extra });
const prueba = (escenario_esperado, n, eventos = [], pico = 9.81) => ({ sesion_id: `RC-${escenario_esperado}-${n}`, escenario_esperado, repeticion: n, nota: '', registrada_ms: 0, mediciones: 100, pico_aceleracion_ms2: pico, max_roll_deg: 1, max_pitch_deg: 2, eventos });

test('la simulación usa los parámetros del firmware y da el tiempo de detección de sus contadores', () => {
  assert.deepEqual(PARAMETROS_SIMULACION, { aceleracion: CONSTANTES_INO.UMBRAL_GOLPE_MS2, angulo: CONSTANTES_INO.UMBRAL_INCLINACION_DEG, permanencia: 150, permanenciaImpacto: 8 });
  const golpe = valoresSimulados('golpe');
  assert.equal(golpe.clase, 'golpe'); assert.equal(golpe.latencia_deteccion_ms, 4, '2 lecturas a 250 Hz');
  assert.equal(valoresSimulados('inclinacion').latencia_deteccion_ms, 152, '150 ms en lecturas de 4 ms');
  assert.equal(valoresSimulados('vuelco').clase, 'vuelco');
  for (const e of ['reposo', 'marcha', 'frenada']) {
    const s = valoresSimulados(e);
    assert.equal(s.clase, 'ninguno', e); assert.equal(s.latencia_deteccion_ms, null);
  }
  assert.equal(valoresSimulados('reposo').pico_aceleracion_ms2, 9.81);
  assert.equal(golpe.latencia_activacion_ms, null, 'la activación no está modelada');
});

test('clase detectada: manda el más grave y no cuenta los cancelados', () => {
  assert.equal(claseDetectada([]), 'ninguno');
  assert.equal(claseDetectada([ev('inclinacion'), ev('vuelco')]), 'vuelco');
  assert.equal(claseDetectada([ev('golpe', { estado: 'cancelado' })]), 'ninguno');
  const r = repeticion(prueba('golpe', 1, [ev('inclinacion', { latencia_deteccion_ms: 152 }), ev('golpe', { latencia_deteccion_ms: 4, latencia_activacion_ms: 0.3 })]));
  assert.equal(r.detectada, 'golpe'); assert.equal(r.acierto, true);
  assert.equal(r.latencia_deteccion_ms, 4, 'los tiempos son los del evento del tipo esperado');
  assert.equal(repeticion(prueba('golpe', 2, [ev('golpe')])).latencia_deteccion_ms, null, 'sin medir: null, no 0');
});

test('estadística: media, desviación muestral y errores', () => {
  assert.deepEqual(estadistica([]), { n: 0, media: null, desviacion: null });
  assert.deepEqual(estadistica([5, null]), { n: 1, media: 5, desviacion: null });
  const s = estadistica([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(s.media, 5); assert.ok(Math.abs(s.desviacion - 2.138089935) < 1e-9);
  assert.deepEqual(errores(10, 12), { absoluto: 2, relativo: 0.2 });
  assert.deepEqual(errores(0, 1), { absoluto: 1, relativo: null });
  assert.deepEqual(errores(null, 1), { absoluto: null, relativo: null });
});

test('matriz de confusión y métricas', () => {
  const reps = [
    prueba('golpe', 1, [ev('golpe')]), prueba('golpe', 2, []),                 // VP, FN
    prueba('vuelco', 1, [ev('inclinacion')]),                                  // VP con tipo equivocado
    prueba('reposo', 1, []), prueba('marcha', 1, []), prueba('frenada', 1, [ev('inclinacion')])  // VN, VN, FP
  ].map(repeticion);
  const c = matrizConfusion(reps);
  assert.equal(c.matriz.golpe.golpe, 1); assert.equal(c.matriz.golpe.ninguno, 1);
  assert.equal(c.matriz.vuelco.inclinacion, 1); assert.equal(c.matriz.ninguno.ninguno, 2); assert.equal(c.matriz.ninguno.inclinacion, 1);
  assert.deepEqual([c.vp, c.fn, c.fp, c.vn], [2, 1, 1, 2]);
  assert.equal(c.exactitud, 3 / 6);
  assert.equal(c.sensibilidad, 2 / 3); assert.equal(c.precision, 2 / 3); assert.equal(c.tasa_falsas_alarmas, 1 / 3);
  const vacia = matrizConfusion([]);
  assert.equal(vacia.exactitud, null); assert.equal(vacia.tasa_falsas_alarmas, null);
});

test('resultados por escenario y sin datos físicos no se inventa nada', () => {
  const vacio = calcularResultados([]);
  assert.equal(vacio.hayDatos, false);
  for (const e of vacio.porEscenario) for (const f of e.filas) { assert.equal(f.n, 0); assert.equal(f.media, null); assert.equal(f.absoluto, null); }
  const r = calcularResultados([prueba('golpe', 1, [ev('golpe', { latencia_deteccion_ms: 4.2 })], 30), prueba('golpe', 2, [ev('golpe', { latencia_deteccion_ms: 3.8 })], 34)]);
  const golpe = r.porEscenario.find(e => e.escenario === 'golpe');
  const fila = clave => golpe.filas.find(f => f.clave === clave);
  assert.equal(golpe.repeticiones, 2); assert.equal(golpe.aciertos, 2);
  assert.equal(fila('pico_aceleracion_ms2').media, 32);
  assert.ok(Math.abs(fila('latencia_deteccion_ms').media - 4) < 1e-12);
  assert.ok(Math.abs(fila('latencia_deteccion_ms').absoluto) < 1e-12);
  assert.equal(fila('detecto').media, 1);
  assert.equal(fila('latencia_activacion_ms').media, null);
});

test('Excel de resultados: comparación, repeticiones, matriz y métricas', async () => {
  const r = calcularResultados([prueba('golpe', 1, [ev('golpe', { latencia_deteccion_ms: 4, latencia_activacion_ms: 0.5 })], 30), prueba('reposo', 1, [])]);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await crearLibroResultados(ExcelJS, r).xlsx.writeBuffer());
  assert.deepEqual(libro.worksheets.map(h => h.name), ['Comparación', 'Repeticiones', 'Matriz de confusión', 'Métricas', 'Frenada y filtro', 'Léeme']);
  const comp = libro.getWorksheet('Comparación');
  const filas = comp.getSheetValues().filter(Boolean).map(f => f.slice(1));
  const pico = filas.find(f => f[0] === 'Golpe' && f[1] === 'Pico de aceleración total');
  assert.equal(pico[4], 30); assert.equal(pico[3], 1, 'n');
  const reposoAct = filas.find(f => f[0] === 'Reposo' && f[1] === 'Latencia de activación');
  assert.equal(reposoAct[4], 'sin medir');
  const met = Object.fromEntries(libro.getWorksheet('Métricas').getSheetValues().filter(Boolean).map(f => [f[1], f[2]]));
  assert.equal(met['Sensibilidad'], 1); assert.equal(met['Tasa de falsas alarmas'], 0);
  assert.equal(libro.getWorksheet('Repeticiones').rowCount, 3);
});

test('comparación de la frenada: solo acelerómetro alarma, el filtro del firmware no', () => {
  const [acel, f98, fw] = calcularResultados([]).frenada;
  assert.equal(acel.alfa, 0); assert.equal(acel.alarma, 'inclinacion'); assert.ok(acel.pitch_max_deg > 25);
  assert.equal(f98.alarma, 'inclinacion');
  assert.equal(fw.alfa, CONSTANTES_INO.ALFA_COMPLEMENTARIO); assert.equal(fw.alarma, null); assert.ok(fw.pitch_max_deg < CONSTANTES_INO.UMBRAL_INCLINACION_DEG);
  assert.ok(Math.abs(fw.tau_s - 3.996) < 0.01);
});
