import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { crearApp } from '../src/adaptadores/http/app.js';
import { crearRepositorio } from '../src/adaptadores/sqlite/repositorio.js';
import { generarEscenario } from '../../web/src/simulation.js';
import { explicarPaquete, puntosGrafica, direccionRoll, direccionPitch, moduloA, desviacionA } from '../../web/src/explanation.js';

const ejemplo = nombre => JSON.parse(readFileSync(new URL(`../../ejemplos/${nombre}.json`, import.meta.url), 'utf8'));

test('EV-001: muestra el vuelco histórico sin inventar rueda, causas ni comienzo físico', () => {
  const p = explicarPaquete(ejemplo('vuelco'));
  assert.equal(p.sesion.origen, 'simulado');
  assert.equal(p.evento.tipo, 'vuelco');
  assert.equal(p.picoRoll.roll_deg, 180);
  assert.equal(p.picoTotal.t_ms, 0);
  assert.equal(p.rueda.length, 0);
  assert.equal(p.disperso, true);
  assert.equal(p.pasos[0].t_ms, p.evento.t_inicio_ms);
  assert.match(p.pasos[0].detalle, /no es necesariamente el inicio físico/);
  assert.equal(p.pasos.some(x => x.titulo.includes('Mayor cambio')), false);
  assert.equal(direccionRoll(180), 'orientación cercana a invertida según roll');
});

test('EV-002: ordena las lecturas y distingue pico, detección y lectura posterior', () => {
  const p = explicarPaquete(ejemplo('vuelco-002'));
  assert.equal(p.picoTotal.t_ms, 1500);
  assert.equal(p.posterior.t_ms, 2200);
  assert.deepEqual(p.pasos.map(x => x.t_ms), [1000, 1500, 1520, 2200, 3000]);
  assert.equal(direccionRoll(p.posterior.roll_deg), 'lado izquierdo elevado');
  assert.equal(direccionPitch(p.posterior.pitch_deg), 'trompa elevada');
  assert.ok(moduloA(p.picoTotal) > 18);
  assert.ok(desviacionA(p.picoTotal) > 8);
});

test('reposo y frenada no crean eventos que la vista de Historial pudiera explicar', () => {
  for (const escenario of ['normal', 'frenada']) {
    const corrida = generarEscenario(escenario);
    assert.equal(corrida.evento, null, escenario);
    assert.throws(() => explicarPaquete(corrida), /Se necesita un evento/);
  }
});

test('golpe, inclinación y vuelco nuevos se explican desde su clasificación y sus muestras', () => {
  for (const [escenario, parametros, esperado] of [
    ['impacto', [], 'golpe'],
    ['inclinacion', [16, 30], 'inclinacion'],
    ['vuelco', [], 'vuelco']
  ]) {
    const corrida = generarEscenario(escenario, ...parametros);
    const p = explicarPaquete(corrida);
    assert.equal(p.evento.tipo, esperado);
    assert.equal(p.muestras.length, corrida.mediciones.length);
    assert.equal(p.rueda.length, corrida.mediciones.length);
    assert.ok(p.muestras.length >= 500);
    assert.ok(p.picoTotal.t_ms >= p.evento.t_inicio_ms);
    assert.ok(p.picoTotal.t_ms <= p.evento.t_fin_ms);
    assert.ok(p.picoDesviacion && p.picoRoll && p.picoPitch && p.picoRueda);
    assert.ok(p.pasos.some(x => x.t_ms === p.evento.t_deteccion_ms));
  }
});

test('evento sin muestras o sin lecturas posteriores se explica parcialmente', () => {
  const paquete = ejemplo('vuelco');
  const vacio = explicarPaquete({ ...paquete, mediciones: [] });
  assert.equal(vacio.parcial, true);
  assert.equal(vacio.picoTotal, null);
  assert.equal(vacio.posterior, null);
  assert.deepEqual(vacio.pasos.map(x => x.t_ms), [0, 600, 620, 2000]);
  const soloAntes = explicarPaquete({ ...paquete, mediciones: [paquete.mediciones[0]] });
  assert.equal(soloAntes.posterior, null);
  assert.equal(soloAntes.disperso, true);
});

test('signos de los ejes y datos opcionales de rueda no se confunden con avance', () => {
  const paquete = ejemplo('vuelco');
  const p = explicarPaquete({
    ...paquete,
    sesion: { ...paquete.sesion, origen: 'real' },
    evento: { ...paquete.evento, tipo: 'inclinacion', estado: 'cancelado', t_activacion_ms: null },
    mediciones: [
      { ...paquete.mediciones[0], roll_deg: -35, pitch_deg: -12 },
      { ...paquete.mediciones[1], roll_deg: -40, pitch_deg: -18, rueda_rps: 0 }
    ]
  });
  assert.equal(p.sesion.origen, 'real');
  assert.equal(p.evento.estado, 'cancelado');
  assert.equal(p.rueda.length, 1);
  assert.equal(p.picoRueda.rueda_rps, 0);
  assert.equal(direccionRoll(p.picoRoll.roll_deg), 'lado derecho elevado');
  assert.equal(direccionPitch(p.picoPitch.pitch_deg), 'trompa hacia abajo');
  assert.match(direccionRoll(0.05), /sin inclinación lateral apreciable/);
  assert.match(direccionPitch(-0.5), /sin inclinación frontal apreciable/);
  assert.equal(p.pasos.some(x => x.titulo.includes('Orden de alerta')), false);
});

test('el muestreo de la gráfica conserva extremos y la lectura vecina al evento', () => {
  const muestras = Array.from({ length: 5000 }, (_, i) => ({ t_ms: i * 20, ax: i === 1337 ? 50 : 0 }));
  const puntos = puntosGrafica(muestras, m => m.ax, 50_000, 200);
  assert.ok(puntos.length <= 202);
  assert.ok(puntos.some(p => p.x === 1337 * 20 && p.y === 50));
  assert.ok(puntos.some(p => p.x === 50_000));
});

test('evento nuevo recuperado por GET /eventos/:id se explica sin escritura adicional', async t => {
  const repo = crearRepositorio(':memory:');
  const server = crearApp({ repositorio: repo }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); repo.cerrar(); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const corrida = generarEscenario('impacto');
  const post = async (ruta, contenido) => {
    const r = await fetch(base + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contenido) });
    assert.equal(r.status, 201);
  };
  await post('/sesiones', { version: 1, sesion: corrida.sesion });
  await post(`/sesiones/${corrida.sesion.id}/mediciones`, { version: 1, mediciones: corrida.mediciones });
  await post('/eventos', { version: 1, evento: corrida.evento });
  const respuesta = await fetch(`${base}/eventos/${corrida.evento.id}`);
  assert.equal(respuesta.status, 200);
  const p = explicarPaquete(await respuesta.json());
  assert.equal(p.evento.tipo, 'golpe');
  assert.equal(p.muestras.length, corrida.mediciones.length);
  assert.equal((await (await fetch(`${base}/eventos?sesion_id=${corrida.sesion.id}`)).json()).eventos.length, 1);
});
