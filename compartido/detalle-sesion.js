// Detalle de sesión: datos generales (tarjetas) y reducción de puntos para dibujar sesiones largas.
// Los números salen de resumenSesion (los mismos que el Excel «Resumen»); aquí solo se ordenan y se
// redactan para la pantalla. Un dato ausente se muestra como SIN_MEDIR, nunca como 0.
import { resumenSesion, aceleracionTotal, SIN_MEDIR, GRAVEDAD } from './exportacion.js';
import { textoHora, NOTA_HORA } from './hora.js';

const num = (v, d = 1) => v.toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d });
const seg = ms => num(ms / 1000);

// "1 h 02 min 05 s", "3 min 07 s", "12,4 s".
export function textoDuracion(ms) {
  if (ms == null) return SIN_MEDIR;
  if (ms < 60000) return `${seg(ms)} s`;
  const total = Math.round(ms / 1000), h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
  const dos = n => String(n).padStart(2, '0');
  return h ? `${h} h ${dos(m)} min ${dos(s)} s` : `${m} min ${dos(s)} s`;
}

// Datos generales de una sesión completa: { sesion, eventos, mediciones, reloj? }.
export function datosGenerales(paquete) {
  const r = resumenSesion({ ...paquete, eventos: paquete.eventos ?? [], evento: undefined });
  return {
    sesion_id: r.sesion_id,
    origen: r.origen,
    hora_inicio_ms: r.hora_inicio_ms,
    hora_fin_ms: r.hora_fin_ms,
    t_inicio_ms: r.t_inicio_ms,
    t_fin_ms: r.t_fin_ms,
    duracion_ms: r.duracion_ms,
    mediciones: r.mediciones,
    golpes: r.eventos_por_tipo.golpe ?? 0,
    inclinaciones: r.eventos_por_tipo.inclinacion ?? 0,
    vuelcos: r.eventos_por_tipo.vuelco ?? 0,
    max_roll: r.max_roll,
    max_pitch: r.max_pitch,
    max_aceleracion: r.max_aceleracion,
    vueltas: r.rueda.con_dato ? r.rueda.vueltas : null,
    rueda_fuente: r.rueda.fuente
  };
}

// Tarjetas listas para pintar: { id, titulo, valor, detalle, t_ms? }. t_ms permite saltar a ese instante.
export function tarjetasSesion(d) {
  const instante = p => p ? `a los ${seg(p.t_ms)} s de la sesión` : 'sin mediciones';
  const hora = ms => ms == null ? SIN_MEDIR : textoHora(ms);
  const conHora = d.hora_inicio_ms != null;
  return [
    { id: 'inicio', titulo: 'Inicio', valor: hora(d.hora_inicio_ms), detalle: conHora ? `Hora ${NOTA_HORA}` : 'Sin hora de recepción en la API' },
    { id: 'fin', titulo: 'Fin', valor: hora(d.hora_fin_ms), detalle: conHora ? `Hora ${NOTA_HORA}` : 'Sin hora de recepción en la API' },
    { id: 'duracion', titulo: 'Duración', valor: textoDuracion(d.duracion_ms), detalle: 'De la primera a la última medición' },
    { id: 'mediciones', titulo: 'Mediciones', valor: d.mediciones.toLocaleString('es-EC'), detalle: 'Muestras guardadas (50 por segundo)' },
    { id: 'eventos', titulo: 'Eventos', valor: String(d.golpes + d.inclinaciones + d.vuelcos),
      detalle: `${d.golpes} ${d.golpes === 1 ? 'golpe' : 'golpes'} · ${d.inclinaciones} ${d.inclinaciones === 1 ? 'inclinación' : 'inclinaciones'} · ${d.vuelcos} ${d.vuelcos === 1 ? 'vuelco' : 'vuelcos'}` },
    { id: 'roll', titulo: 'Inclinación lateral máxima', valor: d.max_roll ? `${num(d.max_roll.valor)}°` : SIN_MEDIR, detalle: instante(d.max_roll), t_ms: d.max_roll?.t_ms },
    { id: 'pitch', titulo: 'Inclinación frontal máxima', valor: d.max_pitch ? `${num(d.max_pitch.valor)}°` : SIN_MEDIR, detalle: instante(d.max_pitch), t_ms: d.max_pitch?.t_ms },
    { id: 'aceleracion', titulo: 'Aceleración total máxima', valor: d.max_aceleracion ? `${num(d.max_aceleracion.valor)} m/s²` : SIN_MEDIR,
      detalle: d.max_aceleracion ? `${num(d.max_aceleracion.valor / GRAVEDAD)} × gravedad · ${instante(d.max_aceleracion)}` : 'sin mediciones', t_ms: d.max_aceleracion?.t_ms },
    { id: 'vueltas', titulo: 'Vueltas de la rueda', valor: d.vueltas == null ? SIN_MEDIR : num(d.vueltas),
      detalle: d.vueltas == null ? 'Ninguna medición trae datos de la rueda' : `Calculadas con ${d.rueda_fuente}` }
  ];
}

// Índice de la primera medición con t_ms >= t (mediciones ordenadas por t_ms).
export function indiceDesde(mediciones, t) {
  let lo = 0, hi = mediciones.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (mediciones[mid].t_ms < t) lo = mid + 1; else hi = mid; }
  return lo;
}

// Reduce las mediciones del rango [desde, hasta] a unas maxPuntos para dibujar, sin perder picos:
// por cada tramo se conservan la de mayor aceleración total (golpes) y los extremos de roll y pitch.
// También se conservan los bordes del rango y las mediciones en los instantes de `fijos` (eventos).
// Donde los datos originales tienen un hueco (> huecoMs) la medición siguiente lleva corte: true,
// para que la gráfica corte la línea aunque los puntos dibujados estén más separados que huecoMs.
// No modifica las mediciones: devuelve copias superficiales solo cuando hay que marcar el corte.
export function reducirMediciones(mediciones, { desde = -Infinity, hasta = Infinity, maxPuntos = 1500, huecoMs = 500, fijos = [] } = {}) {
  const i0 = Math.max(0, indiceDesde(mediciones, desde) - 1);
  const i1 = Math.min(mediciones.length, indiceDesde(mediciones, hasta) + 1);
  const n = i1 - i0;
  const marcar = (m, previa) => previa && m.t_ms - previa.t_ms > huecoMs ? { ...m, corte: true } : m;
  if (n <= maxPuntos) {
    const out = [];
    for (let i = i0; i < i1; i++) out.push(marcar(mediciones[i], mediciones[i - 1]));
    return out;
  }
  // Cinco candidatas por tramo (máx. aceleración, mín./máx. roll, mín./máx. pitch).
  const tramos = Math.max(1, Math.floor(maxPuntos / 5));
  const paso = n / tramos;
  const elegidos = new Set([i0, i1 - 1]);
  for (let k = 0; k < tramos; k++) {
    const a = i0 + Math.floor(k * paso), b = Math.min(i1, i0 + Math.floor((k + 1) * paso));
    if (a >= b) continue;
    let acel = a, rMin = a, rMax = a, pMin = a, pMax = a, aMax = aceleracionTotal(mediciones[a]);
    for (let i = a + 1; i < b; i++) {
      const m = mediciones[i], t = aceleracionTotal(m);
      if (t > aMax) { aMax = t; acel = i; }
      if (m.roll_deg < mediciones[rMin].roll_deg) rMin = i;
      if (m.roll_deg > mediciones[rMax].roll_deg) rMax = i;
      if (m.pitch_deg < mediciones[pMin].pitch_deg) pMin = i;
      if (m.pitch_deg > mediciones[pMax].pitch_deg) pMax = i;
    }
    for (const i of [acel, rMin, rMax, pMin, pMax]) elegidos.add(i);
  }
  for (const t of fijos) {
    if (t < desde || t > hasta) continue;
    const i = Math.min(i1 - 1, Math.max(i0, indiceDesde(mediciones, t)));
    elegidos.add(i);
  }
  // Un hueco real entre dos índices elegidos: se conserva el primero tras el hueco para cortar ahí.
  const orden = [...elegidos].sort((x, y) => x - y);
  const out = [];
  for (let k = 0; k < orden.length; k++) {
    const i = orden[k], anterior = orden[k - 1];
    let corte = false;
    if (anterior !== undefined) for (let j = anterior + 1; j <= i; j++) if (mediciones[j].t_ms - mediciones[j - 1].t_ms > huecoMs) { corte = true; break; }
    out.push(corte ? { ...mediciones[i], corte: true } : mediciones[i]);
  }
  return out;
}
