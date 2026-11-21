import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estadoCierre} from '../../web/src/fin-automatico.js';
const m = (t, roll = 0) => ({t_ms: t, ax: 0, ay: 0, az: 9.81, roll_deg: roll, pitch_deg: 0});
const evento = {t_deteccion_ms: 1, t_fin_ms: 2};
test('sin evento no se cierra', () => assert.equal(estadoCierre({mediciones: [m(3),m(10003)], eventos: [], t_inicio_ms: 0}).listo, false));
test('diez segundos quieto después del evento', () => assert.equal(estadoCierre({mediciones: [m(3),m(10003)], eventos: [evento], t_inicio_ms: 0}).listo, true));
test('el movimiento reinicia la cuenta', () => assert.equal(estadoCierre({mediciones: [m(3),m(5000, 6),m(6000),m(10003)], eventos: [evento], t_inicio_ms: 0}).quietoDesde_ms, 6000));
test('un evento anterior al inicio no cuenta', () => assert.equal(estadoCierre({mediciones: [m(3),m(10003)], eventos: [evento], t_inicio_ms: 2}).hayEvento, false));
