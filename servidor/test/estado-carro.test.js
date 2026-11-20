import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoCarro } from '../../web/src/estado-carro.js';
import { textoConexion } from '../../web/src/telemetria.js';

const m = (t_ms, roll_deg = 0, pitch_deg = 0, ax = 0) => ({ t_ms, roll_deg, pitch_deg, ax, ay: 0, az: 9.81 });

test('estado del carro: normal, inclinado, golpe en el último segundo y volcado', () => {
  assert.equal(estadoCarro([m(0)], 0).texto, 'Normal');
  assert.equal(estadoCarro([m(0, 24.5)], 0).texto, 'Inclinado');
  assert.match(estadoCarro([m(0, 24.5)], 0).detalle, /Lateral 24,5° · lado izquierdo elevado/);
  assert.match(estadoCarro([m(0, 0, 22)], 0).detalle, /Frontal 22,0° · trompa elevada/);
  const golpe = [m(0, 0, 0, 20), m(500), m(900)];
  assert.equal(estadoCarro(golpe, 900).texto, 'Golpe');
  assert.equal(estadoCarro([...golpe, m(1100)], 1100).texto, 'Normal', 'el golpe sale de la ventana de 1 s');
  assert.equal(estadoCarro([m(0, 95)], 0).texto, 'Volcado');
  assert.match(estadoCarro([m(0, -180)], 0).detalle, /Boca abajo/);
  assert.equal(estadoCarro([m(0, 95), m(20)], 0).texto, 'Volcado', 'usa la lectura del instante, no la última');
  assert.equal(estadoCarro([], 0).estado, 'sin-datos');
});

test('texto de conexión: activa ≤ 3 s, atrasada ≤ 10 s, detenida', () => {
  assert.equal(textoConexion(1000, 4000), 'Conexión: activa · hace 3 s');
  assert.equal(textoConexion(1000, 8000), 'Conexión: atrasada · hace 7 s');
  assert.equal(textoConexion(1000, 20000), 'Conexión: detenida · hace 19 s');
  assert.equal(textoConexion(null, 1), 'Conexión: sin datos');
});
