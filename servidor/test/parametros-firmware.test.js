import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONSTANTES_INO, PULSOS_POR_VUELTA, DIAMETRO_RUEDA_M, PARAMETROS_FIRMWARE } from '../../compartido/parametros-firmware.js';
import { vueltasEntre } from '../../web/src/telemetria.js';

const ino = readFileSync(new URL('../../firmware/carro_rc/carro_rc.ino', import.meta.url), 'utf8');
// Valor por defecto en el .ino: `static const T NOMBRE = v;` o `#define NOMBRE v` (con #ifndef).
function constante(nombre) {
  const m = ino.match(new RegExp(`static\\s+(?:const|constexpr)\\s+\\w+\\s+${nombre}\\s*=\\s*([0-9.]+)f?\\s*;`)) ??
    ino.match(new RegExp(`#define\\s+${nombre}\\s+\\(?([0-9.]+)`));
  assert.ok(m, `No se encontró ${nombre} en carro_rc.ino`);
  return Number(m[1]);
}

test('los parámetros compartidos coinciden con carro_rc.ino', () => {
  for (const [nombre, valor] of Object.entries(CONSTANTES_INO)) assert.equal(constante(nombre), valor, nombre);
});

test('PULSOS_POR_VUELTA: una sola constante para firmware y web', () => {
  assert.equal(constante('PULSOS_POR_VUELTA'), PULSOS_POR_VUELTA);
  const a = { t_ms: 0, rueda_pulsos: 10 }, b = { t_ms: 20, rueda_pulsos: 10 + 3 * PULSOS_POR_VUELTA };
  assert.equal(vueltasEntre(a, b), 3);
  assert.equal(DIAMETRO_RUEDA_M, null, 'el diámetro no se conoce: no se inventa');
});

test('la hoja de parámetros muestra las frecuencias y el rango del firmware', () => {
  const valor = p => PARAMETROS_FIRMWARE.find(x => x.parametro === p).valor;
  assert.equal(valor('Frecuencia de adquisición'), 250);
  assert.equal(valor('Frecuencia de publicación'), 50);
  assert.equal(valor('Rango del acelerómetro'), 16);
  assert.equal(valor('Diámetro de la rueda con sensor'), 'sin medir');
});
