// Estado del carro en un instante, para leerlo de un vistazo: Normal / Inclinado / Golpe / Volcado.
// Se calcula con la última lectura (y el último segundo para el golpe) usando los mismos umbrales
// que el firmware. Es una indicación de pantalla: los eventos guardados los decide el firmware.
import { CONSTANTES_INO } from '../../compartido/parametros-firmware.js';
import { direccionRoll, direccionPitch } from '../../compartido/exportacion.js';

const num = v => v.toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const total = m => Math.hypot(m.ax, m.ay, m.az);

export function estadoCarro(mediciones, t, { umbralGolpe = CONSTANTES_INO.UMBRAL_GOLPE_MS2 } = {}) {
  let m = null, golpe = 0;
  for (const x of mediciones) {
    if (x.t_ms > t) break;
    m = x;
    if (x.t_ms > t - 1000) golpe = Math.max(golpe, total(x));
  }
  m ??= mediciones[0];
  if (!m) return { estado: 'sin-datos', texto: 'Sin datos', detalle: 'Todavía no llegan mediciones' };
  const roll = m.roll_deg, pitch = m.pitch_deg;
  if (Math.abs(roll) >= CONSTANTES_INO.UMBRAL_VUELCO_DEG)
    return { estado: 'volcado', texto: 'Volcado', detalle: Math.abs(roll) >= 135 ? `Boca abajo · lateral ${num(roll)}°` : `De costado · lateral ${num(roll)}° · ${direccionRoll(roll)}` };
  if (golpe >= umbralGolpe)
    return { estado: 'golpe', texto: 'Golpe', detalle: `Aceleración total de ${num(golpe)} m/s² en el último segundo` };
  const incl = CONSTANTES_INO.UMBRAL_INCLINACION_DEG;
  if (Math.abs(roll) >= incl || Math.abs(pitch) >= incl)
    return { estado: 'inclinado', texto: 'Inclinado', detalle: Math.abs(roll) >= Math.abs(pitch)
      ? `Lateral ${num(roll)}° · ${direccionRoll(roll)}` : `Frontal ${num(pitch)}° · ${direccionPitch(pitch)}` };
  return { estado: 'normal', texto: 'Normal', detalle: `Lateral ${num(roll)}° · frontal ${num(pitch)}°` };
}
