// Pantalla Detalle de sesión (#sesion/<id>): 6 tarjetas de datos generales, gráficas de toda la sesión
// (zoom arrastrando y rango 6 s · 30 s · 2 min · Sesión), pestañas Inclinación y aceleración / Rueda (Hall) /
// Ejes (g), lista de eventos que salta a su instante, gráfica de postura 3D/2D (carga perezosa) y
// «Exportar sesión» (libro completo: resumen + datos técnicos).
// Las gráficas dibujan como mucho ~1500 mediciones por vista (compartido/detalle-sesion.js): se conservan
// los picos de aceleración y de ángulo de cada tramo, así un golpe nunca desaparece al alejar el zoom.
import {app, $, escape, seconds, toast} from '../app.js';
import {cargarSesionCompleta, exportarSesion, openExport} from './exportar.js';
import {historialSesion} from './historial.js';
import {htmlGraficas, htmlGraficasTecnicas, crearGraficas, actualizarGraficas, moverCursor, zoomArrastrando, vueltasAcumuladas, ZONA_NORMAL_DEG} from '../graficas.js';
import {datosGenerales, tarjetasSesion, reducirMediciones, indiceDesde, textoDuracion} from '../../../compartido/detalle-sesion.js';
import {analizarEvento, horaDe, NOMBRE_TIPO, aceleracionTotal, resumenRueda, SIN_MEDIR, GRAVEDAD} from '../../../compartido/exportacion.js';
import {textoHora, NOTA_HORA} from '../../../compartido/hora.js';
import {NOMBRE_RUEDA, POSICION_RUEDA_SENSOR, PULSOS_POR_VUELTA} from '../../../compartido/parametros-firmware.js';
import {icono} from '../iconos.js';

const MAX_PUNTOS = 1500;           // mediciones dibujadas por vista
const VENTANA_EVENTO_MS = 2000;    // margen alrededor de la ventana del evento al saltar a él
const ZOOM_MINIMO_MS = 500;
const RANGOS = [['6000', '6 s'], ['30000', '30 s'], ['120000', '2 min'], ['sesion', 'Sesión']];
const uno = v => v.toLocaleString('es-EC', {minimumFractionDigits: 1, maximumFractionDigits: 1});

export function renderSesion(id) {
 const generacion = app.liveGeneration;
 const vigente = () => generacion === app.liveGeneration && app.page === 'sesion';
 $('#main').innerHTML = `<div class="detalle-sesion"><a class="back" href="#historial">Volver al historial</a>
  <div class="page-heading"><div><h1>Sesión <span class="mono">${escape(id)}</span></h1><p id="ds-subtitulo">Cargando la sesión…</p></div>
   <div class="page-actions"><button type="button" class="secondary" id="ds-tabla">${icono('mediciones')}Tabla de mediciones</button><button type="button" class="primary" id="ds-exportar" disabled>${icono('exportar')}Exportar sesión</button></div></div>
  <div id="ds-cuerpo"><section class="tarjeta"><p role="status" id="ds-progreso">Consultando la API…</p></section></div></div>`;
 $('#ds-tabla').onclick = () => historialSesion(id);
 cargarSesionCompleta(id, {alAvanzar(n, total) {
  if (vigente() && total) $('#ds-progreso').textContent = `Cargando mediciones: ${n.toLocaleString('es-EC')} de ${total.toLocaleString('es-EC')}…`;
 }}).then(paquete => { if (vigente()) pintar(paquete); })
  .catch(e => { if (vigente()) $('#ds-cuerpo').innerHTML = `<section class="tarjeta"><p class="vacio" role="alert">No se pudo cargar la sesión: ${escape(e.message)}</p></section>`; });
}

// Tarjeta de cifra: icono en círculo de color suave, número grande y etiqueta.
function cifra(tono, ic, valor, etiqueta, detalle = '') {
 return `<div class="tarjeta cifra-sesion" data-tono="${tono}"><span class="cifra-icono">${icono(ic)}</span><strong>${valor}</strong><span class="cifra-etiqueta">${etiqueta}</span>${detalle ? `<small>${detalle}</small>` : ''}</div>`;
}

function pintar(paquete) {
 const {sesion, mediciones, eventos, reloj} = paquete;
 eventos.sort((a, b) => a.t_deteccion_ms - b.t_deteccion_ms);
 const d = datosGenerales(paquete);
 const t = Object.fromEntries(tarjetasSesion(d).map(x => [x.id, x]));
 const horas = d.hora_inicio_ms == null ? '' : ` · <span class="mono">${escape(textoHora(d.hora_inicio_ms))} – ${escape(textoHora(d.hora_fin_ms))}</span> <span class="ayuda">(${NOTA_HORA})</span>`;
 $('#ds-subtitulo').innerHTML = `<span class="chip">${sesion.origen === 'real' ? 'Datos reales' : 'Datos simulados'}</span>${horas}`;
 const exportar = $('#ds-exportar');
 exportar.disabled = !mediciones.length;
 exportar.title = 'Un solo Excel con el resumen y los datos técnicos de todas las muestras';
 exportar.onclick = () => exportarSesion(paquete, exportar);
 if (!mediciones.length) {
  $('#ds-cuerpo').innerHTML = '<section class="tarjeta"><p class="vacio">Esta sesión no tiene mediciones guardadas.</p></section>';
  return;
 }
 const salto = (p, texto) => p ? `<button type="button" class="salto" data-ir="${p.t_ms}" title="Ver este instante en las gráficas">${texto}</button>` : SIN_MEDIR;
 const tarjetas = [
  cifra('acento', 'reloj', escape(t.duracion.valor), 'Duración', 'De la primera a la última medición'),
  cifra('gris', 'mediciones', escape(t.mediciones.valor), 'Mediciones', '50 por segundo'),
  cifra('golpe', 'golpe', String(d.golpes), d.golpes === 1 ? 'Golpe' : 'Golpes'),
  cifra('inclinado', 'inclinado', String(d.inclinaciones), d.inclinaciones === 1 ? 'Inclinación' : 'Inclinaciones'),
  cifra('vuelco', 'volcado', String(d.vuelcos), d.vuelcos === 1 ? 'Vuelco' : 'Vuelcos'),
  cifra('pitch', 'lateral', `${salto(d.max_roll, d.max_roll ? `${uno(Math.abs(d.max_roll.valor))}°` : '')}<span class="cifra-sep">/</span>${salto(d.max_pitch, d.max_pitch ? `${uno(Math.abs(d.max_pitch.valor))}°` : '')}`, 'Máximo lateral / frontal', 'Pulsa un valor para verlo')
 ].join('');

 const filas = eventos.map(e => {
  const a = analizarEvento(e, mediciones), hora = horaDe(reloj, e.t_deteccion_ms);
  return `<li class="evento-sesion" data-tipo="${escape(e.tipo)}" data-id="${escape(e.id)}">
   <button type="button" class="evento-salto" data-evento="${escape(e.id)}" aria-label="Ver ${escape(NOMBRE_TIPO[e.tipo] ?? e.tipo)} de las ${escape(hora == null ? `${seconds(e.t_deteccion_ms)} s` : textoHora(hora))} en las gráficas">
    <span class="evento-cabeza"><span class="chip-evento" data-tipo="${escape(e.tipo)}">${escape(NOMBRE_TIPO[e.tipo] ?? e.tipo)}</span><span class="mono evento-hora">${hora == null ? `${seconds(e.t_deteccion_ms)} s` : escape(textoHora(hora))}</span></span>
    <span class="evento-frase">${escape(a.frase)}</span>
   </button>
   <button type="button" class="text-button small" data-exportar-evento="${escape(e.id)}">${icono('exportar')}Exportar solo este evento</button></li>`;
 }).join('');

 const rueda = resumenRueda(mediciones);
 const ms = v => v == null ? SIN_MEDIR : textoDuracion(v);
 const datoRueda = (etiqueta, valor) => `<div class="dato-rueda"><span>${etiqueta}</span><strong>${valor}</strong></div>`;
 const estadisticasRueda = rueda.con_dato ? `<div class="datos-rueda">
   ${datoRueda('Vueltas', escape(uno(rueda.vueltas)))}
   ${datoRueda('Pulsos', rueda.pulsos == null ? SIN_MEDIR : rueda.pulsos.toLocaleString('es-EC'))}
   ${datoRueda('Máximo', rueda.maximo_rps ? `${escape(uno(rueda.maximo_rps.valor))} vueltas/s` : SIN_MEDIR)}
   ${datoRueda('Girando', escape(ms(rueda.t_girando_ms)))}
   ${datoRueda('Detenida', escape(ms(rueda.t_detenida_ms)))}
   ${datoRueda('Distancia', rueda.distancia_m == null ? 'sin medir' : `${escape(uno(rueda.distancia_m))} m`)}
  </div><p class="grafica-nota">${NOMBRE_RUEDA} (${POSICION_RUEDA_SENSOR}) · ${PULSOS_POR_VUELTA} ${PULSOS_POR_VUELTA === 1 ? 'pulso' : 'pulsos'} por vuelta · fuente: ${escape(rueda.fuente)}${rueda.distancia_m == null ? ' · distancia sin medir: falta el diámetro de la rueda' : ''}.</p>`
  : '<p class="vacio">Ninguna medición trae datos de la rueda.</p>';

 const tab = (id, texto, activa) => `<button type="button" role="tab" id="ds-tab-${id}" aria-controls="ds-panel-${id}" aria-selected="${activa}" tabindex="${activa ? 0 : -1}">${texto}</button>`;
 $('#ds-cuerpo').innerHTML = `<section class="cifras-sesion" aria-label="Datos generales">${tarjetas}</section>
  <div class="sesion-rejilla">
  <section class="tarjeta sesion-graficas" aria-labelledby="ds-t-graficas" id="ds-graficas">
   <header class="tarjeta-cabecera"><h2 id="ds-t-graficas" class="sr-only">Gráficas de toda la sesión</h2>
    <div class="segmentado pestanas" role="tablist" aria-label="Gráficas">${tab('principal', 'Inclinación y aceleración', true)}${tab('rueda', 'Rueda (Hall)', false)}${tab('ejes', 'Ejes (g)', false)}</div>
    <div class="zoom"><button type="button" class="secondary small icon-button" id="ds-atras" aria-label="Tramo anterior">←</button>
     <div class="segmentado" id="ds-rango" role="group" aria-label="Rango de tiempo">${RANGOS.map(([v, t]) => `<button type="button" data-rango="${v}" aria-pressed="${v === 'sesion'}">${t}</button>`).join('')}</div>
     <button type="button" class="secondary small icon-button" id="ds-adelante" aria-label="Tramo siguiente">→</button></div>
   </header>
   <p class="ayuda" id="ds-vista" aria-live="polite"></p>
   <div role="tabpanel" id="ds-panel-principal" aria-labelledby="ds-tab-principal" class="ds-panel">${htmlGraficas('ds-', {valores: 'Máximo en la vista'})}</div>
   <div role="tabpanel" id="ds-panel-rueda" aria-labelledby="ds-tab-rueda" class="ds-panel" hidden>${htmlGraficasTecnicas('ds-', {valores: 'En la vista', ejes: false})}${estadisticasRueda}</div>
   <div role="tabpanel" id="ds-panel-ejes" aria-labelledby="ds-tab-ejes" class="ds-panel" hidden>${htmlGraficasTecnicas('ds-', {valores: 'En la vista', rueda: false, enG: true})}</div>
   <output class="lectura-tecnica" id="ds-lectura"></output>
   <p class="grafica-nota">Arrastra sobre una gráfica para acercar ese tramo. Hasta ${MAX_PUNTOS.toLocaleString('es-EC')} puntos por vista, sin suavizado y conservando el mayor golpe y los ángulos extremos de cada tramo.</p>
  </section>
  <section class="tarjeta sesion-eventos" aria-labelledby="ds-t-eventos"><header class="tarjeta-cabecera"><h2 id="ds-t-eventos">Eventos <span class="chip">${eventos.length}</span></h2></header>
   ${eventos.length ? `<ol class="eventos-sesion">${filas}</ol>` : '<p class="vacio">El carro no guardó eventos en esta sesión.</p>'}</section>
  </div>
  <section class="tarjeta sesion-postura" aria-labelledby="ds-t-postura" id="ds-postura">
   <header class="tarjeta-cabecera"><div><h2 id="ds-t-postura">Postura durante la sesión</h2><p class="ayuda">X adelante · Y izquierda · Z arriba · cada punto es el eje «arriba» del carro</p></div>
    <div class="postura-controles"><div class="segmentado" role="group" aria-label="Tipo de gráfica"><button type="button" data-vista-postura="2d" aria-pressed="false">2D</button><button type="button" data-vista-postura="3d" aria-pressed="true">3D</button></div>
     <div class="segmentado" role="group" aria-label="Vista de la cámara" id="ds-camaras">${[['frontal', 'Frontal'], ['lateral', 'Lateral'], ['arriba', 'Arriba'], ['3d', '3D']].map(([v, t]) => `<button type="button" data-camara="${v}" aria-pressed="${v === '3d'}">${t}</button>`).join('')}</div>
     <button type="button" class="secondary small" id="ds-descargar-postura" disabled>${icono('imagen')}Descargar imagen</button></div></header>
   <div class="postura" id="ds-postura-lienzo"><p class="ayuda" role="status">La gráfica se prepara al llegar aquí…</p></div>
   <div class="postura-leyenda" aria-hidden="true"><span><i class="degradado-tiempo"></i>Inicio → fin de la sesión</span><span><i class="cuadro-zona"></i>Zona normal ±${ZONA_NORMAL_DEG}°</span>
    <span><i class="punto-ev" data-tipo="inclinacion"></i>Inclinación</span><span><i class="punto-ev" data-tipo="golpe"></i>Golpe</span><span><i class="punto-ev" data-tipo="vuelco"></i>Vuelco</span>
    <span><i class="linea-ev" style="background:var(--serie-roll)"></i>Lateral</span><span><i class="linea-ev" style="background:var(--serie-pitch)"></i>Frontal (evento elegido)</span></div>
  </section>`;

 // Vueltas acumuladas con todas las muestras, para que el total no cambie con el zoom.
 const acumuladas = vueltasAcumuladas(mediciones);
 const conVueltas = mediciones.map((m, i) => ({...m, vueltas_acum: acumuladas[i]}));
 const t0 = mediciones[0].t_ms, t1 = Math.max(mediciones.at(-1).t_ms, t0 + 1);
 const fijos = eventos.map(e => e.t_deteccion_ms);
 const vista = {desde: t0, hasta: t1, cursor: null};

 const g = crearGraficas('ds-', {ejesEnG: true, onClick(_e, puntos, chart) {
  if (!puntos.length) return;
  vista.cursor = chart.data.datasets[puntos[0].datasetIndex].data[puntos[0].index].x;
  moverCursor(g, vista.cursor); leer(vista.cursor);
 }});
 app.charts = g.todas;
 const soltarZoom = zoomArrastrando(g, (a, b) => mostrar(a, b));
 let postura = null, observador = null;
 app.alSalir = () => { soltarZoom(); observador?.disconnect(); postura?.destroy(); };

 function leer(t) {
  const m = mediciones[Math.min(mediciones.length - 1, indiceDesde(mediciones, t))];
  const hora = horaDe(reloj, m.t_ms);
  $('#ds-lectura').innerHTML = `<strong>Lectura a ${seconds(m.t_ms)} s${hora == null ? '' : ` · <span class="mono">${escape(textoHora(hora))}</span>`}</strong>
   <span>Lateral ${uno(m.roll_deg)}° · Frontal ${uno(m.pitch_deg)}° · Aceleración total ${uno(aceleracionTotal(m))} m/s² (${uno(aceleracionTotal(m) / GRAVEDAD)} g)</span>
   <span>Muestra ${m.numero} · rueda ${m.rueda_pulsos == null ? 'sin dato' : m.rueda_pulsos + ' pulsos'}</span>`;
 }

 function mostrar(desde, hasta, cursor = vista.cursor) {
  if (hasta - desde < ZOOM_MINIMO_MS) { const c = (desde + hasta) / 2; desde = c - ZOOM_MINIMO_MS / 2; hasta = c + ZOOM_MINIMO_MS / 2; }
  vista.desde = Math.max(t0, desde); vista.hasta = Math.min(t1, hasta); vista.cursor = cursor;
  const puntos = reducirMediciones(conVueltas, {desde: vista.desde, hasta: vista.hasta, maxPuntos: MAX_PUNTOS, fijos});
  const r = actualizarGraficas(g, {mediciones: puntos, eventos, desde: vista.desde, hasta: vista.hasta, cursor, reducidas: true, reloj});
  // Valores del encabezado: máximos dentro de la vista (con todas las muestras, no solo las dibujadas).
  const i0 = indiceDesde(mediciones, vista.desde), i1 = indiceDesde(mediciones, vista.hasta + 1);
  let roll = 0, pitch = 0, total = 0, ejeMax = 0;
  for (let i = i0; i < i1; i++) { const m = mediciones[i]; roll = Math.max(roll, Math.abs(m.roll_deg)); pitch = Math.max(pitch, Math.abs(m.pitch_deg)); total = Math.max(total, aceleracionTotal(m)); ejeMax = Math.max(ejeMax, Math.abs(m.ax), Math.abs(m.ay), Math.abs(m.az)); }
  const enVista = i1 - i0;
  $('#ds-valor-inclinacion').textContent = enVista ? `${uno(roll)}° · ${uno(pitch)}°` : '—';
  $('#ds-valor-golpe').textContent = enVista ? `${uno(total)} m/s²` : '—';
  $('#ds-valor-rueda').textContent = !r.conRueda ? 'Sin dato' : enVista ? `${uno(acumuladas[i1 - 1] - (i0 ? acumuladas[i0 - 1] : 0))} vueltas` : '—';
  $('#ds-valor-ejes').textContent = enVista ? `máx. ${uno(ejeMax / GRAVEDAD)} g` : '—';
  $('#ds-graph-summary').textContent = `Máximo en la vista: lateral ${uno(roll)}°, frontal ${uno(pitch)}°.`;
  const completa = vista.desde <= t0 && vista.hasta >= t1;
  const hora = x => { const h = horaDe(reloj, x); return h == null ? `${seconds(x)} s` : textoHora(h); };
  $('#ds-vista').textContent = `${completa ? 'Toda la sesión' : 'Vista'}: ${hora(vista.desde)} – ${hora(vista.hasta)} · ${enVista.toLocaleString('es-EC')} mediciones, ${puntos.filter(m => m.t_ms >= vista.desde && m.t_ms <= vista.hasta).length.toLocaleString('es-EC')} dibujadas`;
  const ancho = vista.hasta - vista.desde;
  for (const b of document.querySelectorAll('[data-rango]')) b.setAttribute('aria-pressed', String(b.dataset.rango === 'sesion' ? completa : !completa && Math.abs(Number(b.dataset.rango) - ancho) < 1));
  $('#ds-atras').disabled = vista.desde <= t0;
  $('#ds-adelante').disabled = vista.hasta >= t1;
 }
 const centrar = (ancho, c = vista.cursor ?? (vista.desde + vista.hasta) / 2) => {
  if (ancho >= t1 - t0) { mostrar(t0, t1); return; }
  let desde = c - ancho / 2, hasta = c + ancho / 2;
  if (desde < t0) { hasta += t0 - desde; desde = t0; }
  if (hasta > t1) { desde -= hasta - t1; hasta = t1; }
  mostrar(desde, hasta);
 };
 $('#ds-rango').onclick = e => { const b = e.target.closest('[data-rango]'); if (!b) return; if (b.dataset.rango === 'sesion') mostrar(t0, t1, null); else centrar(Number(b.dataset.rango)); };
 const desplazar = f => { const ancho = vista.hasta - vista.desde; centrar(ancho, (vista.desde + vista.hasta) / 2 + ancho * f); };
 $('#ds-atras').onclick = () => desplazar(-.5);
 $('#ds-adelante').onclick = () => desplazar(.5);
 // Pestañas (flechas izquierda/derecha para moverse entre ellas).
 const tabs = [...document.querySelectorAll('#ds-graficas [role=tab]')];
 const activar = b => { for (const x of tabs) { const si = x === b; x.setAttribute('aria-selected', String(si)); x.setAttribute('aria-pressed', String(si)); x.tabIndex = si ? 0 : -1; $('#' + x.getAttribute('aria-controls')).hidden = !si; } };
 tabs.forEach((b, i) => { b.setAttribute('aria-pressed', String(i === 0)); b.onclick = () => activar(b); b.onkeydown = e => { const k = {ArrowRight: 1, ArrowLeft: -1}[e.key]; if (!k) return; const n = tabs[(i + k + tabs.length) % tabs.length]; activar(n); n.focus(); }; });

 const irA = (desde, hasta, cursor) => {
  mostrar(desde, hasta, cursor); leer(cursor);
  $('#ds-graficas').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
 };
 document.querySelectorAll('.evento-salto').forEach(b => b.onclick = () => {
  const e = eventos.find(x => x.id === b.dataset.evento);
  document.querySelectorAll('.evento-sesion').forEach(li => li.classList.toggle('elegido', li.dataset.id === e.id));
  postura?.elegir(e.id);
  irA(e.t_inicio_ms - VENTANA_EVENTO_MS, e.t_fin_ms + VENTANA_EVENTO_MS, e.t_deteccion_ms);
 });
 document.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => {
  const x = Number(b.dataset.ir);
  irA(x - 5000, x + 5000, x);
 });
 // El paquete del evento se arma con las mediciones ya cargadas: su ventana guardada.
 document.querySelectorAll('[data-exportar-evento]').forEach(b => b.onclick = () => {
  const e = eventos.find(x => x.id === b.dataset.exportarEvento);
  if (!e) { toast('No se encontró el evento.'); return; }
  const ventana = mediciones.filter(m => m.t_ms >= e.t_inicio_ms && m.t_ms <= e.t_fin_ms);
  openExport({version: 1, sesion, evento: e, mediciones: ventana});
 });
 mostrar(t0, t1, null);

 // Postura 3D/2D: el módulo se carga cuando la tarjeta se acerca a la pantalla.
 let cargando = null;
 const cargarPostura = () => cargando ??= (async () => {
  observador?.disconnect(); observador = null;
  const {crearPostura} = await import('../postura3d.js');
  if (app.page !== 'sesion' || !$('#ds-postura-lienzo')) return;
  postura = crearPostura($('#ds-postura-lienzo'), {mediciones, eventos, reloj});
  $('#ds-descargar-postura').disabled = false;
  if (!postura.webgl) { document.querySelector('[data-vista-postura="3d"]').disabled = true; modo('2d'); }
 })();
 const modo = m => {
  for (const b of document.querySelectorAll('[data-vista-postura]')) b.setAttribute('aria-pressed', String(b.dataset.vistaPostura === m));
  $('#ds-camaras').hidden = m === '2d';
  postura?.modo(m);
 };
 document.querySelectorAll('[data-vista-postura]').forEach(b => b.onclick = async () => { await cargarPostura(); modo(b.dataset.vistaPostura); });
 $('#ds-camaras').onclick = e => {
  const b = e.target.closest('[data-camara]'); if (!b || !postura) return;
  for (const x of $('#ds-camaras').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
  postura.vista(b.dataset.camara);
 };
 $('#ds-descargar-postura').onclick = () => postura?.descargar(sesion.id);
 observador = new IntersectionObserver(entradas => { if (entradas.some(x => x.isIntersecting)) cargarPostura(); }, {rootMargin: '200px'});
 observador.observe($('#ds-postura'));
}
