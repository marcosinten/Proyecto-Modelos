// Fase 2: registro de pruebas físicas (escenario esperado, repetición y nota) sobre sesiones reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { crearApp } from '../src/adaptadores/http/app.js';
import { crearRepositorio } from '../src/adaptadores/sqlite/repositorio.js';

async function entorno(t) {
  const repo = crearRepositorio(':memory:');
  const server = crearApp({ repositorio: repo, logger: { error() {} } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(r => server.close(r)); repo.cerrar(); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const request = async (ruta, cuerpo) => {
    const r = await fetch(base + ruta, { method: cuerpo === undefined ? 'GET' : 'POST', headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    return { status: r.status, data: await r.json() };
  };
  const sesion = async (id, origen = 'real', mediciones = []) => {
    await request('/sesiones', { version: 1, sesion: { id, origen } });
    if (mediciones.length) await request(`/sesiones/${id}/mediciones`, { version: 1, mediciones });
  };
  return { request, sesion };
}
const medicion = (numero, ax, roll = 0, pitch = 0) => ({ numero, t_ms: numero * 20, ax, ay: 0, az: 9.81, roll_deg: roll, pitch_deg: pitch });
const registrar = (escenario_esperado, repeticion, nota) => ({ version: 1, prueba: { escenario_esperado, repeticion, ...(nota === undefined ? {} : { nota }) } });

test('registrar, leer, corregir y quitar la prueba de una sesión real', async t => {
  const { request, sesion } = await entorno(t);
  await sesion('RC-1');
  assert.deepEqual((await request('/sesiones/RC-1/prueba')).data, { version: 1, sesion_id: 'RC-1', prueba: null });
  const r = await request('/sesiones/RC-1/prueba', registrar('golpe', 1, '  golpe contra la pared  '));
  assert.equal(r.status, 201); assert.equal(r.data.resultado, 'creada');
  assert.equal(r.data.prueba.nota, 'golpe contra la pared', 'la nota se guarda sin espacios sobrantes');
  assert.equal((await request('/sesiones/RC-1/prueba', registrar('golpe', 1, 'golpe contra la pared'))).data.resultado, 'sin_cambios');
  const c = await request('/sesiones/RC-1/prueba', registrar('vuelco', 2));
  assert.equal(c.status, 200); assert.equal(c.data.resultado, 'actualizada');
  assert.deepEqual({ ...c.data.prueba, registrada_ms: 0 }, { escenario_esperado: 'vuelco', repeticion: 2, nota: '', registrada_ms: 0 });
  assert.equal((await request('/sesiones/RC-1/prueba', { version: 1, prueba: null })).data.quitada, true);
  assert.equal((await request('/sesiones/RC-1/prueba')).data.prueba, null);
});

test('validaciones: sesión inexistente, simulada, repetición repetida y campos incorrectos', async t => {
  const { request, sesion } = await entorno(t);
  await sesion('RC-1'); await sesion('RC-2'); await sesion('SIM-1', 'simulado');
  assert.equal((await request('/sesiones/NO-EXISTE/prueba', registrar('reposo', 1))).status, 404);
  assert.equal((await request('/sesiones/SIM-1/prueba', registrar('reposo', 1))).data.error.codigo, 'SESION_NO_REAL');
  await request('/sesiones/RC-1/prueba', registrar('reposo', 1));
  const dup = await request('/sesiones/RC-2/prueba', registrar('reposo', 1));
  assert.equal(dup.status, 409); assert.match(dup.data.error.mensaje, /RC-1/);
  assert.equal((await request('/sesiones/RC-2/prueba', registrar('reposo', 2))).status, 201);
  for (const malo of [registrar('choque', 1), registrar('golpe', 0), registrar('golpe', 1.5), registrar('golpe', 1, 'x'.repeat(501)),
    { version: 1, prueba: { escenario_esperado: 'golpe', repeticion: 1, detectado: 'golpe' } }])
    assert.equal((await request('/sesiones/RC-1/prueba', malo)).status, 400, JSON.stringify(malo).slice(0, 80));
});

test('GET /pruebas: máximos de la sesión, sus eventos y también las sesiones sin evento', async t => {
  const { request, sesion } = await entorno(t);
  await sesion('RC-GOLPE', 'real', [medicion(1, 0), medicion(2, 20), medicion(3, 0, -12, 3)]);
  await request('/eventos', { version: 1, evento: { id: 'RC-GOLPE-EV001', sesion_id: 'RC-GOLPE', tipo: 'golpe', gravedad: 'alta', estado: 'confirmado',
    t_inicio_ms: 0, t_fin_ms: 60, t_deteccion_ms: 40, t_activacion_ms: 40, ubicacion: null, latencia_deteccion_ms: 4, latencia_activacion_ms: 0.4 } });
  await sesion('RC-REPOSO', 'real', [medicion(1, 0), medicion(2, 0)]);
  await sesion('RC-VACIA');
  await sesion('RC-SIN-REGISTRO', 'real', [medicion(1, 30)]);
  await request('/sesiones/RC-GOLPE/prueba', registrar('golpe', 1));
  await request('/sesiones/RC-REPOSO/prueba', registrar('reposo', 1, 'sobre la mesa'));
  await request('/sesiones/RC-VACIA/prueba', registrar('marcha', 1));
  const { pruebas } = (await request('/pruebas')).data;
  assert.deepEqual(pruebas.map(p => p.sesion_id), ['RC-GOLPE', 'RC-VACIA', 'RC-REPOSO'], 'ordenadas por escenario y repetición; sin las no registradas');
  const golpe = pruebas[0];
  assert.equal(golpe.mediciones, 3);
  assert.ok(Math.abs(golpe.pico_aceleracion_ms2 - Math.hypot(20, 9.81)) < 1e-9);
  assert.equal(golpe.max_roll_deg, 12); assert.equal(golpe.max_pitch_deg, 3);
  assert.equal(golpe.eventos[0].latencia_deteccion_ms, 4);
  assert.deepEqual(pruebas[2].eventos, [], 'sesión sin accidente: sirve para contar falsas alarmas');
  assert.equal(pruebas[1].pico_aceleracion_ms2, null, 'sin mediciones no se inventa un pico');
});

test('fase 5: estado del detector opcional en cada medición', async t => {
  const { request, sesion } = await entorno(t);
  await sesion('RC-E');
  const lote = [{ ...medicion(1, 0), estado: 'normal' }, { ...medicion(2, 20), estado: 'emergencia' }, medicion(3, 0)];
  assert.equal((await request('/sesiones/RC-E/mediciones', { version: 1, mediciones: lote })).status, 201);
  assert.equal((await request('/sesiones/RC-E/mediciones', { version: 1, mediciones: lote })).status, 200, 'reintento idéntico');
  const guardadas = (await request('/sesiones/RC-E/mediciones')).data.mediciones;
  assert.deepEqual(guardadas.map(m => m.estado), ['normal', 'emergencia', undefined], 'sin estado: el campo no aparece');
  assert.equal((await request('/sesiones/RC-E/mediciones', { version: 1, mediciones: [{ ...medicion(4, 0), estado: 'pendiente' }] })).status, 400);
  assert.equal((await request('/sesiones/RC-E/mediciones', { version: 1, mediciones: [{ ...medicion(2, 20), estado: 'rearme' }] })).status, 409, 'mismo número con otro estado');
});
