import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import ExcelJS from 'exceljs';
import { crearApp } from '../src/adaptadores/http/app.js';
import { crearRepositorio } from '../src/adaptadores/sqlite/repositorio.js';
import { configuracion } from '../src/config.js';

const fixture = JSON.parse(readFileSync(new URL('../../ejemplos/vuelco.json', import.meta.url), 'utf8'));
async function entorno(t, opciones = {}) {
  const repo = crearRepositorio(':memory:');
  const app = crearApp({ repositorio: repo, logger: { error() {} }, ...opciones });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); repo.cerrar(); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const request = async (ruta, cuerpo, headers = {}) => {
    const r = await fetch(base + ruta, { method: cuerpo === undefined ? 'GET' : 'POST',
      headers: { ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    return { status: r.status, data: await r.json() };
  };
  const seed = async () => {
    assert.equal((await request('/sesiones', { version: 1, sesion: fixture.sesion })).status, 201);
    assert.equal((await request('/sesiones/SES-001/mediciones', { version: 1, mediciones: fixture.mediciones })).status, 201);
    assert.equal((await request('/eventos', { version: 1, evento: fixture.evento })).status, 201);
  };
  return { repo, request, seed, base };
}

test('flujo HTTP completo: sesión → mediciones → evento → JSON exacto para frontend', async t => {
  const { request, seed } = await entorno(t);
  await seed();
  assert.deepEqual((await request('/eventos/EV-001')).data, fixture);
  assert.equal((await request('/sesiones/SES-001/ultima')).data.medicion.roll_deg, 180);
  assert.equal((await request('/eventos?sesion_id=SES-001')).data.eventos.length, 1);
});
test('reintentos idénticos no duplican, cambios con el mismo id generan conflicto', async t => {
  const { request, seed } = await entorno(t); await seed();
  assert.equal((await request('/sesiones', { version: 1, sesion: fixture.sesion })).status, 200);
  const lote = await request('/sesiones/SES-001/mediciones', { version: 1, mediciones: fixture.mediciones });
  assert.equal(lote.data.insertadas, 0); assert.equal(lote.data.repetidas, 3);
  assert.equal((await request('/eventos', { version: 1, evento: fixture.evento })).status, 200);
  assert.equal((await request('/eventos', { version: 1, evento: { ...fixture.evento, gravedad: 'baja' } })).status, 409);
  assert.equal((await request('/sesiones', { version: 1, sesion: { ...fixture.sesion, origen: 'real' } })).status, 409);
});
test('lote atómico: conflicto revierte las muestras nuevas del mismo lote', async t => {
  const { request, seed } = await entorno(t); await seed();
  const lote = [ { ...fixture.mediciones[0], numero: 4, t_ms: 3000 }, { ...fixture.mediciones[0], numero: 4, t_ms: 3100 } ];
  assert.equal((await request('/sesiones/SES-001/mediciones', { version: 1, mediciones: lote })).status, 409);
  assert.equal((await request('/sesiones/SES-001/mediciones')).data.mediciones.length, 3);
});
test('paginación de mediciones sin perder muestras y valores de consulta inválidos', async t => {
  const { request, seed } = await entorno(t); await seed();
  const p1 = (await request('/sesiones/SES-001/mediciones?limite=2')).data;
  assert.equal(p1.hay_mas, true); assert.equal(p1.siguiente_numero, 2);
  const p2 = (await request(`/sesiones/SES-001/mediciones?limite=2&despues_numero=${p1.siguiente_numero}`)).data;
  assert.equal(p2.hay_mas, false); assert.equal(p2.mediciones[0].numero, 3);
  for (const q of ['limite=0', 'limite=1001', 'limite=abc', 'despues_numero=-1', 'limite=2&limite=3'])
    assert.equal((await request('/sesiones/SES-001/mediciones?' + q)).status, 400);
});
test('valida versiones, tipos, coordenadas y coherencia de los tiempos', async t => {
  const { request, seed } = await entorno(t); await seed();
  assert.equal((await request('/sesiones', { version: 2, sesion: fixture.sesion })).status, 400);
  for (const cambios of [{ t_fin_ms: 10 }, { t_activacion_ms: 1 }, { t_activacion_ms: 3000 }, { ubicacion: { latitud: 95, longitud: 0 } }, { campoInventado: 1 }]) {
    const r = await request('/eventos', { version: 1, evento: { ...fixture.evento, ...cambios } });
    assert.equal(r.status, 400); assert.ok(r.data.error.detalles.length);
  }
  assert.equal((await request('/sesiones/SES-001/mediciones', { version: 1, mediciones: [{ ...fixture.mediciones[0], ax: '0' }] })).status, 400);
  assert.equal((await request('/sesiones/SES-001/mediciones', { version: 1, mediciones: [] })).status, 400);
});
test('sesiones y eventos ausentes devuelven 404, sesión vacía devuelve null', async t => {
  const { request } = await entorno(t);
  assert.equal((await request('/eventos/no-existe')).status, 404);
  assert.equal((await request('/sesiones/no-existe/mediciones', { version: 1, mediciones: fixture.mediciones })).status, 404);
  await request('/sesiones', { version: 1, sesion: fixture.sesion });
  assert.equal((await request('/sesiones/SES-001/ultima')).data.medicion, null);
});
test('acepta lotes atrasados coherentes y rechaza tiempo contradictorio', async t => {
  const { request } = await entorno(t);
  await request('/sesiones', { version: 1, sesion: fixture.sesion });
  for (const i of [2, 0, 1])
    assert.equal((await request('/sesiones/SES-001/mediciones', { version: 1, mediciones: [fixture.mediciones[i]] })).status, 201);
  assert.equal((await request('/sesiones/SES-001/mediciones', { version: 1, mediciones: [{ ...fixture.mediciones[0], numero: 4, t_ms: 1000 }] })).status, 409);
});
test('ventana del evento excluye otras sesiones y mediciones fuera del rango', async t => {
  const { request, seed } = await entorno(t); await seed();
  await request('/sesiones/SES-001/mediciones', { version: 1, mediciones: [{ ...fixture.mediciones[0], numero: 4, t_ms: 3000 }] });
  await request('/sesiones', { version: 1, sesion: { id: 'OTRA', origen: 'real' } });
  await request('/sesiones/OTRA/mediciones', { version: 1, mediciones: fixture.mediciones });
  assert.deepEqual((await request('/eventos/EV-001')).data, fixture);
});
test('Excel real conserva números, filas, origen y tiempo de respuesta del JSON', async t => {
  const { base, seed } = await entorno(t); await seed();
  const r = await fetch(base + '/eventos/EV-001/excel');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /spreadsheetml/);
  const libro = new ExcelJS.Workbook(); await libro.xlsx.load(Buffer.from(await r.arrayBuffer()));
  const h = libro.getWorksheet('Datos'); assert.equal(h.rowCount, 4);
  for (let n = 0; n < 3; n++) assert.deepEqual(h.getRow(n + 2).values.slice(1), Object.values(fixture.mediciones[n]));
  const e = libro.getWorksheet('Evento'); assert.equal(e.getRow(2).getCell(e.columnCount).value, 20);
});
test('JSON malformado y cuerpos excesivos tienen errores controlados', async t => {
  const { base } = await entorno(t);
  const post = body => fetch(base + '/sesiones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal((await post('{')).status, 400);
  assert.equal((await post(JSON.stringify({ grande: 'x'.repeat(600000) }))).status, 413);
});
test('clave de API y CORS aplican a las rutas de datos', async t => {
  const { request, base } = await entorno(t, { apiKey: 'clave-de-prueba' });
  assert.equal((await request('/eventos')).status, 401);
  assert.equal((await request('/eventos', undefined, { 'X-API-Key': 'clave-de-prueba' })).status, 200);
  assert.equal((await request('/eventos', undefined, { Origin: 'https://otro.example' })).status, 403);
  const r = await fetch(base + '/eventos', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-API-Key, Content-Type' } });
  assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});
test('fallo de almacenamiento devuelve 503 y no una confirmación falsa', async t => {
  const error = Object.assign(new Error('locked'), { code: 'ERR_SQLITE_ERROR' });
  const roto = { comprobar() { throw error; }, crearSesion() { throw error; } };
  const { request } = await entorno(t, { repositorio: roto });
  assert.equal((await request('/salud')).status, 503);
  const r = await request('/sesiones', { version: 1, sesion: fixture.sesion });
  assert.equal(r.status, 503); assert.equal(r.data.error.codigo, 'ALMACENAMIENTO_NO_DISPONIBLE');
});
test('persistencia después de cerrar y reabrir el archivo SQLite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'grupo11-'));
  const path = join(dir, 'prueba.sqlite');
  let repo;
  try {
    repo = crearRepositorio(path); repo.crearSesion(fixture.sesion); repo.guardarMediciones(fixture.sesion.id, fixture.mediciones); repo.crearEvento(fixture.evento); repo.cerrar();
    repo = crearRepositorio(path); assert.deepEqual(repo.obtenerPaquete('EV-001'), fixture); repo.cerrar(); repo = null;
  } finally { repo?.cerrar(); rmSync(dir, { recursive: true, force: true }); }
});
test('configuración requiere clave para escuchar fuera del equipo local', () => {
  assert.throws(() => configuracion({ HOST: '0.0.0.0' }), /API_KEY/);
  assert.throws(() => configuracion({ PORT: '0' }), /PORT/);
  assert.equal(configuracion({ HOST: '0.0.0.0', API_KEY: 'x'.repeat(24) }).host, '0.0.0.0');
});
