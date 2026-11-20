import Chart from 'chart.js/auto';
import { explicarPaquete, puntosGrafica, moduloA, desviacionA, direccionRoll, direccionPitch } from './explanation.js';

const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const numero = (n, decimales = 2) => n.toLocaleString('es-EC', { maximumFractionDigits: decimales, minimumFractionDigits: decimales });
const segundo = t => numero(t / 1000, 3);
const nombre = { golpe: 'golpe', inclinacion: 'inclinación', vuelco: 'vuelco' };

function tarjeta(nombre, valor, unidad, detalle) {
  return `<div class="explain-metric"><span>${nombre}</span><strong>${valor ?? '—'}${valor == null ? '' : `<small> ${unidad}</small>`}</strong><p>${detalle}</p></div>`;
}

function marcador(t) {
  return {
    id: 'momentoDeteccion',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const x = scales.x.getPixelForValue(t);
      if (x < chartArea.left || x > chartArea.right) return;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#be123c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#9f1239';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.fillText('Detección', Math.min(x + 6, chartArea.right - 58), chartArea.top + 14);
      ctx.restore();
    }
  };
}

function serie(muestras, valor, t, limiteSalto, faltantes = []) {
  const puntos = puntosGrafica(muestras, valor, t);
  for (let i = 1; i < muestras.length; i++) {
    if (muestras[i].t_ms - muestras[i - 1].t_ms > limiteSalto)
      puntos.push({ x: (muestras[i].t_ms + muestras[i - 1].t_ms) / 2, y: null });
  }
  let anterior = -2;
  for (const m of faltantes) {
    // Un hueco en rueda_rps no es cero: interrumpe la línea incluso si hay otros sensores.
    if (m.indice !== anterior + 1 && m.t_ms > muestras[0]?.t_ms && m.t_ms < muestras.at(-1)?.t_ms)
      puntos.push({ x: m.t_ms, y: null });
    anterior = m.indice;
  }
  return puntos.sort((a, b) => a.x - b.x);
}

function crearGrafica(canvas, datos, titulo, unidad, paquete, minimoY) {
  const { evento, limiteSalto } = paquete;
  const inicio = evento.t_inicio_ms, fin = evento.t_fin_ms;
  return new Chart(canvas, {
    type: 'line',
    data: { datasets: datos.map(({ label, color, valores, valor, faltantes }) => ({
      label, data: serie(valores, valor, evento.t_deteccion_ms, limiteSalto, faltantes),
      borderColor: color, backgroundColor: color, borderWidth: 2, tension: 0,
      pointRadius: valores.length < 5 ? 4 : 0, pointHoverRadius: 5, spanGaps: false,
      showLine: valores.length >= 5
    })) },
    plugins: [marcador(evento.t_deteccion_ms)],
    options: {
      animation: false, maintainAspectRatio: false, parsing: false,
      interaction: { intersect: false, mode: 'nearest' },
      plugins: {
        legend: { display: datos.length > 1, position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, font: { family: 'Inter', size: 11 } } },
        tooltip: { callbacks: {
          title: items => `${segundo(items[0].parsed.x)} s desde el inicio de la sesión`,
          label: item => `${item.dataset.label}: ${numero(item.parsed.y)} ${unidad}`
        } }
      },
      scales: {
        x: {
          type: 'linear', min: inicio === fin ? inicio - 500 : inicio, max: inicio === fin ? fin + 500 : fin,
          grid: { display: false }, ticks: { maxTicksLimit: 5, callback: segundo },
          title: { display: true, text: 'Tiempo de sesión (s)' }
        },
        y: {
          ...(minimoY === undefined ? {} : { min: minimoY }),
          grid: { color: '#edf1f7' }, ticks: { maxTicksLimit: 5 },
          title: { display: true, text: titulo }
        }
      }
    }
  });
}

export function mostrarExplicacion(container, paquete, aviso = '') {
  const datos = explicarPaquete(paquete);
  const { evento: e, sesion: s, muestras, rueda, picoTotal, picoDesviacion, picoRoll, picoPitch, picoRueda,
    posterior, ultima, pasos, parcial, disperso, saltoMaximo } = datos;
  const origenSimulado = s.origen === 'simulado';
  const tipo = nombre[e.tipo] ?? e.tipo;
  const cabecera = e.estado === 'cancelado'
    ? `El emisor registró un posible ${tipo} y lo marcó como cancelado. No es un incidente confirmado.`
    : `El emisor registró un ${tipo} con gravedad «${e.gravedad}». Es la clasificación guardada por el sistema, no una conclusión nueva de esta vista.`;
  const lecturaPosterior = posterior
    ? `La primera lectura disponible después de la detección, a los ${segundo(posterior.t_ms)} s, indica roll ${numero(posterior.roll_deg)}° (${direccionRoll(posterior.roll_deg)}) y pitch ${numero(posterior.pitch_deg)}° (${direccionPitch(posterior.pitch_deg)}).`
    : 'No hay lecturas posteriores a la detección en esta ventana; no podemos describir cómo evolucionó después.';
  const muestraFinal = ultima && e.t_fin_ms - ultima.t_ms > Math.max(100, datos.limiteSalto)
    ? `La última lectura disponible es de ${segundo(ultima.t_ms)} s; no hay mediciones hasta el fin de la ventana.`
    : '';

  container.innerHTML = `
    <a class="back" href="#historial">← Volver al historial</a>
    <div class="explain-heading">
      <div><div class="eyebrow">LECTURA DEL REGISTRO · ${escape(e.id)}</div><h1>Qué registró el sistema</h1>
        <p>Evento ${escape(e.id)} · sesión ${escape(s.id)} · tiempos desde el inicio de la sesión, no hora del día.</p></div>
      <span class="badge ${origenSimulado ? 'purple' : 'neutral'}">${origenSimulado ? 'DATOS SIMULADOS' : 'ORIGEN REAL REPORTADO'}</span>
    </div>
    ${origenSimulado ? '<div class="explain-origin"><strong>Datos simulados</strong> · Este emisor no aporta mediciones de un carro físico.</div>' : ''}
    ${aviso ? `<div class="explain-notice" role="status">${escape(aviso)}</div>` : ''}
    <section class="card explain-intro" aria-labelledby="explain-summary">
      <div class="explain-kicker">01 / EN POCAS PALABRAS</div>
      <h2 id="explain-summary">${escape(e.tipo === 'golpe' ? 'Se registró un golpe' : e.tipo === 'vuelco' ? 'Se registró un vuelco' : 'Se registró una inclinación')}</h2>
      <p>${escape(cabecera)} La ventana conservada va de ${segundo(e.t_inicio_ms)} a ${segundo(e.t_fin_ms)} s; su inicio no indica necesariamente cuándo comenzó físicamente el incidente. La detección se registró a los <strong>${segundo(e.t_deteccion_ms)} s</strong>.</p>
      <p>${parcial
        ? 'No hay mediciones en este paquete. El registro permite conocer el tipo y los tiempos informados, pero no verificar la intensidad, la inclinación ni lo que pasó después.'
        : escape(lecturaPosterior + (muestraFinal ? ' ' + muestraFinal : ''))}</p>
      <div class="explain-boundary"><span>Registrado</span> Tipo, gravedad, estado y tiempos proceden del evento guardado; la gravedad es una etiqueta experimental, no una medida de daño.
        <br><span>Calculado</span> Los picos y la desviación respecto a la gravedad se calculan solo con las lecturas disponibles.</div>
    </section>
    <section class="explain-section" aria-labelledby="explain-evidence">
      <div class="explain-section-head"><div><div class="explain-kicker">02 / EVIDENCIA</div><h2 id="explain-evidence">Lo que muestran las lecturas</h2></div><span>${muestras.length} ${muestras.length === 1 ? 'medición' : 'mediciones'} en esta ventana</span></div>
      ${parcial ? '<div class="card explain-empty">Sin mediciones para mostrar valores o gráficas. Puedes volver a abrir esta explicación cuando lleguen más lecturas.</div>' : `
      <div class="explain-metrics">
        ${tarjeta('Aceleración total más alta', numero(moduloA(picoTotal)), 'm/s²', `A los ${segundo(picoTotal.t_ms)} s · √(X² + Y² + Z²).`)}
        ${tarjeta('Mayor diferencia frente a 9,81', numero(desviacionA(picoDesviacion)), 'm/s²', `A los ${segundo(picoDesviacion.t_ms)} s · |aceleración total − gravedad|.`)}
        ${tarjeta('Roll · máximo absoluto', numero(picoRoll.roll_deg), '°', `A los ${segundo(picoRoll.t_ms)} s · ${direccionRoll(picoRoll.roll_deg)}.`)}
        ${tarjeta('Pitch · máximo absoluto', numero(picoPitch.pitch_deg), '°', `A los ${segundo(picoPitch.t_ms)} s · ${direccionPitch(picoPitch.pitch_deg)}.`)}
      </div>
      <p class="explain-ejes">En el pico de aceleración total: X (delante/atrás) ${numero(picoTotal.ax)}, Y (lateral) ${numero(picoTotal.ay)}, Z (vertical) ${numero(picoTotal.az)} m/s². Roll positivo eleva el lado izquierdo; roll negativo, el derecho. Pitch positivo eleva la trompa; pitch negativo la baja.</p>
      <p class="explain-caveat">La aceleración incluye gravedad. Esta diferencia de magnitudes no equivale por sí sola a velocidad, fuerza de choque ni causa del movimiento. Los ángulos son los reportados por el emisor; en el firmware se estiman con el acelerómetro y un golpe puede alterar esa estimación. ${rueda.length ? `Máximo giro registrado: ${numero(picoRueda.rueda_rps)} vueltas/s a los ${segundo(picoRueda.t_ms)} s; el Hall mide la rueda, no el avance del carro.${rueda.length < muestras.length ? ` Hay dato de rueda en ${rueda.length} de ${muestras.length} lecturas; los huecos no significan rueda detenida.` : ''}` : 'No hay dato de rueda: su ausencia no significa que estuviera detenida.'}</p>
      ${disperso ? `<div class="explain-notice">Lecturas ${muestras.length < 5 ? 'escasas' : 'con intervalos sin datos'}${saltoMaximo ? ` (salto máximo: ${numero(saltoMaximo / 1000)} s)` : ''}. Los puntos no prueban qué ocurrió entre una muestra y otra.</div>` : ''}
      <div class="explain-charts">
        <div class="card explain-chart-card explain-chart-wide"><h3>Inclinación reportada <small>roll y pitch · grados (°)</small></h3><div class="explain-canvas"><canvas id="explain-angles" role="img" aria-label="Inclinación lateral roll y frontal pitch reportada en grados; línea vertical marca la detección"></canvas></div><p>Los valores positivos y negativos tienen direcciones distintas; no se suman.</p></div>
        <div class="card explain-chart-card ${rueda.length ? '' : 'explain-chart-wide'}"><h3>Intensidad de la señal <small>desviación respecto a 9,81 m/s²</small></h3><div class="explain-canvas"><canvas id="explain-intensity" role="img" aria-label="Diferencia de la magnitud de aceleración respecto a la gravedad; línea vertical marca la detección"></canvas></div><p>|√(X² + Y² + Z²) − 9,81|. No mide por sí sola la causa.</p></div>
        ${rueda.length ? '<div class="card explain-chart-card"><h3>Giro de la rueda <small>vueltas por segundo</small></h3><div class="explain-canvas"><canvas id="explain-wheel" role="img" aria-label="Giro de rueda en vueltas por segundo; línea vertical marca la detección"></canvas></div><p>Una rueda puede girar sin que el carro avance, o patinar.</p></div>' : ''}
      </div>`}
    </section>
    <section class="card explain-timeline" aria-labelledby="explain-sequence">
      <div class="explain-kicker">03 / SECUENCIA</div><h2 id="explain-sequence">Línea de tiempo</h2>
      <ol>${pasos.map(p => `<li><time>${segundo(p.t_ms)} s</time><div><span class="explain-source">${escape(p.fuente)}</span><strong>${escape(p.titulo)}</strong><p>${escape(p.detalle)}</p></div></li>`).join('')}</ol>
      <p class="explain-footnote">${e.t_activacion_ms === null
        ? 'El evento no incluye un instante de activación medido. No se puede calcular el tiempo de respuesta.'
        : `La orden reportada llegó ${numero(e.t_activacion_ms - e.t_deteccion_ms, 0)} ms después de la detección, según el reloj del emisor. No mide la latencia de la red ni el movimiento físico del servo.`}</p>
    </section>`;

  if (parcial) return () => {};
  const graficas = [
    crearGrafica(container.querySelector('#explain-angles'), [
      { label: 'Roll · lateral', color: '#2563eb', valores: muestras, valor: m => m.roll_deg },
      { label: 'Pitch · frontal', color: '#d97706', valores: muestras, valor: m => m.pitch_deg }
    ], 'Inclinación (°)', '°', datos),
    crearGrafica(container.querySelector('#explain-intensity'), [
      { label: 'Diferencia de magnitud', color: '#be123c', valores: muestras, valor: desviacionA }
    ], 'Diferencia (m/s²)', 'm/s²', datos, 0)
  ];
  if (rueda.length)
    graficas.push(crearGrafica(container.querySelector('#explain-wheel'), [
      { label: 'Giro de rueda', color: '#0f766e', valores: rueda, valor: m => m.rueda_rps,
        faltantes: muestras.flatMap((m, indice) => m.rueda_rps == null ? [{ t_ms: m.t_ms, indice }] : []) }
    ], 'Rueda (vueltas/s)', 'vueltas/s', datos, 0));
  return () => graficas.forEach(g => g.destroy());
}
