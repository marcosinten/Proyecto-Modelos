// Gráfica de postura de una sesión (Detalle de sesión). Se carga de forma perezosa.
//   3D: cada medición es la punta del eje «arriba» del carro (vector unitario) calculada con roll_deg y
//       pitch_deg con la MISMA convención que web/src/car.js: Euler(roll, 0, pitch, 'YZX') sobre los
//       ejes de three.js (X adelante, Y arriba, Z a la derecha del carro). Se dibuja en ejes del vehículo
//       X adelante · Y izquierda · Z arriba (X = X₃, Y = −Z₃, Z = Y₃). Sin animación: se dibuja al cambiar.
//   2D: mapa lateral (roll, x) contra frontal (pitch, y) con el cuadrado de ±10°.
// Puntos coloreados por tiempo (#B2CCFF → #1D3FB8), pirámide/cuadrado de la zona normal, eventos del color
// de su tipo y, para el evento elegido, línea al origen y arcos rotulados con sus ángulos.
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Chart from 'chart.js/auto';
import { reducirMediciones, indiceDesde } from '../../compartido/detalle-sesion.js';
import { analizarEvento, aceleracionTotal, horaDe, NOMBRE_TIPO } from '../../compartido/exportacion.js';
import { textoHora } from '../../compartido/hora.js';
import { ZONA_NORMAL_DEG } from './graficas.js';

const MAX_PUNTOS = 3000;
const css = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
const num = v => v.toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const seg = ms => (ms / 1000).toLocaleString('es-EC', { maximumFractionDigits: 1 });
const INICIO = new T.Color('#B2CCFF'), FIN = new T.Color('#1D3FB8');
const COLOR = { inclinacion: ['#F79009', '#B54708'], golpe: ['#D92D20', '#B42318'], vuelco: ['#7A271A', '#7A271A'] };
const colorTiempo = f => INICIO.clone().lerp(FIN, f);
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Eje «arriba» del carro en ejes del vehículo (X adelante, Y izquierda, Z arriba).
const euler = new T.Euler(), arriba3 = new T.Vector3();
export function posturaVehiculo(roll, pitch, destino = new T.Vector3()) {
  euler.set(T.MathUtils.degToRad(roll), 0, T.MathUtils.degToRad(pitch), 'YZX');   // igual que car.js
  arriba3.set(0, 1, 0).applyEuler(euler);
  return destino.set(arriba3.x, -arriba3.z, arriba3.y);
}

// Pico del evento: la medición de mayor |ángulo| en su ventana (o la detección si no hay mediciones).
function picoEvento(e, mediciones) {
  const a = analizarEvento(e, mediciones);
  const t = a.angulo_max?.t_ms ?? e.t_deteccion_ms;
  const m = mediciones[Math.min(mediciones.length - 1, indiceDesde(mediciones, t))];
  return { e, m, a };
}

function textoPunto(m, reloj) {
  const h = horaDe(reloj, m.t_ms);
  return `<strong class="mono">${h == null ? `${seg(m.t_ms)} s` : `${textoHora(h)} · ${seg(m.t_ms)} s`}</strong>
    <span>Lateral ${num(m.roll_deg)}° · Frontal ${num(m.pitch_deg)}°</span><span>Aceleración total ${num(aceleracionTotal(m))} m/s²</span>`;
}

function texturaEvento(tipo) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), [fondo, borde] = COLOR[tipo] ?? COLOR.inclinacion;
  x.beginPath(); x.arc(32, 32, 27, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill();
  x.beginPath(); x.arc(32, 32, 29, 0, Math.PI * 2); x.lineWidth = 3; x.strokeStyle = borde; x.stroke();
  x.beginPath(); x.arc(32, 32, 20, 0, Math.PI * 2); x.fillStyle = fondo; x.fill();
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

// contenedor: elemento con tamaño. Devuelve { modo('2d'|'3d'), vista(nombre), elegir(idEvento), descargar(), destroy(), webgl }.
export function crearPostura(contenedor, { mediciones, eventos = [], reloj = null }) {
  const puntos = reducirMediciones(mediciones, { maxPuntos: MAX_PUNTOS, fijos: eventos.map(e => e.t_deteccion_ms) });
  const t0 = puntos[0]?.t_ms ?? 0, t1 = Math.max(t0 + 1, puntos.at(-1)?.t_ms ?? 1);
  const picos = eventos.map(e => picoEvento(e, mediciones));
  let elegido = [...picos].sort((p, q) => Math.abs(q.a.angulo_max?.valor ?? 0) - Math.abs(p.a.angulo_max?.valor ?? 0))[0] ?? null;

  contenedor.innerHTML = `<div class="postura-lienzo" data-modo="3d"><div class="postura-3d"></div><div class="postura-rotulos" aria-hidden="true"></div>
    <div class="postura-2d"><canvas aria-label="Mapa de postura: lateral (roll) en el eje horizontal y frontal (pitch) en el vertical"></canvas></div>
    <div class="postura-tooltip" role="status" hidden></div></div>`;
  const lienzo = contenedor.querySelector('.postura-lienzo'), caja3d = contenedor.querySelector('.postura-3d');
  const rotulos = contenedor.querySelector('.postura-rotulos'), tooltip = contenedor.querySelector('.postura-tooltip');
  const resumen = `Postura de ${puntos.length.toLocaleString('es-EC')} mediciones${eventos.length ? ` y ${eventos.length} eventos` : ''}. Zona normal ±${ZONA_NORMAL_DEG}° en lateral y frontal.`;

  // ---------- 3D ----------
  let renderer = null;
  try { renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); } catch { renderer = null; }
  const escena = new T.Scene(), camara = new T.OrthographicCamera(-1.6, 1.6, 1.2, -1.2, -10, 10);
  camara.up.set(0, 0, 1);
  let controles = null, rotulosLista = [], quitar3d = () => {}, dibujarElegido = () => {};
  const pintar = () => { if (!renderer) return; renderer.render(escena, camara); colocarRotulos(); };
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 1);
    renderer.domElement.setAttribute('role', 'img'); renderer.domElement.setAttribute('aria-label', resumen + ' Vista 3D; arrastra para girar.');
    caja3d.append(renderer.domElement);
    const gris = new T.LineBasicMaterial({ color: css('--eje-3d', '#8A94A6') });
    const linea = (a, b, mat) => escena.add(new T.Line(new T.BufferGeometry().setFromPoints([a, b]), mat));
    const ejes = [[new T.Vector3(1.25, 0, 0), 'X adelante'], [new T.Vector3(0, 1.25, 0), 'Y izquierda'], [new T.Vector3(0, 0, 1.25), 'Z arriba']];
    for (const [v, nombre] of ejes) { linea(new T.Vector3(), v, gris); rotulosLista.push({ p: v.clone().multiplyScalar(1.06), texto: nombre, clase: 'eje' }); }
    for (const v of [new T.Vector3(-1, 0, 0), new T.Vector3(0, -1, 0)]) linea(new T.Vector3(), v, new T.LineDashedMaterial({ color: 0xC5CBD5, dashSize: .04, gapSize: .03 }));
    escena.children.at(-1).computeLineDistances(); escena.children.at(-2).computeLineDistances();
    // Pirámide de la zona normal (±10° en lateral y frontal): vértice en el origen.
    const esquinas = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([r, p]) => posturaVehiculo(r * ZONA_NORMAL_DEG, p * ZONA_NORMAL_DEG));
    const caras = new T.BufferGeometry();
    caras.setAttribute('position', new T.Float32BufferAttribute(esquinas.flatMap((a, i) => { const b = esquinas[(i + 1) % 4]; return [0, 0, 0, a.x, a.y, a.z, b.x, b.y, b.z]; }), 3));
    escena.add(new T.Mesh(caras, new T.MeshBasicMaterial({ color: 0x12B76A, transparent: true, opacity: .12, side: T.DoubleSide, depthWrite: false })));
    const aristas = new T.LineBasicMaterial({ color: 0x12B76A, transparent: true, opacity: .6 });
    for (let i = 0; i < 4; i++) { linea(new T.Vector3(), esquinas[i], aristas); linea(esquinas[i], esquinas[(i + 1) % 4], aristas); }
    rotulosLista.push({ p: esquinas[0].clone().lerp(esquinas[3], .5).multiplyScalar(1.08), texto: `Zona normal ±${ZONA_NORMAL_DEG}°`, clase: 'zona' });
    // Trayectoria y puntos coloreados por tiempo.
    const pos = new Float32Array(puntos.length * 3), col = new Float32Array(puntos.length * 3), v = new T.Vector3();
    puntos.forEach((m, i) => {
      posturaVehiculo(m.roll_deg, m.pitch_deg, v); pos.set([v.x, v.y, v.z], i * 3);
      const c = colorTiempo((m.t_ms - t0) / (t1 - t0)); col.set([c.r, c.g, c.b], i * 3);
    });
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    escena.add(new T.Line(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .45 })));
    const nube = new T.Points(geo, new T.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true }));
    escena.add(nube);
    // Eventos: esferas (sprites) del color del tipo con aro blanco.
    const texturas = {};
    for (const p of picos) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: texturas[p.e.tipo] ??= texturaEvento(p.e.tipo), sizeAttenuation: false, depthTest: false }));
      s.scale.set(.045, .045, 1); s.position.copy(posturaVehiculo(p.m.roll_deg, p.m.pitch_deg)); s.renderOrder = 3; s.userData.id = p.e.id;
      escena.add(s);
    }
    // Detalle del evento elegido: línea al origen y arcos de sus ángulos.
    const detalle = new T.Group(); escena.add(detalle);
    dibujarElegido = () => {
      detalle.clear(); rotulosLista = rotulosLista.filter(r => r.clase !== 'angulo');
      if (!elegido) return;
      const { m, e } = elegido, punta = posturaVehiculo(m.roll_deg, m.pitch_deg), [, borde] = COLOR[e.tipo] ?? COLOR.inclinacion;
      detalle.add(new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), punta]), new T.LineBasicMaterial({ color: borde })));
      const arco = (f, color, texto) => {
        const pts = []; for (let k = 0; k <= 32; k++) pts.push(f(k / 32).multiplyScalar(.55));
        detalle.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color })));
        rotulosLista.push({ p: f(.5).multiplyScalar(.62), texto, clase: 'angulo', color });
      };
      arco(k => posturaVehiculo(m.roll_deg * k, 0), css('--serie-roll', '#2F5BEA'), `Lateral ${num(m.roll_deg)}°`);
      arco(k => posturaVehiculo(0, m.pitch_deg * k), css('--serie-pitch-texto', '#107569'), `Frontal ${num(m.pitch_deg)}°`);
    };
    dibujarElegido();
    controles = new OrbitControls(camara, renderer.domElement);
    controles.enablePan = false; controles.minZoom = .6; controles.maxZoom = 4; controles.addEventListener('change', pintar);
    // Tooltip: punto más cercano bajo el puntero.
    const rayo = new T.Raycaster(); rayo.params.Points.threshold = .025;
    const raton = new T.Vector2();
    let pendiente = 0;
    const mover = ev => {
      cancelAnimationFrame(pendiente);
      pendiente = requestAnimationFrame(() => {
        const r = renderer.domElement.getBoundingClientRect();
        raton.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
        rayo.setFromCamera(raton, camara);
        const hit = rayo.intersectObject(nube)[0];
        if (!hit) { tooltip.hidden = true; return; }
        tooltip.innerHTML = textoPunto(puntos[hit.index], reloj); tooltip.hidden = false;
        tooltip.style.left = `${Math.min(r.width - 220, ev.clientX - r.left + 14)}px`; tooltip.style.top = `${Math.max(0, ev.clientY - r.top - 10)}px`;
      });
    };
    const salir = () => { tooltip.hidden = true; };
    renderer.domElement.addEventListener('pointermove', mover); renderer.domElement.addEventListener('pointerleave', salir);
    quitar3d = () => { renderer.domElement.removeEventListener('pointermove', mover); renderer.domElement.removeEventListener('pointerleave', salir); };
  }
  function colocarRotulos() {
    const w = caja3d.clientWidth, h = caja3d.clientHeight, v = new T.Vector3();
    rotulos.innerHTML = rotulosLista.map(r => {
      v.copy(r.p).project(camara);
      return `<span class="postura-rotulo ${r.clase}" style="left:${(v.x + 1) / 2 * w}px;top:${(1 - v.y) / 2 * h}px${r.color ? `;color:${r.color}` : ''}">${escape(r.texto)}</span>`;
    }).join('');
  }
  const VISTAS = { frontal: [3, 0, 0], lateral: [0, 3, 0], arriba: [0, 0, 3], '3d': [2.2, 1.5, 1.3] };
  function vista(nombre) {
    if (!renderer) return;
    camara.position.set(...VISTAS[nombre] ?? VISTAS['3d']);
    camara.up.set(...(nombre === 'arriba' ? [1, 0, 0] : [0, 0, 1]));
    camara.zoom = 1; camara.lookAt(0, 0, .35); controles.target.set(0, 0, .35); controles.update(); pintar();
  }
  function ajustar() {
    if (!renderer) return;
    const w = caja3d.clientWidth, h = caja3d.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h); const alto = 1.35, ancho = alto * w / h;
    Object.assign(camara, { left: -ancho, right: ancho, top: alto, bottom: -alto }); camara.updateProjectionMatrix(); pintar();
  }
  const observador = new ResizeObserver(ajustar); observador.observe(caja3d);
  vista('3d');

  // ---------- 2D ----------
  let mapa = null;
  function crearMapa() {
    const canvas = contenedor.querySelector('.postura-2d canvas');
    const max = Math.max(15, ...puntos.map(m => Math.max(Math.abs(m.roll_deg), Math.abs(m.pitch_deg))));
    const lim = Math.min(180, Math.ceil(max * 1.1 / 5) * 5);
    const zona = {
      id: 'zona', beforeDatasetsDraw(c) {
        const { ctx, scales: { x, y } } = c, x0 = x.getPixelForValue(-ZONA_NORMAL_DEG), x1 = x.getPixelForValue(ZONA_NORMAL_DEG), y0 = y.getPixelForValue(ZONA_NORMAL_DEG), y1 = y.getPixelForValue(-ZONA_NORMAL_DEG);
        ctx.save(); ctx.fillStyle = 'rgba(18, 183, 106, .12)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(18, 183, 106, .6)'; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        ctx.setLineDash([]); ctx.fillStyle = '#067647'; ctx.font = '600 12px "IBM Plex Sans", sans-serif'; ctx.textBaseline = 'bottom';
        ctx.fillText(`Zona normal ±${ZONA_NORMAL_DEG}°`, x0 + 2, y0 - 3); ctx.restore();
      }
    };
    const rgb = c => `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
    const colores = puntos.map(m => rgb(colorTiempo((m.t_ms - t0) / (t1 - t0))));
    mapa = new Chart(canvas, {
      type: 'scatter', plugins: [zona],
      data: { datasets: [
        { label: 'Mediciones', data: puntos.map(m => ({ x: m.roll_deg, y: m.pitch_deg, m })), pointRadius: 2.2, pointHoverRadius: 4, pointBackgroundColor: colores, pointBorderWidth: 0, showLine: true, borderColor: 'rgba(47, 91, 234, .18)', borderWidth: 1 },
        { label: 'Eventos', data: picos.map(p => ({ x: p.m.roll_deg, y: p.m.pitch_deg, m: p.m, e: p.e })), pointRadius: 7, pointHoverRadius: 8, pointBackgroundColor: picos.map(p => (COLOR[p.e.tipo] ?? COLOR.inclinacion)[0]), pointBorderColor: '#fff', pointBorderWidth: 2.5 }
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
        plugins: { legend: { display: false }, decimation: { enabled: false },
          tooltip: { backgroundColor: '#fff', borderColor: '#E3E8F0', borderWidth: 1, titleColor: '#101828', bodyColor: '#475467', padding: 10, cornerRadius: 8,
            titleFont: { family: '"IBM Plex Mono", monospace', weight: '500' },
            callbacks: {
              title: i => { const m = i[0].raw.m, h = horaDe(reloj, m.t_ms); return h == null ? `${seg(m.t_ms)} s` : `${textoHora(h)} · ${seg(m.t_ms)} s`; },
              label: i => { const m = i.raw.m; return [`${i.raw.e ? NOMBRE_TIPO[i.raw.e.tipo] + ' · ' : ''}Lateral ${num(m.roll_deg)}° · Frontal ${num(m.pitch_deg)}°`, `Aceleración total ${num(aceleracionTotal(m))} m/s²`]; }
            } } },
        scales: {
          x: { min: -lim, max: lim, title: { display: true, text: 'Lateral (roll) °', color: '#475467', font: { weight: '600' } }, grid: { color: '#E8ECF3' }, border: { display: false }, ticks: { color: '#667085' } },
          y: { min: -lim, max: lim, title: { display: true, text: 'Frontal (pitch) °', color: '#475467', font: { weight: '600' } }, grid: { color: '#E8ECF3' }, border: { display: false }, ticks: { color: '#667085' } }
        }
      }
    });
  }

  function modo(m) {
    const dos = m === '2d' || !renderer;
    lienzo.dataset.modo = dos ? '2d' : '3d'; tooltip.hidden = true;
    if (dos && !mapa) crearMapa();
    if (!dos) ajustar();
  }
  function elegir(id) {
    elegido = picos.find(p => p.e.id === id) ?? elegido;
    dibujarElegido(); pintar();
  }
  function descargar(nombre) {
    const dos = lienzo.dataset.modo === '2d';
    const origen = dos ? contenedor.querySelector('.postura-2d canvas') : renderer.domElement;
    const c = document.createElement('canvas'); c.width = origen.width; c.height = origen.height;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(origen, 0, 0);
    if (!dos) {
      const k = origen.width / caja3d.clientWidth;
      x.font = `500 ${14 * k}px "IBM Plex Sans", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      const v = new T.Vector3();
      for (const r of rotulosLista) { v.copy(r.p).project(camara); x.fillStyle = r.color ?? (r.clase === 'zona' ? '#067647' : '#475467'); x.fillText(r.texto, (v.x + 1) / 2 * origen.width, (1 - v.y) / 2 * origen.height); }
    }
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `${nombre}-postura-${dos ? '2d' : '3d'}.png`; a.click();
  }
  return {
    webgl: !!renderer, modo, vista, elegir, descargar,
    destroy() { observador.disconnect(); quitar3d(); controles?.dispose(); mapa?.destroy(); renderer?.dispose(); escena.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); }); contenedor.replaceChildren(); }
  };
}
