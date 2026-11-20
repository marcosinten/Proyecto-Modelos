import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VENTANA_CONECTABLE_MS, PAUSA_MS, estadoRecepcion, esConectable, filtrarConectables,
  cargarSesiones, sesionMasReciente
} from '../../web/src/telemetria.js';
import { crearRepositorio } from '../src/adaptadores/sqlite/repositorio.js';

const AHORA = 1_800_000_000_000;
const s = (id, edad, mediciones = 10, origen = 'real') =>
  ({ id, origen, mediciones, eventos: 0, ultima_recepcion_ms: edad == null ? null : AHORA - edad });

test('ventana conectable: 10 s; «Recibiendo» hasta 3 s e «inestable» de 3 a 10 s', () => {
  assert.equal(VENTANA_CONECTABLE_MS, 10000);
  assert.equal(PAUSA_MS, 3000);
  assert.equal(estadoRecepcion(AHORA - 3000, AHORA).etiqueta, 'Recibiendo');
  assert.equal(estadoRecepcion(AHORA - 3001, AHORA).etiqueta, 'Conexión inestable');
  assert.equal(estadoRecepcion(AHORA - 10000, AHORA).etiqueta, 'Conexión inestable');
  assert.equal(estadoRecepcion(AHORA - 10001, AHORA).etiqueta, null);
  assert.deepEqual(estadoRecepcion(null, AHORA), { edad: null, etiqueta: null });
});

test('filtro en vivo: activa, justo en el límite, vieja, sin mediciones y sin recepción', () => {
  assert.equal(esConectable(s('ACTIVA', 500), AHORA), true);
  assert.equal(esConectable(s('LIMITE', 10000), AHORA), true);
  assert.equal(esConectable(s('FUERA', 10001), AHORA), false);
  assert.equal(esConectable(s('VIEJA', 3_600_000), AHORA), false);
  assert.equal(esConectable(s('VACIA', 500, 0), AHORA), false);
  assert.equal(esConectable(s('NULA', null), AHORA), false);
  // Orden de la API: ultima_recepcion_ms DESC, null al final.
  const { lista, fin } = filtrarConectables([s('ACTIVA', 500), s('VACIA', 600, 0), s('LIMITE', 10000), s('VIEJA', 3_600_000), s('NULA', null)], AHORA);
  assert.deepEqual(lista.map(x => x.id), ['ACTIVA', 'LIMITE']);
  assert.equal(fin, true);
  assert.deepEqual(filtrarConectables([s('A', 1), s('B', 2)], AHORA), { lista: [s('A', 1), s('B', 2)], fin: false });
});

test('real o simulada: lo que recibe datos ahora sirve en vivo', () => {
  const { lista } = filtrarConectables([s('SIM', 100, 5, 'simulado'), s('ESP', 200)], AHORA);
  assert.deepEqual(lista.map(x => x.id), ['SIM', 'ESP']);
});

function getFalso(paginas) {
  const pedidas = [];
  const get = async path => {
    const offset = Number(new URL(path, 'http://x').searchParams.get('offset'));
    pedidas.push(offset);
    const i = offset / 200;
    return { ahora_ms: AHORA, sesiones: paginas[i], hay_mas: i < paginas.length - 1, siguiente_offset: offset + 200 };
  };
  return { get, pedidas };
}

test('vivo deja de paginar al encontrar una sesión fuera de la ventana; historial lista todas', async () => {
  const pagina1 = [s('A', 100), ...Array.from({ length: 199 }, (_, i) => s('V' + i, 20000 + i))];
  const pagina2 = [s('X', 30000), s('N', null)];
  const vivo = getFalso([pagina1, pagina2]);
  const r = await cargarSesiones(vivo.get, 'vivo');
  assert.deepEqual(r.sesiones.map(x => x.id), ['A']);
  assert.equal(r.ahora, AHORA);
  assert.deepEqual(vivo.pedidas, [0], 'no pide la segunda página');

  const historial = getFalso([pagina1, pagina2]);
  const h = await cargarSesiones(historial.get, 'historial');
  assert.equal(h.sesiones.length, 202);
  assert.deepEqual(historial.pedidas, [0, 200]);
  assert.ok(h.sesiones.some(x => x.id === 'N') && h.sesiones.some(x => x.id === 'V0'));
});

test('vivo con una API real: solo la sesión que acaba de recibir datos', async () => {
  const repo = crearRepositorio(':memory:');
  try {
    for (const id of ['VACIA', 'ACTIVA']) repo.crearSesion({ id, origen: 'real' });
    repo.guardarMediciones('ACTIVA', [{ numero: 1, t_ms: 0, ax: 0, ay: 0, az: 9.81, roll_deg: 0, pitch_deg: 0 }]);
    const get = async path => {
      const q = new URL(path, 'http://x').searchParams;
      return { ahora_ms: Date.now(), ...repo.listarSesiones(Number(q.get('limite')), Number(q.get('offset'))) };
    };
    assert.deepEqual((await cargarSesiones(get, 'vivo')).sesiones.map(x => x.id), ['ACTIVA']);
    assert.deepEqual((await cargarSesiones(get, 'historial')).sesiones.map(x => x.id).sort(), ['ACTIVA', 'VACIA']);
  } finally { repo.cerrar(); }
});

test('aviso de sesión nueva: solo otra sesión real «Recibiendo» más reciente que la conectada', () => {
  const actual = AHORA - 4000;
  const lista = [s('SIM', 100, 5, 'simulado'), s('NUEVA', 200), s('CONECTADA', 4000)];
  assert.equal(sesionMasReciente(lista, AHORA, 'CONECTADA', actual)?.id, 'NUEVA');
  assert.equal(sesionMasReciente(lista, AHORA, 'CONECTADA', actual, new Set(['NUEVA'])), null, 'descartada por el usuario');
  assert.equal(sesionMasReciente([s('NUEVA', 5000)], AHORA, 'CONECTADA', actual), null, 'no está «Recibiendo»');
  assert.equal(sesionMasReciente([s('VIEJA', 2000)], AHORA, 'CONECTADA', AHORA - 1000), null, 'no es más reciente');
  assert.equal(sesionMasReciente([s('NUEVA', 200)], AHORA, 'NUEVA', null), null, 'la propia sesión no cuenta');
});
