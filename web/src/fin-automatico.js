// El carro está quieto si roll y pitch están dentro de ±5° y la aceleración está cerca de 9,81 m/s².
// Se cuenta desde la primera medición quieta posterior al último evento y a su fin, si lo tiene.
// Cualquier movimiento reinicia la cuenta; está listo cuando se acumulan 10 s continuos.
// Se usan 10 s para dar tiempo a que el carro se estabilice antes de iniciar otra prueba.
export const ESPERA_QUIETO_MS = 10000;
export const ANGULO_QUIETO_DEG = 5;
export const DESVIO_QUIETO_MS2 = 1.5;
export function estadoCierre({mediciones, eventos, t_inicio_ms}) {
  const posteriores = eventos.filter(e => e.t_deteccion_ms >= t_inicio_ms);
  if (!posteriores.length) return {hayEvento: false, quietoDesde_ms: null, faltan_ms: ESPERA_QUIETO_MS, listo: false};
  const ultimo = posteriores.reduce((a, e) => e.t_deteccion_ms > a.t_deteccion_ms ? e : a);
  const desde = Math.max(ultimo.t_deteccion_ms, ultimo.t_fin_ms ?? ultimo.t_deteccion_ms);
  let quietoDesde_ms = null;
  for (const m of mediciones) {
    if (m.t_ms <= desde) continue;
    const quieto = Math.abs(m.roll_deg) <= ANGULO_QUIETO_DEG && Math.abs(m.pitch_deg) <= ANGULO_QUIETO_DEG && Math.abs(Math.hypot(m.ax, m.ay, m.az) - 9.81) <= DESVIO_QUIETO_MS2;
    quietoDesde_ms = quieto ? quietoDesde_ms ?? m.t_ms : null;
  }
  const faltan_ms = quietoDesde_ms == null ? ESPERA_QUIETO_MS : Math.max(0, ESPERA_QUIETO_MS - (mediciones.at(-1).t_ms - quietoDesde_ms));
  return {hayEvento: true, quietoDesde_ms, faltan_ms, listo: quietoDesde_ms != null && faltan_ms === 0};
}
