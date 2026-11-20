// Lectura descriptiva del paquete v1. No reclasifica eventos ni estima causas.
export const GRAVEDAD = 9.81;

export const moduloA = m => Math.hypot(m.ax, m.ay, m.az);
export const desviacionA = m => Math.abs(moduloA(m) - GRAVEDAD);

export function direccionRoll(roll) {
  if (Math.abs(roll) >= 135) return 'orientación cercana a invertida según roll';
  if (Math.abs(roll) < 2) return 'cerca de 0°; sin inclinación lateral apreciable';
  if (roll > 0) return 'lado izquierdo elevado';
  if (roll < 0) return 'lado derecho elevado';
}

export function direccionPitch(pitch) {
  if (Math.abs(pitch) < 2) return 'cerca de 0°; sin inclinación frontal apreciable';
  if (pitch > 0) return 'trompa elevada';
  return 'trompa hacia abajo';
}

const mayor = (muestras, valor) => muestras.reduce((mejor, actual) =>
  !mejor || valor(actual) > valor(mejor) ? actual : mejor, null);

export function explicarPaquete(paquete) {
  const { evento, sesion } = paquete;
  if (!evento || !sesion) throw new Error('Se necesita un evento y su sesión para explicarlo');
  const muestras = [...(paquete.mediciones ?? [])].sort((a, b) => a.t_ms - b.t_ms || a.numero - b.numero);
  const rueda = muestras.filter(m => m.rueda_rps != null);
  const picoTotal = mayor(muestras, moduloA);
  const picoDesviacion = mayor(muestras, desviacionA);
  const picoRoll = mayor(muestras, m => Math.abs(m.roll_deg));
  const picoPitch = mayor(muestras, m => Math.abs(m.pitch_deg));
  const picoRueda = mayor(rueda, m => m.rueda_rps);
  const posterior = muestras.find(m => m.t_ms > evento.t_deteccion_ms) ?? null;
  const primera = muestras[0] ?? null;
  const ultima = muestras.at(-1) ?? null;
  const pasos = [
    { t_ms: evento.t_inicio_ms, titulo: 'Inicio de la ventana', detalle: 'Empieza el intervalo conservado; no es necesariamente el inicio físico del incidente.', fuente: 'Registro' },
    { t_ms: evento.t_deteccion_ms, titulo: 'Detección registrada', detalle: `El emisor registró ${evento.tipo === 'golpe' ? 'un golpe' : evento.tipo === 'vuelco' ? 'un vuelco' : 'una inclinación'}.`, fuente: 'Evento' }
  ];
  // Una señal casi igual a la gravedad no merece un hito de "pico". Esto solo
  // selecciona qué mostrar en la cronología; nunca modifica la clasificación.
  if (picoDesviacion && desviacionA(picoDesviacion) > 1 && picoDesviacion.t_ms !== evento.t_deteccion_ms)
    pasos.push({ t_ms: picoDesviacion.t_ms, titulo: 'Mayor cambio de magnitud frente a la gravedad',
      detalle: `Diferencia de ${desviacionA(picoDesviacion).toFixed(2)} m/s²; aceleración total ${moduloA(picoDesviacion).toFixed(2)} m/s².`, fuente: 'Medición' });
  if (evento.t_activacion_ms !== null)
    pasos.push({ t_ms: evento.t_activacion_ms, titulo: 'Orden de alerta reportada', detalle: 'El emisor reportó la orden de activación; esto no mide el movimiento físico del servo.', fuente: 'Evento' });
  if (posterior)
    pasos.push({ t_ms: posterior.t_ms, titulo: 'Lectura posterior', detalle: `Roll ${posterior.roll_deg.toFixed(1)}° y pitch ${posterior.pitch_deg.toFixed(1)}° en la primera muestra posterior a la detección.`, fuente: 'Medición' });
  pasos.push({ t_ms: evento.t_fin_ms, titulo: 'Fin de la ventana', detalle: 'Termina el intervalo guardado para este evento, no necesariamente el movimiento del carro.', fuente: 'Registro' });
  pasos.sort((a, b) => a.t_ms - b.t_ms);

  // Los huecos pueden indicar telemetría perdida; no se trazan trayectorias ficticias.
  const deltas = muestras.slice(1).map((m, i) => m.t_ms - muestras[i].t_ms).filter(d => d > 0).sort((a, b) => a - b);
  const mediana = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 0;
  const limiteSalto = Math.min(500, Math.max(100, 4 * mediana));
  const saltoMaximo = deltas.at(-1) ?? 0;

  return {
    evento, sesion, muestras, rueda, picoTotal, picoDesviacion, picoRoll, picoPitch, picoRueda,
    primera, ultima, posterior, pasos, saltoMaximo, limiteSalto,
    parcial: muestras.length === 0,
    disperso: muestras.length > 0 && (muestras.length < 5 || saltoMaximo > limiteSalto)
  };
}

// Reduce gráficas extensas sin eliminar extremos ni la lectura vecina a la detección.
export function puntosGrafica(muestras, valor, deteccionMs, maxPuntos = 900) {
  if (muestras.length <= maxPuntos) return muestras.map(m => ({ x: m.t_ms, y: valor(m) }));
  const indices = new Set([0, muestras.length - 1]);
  const paso = Math.ceil(muestras.length / Math.floor((maxPuntos - 4) / 2));
  for (let i = 0; i < muestras.length; i += paso) {
    let min = i, max = i;
    for (let j = i + 1; j < Math.min(i + paso, muestras.length); j++) {
      if (valor(muestras[j]) < valor(muestras[min])) min = j;
      if (valor(muestras[j]) > valor(muestras[max])) max = j;
    }
    indices.add(min); indices.add(max);
  }
  let vecino = 0;
  for (let i = 1; i < muestras.length; i++)
    if (Math.abs(muestras[i].t_ms - deteccionMs) < Math.abs(muestras[vecino].t_ms - deteccionMs)) vecino = i;
  indices.add(vecino);
  return [...indices].sort((a, b) => a - b).map(i => ({ x: muestras[i].t_ms, y: valor(muestras[i]) }));
}
