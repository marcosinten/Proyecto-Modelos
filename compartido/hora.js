// Hora aproximada de un instante de la sesión, con el reloj de la API:
//   hora = ultima_recepcion_ms − (t_ultima_medicion − t_evento)
// Supone que la última medición llegó al recibirse (retraso de red y de lote ≈ 1 s como máximo),
// por eso se presenta como «aprox. ±1 s». Sin ultima_recepcion_ms devuelve null («sin medir»).
export const NOTA_HORA = 'aprox. ±1 s';

export function horaAproximadaMs(ultimaRecepcionMs, tUltimaMedicionMs, tMs) {
  if (ultimaRecepcionMs == null || tUltimaMedicionMs == null || tMs == null) return null;
  return ultimaRecepcionMs - (tUltimaMedicionMs - tMs);
}

// hh:mm:ss en hora local (Ecuador por defecto), o null.
export function textoHora(ms, zona = 'America/Guayaquil') {
  if (ms == null) return null;
  return new Date(ms).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: zona });
}

export function textoFechaHora(ms, zona = 'America/Guayaquil') {
  if (ms == null) return null;
  return new Date(ms).toLocaleString('es-EC', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: zona });
}
