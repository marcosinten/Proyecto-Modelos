// Resumen de una corrida. Lo usan la web y el servidor (Excel) para mostrar los mismos números.
// Todo sale de las mediciones o del evento del paquete: nada se estima ni se rellena.
// Un dato ausente se devuelve como null y quien lo muestra escribe SIN_MEDIR, nunca 0.

export const SIN_MEDIR = 'sin medir';
export const RUEDA_MINIMA_RPS = 0.01; // Mismo criterio que el monitor para decir «girando».

export const ETIQUETAS = {
  golpe: 'Impacto', vuelco: 'Vuelco', inclinacion: 'Inclinación',
  alta: 'Alta', media: 'Media', baja: 'Baja',
  confirmado: 'Confirmado', cancelado: 'Cancelado',
  real: 'Real', simulado: 'Simulado'
};
export const etiqueta = valor => ETIQUETAS[valor] ?? String(valor ?? '');

// Unidades y significado de cada columna de la hoja Datos (nombres del contrato v1).
export const COLUMNAS_DATOS = [
  { columna: 'numero', unidad: '—', descripcion: 'Número de la medición dentro de la sesión, desde 1' },
  { columna: 't_ms', unidad: 'ms', descripcion: 'Tiempo desde el inicio de la sesión (reloj del emisor)' },
  { columna: 'ax', unidad: 'm/s²', descripcion: 'Aceleración en X (adelante/atrás); incluye gravedad' },
  { columna: 'ay', unidad: 'm/s²', descripcion: 'Aceleración en Y (lado a lado); incluye gravedad' },
  { columna: 'az', unidad: 'm/s²', descripcion: 'Aceleración en Z (arriba/abajo); incluye gravedad' },
  { columna: 'roll_deg', unidad: '°', descripcion: 'Inclinación lateral; positivo levanta el lado izquierdo' },
  { columna: 'pitch_deg', unidad: '°', descripcion: 'Inclinación frontal; positivo levanta la trompa' },
  { columna: 'rueda_rps', unidad: 'vueltas/s', descripcion: 'Giro de la rueda (sensor Hall). Celda vacía = sin dato, no rueda detenida' },
  { columna: 'rueda_pulsos', unidad: 'pulsos', descripcion: 'Contador acumulado de pulsos Hall desde el arranque del ESP32. Celda vacía = sin dato' }
];

const pico = (mediciones, valor) => {
  let mejor = null;
  for (const m of mediciones) {
    const v = valor(m);
    if (Number.isFinite(v) && (mejor === null || Math.abs(v) > Math.abs(mejor.valor))) mejor = { valor: v, t_ms: m.t_ms };
  }
  return mejor;
};

export function calcularResumen(paquete) {
  const mediciones = paquete.mediciones ?? [];
  const e = paquete.evento ?? null;
  const primera = mediciones[0]?.t_ms ?? null;
  const ultima = mediciones.at(-1)?.t_ms ?? null;
  const t_inicio_ms = e ? e.t_inicio_ms : primera;
  const t_fin_ms = e ? e.t_fin_ms : ultima;
  const t_activacion_ms = e?.t_activacion_ms ?? null;

  // Rueda: se informa en el instante de detección; sin evento, en la última medición.
  const conRueda = mediciones.filter(m => m.rueda_rps != null);
  const referencia = e ? mediciones.findLast(m => m.t_ms <= e.t_deteccion_ms) ?? null : mediciones.at(-1) ?? null;
  const rpsReferencia = referencia?.rueda_rps ?? null;
  const rueda = {
    muestras_con_dato: conRueda.length,
    maximo: pico(conRueda, m => m.rueda_rps),
    referencia: e ? 'deteccion' : 'ultima',
    rps_referencia: rpsReferencia,
    estado: !conRueda.length || rpsReferencia === null ? 'sin dato' : rpsReferencia > RUEDA_MINIMA_RPS ? 'girando' : 'detenida'
  };

  return {
    sesion_id: paquete.sesion.id,
    origen: paquete.sesion.origen,
    evento_id: e?.id ?? null,
    tipo: e?.tipo ?? null,
    gravedad: e?.gravedad ?? null,
    estado: e?.estado ?? null,
    t_inicio_ms,
    t_deteccion_ms: e?.t_deteccion_ms ?? null,
    t_activacion_ms,
    t_fin_ms,
    respuesta_ms: e && t_activacion_ms !== null ? t_activacion_ms - e.t_deteccion_ms : null,
    duracion_ms: t_inicio_ms !== null && t_fin_ms !== null ? t_fin_ms - t_inicio_ms : null,
    duracion_de: e ? 'evento' : 'mediciones',
    mediciones: mediciones.length,
    t_primera_ms: primera,
    t_ultima_ms: ultima,
    pico_aceleracion: pico(mediciones, m => Math.hypot(m.ax, m.ay, m.az)),
    pico_roll: pico(mediciones, m => m.roll_deg),
    pico_pitch: pico(mediciones, m => m.pitch_deg),
    rueda,
    ubicacion: e?.ubicacion ?? null
  };
}

export function textoRueda(rueda) {
  if (rueda.estado === 'sin dato') return rueda.muestras_con_dato ? 'Sin dato en ese instante' : 'Sin dato (sin sensor de rueda)';
  const momento = rueda.referencia === 'deteccion' ? 'en la detección' : 'en la última medición';
  return (rueda.estado === 'girando' ? 'Girando ' : 'Detenida ') + momento;
}
