// Fase 2: registro de pruebas físicas (escenario esperado, repetición y nota) sobre sesiones reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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
  assert.deepEqual({ ...c.data.prueba, registrada_ms: 0 }, { escenario_esperado: 'vuelco', repeticion: 2, nota: '', registrada_ms: 0, t_fin_ms: null });
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

 test('el fin limita mediciones y eventos y el reintento es idempotente', async t => {
  const { request, sesion } = await entorno(t);
  await sesion('FIN', 'real', [medicion(1, 0), medicion(2, 20, 30, 10)]);
  await request('/eventos', {version: 1, evento: {id: 'FIN-E', sesion_id: 'FIN', tipo: 'golpe', gravedad: 'alta', estado: 'confirmado', t_inicio_ms: 20, t_fin_ms: 40, t_deteccion_ms: 40, t_activacion_ms: 40, ubicacion: null}});
  const cuerpo = {version: 1, prueba: {escenario_esperado: 'golpe', repeticion: 1, t_fin_ms: 20}};
  await request('/sesiones/FIN/prueba', cuerpo);
  assert.equal((await request('/sesiones/FIN/prueba', cuerpo)).data.resultado, 'sin_cambios');
  let p = (await request('/pruebas')).data.pruebas[0];
  assert.equal(p.mediciones, 1); assert.equal(p.pico_aceleracion_ms2, 9.81); assert.equal(p.max_roll_deg, 0); assert.equal(p.eventos.length, 0);
  for (const valor of [-1, 1.5]) assert.equal((await request('/sesiones/FIN/prueba', {...cuerpo, prueba: {...cuerpo.prueba, t_fin_ms: valor}})).status, 400);
  await request('/sesiones/FIN/prueba', registrar('golpe', 1));
  p = (await request('/pruebas')).data.pruebas[0];
  assert.equal(p.t_fin_ms, null); assert.equal(p.mediciones, 2); assert.equal(p.eventos.length, 1); assert.equal(p.max_roll_deg, 30);
});


test('migración 005 conserva las pruebas de una base anterior', t => {
  const dir = mkdtempSync(join(tmpdir(), 'fin-prueba-'));
  let repo;
  t.after(() => { repo?.cerrar(); rmSync(dir, { recursive: true, force: true }); });
  const path = join(dir, 'antes.sqlite');
  const vieja = new DatabaseSync(path);
  vieja.exec(readFileSync(new URL('../db/migraciones/001_crear_tablas.sql', import.meta.url), 'utf8'));
  vieja.exec('CREATE TABLE migraciones (nombre TEXT PRIMARY KEY, aplicada_ms INTEGER NOT NULL)');
  for (const nombre of ['002_latencias_evento.sql', '003_pruebas_fisicas.sql', '004_estado_medicion.sql']) {
    vieja.exec(readFileSync(new URL('../db/migraciones/' + nombre, import.meta.url), 'utf8'));
    vieja.prepare('INSERT INTO migraciones(nombre, aplicada_ms) VALUES (?,?)').run(nombre, Date.now());
  }
  vieja.exec("INSERT INTO sesiones(id, origen) VALUES ('RC-ANTERIOR', 'real')");
  vieja.exec("INSERT INTO pruebas_fisicas(sesion_id, escenario_esperado, repeticion, nota, registrada_ms) VALUES ('RC-ANTERIOR', 'inclinacion', 2, 'anterior', 1)");
  vieja.close();
  repo = crearRepositorio(path);
  const prueba = repo.obtenerPrueba('RC-ANTERIOR');
  assert.equal(prueba.escenario_esperado, 'inclinacion');
  assert.equal(prueba.repeticion, 2);
  assert.equal(prueba.t_fin_ms, null);
  const lista = repo.listarPruebas();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].sesion_id, 'RC-ANTERIOR');
  assert.equal(lista[0].escenario_esperado, 'inclinacion');
  assert.equal(lista[0].repeticion, 2);
  assert.equal(lista[0].t_fin_ms, null);
});
