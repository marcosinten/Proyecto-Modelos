// Componente de gráficas compartido por En vivo, Detalle de evento, Detalle de sesión, Simulación y Explicar.
//   Inclinación (°)            lateral (roll) y frontal (pitch); banda «Zona normal» de ±10° y referencias
//                              punteadas en el umbral de inclinación (20°) y de vuelco (90°).
//   Aceleración total (m/s²)   √(ax²+ay²+az²) con el umbral de golpe y la referencia de 1 g.
//   Rueda con sensor (vueltas) vueltas acumuladas y franja girando/detenida.
//   Aceleración por eje        X, Y, Z (m/s², o g en el Detalle de sesión).
// Solo cambia el dibujo: no se suaviza ningún valor (tension 0, sin promedio móvil). Con muchas mediciones
// se dibuja una versión reducida por cubos que conserva el mínimo y el máximo de cada cubo
// (compartido/detalle-sesion.js), así un golpe de una sola muestra nunca desaparece.
// Plugins propios (sin dependencias nuevas): banda, referencias, marcas de evento, cursor, selección,
// franja de rueda y etiquetas directas al final de cada línea.
import Chart from 'chart.js/auto';
import { CONSTANTES_INO, NOMBRE_RUEDA, POSICION_RUEDA_SENSOR } from '../../compartido/parametros-firmware.js';
import { RUEDA_MINIMA_RPS, NOMBRE_TIPO, horaDe } from '../../compartido/exportacion.js';
import { reducirMediciones } from '../../compartido/detalle-sesion.js';
import { textoHora } from '../../compartido/hora.js';
import { vueltasEntre } from './telemetria.js';

export const ZONA_NORMAL_DEG = 10;   // banda «Zona normal» (pedido de diseño); el firmware marca inclinación a 20°
export const MAX_PUNTOS = 2000;      // por encima se dibuja la versión reducida (mín./máx. por cubo)
const GRAVEDAD = 9.81;
const HUECO_MS = 500;                // más separación entre muestras: la línea se corta (datos perdidos)
const css = (nombre, defecto = '#667085') => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || defecto;
const num = (v, d = 1) => v.toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d });
const seg = ms => (ms / 1000).toLocaleString('es-EC', { maximumFractionDigits: 1 });
const FUENTE = '"IBM Plex Sans", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`; };
const COLOR_EVENTO = { inclinacion: ['--ev-inclinacion', '--ev-inclinacion-texto'], golpe: ['--ev-golpe', '--ev-golpe-texto'], vuelco: ['--ev-vuelco', '--ev-vuelco-texto'] };
const coloresEvento = tipo => (COLOR_EVENTO[tipo] ?? COLOR_EVENTO.inclinacion).map(v => css(v));

Chart.defaults.font.family = FUENTE;
Chart.defaults.font.size = 12;

const grafica = (p, id, titulo, sub, canvas, aria, valores, extra = '') => `
  <section class="grafica" aria-labelledby="${p}t-${id}">
    <header><div><h3 id="${p}t-${id}">${titulo}</h3>${sub}</div><div class="grafica-valor"><span>${valores}</span><strong id="${p}valor-${id}">—</strong></div></header>
    <div class="grafica-lienzo"><canvas id="${p}${canvas}" role="img" aria-label="${aria}"></canvas></div>${extra}
  </section>`;

// Gráficas principales: inclinación y aceleración total.
export function htmlGraficas(p = '', { valores = 'Ahora' } = {}) {
  return `<div class="graficas-lista">
  ${grafica(p, 'inclinacion', 'Inclinación (°)', `<div class="leyenda" aria-hidden="true"><span><i style="color:var(--serie-roll)"></i>Lateral (roll)</span><span><i style="color:var(--serie-pitch)"></i>Frontal (pitch)</span></div>`,
    'angles', 'Inclinación lateral y frontal en grados', valores, `<p class="sr-only" id="${p}graph-summary"></p>`)}
  ${grafica(p, 'golpe', 'Aceleración total (m/s²)', '', 'magnitude', 'Aceleración total en metros por segundo al cuadrado, con el umbral de golpe y la gravedad', valores)}
  </div>`;
}

// Gráficas secundarias: vueltas de la rueda con sensor y aceleración por eje.
export function htmlGraficasTecnicas(p = '', { valores = 'Ahora', ejes = true, rueda = true, enG = false } = {}) {
  return `<div class="tecnico-graficas">
  ${rueda ? grafica(p, 'rueda', `${NOMBRE_RUEDA} (vueltas)`, `<p class="grafica-nota">${POSICION_RUEDA_SENSOR} · franja inferior: <span class="muestra muestra-gira"></span> girando · <span class="muestra muestra-quieta"></span> detenida</p>`,
    'wheel', 'Vueltas acumuladas de la rueda con sensor', valores) : ''}
  ${ejes ? grafica(p, 'ejes', `Aceleración por eje (${enG ? 'g' : 'm/s²'})`, `<div class="leyenda" aria-hidden="true"><span><i style="color:var(--serie-x)"></i>X adelante</span><span><i style="color:var(--serie-y)"></i>Y izquierda</span><span><i style="color:var(--serie-z)"></i>Z arriba</span></div>`,
    'accel', 'Aceleración por eje X, Y y Z', valores) : ''}
  </div>`;
}

// Valor de una serie {x, y}[] en el instante t (la muestra más cercana; null si cae en un hueco).
function valorEn(data, t) {
  let lo = 0, hi = data.length - 1;
  if (hi < 0) return null;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (data[mid].x < t) lo = mid + 1; else hi = mid; }
  const a = data[lo], b = data[lo - 1];
  const p = b && Math.abs(b.x - t) < Math.abs(a.x - t) ? b : a;
  return p?.y ?? null;
}

// Hora (hh:mm:ss) de un instante de la sesión con el reloj de la API, o null.
const horaDeGrafica = (chart, t) => { const h = chart?.$tel?.reloj ? horaDe(chart.$tel.reloj, t) : null; return h == null ? null : textoHora(h); };

function pastilla(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const dibujo = {
  id: 'telemetria',
  beforeDatasetsDraw(chart) {
    const t = chart.$tel; if (!t) return;
    const { ctx, chartArea: a, scales: { y } } = chart;
    const grande = t.presentacion;
    ctx.save();
    for (const b of t.bandas ?? []) {
      const y0 = Math.max(a.top, Math.min(a.bottom, y.getPixelForValue(b.hasta)));
      const y1 = Math.max(a.top, Math.min(a.bottom, y.getPixelForValue(b.desde)));
      if (y1 - y0 < 1) continue;
      ctx.fillStyle = b.color; ctx.fillRect(a.left, y0, a.right - a.left, y1 - y0);
      if (b.borde) {
        ctx.strokeStyle = b.borde; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        for (const py of [y0, y1]) { ctx.beginPath(); ctx.moveTo(a.left, py + .5); ctx.lineTo(a.right, py + .5); ctx.stroke(); }
        ctx.setLineDash([]);
      }
    }
    for (const l of t.lineasY ?? []) {
      const py = Math.round(y.getPixelForValue(l.valor)) + .5;
      if (py < a.top || py > a.bottom) continue;
      ctx.strokeStyle = l.color; ctx.lineWidth = l.ancho ?? 1; ctx.setLineDash(l.trazo ?? [5, 4]);
      ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke(); ctx.setLineDash([]);
      if (l.texto) {
        ctx.fillStyle = l.colorTexto ?? l.color; ctx.font = `600 ${grande ? 13 : 11}px ${FUENTE}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(l.texto, a.right - 6, py - 3);
      }
    }
    ctx.restore();
  },
  afterDatasetsDraw(chart) {
    const t = chart.$tel; if (!t) return;
    const { ctx, chartArea: a, scales: { x, y } } = chart;
    const grande = t.presentacion;
    ctx.save();
    // Rótulo de la banda (después de las series, con fondo, para que se lea sobre las líneas).
    for (const b of t.bandas ?? []) {
      const y0 = Math.max(a.top, Math.min(a.bottom, y.getPixelForValue(b.hasta)));
      const y1 = Math.max(a.top, Math.min(a.bottom, y.getPixelForValue(b.desde)));
      if (b.texto && y1 - y0 > 12) {
        // Rótulo con fondo para que se lea sobre las líneas.
        const tam = grande ? 13 : 11;
        ctx.font = `600 ${tam}px ${FUENTE}`; const w = ctx.measureText(b.texto).width;
        const ty = y0 + 2;
        ctx.fillStyle = 'rgba(255, 255, 255, .85)'; pastilla(ctx, a.left + 4, ty, w + 10, tam + 6, 3); ctx.fill();
        ctx.fillStyle = b.colorTexto ?? css('--texto-3'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(b.texto, a.left + 9, ty + 3);
      }
    }
    if (t.franja?.length) {
      const alto = 6, top = a.bottom - alto;
      for (const f of t.franja) {
        const x0 = Math.max(a.left, x.getPixelForValue(f.desde)), x1 = Math.min(a.right, x.getPixelForValue(f.hasta));
        if (x1 <= x0) continue;
        ctx.fillStyle = f.gira ? css('--serie-rueda') : css('--borde');
        ctx.fillRect(x0, top, x1 - x0, alto);
      }
    }
    // Eventos: línea vertical fina en la detección, punto del color del tipo sobre la línea de datos y
    // rótulo corto «Tipo hh:mm:ss» arriba (carriles para que no se solapen).
    // t.banderas queda con lo dibujado (lo usan las pruebas del navegador).
    t.banderas = [];
    const carriles = [], rotulos = [];
    const visibles = (t.eventos ?? []).map(e => ({ e, px: x.getPixelForValue(e.t_deteccion_ms) }))
      .filter(v => v.px >= a.left && v.px <= a.right).sort((p, q) => p.px - q.px);
    for (const { e, px } of visibles) {
      const [color, texto] = coloresEvento(e.tipo);
      const nombre = NOMBRE_TIPO[e.tipo] ?? e.tipo, hora = horaDeGrafica(chart, e.t_deteccion_ms) ?? `${seg(e.t_deteccion_ms)} s`;
      t.banderas.push({ texto: nombre, hora, x: px });
      const lx = Math.round(px) + .5;
      ctx.strokeStyle = texto; ctx.lineWidth = 1; ctx.globalAlpha = .9;
      ctx.beginPath(); ctx.moveTo(lx, a.top); ctx.lineTo(lx, a.bottom); ctx.stroke(); ctx.globalAlpha = 1;
      // Punto sobre la serie con mayor |valor| en ese instante.
      let vy = null;
      chart.data.datasets.forEach((d, i) => {
        if (chart.getDatasetMeta(i).hidden) return;
        const v = valorEn(d.data, e.t_deteccion_ms);
        if (v != null && (vy == null || Math.abs(v) > Math.abs(vy))) vy = v;
      });
      if (vy != null) {
        const py = Math.max(a.top, Math.min(a.bottom, y.getPixelForValue(vy)));
        ctx.beginPath(); ctx.arc(px, py, grande ? 6 : 5, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, (grande ? 6 : 5) + 1.5, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = texto; ctx.stroke();
      }
      if (t.rotular) rotulos.push({ nombre, hora, px, color, texto });
    }
    // Rótulos en una segunda pasada: ninguna línea de otro evento los cruza.
    for (const { nombre, hora, px, color, texto } of rotulos) {
      {
        const tam = grande ? 13 : 11, alto = tam + 8;
        ctx.font = `600 ${tam}px ${FUENTE}`; const wTipo = ctx.measureText(nombre).width;
        ctx.font = `500 ${tam}px ${MONO}`; const wHora = ctx.measureText(hora).width;
        const ancho = wTipo + 6 + wHora + 16;
        const bx = px + 4 + ancho > a.right ? px - 4 - ancho : px + 4;
        let carril = carriles.findIndex(fin => bx > fin + 4);
        if (carril < 0) carril = carriles.length;
        carriles[carril] = bx + ancho;
        const by = a.top + 2 + carril * (alto + 3);
        pastilla(ctx, bx, by, ancho, alto, 4);
        ctx.fillStyle = 'rgba(255, 255, 255, .94)'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = `600 ${tam}px ${FUENTE}`; ctx.fillStyle = texto; ctx.fillText(nombre, bx + 8, by + alto / 2 + .5);
        ctx.font = `500 ${tam}px ${MONO}`; ctx.fillStyle = css('--texto-2'); ctx.fillText(hora, bx + 8 + wTipo + 6, by + alto / 2 + .5);
      }
    }
    if (t.seleccion) {
      ctx.fillStyle = rgba(css('--acento', '#2F5BEA'), .12);
      ctx.fillRect(t.seleccion[0], a.top, t.seleccion[1] - t.seleccion[0], a.bottom - a.top);
    }
    if (t.cursor != null) {
      const px = Math.round(x.getPixelForValue(t.cursor)) + .5;
      if (px >= a.left && px <= a.right) {
        ctx.strokeStyle = css('--texto-2'); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // Etiquetas directas al final de cada línea.
    if (t.etiquetas) {
      const marcas = [], tam = grande ? 14 : 12, paso = tam + 4;
      chart.data.datasets.forEach((d, i) => {
        const ultimo = d.data.findLast(p => p.y != null);
        if (!ultimo || chart.getDatasetMeta(i).hidden) return;
        marcas.push({ y: Math.max(a.top + paso / 2, Math.min(a.bottom - paso / 2, y.getPixelForValue(ultimo.y))), texto: `${d.$corto ?? d.label} ${num(ultimo.y, t.decimales ?? 1)}${t.unidad}`, color: d.$colorTexto ?? d.borderColor });
      });
      marcas.sort((m, n) => m.y - n.y);
      for (let i = 1; i < marcas.length; i++) if (marcas[i].y - marcas[i - 1].y < paso) marcas[i].y = marcas[i - 1].y + paso;
      ctx.font = `600 ${tam}px ${FUENTE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const m of marcas) { ctx.fillStyle = m.color; ctx.fillText(m.texto, a.right + 8, m.y); }
    }
    ctx.restore();
  }
};

// Relleno degradado de la serie: 18 % arriba del área, 0 % abajo (cacheado por tamaño).
function degradado(color) {
  return ({ chart }) => {
    const a = chart.chartArea; if (!a) return 'transparent';
    const clave = `${color}|${a.top}|${a.bottom}`;
    chart.$degradados ??= new Map();
    if (!chart.$degradados.has(clave)) {
      const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
      g.addColorStop(0, rgba(color, .18)); g.addColorStop(1, rgba(color, 0));
      chart.$degradados.set(clave, g);
    }
    return chart.$degradados.get(clave);
  };
}

function crear(canvas, datasets, { etiquetas = false, unidad = '', decimales = 1, yMin, onClick, relleno = true } = {}) {
  const tinta3 = css('--texto-3'), rejilla = css('--rejilla', '#E8ECF3');
  const chart = new Chart(canvas, {
    type: 'line',
    data: { datasets: datasets.map(d => ({ data: [], borderWidth: 2.5, $ancho: 2.5, pointRadius: 0, pointHoverRadius: 4, pointHoverBorderWidth: 2, pointHoverBorderColor: '#fff',
      tension: 0, spanGaps: false, borderJoinStyle: 'round', borderCapStyle: 'round',
      fill: relleno ? 'origin' : false, backgroundColor: relleno ? degradado(d.borderColor) : d.borderColor, pointHoverBackgroundColor: d.borderColor, ...d })) },
    plugins: [dibujo],
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
      layout: { padding: { right: etiquetas ? 112 : 12, top: 6, left: 2 } },
      interaction: { mode: 'index', axis: 'x', intersect: false },
      onClick,
      plugins: {
        legend: { display: false },
        decimation: { enabled: false },
        filler: { propagate: false },
        tooltip: {
          backgroundColor: '#FFFFFF', borderColor: css('--borde'), borderWidth: 1, titleColor: css('--texto'), bodyColor: css('--texto-2'), footerColor: css('--texto'),
          padding: 10, cornerRadius: 8, boxPadding: 4, usePointStyle: true, caretPadding: 6,
          titleFont: { family: MONO, weight: '500', size: 12 }, bodyFont: { family: FUENTE, size: 13 }, footerFont: { family: FUENTE, weight: '600', size: 12 },
          callbacks: {
            title: i => { const ms = i[0].parsed.x, h = horaDeGrafica(i[0].chart, ms); return h ? `${h} · ${seg(ms)} s` : `${seg(ms)} s de sesión`; },
            label: i => `${i.dataset.label}: ${num(i.parsed.y, decimales + 1)}${unidad}`,
            labelPointStyle: () => ({ pointStyle: 'circle', rotation: 0 }),
            footer: i => {
              const ms = i[0]?.parsed.x, chart = i[0]?.chart; if (ms == null) return '';
              return (chart.$tel.eventos ?? []).filter(e => ms >= e.t_inicio_ms && ms <= e.t_fin_ms)
                .map(e => `${NOMBRE_TIPO[e.tipo] ?? e.tipo} · detección ${horaDeGrafica(chart, e.t_deteccion_ms) ?? seg(e.t_deteccion_ms) + ' s'}`);
            }
          }
        }
      },
      scales: {
        x: { type: 'linear', grid: { display: false }, border: { display: false },
          ticks: { maxTicksLimit: 6, color: tinta3, font: { size: 12 }, maxRotation: 0, padding: 6,
            callback(v) { return horaDeGrafica(this.chart, v) ?? seg(v) + ' s'; } } },
        y: { ...(yMin === undefined ? {} : { min: yMin }), grid: { color: rejilla, lineWidth: 1, drawTicks: false }, border: { display: false },
          ticks: { maxTicksLimit: 6, color: tinta3, font: { size: 12 }, padding: 8, callback: v => v.toLocaleString('es-EC', { maximumFractionDigits: 2 }) } }
      }
    }
  });
  chart.$tel = { etiquetas, unidad, decimales };
  return chart;
}

// ejesEnG: la gráfica de ejes X/Y/Z en g (Detalle de sesión). En el resto queda en m/s².
export function crearGraficas(p = '', { onClick, ejesEnG = false } = {}) {
  const $ = id => document.getElementById(p + id);
  const roll = css('--serie-roll'), pitch = css('--serie-pitch'), total = css('--serie-total'), rueda = css('--serie-rueda');
  const g = {
    ejesEnG,
    angles: $('angles') && crear($('angles'), [
      { label: 'Lateral (roll)', $corto: 'Lateral', borderColor: roll },
      { label: 'Frontal (pitch)', $corto: 'Frontal', borderColor: pitch, $colorTexto: css('--serie-pitch-texto') }
    ], { etiquetas: true, unidad: '°', onClick }),
    magnitude: $('magnitude') && crear($('magnitude'), [{ label: 'Aceleración total', $corto: 'Total', borderColor: total }], { etiquetas: true, unidad: ' m/s²', yMin: 0, onClick }),
    wheel: $('wheel') && crear($('wheel'), [{ label: 'Vueltas', borderColor: rueda }], { etiquetas: true, unidad: '', yMin: 0, onClick }),
    accel: $('accel') ? crear($('accel'), [
      { label: 'X adelante', $corto: 'X', borderColor: css('--serie-x'), borderWidth: 2, $ancho: 2 },
      { label: 'Y izquierda', $corto: 'Y', borderColor: css('--serie-y'), borderWidth: 2, $ancho: 2 },
      { label: 'Z arriba', $corto: 'Z', borderColor: css('--serie-z'), $colorTexto: css('--serie-z-texto'), borderWidth: 2, $ancho: 2 }
    ], { etiquetas: true, unidad: ejesEnG ? ' g' : '', decimales: ejesEnG ? 2 : 1, onClick, relleno: false }) : null
  };
  g.todas = [g.angles, g.magnitude, g.wheel, g.accel].filter(Boolean);
  g.destroy = () => g.todas.forEach(c => c.destroy());
  // Las fuentes locales pueden terminar de cargar después del primer dibujo.
  document.fonts?.ready.then(() => g.todas.forEach(c => c.ctx && c.update('none')));
  return g;
}

// Serie con cortes donde faltan datos (más de HUECO_MS entre muestras, o m.corte en mediciones reducidas).
const hayHueco = (m, previa, marcados) => previa && (marcados ? m.corte : m.t_ms - previa.t_ms > HUECO_MS);
function serie(mediciones, valor, marcados = false) {
  const out = [];
  for (let i = 0; i < mediciones.length; i++) {
    const m = mediciones[i], previa = mediciones[i - 1];
    if (hayHueco(m, previa, marcados)) out.push({ x: (m.t_ms + previa.t_ms) / 2, y: null });
    const v = valor(m);
    out.push({ x: m.t_ms, y: v == null || !Number.isFinite(v) ? null : v });
  }
  return out;
}

export function vueltasAcumuladas(mediciones) {
  let total = 0;
  return mediciones.map((m, i) => (total += vueltasEntre(mediciones[i - 1], m)));
}

const extremos = (lista, f) => lista.reduce(([lo, hi], m) => { const v = f(m); return [Math.min(lo, v), Math.max(hi, v)]; }, [Infinity, -Infinity]);

// Actualiza los datasets en su sitio (sin recrear las gráficas) y devuelve los valores para los encabezados.
// reducidas = true: las mediciones ya vienen reducidas (Detalle de sesión, con m.corte y vueltas_acum).
// Si no, y son más de MAX_PUNTOS, se reducen aquí (mín./máx. por cubo, conservando las detecciones).
// reloj: { ultima_recepcion_ms, t_ultima_medicion_ms } para mostrar horas (eje, rótulos, tooltip).
export function actualizarGraficas(g, { mediciones, eventos = [], desde, hasta, cursor = null, umbralGolpe = CONSTANTES_INO.UMBRAL_GOLPE_MS2, reducidas = false, reloj = null }) {
  const todas = mediciones;
  const total = x => Math.hypot(x.ax, x.ay, x.az);
  let m = todas, marcados = reducidas;
  if (!reducidas && todas.length > MAX_PUNTOS) {
    const v = vueltasAcumuladas(todas);
    m = reducirMediciones(todas.map((x, i) => ({ ...x, vueltas_acum: v[i] })), { desde, hasta, maxPuntos: MAX_PUNTOS, fijos: eventos.map(e => e.t_deteccion_ms) });
    marcados = true;
  }
  const factor = g.ejesEnG ? 1 / GRAVEDAD : 1;
  const datos = {
    angles: [serie(m, x => x.roll_deg, marcados), serie(m, x => x.pitch_deg, marcados)],
    magnitude: [serie(m, total, marcados)],
    // vueltas_acum (si viene) se calculó con todas las muestras antes de reducir: el total no depende del zoom.
    wheel: [(() => { const v = m[0]?.vueltas_acum != null ? m.map(x => x.vueltas_acum) : vueltasAcumuladas(m); return serie(m.map((x, i) => ({ ...x, v: v[i] })), x => x.v, marcados); })()],
    accel: [serie(m, x => x.ax * factor, marcados), serie(m, x => x.ay * factor, marcados), serie(m, x => x.az * factor, marcados)]
  };
  let maxAng = 0, maxTotal = 0;
  for (const x of todas) { maxAng = Math.max(maxAng, Math.abs(x.roll_deg), Math.abs(x.pitch_deg)); maxTotal = Math.max(maxTotal, total(x)); }
  // Eje fijo ±45°; se amplía a ±90° si se supera y a ±180° si hay vuelco (|ángulo| ≥ 90°).
  const vuelco = CONSTANTES_INO.UMBRAL_VUELCO_DEG, incl = CONSTANTES_INO.UMBRAL_INCLINACION_DEG;
  const lim = maxAng >= vuelco ? 180 : maxAng > 45 ? 90 : 45;
  if (g.angles) {
    const y = g.angles.options.scales.y;
    y.min = -lim; y.max = lim; y.ticks.stepSize = lim === 45 ? 15 : lim === 90 ? 30 : 45;
    g.angles.$tel.bandas = [{ desde: -ZONA_NORMAL_DEG, hasta: ZONA_NORMAL_DEG, color: css('--zona-relleno', 'rgba(18,183,106,.08)'), borde: css('--zona-linea', 'rgba(18,183,106,.6)'), texto: 'Zona normal', colorTexto: css('--est-normal') }];
    const evI = css('--ev-inclinacion-texto'), evV = css('--ev-vuelco-texto');
    g.angles.$tel.lineasY = [
      { valor: incl, texto: `Umbral de inclinación ${incl}°`, color: rgba(evI, .7), colorTexto: evI }, { valor: -incl, color: rgba(evI, .7) },
      { valor: vuelco, texto: `Vuelco ${vuelco}°`, color: rgba(evV, .7), colorTexto: evV }, { valor: -vuelco, color: rgba(evV, .7) }
    ];
    const [r0, r1] = extremos(todas, x => x.roll_deg), [p0, p1] = extremos(todas, x => x.pitch_deg);
    g.angles.canvas.setAttribute('aria-label', todas.length
      ? `Inclinación en grados. Lateral entre ${num(r0)} y ${num(r1)}°, frontal entre ${num(p0)} y ${num(p1)}°. Zona normal ±${ZONA_NORMAL_DEG}°. ${eventos.length} ${eventos.length === 1 ? 'evento marcado' : 'eventos marcados'}.`
      : 'Inclinación en grados: sin mediciones.');
  }
  if (g.magnitude) {
    g.magnitude.options.scales.y.max = Math.max(20, Math.ceil(maxTotal * 1.15 / 5) * 5);
    const golpe = css('--ev-golpe-texto');
    g.magnitude.$tel.lineasY = [
      { valor: umbralGolpe, texto: `Umbral de golpe ${num(umbralGolpe, 0)}`, color: rgba(golpe, .8), colorTexto: golpe },
      { valor: GRAVEDAD, texto: '1 g', color: css('--con-desconectada', '#98A2B3'), colorTexto: css('--texto-3'), trazo: [2, 3] }
    ];
    g.magnitude.canvas.setAttribute('aria-label', todas.length ? `Aceleración total: máximo ${num(maxTotal)} m/s²; umbral de golpe ${num(umbralGolpe, 0)} m/s²; en reposo 9,8 (1 g).` : 'Aceleración total: sin mediciones.');
  }
  // Franja de la rueda: tramos girando/detenida según rueda_rps.
  const franja = [];
  for (let i = 1; i < m.length; i++) {
    const a = m[i - 1]; if (a.rueda_rps == null || hayHueco(m[i], a, marcados)) continue;
    const gira = a.rueda_rps > RUEDA_MINIMA_RPS, ultimo = franja.at(-1);
    if (ultimo && ultimo.gira === gira && ultimo.hasta === a.t_ms) ultimo.hasta = m[i].t_ms;
    else franja.push({ desde: a.t_ms, hasta: m[i].t_ms, gira });
  }
  const maxV = datos.wheel[0].reduce((s, q) => Math.max(s, q.y ?? 0), 0);
  if (g.wheel) {
    g.wheel.$tel.franja = franja; g.wheel.options.scales.y.max = Math.max(1, Math.ceil(maxV * 1.2));
    g.wheel.canvas.setAttribute('aria-label', `Vueltas acumuladas de la ${NOMBRE_RUEDA.toLowerCase()}: ${num(maxV)} al final del tramo.`);
  }
  if (g.accel) g.accel.canvas.setAttribute('aria-label', `Aceleración por eje X (adelante), Y (izquierda) y Z (arriba) en ${g.ejesEnG ? 'g' : 'm/s²'}.`);
  for (const [clave, chart] of Object.entries({ angles: g.angles, magnitude: g.magnitude, wheel: g.wheel, accel: g.accel })) {
    if (!chart) continue;
    chart.data.datasets.forEach((d, i) => { d.data = datos[clave][i]; d.pointRadius = m.length < 10 ? 3 : 0; d.pointBackgroundColor = d.borderColor; });
    chart.options.scales.x.min = desde; chart.options.scales.x.max = hasta;
    Object.assign(chart.$tel, { eventos, rotular: clave === 'angles' || clave === 'magnitude', cursor, reloj });
    chart.update('none');
  }
  return { maxAng, maxTotal, vueltas: datos.wheel[0].findLast(q => q.y != null)?.y ?? null, conRueda: todas.some(x => x.rueda_rps != null || x.rueda_pulsos != null), dibujadas: m.length };
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
    const arriba = () => {
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

// Pantalla completa: ticks de 14 px, rótulos más grandes y líneas de 3 px.
export function modoPresentacion(g, activo) {
  for (const c of g.todas) {
    c.$tel.presentacion = activo;
    for (const eje of Object.values(c.options.scales)) eje.ticks.font = { ...(eje.ticks.font ?? {}), size: activo ? 14 : 12 };
    c.options.layout.padding.right = c.$tel.etiquetas ? (activo ? 130 : 112) : 12;
    c.data.datasets.forEach(d => { d.borderWidth = activo ? 3 : (d.$ancho ?? 2.5); });
    c.update('none');
  }
}
