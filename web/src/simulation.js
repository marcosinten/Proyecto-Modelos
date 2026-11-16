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
export function generarEscenario(tipo, aceleracion = 16, angulo = 60, permanencia = 150, permanenciaImpacto = 20, opciones = {}) {
  const { rango_g = null, ruido = 0, duracion_impacto_ms = 100, semilla = 1 } = opciones;
  const tipos = ['normal', 'frenada', 'impacto', 'vuelco', 'inclinacion'];
  if (!tipos.includes(tipo) || ![aceleracion, angulo, permanencia, permanenciaImpacto].every(Number.isFinite) ||
      aceleracion <= 9.81 || angulo <= 0 || angulo > 180 || permanencia < 0 || permanenciaImpacto < 0 ||
      (rango_g !== null && ![2, 4, 8, 16].includes(rango_g)) || !Number.isFinite(ruido) || ruido < 0 || ruido > 5 ||
      !Number.isFinite(duracion_impacto_ms) || duracion_impacto_ms < 1 || duracion_impacto_ms > 1000 || !Number.isInteger(semilla)) {
    throw new Error('Escenario o parámetros fuera de rango.');
  }
  const dt = 20;
  const radio = .03; // Metres, illustrative RC wheel.
  const smooth = x => { const u = Math.max(0, Math.min(1, x)); return u*u*(3-2*u); };
  const velocity = t => {
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
  const mediciones = [];
  for (let t = 0; t <= 10000; t += dt) {
    const linear = (velocity(t + 1) - velocity(t - 1)) / .002;
    const roll = tipo === 'vuelco' ? 180 * smooth((t - 3500) / 2000)
      : tipo === 'inclinacion' ? 42 * Math.sin(Math.PI*t/10000)**2 : 0;
    const pitch = tipo === 'frenada' ? linear * .8 : 0;
    const r = roll*Math.PI/180, p = pitch*Math.PI/180;
    mediciones.push({
      numero: mediciones.length + 1, t_ms: t,
      ax: sensor(linear + 9.81*Math.sin(p)),
      ay: sensor(9.81*Math.sin(r)*Math.cos(p)),
      az: sensor(9.81*Math.cos(r)*Math.cos(p)),
      roll_deg: roll, pitch_deg: pitch,
      rueda_rps: velocity(t)/(2*Math.PI*radio)
    });
  }
  // Independent persistence counters prevent one condition from sustaining another.
  const candidatos = [];
  for (const [tipoEvento, condition, dwell] of [
    ['golpe', m => Math.hypot(m.ax,m.ay,m.az) >= aceleracion, permanenciaImpacto],
    ['inclinacion', m => Math.abs(m.roll_deg) >= angulo || Math.abs(m.pitch_deg) >= angulo, permanencia],
    ['vuelco', m => Math.abs(m.roll_deg) >= Math.max(90, angulo), permanencia]
  ]) {
    let since = null;
    for (const m of mediciones) {
      if (!condition(m)) { since = null; continue; }
      since ??= m.t_ms;
      if (m.t_ms - since >= dwell) {
        candidatos.push({tipo:tipoEvento, t:m.t_ms});
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
    parametros:{escenario:tipo, aceleracion, angulo, permanencia, permanencia_impacto_ms:permanenciaImpacto, muestreo_ms:dt, radio_rueda_m:radio, rango_g:rango_g ?? 'sin límite', ruido_m_s2:ruido, duracion_impacto_ms, semilla},
    evento:detected ? {
      id:'EV-'+id, sesion_id:sesion.id, tipo:detected.tipo,
      gravedad:detected.tipo==='inclinacion'?'media':'alta', estado:'confirmado',
      t_inicio_ms:0, t_fin_ms:10000, t_deteccion_ms:detected.t,
      t_activacion_ms:null, ubicacion:null
    } : null
  };
}
