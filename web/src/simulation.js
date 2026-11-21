import { CONSTANTES_INO } from '../../compartido/parametros-firmware.js';
// Synthetic kinematic model. Axes: X forward, Y lateral (left), Z up.
// Accelerometer output includes gravity projected into the body frame.
// Angle convention (same as the viewer and the firmware):
//   roll_deg  > 0 raises the left side (rotation about +X)
//   pitch_deg > 0 raises the nose
//   orientation = pitch applied after roll, so at rest
//   ax = g sin(p), ay = g sin(r) cos(p), az = g cos(r) cos(p)
// opciones (all optional, defaults reproduce the ideal sensor):
//   rango_g              accelerometer full scale in g (2, 4, 8, 16); null = no clipping
//   ruido                standard deviation of white noise in m/s² per axis
//   duracion_impacto_ms  length of the collision stop (real RC hits: 5–20 ms)
//   semilla              integer seed, keeps noisy runs reproducible
//
//   alfa                 complementary filter coefficient (firmware: ALFA_COMPLEMENTARIO); 0 = accelerometer only
//
// Ángulo estimado como el firmware (21 nov): en cada lectura se calculan el ángulo del acelerómetro
// (atan2 sobre ax, ay, az simulados, que incluyen la aceleración del movimiento) y el giro simulado
// (derivada del ángulo real: gx = d(roll)/dt, gy = −d(pitch)/dt), y se mezclan con el mismo filtro:
//   angulo = α·(angulo + giro·dt) + (1 − α)·angulo_acelerometro
// Las mediciones publicadas llevan ese ángulo estimado (lo que ve el ESP32). El ángulo real del modelo
// va aparte, en angulosReales, para dibujarlo junto al estimado.
//
// Detection mirrors firmware/carro_rc/carro_rc.ino so the model predicts what the car will do:
//   - the sensor is read every 4 ms (250 Hz) and every rule is evaluated on those readings;
//   - golpe: |a| >= aceleracion on consecutive readings for permanenciaImpacto ms
//     (default 8 ms = 2 readings, the firmware's LECTURAS_GOLPE);
//   - inclinacion: |roll| or |pitch| estimados >= angulo, sustained for permanencia ms (firmware: 150 ms);
//   - vuelco: |roll| del acelerómetro >= max(90, angulo), sustained for permanencia ms (igual que el firmware);
//   - the published samples are 50 Hz: from every 5 readings, the one with the largest |a|,
//     with its own time stamp, exactly as the firmware sends them to the API.
export function generarEscenario(tipo, aceleracion = 16, angulo = 60, permanencia = 150, permanenciaImpacto = 8, opciones = {}) {
  const { rango_g = null, ruido = 0, duracion_impacto_ms = 100, semilla = 1, alfa = CONSTANTES_INO.ALFA_COMPLEMENTARIO } = opciones;
  // reposo (fase 3): carro quieto y horizontal, para comparar con la prueba física de reposo.
  const tipos = ['reposo', 'normal', 'frenada', 'impacto', 'vuelco', 'inclinacion'];
  if (!tipos.includes(tipo) || ![aceleracion, angulo, permanencia, permanenciaImpacto].every(Number.isFinite) ||
      aceleracion <= 9.81 || angulo <= 0 || angulo > 180 || permanencia < 0 || permanenciaImpacto < 0 ||
      (rango_g !== null && ![2, 4, 8, 16].includes(rango_g)) || !Number.isFinite(ruido) || ruido < 0 || ruido > 5 ||
      !Number.isFinite(duracion_impacto_ms) || duracion_impacto_ms < 1 || duracion_impacto_ms > 1000 || !Number.isInteger(semilla) ||
      !Number.isFinite(alfa) || alfa < 0 || alfa >= 1) {
    throw new Error('Escenario o parámetros fuera de rango.');
  }
  const lectura = 4;        // ms between sensor readings (250 Hz)
  const porEnvio = 5;       // readings per published sample (50 Hz)
  const dt = lectura * porEnvio;
  const radio = .03; // Metres, illustrative RC wheel.
  const smooth = x => { const u = Math.max(0, Math.min(1, x)); return u*u*(3-2*u); };
  const velocity = t => {
    if (tipo === 'reposo') return 0;
    const initial = 2 * smooth((t - 500) / 1000);
    const stopAt = tipo === 'impacto' ? 4900 : tipo === 'frenada' ? 4500 : tipo === 'vuelco' ? 3500 : 8000;
    const duration = tipo === 'impacto' ? duracion_impacto_ms : tipo === 'frenada' ? 700 : tipo === 'vuelco' ? 2000 : 1000;
    return initial * (1 - smooth((t - stopAt) / duration));
  };
  // Sensor model: seeded Gaussian noise, then clipping at the selected full scale.
  let state = semilla >>> 0;
  const uniform = () => { state = (state + 0x6D2B79F5) >>> 0; let x = state; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
  const limite = rango_g === null ? Infinity : rango_g * 9.80665;
  const sensor = v => Math.max(-limite, Math.min(limite, ruido ? v + ruido * gauss() : v));
  // Ángulos reales del modelo en el instante t (°).
  const rollReal = t => tipo === 'vuelco' ? 180 * smooth((t - 3500) / 2000)
    : tipo === 'inclinacion' ? 42 * Math.sin(Math.PI*t/10000)**2 : 0;
  const pitchReal = t => tipo === 'frenada' ? (velocity(t + 1) - velocity(t - 1)) / .002 * .8 : 0;
  const grados = Math.PI / 180;
  const envolver = a => a > 180 ? a - 360 : a < -180 ? a + 360 : a;
  let rollEst = null, pitchEst = null;
  const lecturas = [];
  for (let t = 0; t < 10000 + dt; t += lectura) {
    const linear = (velocity(t + 1) - velocity(t - 1)) / .002;
    const roll = rollReal(t), pitch = pitchReal(t);
    const r = roll*grados, p = pitch*grados;
    const ax = sensor(linear + 9.81*Math.sin(p)), ay = sensor(9.81*Math.sin(r)*Math.cos(p)), az = sensor(9.81*Math.cos(r)*Math.cos(p));
    // Lo que calcula el firmware: ángulo del acelerómetro, giro y filtro complementario.
    const rollAcc = Math.atan2(ay, az) / grados, pitchAcc = Math.atan2(ax, Math.hypot(ay, az)) / grados;
    const gx = (roll - rollReal(t - lectura)) / (lectura / 1000), gy = -(pitch - pitchReal(t - lectura)) / (lectura / 1000);
    if (rollEst === null) { rollEst = rollAcc; pitchEst = pitchAcc; }
    else {
      rollEst = envolver(rollAcc + alfa * envolver(rollEst + gx * lectura / 1000 - rollAcc));
      pitchEst = Math.max(-90, Math.min(90, pitchAcc + alfa * (pitchEst - gy * lectura / 1000 - pitchAcc)));
    }
    lecturas.push({
      t_ms: t, ax, ay, az,
      roll_deg: rollEst, pitch_deg: pitchEst,
      roll_acc_deg: rollAcc, pitch_acc_deg: pitchAcc, roll_real_deg: roll, pitch_real_deg: pitch,
      rueda_rps: velocity(t)/(2*Math.PI*radio)
    });
  }
  // Published samples: largest |a| of each group of readings, like the firmware's telemetry.
  const norma = m => Math.hypot(m.ax, m.ay, m.az);
  const mediciones = [], angulosReales = [];
  for (let i = 0; i + porEnvio <= lecturas.length; i += porEnvio) {
    const grupo = lecturas.slice(i, i + porEnvio);
    const pico = grupo.reduce((a, b) => norma(b) > norma(a) ? b : a);
    // Solo los campos del contrato v1 (la corrida se puede guardar en la API).
    const { t_ms, ax, ay, az, roll_deg, pitch_deg } = pico;
    mediciones.push({ numero: mediciones.length + 1, t_ms, ax, ay, az, roll_deg, pitch_deg, rueda_rps: grupo.at(-1).rueda_rps });
    angulosReales.push({ t_ms, roll_deg: pico.roll_real_deg, pitch_deg: pico.pitch_real_deg, roll_acc_deg: pico.roll_acc_deg, pitch_acc_deg: pico.pitch_acc_deg });
  }
  // Rules on every 4 ms reading, each with its own counter so one condition never sustains another.
  const lecturasGolpe = Math.max(1, Math.round(permanenciaImpacto / lectura));
  const candidatos = [];
  for (const [tipoEvento, condition, dwell, porLecturas] of [
    ['golpe', m => norma(m) >= aceleracion, lecturasGolpe, true],
    ['inclinacion', m => Math.abs(m.roll_deg) >= angulo || Math.abs(m.pitch_deg) >= angulo, permanencia, false],
    ['vuelco', m => Math.abs(m.roll_acc_deg) >= Math.max(90, angulo), permanencia, false]
  ]) {
    let since = null, seguidas = 0;
    for (const m of lecturas) {
      if (!condition(m)) { since = null; seguidas = 0; continue; }
      since ??= m.t_ms; seguidas++;
      if (porLecturas ? seguidas >= dwell : m.t_ms - since >= dwell) {
        // desde: primera lectura sobre el umbral; t − desde es el tiempo de detección (igual que el firmware).
        candidatos.push({tipo:tipoEvento, t:m.t_ms, desde:since, latencia_deteccion_ms:m.t_ms - since});
        break;
      }
    }
  }
  // One summary event per legacy package; the final rollover takes priority.
  const detected = candidatos.find(e=>e.tipo==='vuelco') ?? candidatos.find(e=>e.tipo==='golpe') ?? candidatos[0];
  const id = crypto.randomUUID();
  const sesion = {id:'SIM-'+id, origen:'simulado'};
  return {
    version:1, sesion, mediciones,
    // Ángulo real del modelo y el del acelerómetro, uno por medición (mismo t_ms). No van a la API.
    angulosReales,
    // Cada regla que se cumplió, en orden de tiempo. La primera es la que abre el evento en el firmware
    // (p. ej. un vuelco empieza como inclinación); su latencia es la que mide el firmware.
    detecciones: [...candidatos].sort((a, b) => a.t - b.t),
    parametros:{escenario:tipo, aceleracion, angulo, permanencia, permanencia_impacto_ms:permanenciaImpacto, lecturas_golpe:lecturasGolpe, lectura_ms:lectura, muestreo_ms:dt, radio_rueda_m:radio, alfa_complementario:alfa, rango_g:rango_g ?? 'sin límite', ruido_m_s2:ruido, duracion_impacto_ms, semilla},
    evento:detected ? {
      id:'EV-'+id, sesion_id:sesion.id, tipo:detected.tipo,
      gravedad:detected.tipo==='inclinacion'?'media':'alta', estado:'confirmado',
      t_inicio_ms:0, t_fin_ms:mediciones.at(-1).t_ms, t_deteccion_ms:detected.t,
      t_activacion_ms:null, ubicacion:null
    } : null
  };
}
