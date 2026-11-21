// Componente de gráficas compartido por En vivo, Detalle, Simulación y Explicar.
// Cada gráfica responde una pregunta:
//   ¿Qué tan inclinado está el carro?  inclinación lateral y frontal (°), bandas normal/inclinado/vuelco.
//   ¿Hubo golpes?                      aceleración total √(ax²+ay²+az²) con el umbral y la gravedad.
//   ¿La rueda gira?                    franja girando/detenida y vueltas acumuladas de la rueda con sensor.
//   Detalle técnico                    ejes X/Y/Z por separado.
// Solo cambia el dibujo: el suavizado (promedio móvil de 100 ms, solo en la inclinación) no toca los
// datos guardados ni exportados, y la aceleración total nunca se suaviza para no ocultar los golpes.
import Chart from 'chart.js/auto';
import { CONSTANTES_INO, NOMBRE_RUEDA, POSICION_RUEDA_SENSOR } from '../../compartido/parametros-firmware.js';
import { RUEDA_MINIMA_RPS, NOMBRE_TIPO } from '../../compartido/exportacion.js';
import { vueltasEntre } from './telemetria.js';

const GRAVEDAD = 9.81;
const SUAVIZADO_MUESTRAS = 5;     // 5 × 20 ms = 100 ms
const HUECO_MS = 500;             // más separación entre muestras: la línea se corta (datos perdidos)
const css = nombre => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || '#333';
const num = (v, d = 1) => v.toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d });
const seg = ms => (ms / 1000).toLocaleString('es-EC', { maximumFractionDigits: 1 });

const grafica = (p, id, titulo, sub, canvas, aria, valores, extra = '') => `
  <section class="grafica" aria-labelledby="${p}t-${id}">
    <header><div><h3 id="${p}t-${id}">${titulo}</h3>${sub}</div><div class="grafica-valor"><span>${valores}</span><strong id="${p}valor-${id}">—</strong></div></header>
    <div class="grafica-lienzo"><canvas id="${p}${canvas}" role="img" aria-label="${aria}"></canvas></div>${extra}
  </section>`;

// Gráficas principales: inclinación y aceleración total.
export function htmlGraficas(p = '', { valores = 'Ahora' } = {}) {
  return `<div class="graficas-lista">
  ${grafica(p, 'inclinacion', 'Inclinación (°)', `<div class="leyenda" aria-hidden="true"><span style="color:var(--serie-roll)"><i></i>Lateral (roll)</span><span style="color:var(--serie-pitch)"><i></i>Frontal (pitch)</span></div>`,
    'angles', 'Inclinación lateral y frontal en grados', valores, `<p class="sr-only" id="${p}graph-summary"></p>`)}
  ${grafica(p, 'golpe', 'Aceleración total (m/s²)', '', 'magnitude', 'Aceleración total en metros por segundo al cuadrado, con el umbral de golpe y la gravedad', valores)}
  </div>`;
}

// Gráficas secundarias: vueltas de la rueda con sensor y aceleración por eje.
export function htmlGraficasTecnicas(p = '', { valores = 'Ahora', ejes = true, rueda = true } = {}) {
  return `<div class="tecnico-graficas">
  ${rueda ? grafica(p, 'rueda', `${NOMBRE_RUEDA} (vueltas)`, `<p class="grafica-nota">${POSICION_RUEDA_SENSOR} · franja inferior: <span class="muestra muestra-gira"></span> girando · <span class="muestra muestra-quieta"></span> detenida</p>`,
    'wheel', 'Vueltas acumuladas de la rueda con sensor', valores) : ''}
  ${ejes ? grafica(p, 'ejes', 'Aceleración por eje (m/s²)', `<div class="leyenda" aria-hidden="true"><span style="color:var(--serie-x)"><i></i>X</span><span style="color:var(--serie-y)"><i></i>Y</span><span style="color:var(--serie-z)"><i></i>Z</span></div>`,
    'accel', 'Aceleración por eje X, Y y Z', valores) : ''}
  </div>`;
}

// Dibujo propio: bandas, líneas de referencia rotuladas, banderas de eventos, cursor, franja de rueda
// y etiquetas directas al final de cada línea.
const dibujo = {
  id: 'telemetria',
  beforeDatasetsDraw(chart) {
    const t = chart.$tel; if (!t) return;
    const { ctx, chartArea: a, scales: { x, y } } = chart;
    ctx.save();
    for (const b of t.bandas ?? []) {
      const y0 = Math.max(a.top, Math.min(a.bottom, y.getPixelForValue(b.hasta)));
      const y1 = Math.max(a.top, Math.min(a.bottom, y.getPixelForValue(b.desde)));
      if (y1 - y0 < 1) continue;
      ctx.fillStyle = b.color; ctx.fillRect(a.left, y0, a.right - a.left, y1 - y0);
      if (b.texto && y1 - y0 > 14) {
        ctx.fillStyle = css('--tinta-3'); ctx.font = `500 11px Inter, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(b.texto, a.left + 6, y0 + 3);
      }
    }
    for (const l of t.lineasY ?? []) {
      const py = y.getPixelForValue(l.valor);
      if (py < a.top || py > a.bottom) continue;
      ctx.strokeStyle = l.color; ctx.lineWidth = 1.5; ctx.setLineDash(l.trazo ?? [5, 4]);
      ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = l.color; ctx.font = `600 11px Inter, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(l.texto, a.right - 4, py - 3);
    }
    ctx.restore();
  },
  afterDatasetsDraw(chart) {
    const t = chart.$tel; if (!t) return;
    const { ctx, chartArea: a, scales: { x, y } } = chart;
    ctx.save();
    if (t.franja?.length) {
      const alto = 8, top = a.bottom - alto;
      for (const f of t.franja) {
        const x0 = Math.max(a.left, x.getPixelForValue(f.desde)), x1 = Math.min(a.right, x.getPixelForValue(f.hasta));
        if (x1 <= x0) continue;
        ctx.fillStyle = f.gira ? css('--acento') : css('--linea');
        ctx.fillRect(x0, top, x1 - x0, alto);
      }
    }
    // Banderas: línea en el instante de detección y el tipo rotulado arriba (carril por tipo para no solaparse).
    // t.banderas queda con lo dibujado (lo usan las pruebas del navegador).
    t.banderas = [];
    for (const e of t.eventos ?? []) {
      const px = x.getPixelForValue(e.t_deteccion_ms);
      if (px < a.left || px > a.right) continue;
      t.banderas.push({ texto: NOMBRE_TIPO[e.tipo] ?? e.tipo, x: px });
      const color = e.tipo === 'vuelco' ? css('--peligro') : e.tipo === 'golpe' ? css('--golpe') : css('--aviso');
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
      if (t.rotular) {
        const texto = NOMBRE_TIPO[e.tipo] ?? e.tipo, carril = { golpe: 0, inclinacion: 1, vuelco: 2 }[e.tipo] ?? 0;
        ctx.font = `600 11px Inter, sans-serif`;
        const ancho = ctx.measureText(texto).width + 10, derecha = px + ancho > a.right;
        const bx = derecha ? px - ancho : px, by = a.top + 2 + carril * 17;
        ctx.fillStyle = color; ctx.fillRect(bx, by, ancho, 15);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(texto, bx + 5, by + 8);
      }
    }
    if (t.seleccion) {
      ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
      ctx.fillRect(t.seleccion[0], a.top, t.seleccion[1] - t.seleccion[0], a.bottom - a.top);
    }
    if (t.cursor != null) {
      const px = x.getPixelForValue(t.cursor);
      if (px >= a.left && px <= a.right) {
        ctx.strokeStyle = css('--tinta-2'); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // Etiquetas directas al final de cada línea (reemplazan la leyenda).
    if (t.etiquetas) {
      const marcas = [];
      chart.data.datasets.forEach((d, i) => {
        const ultimo = d.data.findLast(p => p.y != null);
        if (!ultimo || chart.getDatasetMeta(i).hidden) return;
        marcas.push({ y: Math.max(a.top + 8, Math.min(a.bottom - 8, y.getPixelForValue(ultimo.y))), texto: `${d.label} ${num(ultimo.y)}${t.unidad}`, color: d.borderColor });
      });
      marcas.sort((m, n) => m.y - n.y);
      for (let i = 1; i < marcas.length; i++) if (marcas[i].y - marcas[i - 1].y < 15) marcas[i].y = marcas[i - 1].y + 15;
      ctx.font = `600 12px Inter, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const m of marcas) { ctx.fillStyle = m.color; ctx.fillText(m.texto, a.right + 6, m.y); }
    }
    ctx.restore();
  }
};

function crear(canvas, datasets, { etiquetas = false, unidad = '', yMin, onClick } = {}) {
  const chart = new Chart(canvas, {
    type: 'line',
    data: { datasets: datasets.map(d => ({ data: [], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0, spanGaps: false, ...d })) },
    plugins: [dibujo],
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
      layout: { padding: { right: etiquetas ? 104 : 8, top: 4 } },
      interaction: { mode: 'index', axis: 'x', intersect: false },
      onClick,
      plugins: {
        legend: { display: false },
        decimation: { enabled: false },
        tooltip: { callbacks: { title: i => `${seg(i[0].parsed.x)} s`, label: i => `${i.dataset.label}: ${num(i.parsed.y, 2)}${unidad}` } }
      },
      scales: {
        x: { type: 'linear', grid: { display: false }, border: { color: css('--linea') },
          ticks: { maxTicksLimit: 6, color: css('--tinta-3'), font: { size: 11 }, callback: v => seg(v) + ' s' } },
        y: { ...(yMin === undefined ? {} : { min: yMin }), grid: { color: css('--linea-suave') }, border: { display: false },
          ticks: { maxTicksLimit: 5, color: css('--tinta-3'), font: { size: 11 } } }
      }
    }
  });
  chart.$tel = { etiquetas, unidad };
  return chart;
}

export function crearGraficas(p = '', { onClick } = {}) {
  const $ = id => document.getElementById(p + id);
  const tinta = css('--tinta'), acento = css('--acento');
  const g = {
    angles: $('angles') && crear($('angles'), [
      { label: 'Lateral', borderColor: tinta, backgroundColor: tinta },
      { label: 'Frontal', borderColor: acento, backgroundColor: acento, borderDash: [7, 4] }
    ], { etiquetas: true, unidad: '°', onClick }),
    magnitude: $('magnitude') && crear($('magnitude'), [{ label: 'Aceleración total', borderColor: tinta, backgroundColor: tinta, borderWidth: 1.8 }], { unidad: ' m/s²', yMin: 0, onClick }),
    wheel: $('wheel') && crear($('wheel'), [{ label: 'Vueltas', borderColor: acento, backgroundColor: acento }], { unidad: ' vueltas', yMin: 0, onClick }),
    accel: $('accel') ? crear($('accel'), [
      { label: 'X', borderColor: tinta, backgroundColor: tinta, borderWidth: 1.5 },
      { label: 'Y', borderColor: acento, backgroundColor: acento, borderWidth: 1.5, borderDash: [7, 4] },
      { label: 'Z', borderColor: css('--tinta-3'), backgroundColor: css('--tinta-3'), borderWidth: 1.5, borderDash: [2, 3] }
    ], { etiquetas: true, unidad: '', onClick }) : null
  };
  g.todas = [g.angles, g.magnitude, g.wheel, g.accel].filter(Boolean);
  g.destroy = () => g.todas.forEach(c => c.destroy());
  return g;
}

// Serie con cortes donde faltan datos (más de HUECO_MS entre muestras) y suavizado opcional.
// Con marcados = true (mediciones ya reducidas, ver compartido/detalle-sesion.js) el corte lo indica m.corte.
const hayHueco = (m, previa, marcados) => previa && (marcados ? m.corte : m.t_ms - previa.t_ms > HUECO_MS);
function serie(mediciones, valor, suavizar = 1, marcados = false) {
  const out = [];
  let ventana = [];
  for (let i = 0; i < mediciones.length; i++) {
    const m = mediciones[i], previa = mediciones[i - 1];
    if (hayHueco(m, previa, marcados)) { out.push({ x: (m.t_ms + previa.t_ms) / 2, y: null }); ventana = []; }
    const v = valor(m);
    if (v == null || !Number.isFinite(v)) { out.push({ x: m.t_ms, y: null }); ventana = []; continue; }
    ventana.push(v); if (ventana.length > suavizar) ventana.shift();
    out.push({ x: m.t_ms, y: ventana.reduce((s, z) => s + z, 0) / ventana.length });
  }
  return out;
}

export function vueltasAcumuladas(mediciones) {
  let total = 0;
  return mediciones.map((m, i) => (total += vueltasEntre(mediciones[i - 1], m)));
}

// Actualiza los datasets en su sitio (sin recrear las gráficas) y devuelve los valores para los encabezados.
// reducidas = true: las mediciones ya vienen reducidas para dibujar (Detalle de sesión). No se suaviza
// (el promedio entre puntos separados borraría los picos) y los cortes vienen marcados en m.corte.
export function actualizarGraficas(g, { mediciones, eventos = [], desde, hasta, cursor = null, umbralGolpe = CONSTANTES_INO.UMBRAL_GOLPE_MS2, reducidas = false }) {
  const m = mediciones;
  const total = x => Math.hypot(x.ax, x.ay, x.az);
  const suave = reducidas ? 1 : SUAVIZADO_MUESTRAS;
  const datos = {
    angles: [serie(m, x => x.roll_deg, suave, reducidas), serie(m, x => x.pitch_deg, suave, reducidas)],
    magnitude: [serie(m, total, 1, reducidas)],
    // vueltas_acum (si viene) se calculó con todas las muestras antes de reducir: el total no depende del zoom.
    wheel: [(() => { const v = m[0]?.vueltas_acum != null ? m.map(x => x.vueltas_acum) : vueltasAcumuladas(m); return serie(m.map((x, i) => ({ ...x, v: v[i] })), x => x.v, 1, reducidas); })()],
    accel: [serie(m, x => x.ax, 1, reducidas), serie(m, x => x.ay, 1, reducidas), serie(m, x => x.az, 1, reducidas)]
  };
  let maxAng = 0, maxTotal = 0;
  for (const x of m) { maxAng = Math.max(maxAng, Math.abs(x.roll_deg), Math.abs(x.pitch_deg)); maxTotal = Math.max(maxTotal, total(x)); }
  // Eje fijo ±30°; se amplía a ±90° si se supera y a ±180° si hay vuelco (|ángulo| ≥ 90°).
  const lim = maxAng >= CONSTANTES_INO.UMBRAL_VUELCO_DEG ? 180 : maxAng > 30 ? 90 : 30;
  const incl = CONSTANTES_INO.UMBRAL_INCLINACION_DEG, vuelco = CONSTANTES_INO.UMBRAL_VUELCO_DEG;
  const bandaAviso = css('--aviso-fondo'), bandaPeligro = css('--peligro-fondo');
  g.angles.options.scales.y.min = -lim; g.angles.options.scales.y.max = lim;
  g.angles.options.scales.y.ticks.stepSize = lim === 30 ? 10 : lim === 90 ? 30 : 45;
  g.angles.$tel.bandas = [
    { desde: incl, hasta: vuelco, color: bandaAviso, texto: `inclinado (${incl}°–${vuelco}°)` },
    { desde: -vuelco, hasta: -incl, color: bandaAviso },
    { desde: vuelco, hasta: 180, color: bandaPeligro, texto: `vuelco (más de ${vuelco}°)` },
    { desde: -180, hasta: -vuelco, color: bandaPeligro }
  ];
  g.magnitude.options.scales.y.max = Math.max(20, Math.ceil(maxTotal * 1.15 / 5) * 5);
  g.magnitude.$tel.lineasY = [
    { valor: umbralGolpe, texto: `Umbral de golpe ${num(umbralGolpe, 0)}`, color: css('--golpe') },
    { valor: GRAVEDAD, texto: 'Gravedad 9,8', color: css('--tinta-3'), trazo: [2, 3] }
  ];
  // Franja de la rueda: tramos girando/detenida según rueda_rps.
  const franja = [];
  for (let i = 1; i < m.length; i++) {
    const a = m[i - 1]; if (a.rueda_rps == null || hayHueco(m[i], a, reducidas)) continue;
    const gira = a.rueda_rps > RUEDA_MINIMA_RPS, ultimo = franja.at(-1);
    if (ultimo && ultimo.gira === gira && ultimo.hasta === a.t_ms) ultimo.hasta = m[i].t_ms;
    else franja.push({ desde: a.t_ms, hasta: m[i].t_ms, gira });
  }
  const maxV = datos.wheel[0].reduce((s, q) => Math.max(s, q.y ?? 0), 0);
  if (g.wheel) { g.wheel.$tel.franja = franja; g.wheel.options.scales.y.max = Math.max(1, Math.ceil(maxV * 1.2)); }
  for (const [clave, chart] of Object.entries({ angles: g.angles, magnitude: g.magnitude, wheel: g.wheel, accel: g.accel })) {
    if (!chart) continue;
    chart.data.datasets.forEach((d, i) => { d.data = datos[clave][i]; d.pointRadius = m.length < 10 ? 3 : 0; });
    chart.options.scales.x.min = desde; chart.options.scales.x.max = hasta;
    chart.$tel.eventos = eventos; chart.$tel.rotular = clave !== 'accel'; chart.$tel.cursor = cursor;
    chart.update('none');
  }
  return { maxAng, maxTotal, vueltas: datos.wheel[0].findLast(q => q.y != null)?.y ?? null, conRueda: m.some(x => x.rueda_rps != null || x.rueda_pulsos != null) };
}

// Solo mueve el cursor de reproducción (sin recalcular series).
export function moverCursor(g, cursor) {
  for (const c of g.todas) { c.$tel.cursor = cursor; c.draw(); }
}

// Zoom arrastrando sobre cualquier gráfica: al soltar llama a alElegir(desde, hasta) en ms de sesión.
// Un arrastre de menos de 8 px se trata como clic (lo maneja onClick de la gráfica).
export function zoomArrastrando(g, alElegir) {
  const quitar = [];
  for (const chart of g.todas) {
    const canvas = chart.canvas;
    let inicio = null;
    const x = e => e.clientX - canvas.getBoundingClientRect().left;
    const abajo = e => { if (e.button !== 0) return; inicio = x(e); chart.$tel.seleccion = null; canvas.setPointerCapture?.(e.pointerId); };
    const mover = e => {
      if (inicio == null) return;
      const a = chart.chartArea, px = Math.max(a.left, Math.min(a.right, x(e)));
      chart.$tel.seleccion = Math.abs(px - inicio) >= 8 ? [Math.min(inicio, px), Math.max(inicio, px)] : null;
      chart.draw();
    };
    const arriba = e => {
      if (inicio == null) return;
      const sel = chart.$tel.seleccion; inicio = null; chart.$tel.seleccion = null; chart.draw();
      if (!sel) return;
      const escala = chart.scales.x;
      alElegir(escala.getValueForPixel(sel[0]), escala.getValueForPixel(sel[1]));
    };
    canvas.addEventListener('pointerdown', abajo); canvas.addEventListener('pointermove', mover);
    canvas.addEventListener('pointerup', arriba); canvas.addEventListener('pointercancel', arriba);
    canvas.style.cursor = 'crosshair'; canvas.style.touchAction = 'pan-y';
    quitar.push(() => { canvas.removeEventListener('pointerdown', abajo); canvas.removeEventListener('pointermove', mover); canvas.removeEventListener('pointerup', arriba); canvas.removeEventListener('pointercancel', arriba); });
  }
  return () => quitar.forEach(f => f());
}

// Pantalla completa: ticks de 14 px y líneas de 3 px.
export function modoPresentacion(g, activo) {
  for (const c of g.todas) {
    c.$tel.presentacion = activo;
    for (const eje of Object.values(c.options.scales)) eje.ticks.font = { ...(eje.ticks.font ?? {}), size: activo ? 14 : 12 };
    c.data.datasets.forEach(d => { d.borderWidth = activo ? 3 : (d.$ancho ?? 2.5); });
    c.update('none');
  }
}
