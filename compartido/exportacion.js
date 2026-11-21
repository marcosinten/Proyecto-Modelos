// Cálculos de las exportaciones (Resumen y Técnico). Los usan la web y el servidor.
// Todo sale de las mediciones y eventos guardados: nada se estima fuera de lo indicado ni se rellena.
// Un dato ausente es null y quien lo muestra escribe SIN_MEDIR, nunca 0.
import { PULSOS_POR_VUELTA, DIAMETRO_RUEDA_M, CONSTANTES_INO, distanciaM } from './parametros-firmware.js';
import { horaAproximadaMs } from './hora.js';

export const SIN_MEDIR = 'sin medir';
export const GRAVEDAD = 9.81;
export const RUEDA_MINIMA_RPS = 0.01;         // mismo criterio que el monitor para decir «girando»
export const UMBRAL_TRAMO_DEG = CONSTANTES_INO.UMBRAL_INCLINACION_DEG; // 10°
export const UNIR_HUECOS_MS = 200;            // huecos menores se unen al mismo tramo
export const TRAMO_MINIMO_MS = 150;           // tramos más cortos se descartan
const HUECO_TELEMETRIA_MS = 500;              // más separación entre muestras = datos perdidos

export const NOMBRE_TIPO = { golpe: 'Golpe', inclinacion: 'Inclinación', vuelco: 'Vuelco' };
export const aceleracionTotal = m => Math.hypot(m.ax, m.ay, m.az);
const num = (v, d = 1) => v.toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d });

// Tiempos de respuesta que mide el firmware con micros() (fase 1). Si el evento no los trae (EV-001,
// EV-002 y los eventos anteriores), son null y se muestran «sin medir»: nunca se cambian por 0.
//   latencia_deteccion_ms:  primera lectura sobre el umbral → evento confirmado.
//   latencia_activacion_ms: evento confirmado → órdenes enviadas a LED, buzzer y servo.
export const latenciaDeteccion = e => e?.latencia_deteccion_ms ?? null;
export const latenciaActivacion = e => e?.latencia_activacion_ms ?? null;
// «4 ms», «152 ms», «0,005 ms» o «sin medir». Hasta 3 decimales: la activación dura microsegundos.
export const textoLatencia = ms => ms == null ? SIN_MEDIR : `${ms.toLocaleString('es-EC', { maximumFractionDigits: 3 })} ms`;

// Mismas convenciones que web/src/explanation.js.
export function direccionRoll(roll) {
  if (Math.abs(roll) >= 135) return 'cerca de invertido';
  return roll > 0 ? 'lado izquierdo elevado' : 'lado derecho elevado';
}
export const direccionPitch = pitch => pitch > 0 ? 'trompa elevada' : 'trompa hacia abajo';

export function normalizar(paquete) {
  const mediciones = [...(paquete.mediciones ?? [])].sort((a, b) => a.t_ms - b.t_ms || a.numero - b.numero);
  const eventos = [...(paquete.eventos ?? (paquete.evento ? [paquete.evento] : []))].sort((a, b) => a.t_deteccion_ms - b.t_deteccion_ms);
  const alcance = paquete.evento && !paquete.eventos ? 'evento' : 'sesion';
  return { ...paquete, mediciones, eventos, alcance, reloj: paquete.reloj ?? null };
}

// Hora aproximada (ms de la API) de un instante de la sesión, o null si falta el reloj.
export const horaDe = (reloj, t_ms) => horaAproximadaMs(reloj?.ultima_recepcion_ms, reloj?.t_ultima_medicion_ms, t_ms);

// Tramos en los que condicion(m) se cumple, uniendo huecos < unirMs y descartando tramos < minMs.
// Un tramo va de la primera a la última medición que cumple la condición.
export function tramos(mediciones, condicion, { unirMs = UNIR_HUECOS_MS, minMs = TRAMO_MINIMO_MS } = {}) {
  const crudos = [];
  let actual = null;
  for (const m of mediciones) {
    if (condicion(m)) {
      if (actual && m.t_ms - actual.fin.t_ms < unirMs) { actual.fin = m; actual.muestras.push(m); }
      else { actual = { inicio: m, fin: m, muestras: [m] }; crudos.push(actual); }
    }
  }
  return crudos
    .map(t => ({ t_inicio_ms: t.inicio.t_ms, t_fin_ms: t.fin.t_ms, duracion_ms: t.fin.t_ms - t.inicio.t_ms, muestras: t.muestras }))
    .filter(t => t.duracion_ms >= minMs);
}

const inclinada = (m, umbral = UMBRAL_TRAMO_DEG) => Math.abs(m.roll_deg) >= umbral || Math.abs(m.pitch_deg) >= umbral;

// Tramos con |roll| o |pitch| >= 10° (umbral del firmware), con su máximo (eje, valor con signo e instante).
export function tramosInclinacion(mediciones, opciones) {
  return tramos(mediciones, m => inclinada(m), opciones).map(({ muestras, ...t }) => {
    let pico = null;
    for (const m of muestras) {
      for (const [eje, valor] of [['lateral', m.roll_deg], ['frontal', m.pitch_deg]])
        if (!pico || Math.abs(valor) > Math.abs(pico.valor)) pico = { eje, valor, t_ms: m.t_ms };
    }
    return { ...t, eje: pico.eje, maximo_deg: pico.valor, t_maximo_ms: pico.t_ms,
      direccion: pico.eje === 'lateral' ? direccionRoll(pico.valor) : direccionPitch(pico.valor) };
  });
}

// Rueda con sensor. Vueltas = Δrueda_pulsos / PULSOS_POR_VUELTA cuando hay contador;
// si no, integración de rueda_rps entre muestras (firmware anterior).
export function resumenRueda(mediciones) {
  let vueltas = 0, pulsos = 0, conContador = true, conDato = 0, girando = 0, detenida = 0, maximo = null;
  for (let i = 0; i < mediciones.length; i++) {
    const m = mediciones[i];
    if (m.rueda_rps != null) {
      conDato++;
      if (!maximo || m.rueda_rps > maximo.valor) maximo = { valor: m.rueda_rps, t_ms: m.t_ms };
    }
    if (m.rueda_pulsos == null) conContador = false;
    if (!i) continue;
    const a = mediciones[i - 1], dt = m.t_ms - a.t_ms;
    if (a.rueda_pulsos != null && m.rueda_pulsos != null) {
      const d = Math.max(0, m.rueda_pulsos - a.rueda_pulsos);
      pulsos += d; vueltas += d / PULSOS_POR_VUELTA;
    } else if (dt > 0 && dt <= HUECO_TELEMETRIA_MS && a.rueda_rps != null && m.rueda_rps != null) vueltas += (a.rueda_rps + m.rueda_rps) * dt / 2000;
    if (dt <= 0 || dt > HUECO_TELEMETRIA_MS || a.rueda_rps == null) continue;
    if (a.rueda_rps > RUEDA_MINIMA_RPS) girando += dt; else detenida += dt;
  }
  const hayDato = conDato > 0 || mediciones.some(m => m.rueda_pulsos != null);
  const duracion = mediciones.length > 1 ? mediciones.at(-1).t_ms - mediciones[0].t_ms : 0;
  const distancia = hayDato ? distanciaM(vueltas) : null;
  return {
    con_dato: hayDato, muestras_con_rps: conDato,
    fuente: !hayDato ? null : conContador ? 'contador rueda_pulsos' : 'integración de rueda_rps',
    pulsos: hayDato && conContador ? pulsos : null,
    vueltas: hayDato ? vueltas : null,
    t_girando_ms: conDato ? girando : null, t_detenida_ms: conDato ? detenida : null,
    maximo_rps: maximo,
    diametro_m: DIAMETRO_RUEDA_M,
    distancia_m: distancia,
    velocidad_media_m_s: distancia == null || duracion <= 0 ? null : distancia / (duracion / 1000)
  };
}

// Valor de mayor magnitud con su signo.
function pico(mediciones, valor) {
  let mejor = null;
  for (const m of mediciones) {
    const v = valor(m);
    if (Number.isFinite(v) && (!mejor || Math.abs(v) > Math.abs(mejor.valor))) mejor = { valor: v, t_ms: m.t_ms };
  }
  return mejor;
}

export function analizarEvento(evento, mediciones) {
  const ventana = mediciones.filter(m => m.t_ms >= evento.t_inicio_ms && m.t_ms <= evento.t_fin_ms);
  const roll = pico(ventana, m => m.roll_deg), pitch = pico(ventana, m => m.pitch_deg);
  const angulo = !roll ? null : Math.abs(roll.valor) >= Math.abs(pitch.valor) ? { eje: 'lateral', ...roll } : { eje: 'frontal', ...pitch };
  const acel = pico(ventana, aceleracionTotal);
  // Tiempo sobre el umbral dentro de la ventana: inclinación (10°) o vuelco (|roll| >= 90°).
  const sobre = evento.tipo === 'vuelco'
    ? tramos(ventana, m => Math.abs(m.roll_deg) >= CONSTANTES_INO.UMBRAL_VUELCO_DEG, { minMs: 0 })
    : tramos(ventana, m => inclinada(m), { minMs: 0 });
  const tiempoSobre = sobre.length ? sobre.reduce((s, t) => s + t.duracion_ms, 0) : null;
  const a = {
    mediciones: ventana.length,
    duracion_ms: evento.t_fin_ms - evento.t_inicio_ms,
    respuesta_ms: evento.t_activacion_ms == null ? null : evento.t_activacion_ms - evento.t_deteccion_ms,
    latencia_deteccion_ms: latenciaDeteccion(evento), latencia_activacion_ms: latenciaActivacion(evento),
    angulo_max: angulo, aceleracion_max: acel, tiempo_sobre_umbral_ms: tiempoSobre
  };
  return { ...a, frase: fraseEvento(evento, a) };
}

export function fraseEvento(evento, a) {
  if (!a.mediciones) return `${NOMBRE_TIPO[evento.tipo] ?? evento.tipo} registrado; no hay mediciones guardadas en su ventana.`;
  const durante = ms => ms == null ? `en una ventana de ${num(a.duracion_ms / 1000)} s` : `durante ${num(ms / 1000)} s`;
  const ang = a.angulo_max;
  if (evento.tipo === 'golpe') {
    const g = a.aceleracion_max.valor;
    return `Golpe de ${num(g)} m/s² de aceleración total (${num(g / GRAVEDAD)} veces la gravedad).`;
  }
  if (evento.tipo === 'vuelco') {
    const roll = ang.eje === 'lateral' ? ang.valor : null;
    const valor = num(Math.abs(roll ?? ang.valor));
    const como = roll != null && Math.abs(roll) >= 135 ? `quedó cerca de invertido (${valor}°)` : `llegó a ${valor}° de lado (${direccionRoll(roll ?? ang.valor)})`;
    return `Se volcó: ${como} ${a.tiempo_sobre_umbral_ms == null ? durante(null) : `y pasó ${num(a.tiempo_sobre_umbral_ms / 1000)} s sobre 90°`}.`;
  }
  const valor = num(Math.abs(ang.valor));
  return ang.eje === 'lateral'
    ? `Se inclinó ${valor}° hacia un lado (${direccionRoll(ang.valor)}) ${durante(a.tiempo_sobre_umbral_ms)}.`
    : `Se inclinó ${valor}° de frente (${direccionPitch(ang.valor)}) ${durante(a.tiempo_sobre_umbral_ms)}.`;
}

export function resumenSesion(paquete) {
  const p = normalizar(paquete);
  const { mediciones, eventos, reloj } = p;
  const primera = mediciones[0]?.t_ms ?? null, ultima = mediciones.at(-1)?.t_ms ?? null;
  const t_inicio_ms = p.alcance === 'evento' ? eventos[0].t_inicio_ms : primera;
  const t_fin_ms = p.alcance === 'evento' ? eventos[0].t_fin_ms : ultima;
  const porTipo = { golpe: 0, inclinacion: 0, vuelco: 0 };
  for (const e of eventos) porTipo[e.tipo] = (porTipo[e.tipo] ?? 0) + 1;
  return {
    sesion_id: p.sesion.id, origen: p.sesion.origen, alcance: p.alcance,
    evento_id: p.alcance === 'evento' ? eventos[0].id : null,
    t_inicio_ms, t_fin_ms,
    duracion_ms: t_inicio_ms == null || t_fin_ms == null ? null : t_fin_ms - t_inicio_ms,
    hora_inicio_ms: horaDe(reloj, t_inicio_ms), hora_fin_ms: horaDe(reloj, t_fin_ms),
    mediciones: mediciones.length,
    eventos_por_tipo: porTipo, eventos: eventos.length,
    max_roll: pico(mediciones, m => m.roll_deg), max_pitch: pico(mediciones, m => m.pitch_deg),
    max_aceleracion: pico(mediciones, aceleracionTotal),
    rueda: resumenRueda(mediciones),
    inclinaciones: tramosInclinacion(mediciones),
    detalle_eventos: eventos.map(e => ({ evento: e, hora_ms: horaDe(reloj, e.t_deteccion_ms), ...analizarEvento(e, mediciones) }))
  };
}
