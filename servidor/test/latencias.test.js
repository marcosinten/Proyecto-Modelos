// Fase 1: tiempos de respuesta medidos por el firmware (latencia_deteccion_ms y latencia_activacion_ms).
// Campos opcionales: los datos anteriores (EV-001, EV-002, bases ya guardadas) siguen siendo válidos y
// dicen «sin medir»; nunca se cambian por 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import { crearApp } from '../src/adaptadores/http/app.js';
import { crearRepositorio } from '../src/adaptadores/sqlite/repositorio.js';
import { crearEventoSchema, paqueteSchema, validar } from '../src/aplicacion/contratos.js';
import { crearLibro } from '../../compartido/libro-excel.js';
import { SIN_MEDIR, textoLatencia, analizarEvento } from '../../compartido/exportacion.js';

const leer = nombre => JSON.parse(readFileSync(new URL('../../ejemplos/' + nombre, import.meta.url), 'utf8'));
const fixture = leer('vuelco.json');
const LAT = { latencia_deteccion_ms: 152.004, latencia_activacion_ms: 1.937 };
const conLatencias = { ...fixture.evento, id: 'EV-LAT', ...LAT };

async function entorno(t) {
  const repo = crearRepositorio(':memory:');
  const server = crearApp({ repositorio: repo, logger: { error() {} } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(r => server.close(r)); repo.cerrar(); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const request = async (ruta, cuerpo) => {
    const r = await fetch(base + ruta, { method: cuerpo ? 'POST' : 'GET', headers: cuerpo ? { 'Content-Type': 'application/json' } : {}, body: cuerpo && JSON.stringify(cuerpo) });
    return { status: r.status, data: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer() };
  };
  await request('/sesiones', { version: 1, sesion: fixture.sesion });
  await request('/sesiones/SES-001/mediciones', { version: 1, mediciones: fixture.mediciones });
  return { request };
}

test('contrato: las latencias son opcionales, en ms con decimales y no negativas', () => {
  // Datos viejos sin el campo: siguen siendo válidos.
  for (const nombre of ['vuelco.json', 'vuelco-002.json']) validar(paqueteSchema, leer(nombre));
  assert.deepEqual(validar(crearEventoSchema, { version: 1, evento: conLatencias }).evento, conLatencias);
  for (const malo of [{ latencia_deteccion_ms: -1 }, { latencia_activacion_ms: '2' }, { latencia_deteccion_ms: 60001 }, { latencia_activacion_ms: null }])
    assert.throws(() => validar(crearEventoSchema, { version: 1, evento: { ...conLatencias, ...malo } }), /Revisa/);
});

test('API: guarda y devuelve las latencias; un reintento idéntico da 200 y uno distinto 409', async t => {
  const { request } = await entorno(t);
  assert.equal((await request('/eventos', { version: 1, evento: conLatencias })).status, 201);
  assert.equal((await request('/eventos', { version: 1, evento: conLatencias })).status, 200);
  assert.equal((await request('/eventos', { version: 1, evento: { ...conLatencias, latencia_activacion_ms: 2 } })).status, 409);
  const { data } = await request('/eventos/EV-LAT');
  assert.equal(data.evento.latencia_deteccion_ms, LAT.latencia_deteccion_ms);
  assert.equal(data.evento.latencia_activacion_ms, LAT.latencia_activacion_ms);
  // Un evento sin el dato no lo lleva (no aparece como 0 ni como null).
  await request('/eventos', { version: 1, evento: fixture.evento });
  const viejo = (await request('/eventos/EV-001')).data;
  assert.deepEqual(viejo, fixture);
  assert.equal('latencia_deteccion_ms' in viejo.evento, false);
});

test('persistencia: la migración 002 añade las columnas a una base anterior sin tocar sus eventos', t => {
  const dir = mkdtempSync(join(tmpdir(), 'latencias-'));
  let repo;
  t.after(() => { repo?.cerrar(); rmSync(dir, { recursive: true, force: true }); });
  const path = join(dir, 'antes.sqlite');
  const vieja = new DatabaseSync(path);
  vieja.exec(readFileSync(new URL('../db/migraciones/001_crear_tablas.sql', import.meta.url), 'utf8'));
  vieja.exec("INSERT INTO sesiones VALUES ('SES-001','simulado')");
  vieja.prepare('INSERT INTO eventos(id,sesion_id,tipo,gravedad,estado,t_inicio_ms,t_fin_ms,t_deteccion_ms,t_activacion_ms) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('EV-001', 'SES-001', 'vuelco', 'alta', 'confirmado', 0, 2200, 1500, 1520);
  vieja.close();
  repo = crearRepositorio(path);
  const ev = repo.obtenerPaquete('EV-001').evento;
  assert.equal('latencia_deteccion_ms' in ev, false, 'el evento anterior queda sin medir');
  repo.crearEvento({ ...conLatencias, sesion_id: 'SES-001' });
  repo.cerrar();
  // Reabrir no vuelve a aplicar la migración (fallaría con «duplicate column»).
  repo = crearRepositorio(path);
  assert.equal(repo.obtenerPaquete('EV-LAT').evento.latencia_activacion_ms, LAT.latencia_activacion_ms);
  const db = new DatabaseSync(path);
  assert.ok(db.prepare("SELECT 1 FROM migraciones WHERE nombre='002_latencias_evento.sql'").get());
  db.close();
});

test('Excel: Resumen y Datos técnicos muestran las latencias o «sin medir»', async () => {
  const paquete = { version: 1, sesion: fixture.sesion, mediciones: fixture.mediciones, eventos: [conLatencias, fixture.evento] };
  const libroDe = async formato => { const l = new ExcelJS.Workbook(); await l.xlsx.load(await crearLibro(ExcelJS, paquete, { formato }).xlsx.writeBuffer()); return l; };
  const tecnico = (await libroDe('tecnico')).getWorksheet('Eventos');
  const claves = tecnico.getRow(1).values;
  const dato = (fila, clave) => tecnico.getRow(fila).getCell(claves.indexOf(clave)).value;
  assert.equal(dato(2, 'latencia_deteccion_ms'), 152.004);
  assert.equal(dato(2, 'latencia_activacion_ms'), 1.937);
  assert.equal(dato(3, 'latencia_deteccion_ms'), SIN_MEDIR);
  assert.equal(dato(3, 'latencia_activacion_ms'), SIN_MEDIR);
  const resumen = (await libroDe('resumen')).getWorksheet('Eventos');
  const titulos = resumen.getRow(1).values;
  const col = t => titulos.indexOf(t);
  assert.equal(resumen.getRow(2).getCell(col('Tiempo de detección (ms)')).value, 152.004);
  assert.equal(resumen.getRow(2).getCell(col('Latencia de activación (ms)')).value, 1.937);
  assert.equal(resumen.getRow(3).getCell(col('Tiempo de detección (ms)')).value, SIN_MEDIR);
});

test('texto en pantalla: «sin medir» cuando falta, nunca 0', () => {
  assert.equal(textoLatencia(null), SIN_MEDIR);
  assert.equal(textoLatencia(undefined), SIN_MEDIR);
  assert.equal(textoLatencia(0.005), '0,005 ms');
  assert.equal(textoLatencia(152), '152 ms');
  const a = analizarEvento(fixture.evento, fixture.mediciones);
  assert.equal(a.latencia_deteccion_ms, null);
  assert.equal(analizarEvento(conLatencias, fixture.mediciones).latencia_activacion_ms, 1.937);
});
