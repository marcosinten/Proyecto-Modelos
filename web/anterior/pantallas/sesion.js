// Pantalla Detalle de sesión (#sesion/<id>): datos generales, eventos con su frase, gráficas de toda la
// sesión con zoom y un único botón «Exportar sesión» (libro completo: resumen + datos técnicos).
// Las gráficas dibujan como mucho ~1500 mediciones por vista (compartido/detalle-sesion.js): se conservan
// los picos de aceleración y de ángulo de cada tramo, así un golpe nunca desaparece al alejar el zoom.
import {app, $, escape, seconds, toast} from '../app.js';
import {cargarSesionCompleta, exportarSesion, openExport} from './exportar.js';
import {historialSesion} from './historial.js';
import {htmlGraficas, crearGraficas, actualizarGraficas, moverCursor, zoomArrastrando, vueltasAcumuladas} from '../graficas.js';
import {datosGenerales, tarjetasSesion, reducirMediciones, indiceDesde} from '../../../compartido/detalle-sesion.js';
import {analizarEvento, horaDe, NOMBRE_TIPO, aceleracionTotal, SIN_MEDIR} from '../../../compartido/exportacion.js';
import {textoHora, NOTA_HORA} from '../../../compartido/hora.js';

const MAX_PUNTOS = 1500;           // mediciones dibujadas por vista
const VENTANA_EVENTO_MS = 2000;    // margen alrededor de la ventana del evento al saltar a él
const ZOOM_MINIMO_MS = 500;
const uno = v => v.toLocaleString('es-EC', {minimumFractionDigits: 1, maximumFractionDigits: 1});

export function renderSesion(id) {
 const generacion = app.liveGeneration;
 const vigente = () => generacion === app.liveGeneration && app.page === 'sesion';
 $('#main').innerHTML = `<div class="detalle-sesion"><a class="back" href="#historial">Volver al historial</a>
  <div class="page-heading"><div><h1>Sesión ${escape(id)}</h1><p id="ds-subtitulo">Cargando la sesión…</p></div>
   <div class="page-actions"><button type="button" class="secondary" id="ds-tabla">Tabla de mediciones</button><button type="button" class="primary" id="ds-exportar" disabled>Exportar sesión</button></div></div>
  <div id="ds-cuerpo"><section class="bloque"><p role="status" id="ds-progreso">Consultando la API…</p></section></div></div>`;
 $('#ds-tabla').onclick = () => historialSesion(id);
 cargarSesionCompleta(id, {alAvanzar(n, total) {
  if (vigente() && total) $('#ds-progreso').textContent = `Cargando mediciones: ${n.toLocaleString('es-EC')} de ${total.toLocaleString('es-EC')}…`;
 }}).then(paquete => { if (vigente()) pintar(paquete); })
  .catch(e => { if (vigente()) $('#ds-cuerpo').innerHTML = `<section class="bloque"><p class="vacio" role="alert">No se pudo cargar la sesión: ${escape(e.message)}</p></section>`; });
}

function pintar(paquete) {
 const {sesion, mediciones, eventos, reloj} = paquete;
 eventos.sort((a, b) => a.t_deteccion_ms - b.t_deteccion_ms);
 const d = datosGenerales(paquete);
 $('#ds-subtitulo').innerHTML = `<span class="badge ${sesion.origen === 'real' ? 'neutral' : 'purple'}">${sesion.origen === 'real' ? 'Datos reales' : 'Datos simulados'}</span> Todas las mediciones guardadas de la sesión.`;
 const exportar = $('#ds-exportar');
 exportar.disabled = !mediciones.length;
 exportar.title = 'Un solo Excel con el resumen y los datos técnicos de todas las muestras';
 exportar.onclick = () => exportarSesion(paquete, exportar);
 if (!mediciones.length) {
  $('#ds-cuerpo').innerHTML = '<section class="bloque"><p class="vacio">Esta sesión no tiene mediciones guardadas.</p></section>';
  return;
 }

 const tarjetas = tarjetasSesion(d).map(t => {
  const cuerpo = `<span class="rotulo">${escape(t.titulo)}</span><strong>${escape(t.valor)}</strong><small>${escape(t.detalle)}</small>`;
  return t.t_ms == null ? `<div class="tarjeta" data-id="${t.id}">${cuerpo}</div>`
   : `<button type="button" class="tarjeta" data-id="${t.id}" data-ir="${t.t_ms}" title="Ver este instante en las gráficas">${cuerpo}</button>`;
 }).join('');

 const filas = eventos.map(e => {
  const a = analizarEvento(e, mediciones), hora = horaDe(reloj, e.t_deteccion_ms);
  return `<li class="evento evento-sesion" data-tipo="${escape(e.tipo)}">
   <button type="button" class="evento-salto" data-evento="${escape(e.id)}" aria-label="Ver ${escape(NOMBRE_TIPO[e.tipo] ?? e.tipo)} de las ${escape(hora == null ? `${seconds(e.t_deteccion_ms)} s` : textoHora(hora))} en las gráficas">
    <span class="evento-hora mono">${hora == null ? SIN_MEDIR : escape(textoHora(hora))}<small>${seconds(e.t_deteccion_ms)} s</small></span>
    <span class="evento-tipo">${escape(NOMBRE_TIPO[e.tipo] ?? e.tipo)}</span>
    <span class="evento-texto"><strong>${escape(a.frase)}</strong><small>${escape(e.id)} · respuesta de la alarma ${a.respuesta_ms == null ? SIN_MEDIR : a.respuesta_ms + ' ms'}</small></span>
   </button>
   <div class="evento-acciones"><button type="button" class="secondary small" data-exportar-evento="${escape(e.id)}">Exportar solo este evento</button></div></li>`;
 }).join('');

 $('#ds-cuerpo').innerHTML = `<section class="tarjetas" aria-label="Datos generales">${tarjetas}</section>
  <p class="grafica-nota">Horas ${NOTA_HORA}, reconstruidas con el reloj de la API. Las tarjetas con un instante te llevan a ese punto de las gráficas.</p>
  <section class="bloque" aria-labelledby="ds-t-eventos"><header class="bloque-cabecera"><h2 id="ds-t-eventos">Eventos de la sesión (${eventos.length})</h2></header>
   ${eventos.length ? `<ol class="eventos-lista">${filas}</ol><p class="grafica-nota">Pulsa un evento para verlo en las gráficas.</p>` : '<p class="vacio">El carro no guardó eventos en esta sesión.</p>'}</section>
  <section class="bloque" aria-labelledby="ds-t-graficas" id="ds-graficas">
   <header class="bloque-cabecera"><h2 id="ds-t-graficas">Gráficas de toda la sesión</h2>
    <div class="zoom" role="group" aria-label="Zoom de las gráficas"><button type="button" class="secondary small" id="ds-acercar">Acercar</button><button type="button" class="secondary small" id="ds-alejar">Alejar</button><button type="button" class="secondary small" id="ds-todo">Ver toda la sesión</button></div></header>
   <p class="grafica-nota" id="ds-vista" aria-live="polite"></p>
   ${htmlGraficas('ds-', {valores: 'Máximo en la vista'})}
   <output class="lectura-tecnica" id="ds-lectura"></output>
   <p class="grafica-nota">Arrastra sobre una gráfica para acercar ese tramo; pulsa un punto para leer sus valores. Para dibujar rápido se muestran como mucho ${MAX_PUNTOS.toLocaleString('es-EC')} mediciones por vista, conservando en cada tramo el mayor golpe y los ángulos extremos. Sin suavizado.</p>
  </section>`;

 // Vueltas acumuladas con todas las muestras, para que el total no cambie con el zoom.
 const acumuladas = vueltasAcumuladas(mediciones);
 const conVueltas = mediciones.map((m, i) => ({...m, vueltas_acum: acumuladas[i]}));
 const t0 = mediciones[0].t_ms, t1 = Math.max(mediciones.at(-1).t_ms, t0 + 1);
 const fijos = eventos.map(e => e.t_deteccion_ms);
 const vista = {desde: t0, hasta: t1, cursor: null};

 const g = crearGraficas('ds-', {onClick(_e, puntos, chart) {
  if (!puntos.length) return;
  vista.cursor = chart.data.datasets[puntos[0].datasetIndex].data[puntos[0].index].x;
  moverCursor(g, vista.cursor); leer(vista.cursor);
 }});
 app.charts = g.todas;
 const soltarZoom = zoomArrastrando(g, (a, b) => mostrar(a, b));
 app.alSalir = soltarZoom;

 function leer(t) {
  const m = mediciones[Math.min(mediciones.length - 1, indiceDesde(mediciones, t))];
  const hora = horaDe(reloj, m.t_ms);
  $('#ds-lectura').innerHTML = `<strong>Lectura a ${seconds(m.t_ms)} s${hora == null ? '' : ` · ${escape(textoHora(hora))}`}</strong>
   <span>Lateral ${uno(m.roll_deg)}° · Frontal ${uno(m.pitch_deg)}° · Aceleración total ${uno(aceleracionTotal(m))} m/s²</span>
   <span>Muestra ${m.numero} · rueda ${m.rueda_pulsos == null ? 'sin dato' : m.rueda_pulsos + ' pulsos'}</span>`;
 }

 function mostrar(desde, hasta, cursor = vista.cursor) {
  if (hasta - desde < ZOOM_MINIMO_MS) { const c = (desde + hasta) / 2; desde = c - ZOOM_MINIMO_MS / 2; hasta = c + ZOOM_MINIMO_MS / 2; }
  vista.desde = Math.max(t0, desde); vista.hasta = Math.min(t1, hasta); vista.cursor = cursor;
  const puntos = reducirMediciones(conVueltas, {desde: vista.desde, hasta: vista.hasta, maxPuntos: MAX_PUNTOS, fijos});
  const r = actualizarGraficas(g, {mediciones: puntos, eventos, desde: vista.desde, hasta: vista.hasta, cursor, reducidas: true});
  // Valores del encabezado: máximos dentro de la vista (con todas las muestras, no solo las dibujadas).
  const i0 = indiceDesde(mediciones, vista.desde), i1 = indiceDesde(mediciones, vista.hasta + 1);
  let roll = 0, pitch = 0, total = 0;
  for (let i = i0; i < i1; i++) { const m = mediciones[i]; roll = Math.max(roll, Math.abs(m.roll_deg)); pitch = Math.max(pitch, Math.abs(m.pitch_deg)); total = Math.max(total, aceleracionTotal(m)); }
  const enVista = i1 - i0;
  $('#ds-valor-inclinacion').textContent = enVista ? `${uno(roll)}° · ${uno(pitch)}°` : '—';
  $('#ds-valor-golpe').textContent = enVista ? `${uno(total)} m/s²` : '—';
  $('#ds-valor-rueda').textContent = !r.conRueda ? 'Sin dato' : enVista ? `${uno(acumuladas[i1 - 1] - (i0 ? acumuladas[i0 - 1] : 0))} vueltas` : '—';
  $('#ds-graph-summary').textContent = 'Lateral (línea continua) y frontal (discontinua), sin suavizar.';
  const completa = vista.desde <= t0 && vista.hasta >= t1;
  $('#ds-vista').textContent = `${completa ? 'Toda la sesión' : 'Vista'}: ${seconds(vista.desde)} s – ${seconds(vista.hasta)} s de ${seconds(t1)} s · ${enVista.toLocaleString('es-EC')} mediciones en la vista, ${puntos.filter(m => m.t_ms >= vista.desde && m.t_ms <= vista.hasta).length.toLocaleString('es-EC')} dibujadas.`;
  $('#ds-todo').disabled = completa;
  $('#ds-alejar').disabled = completa;
  $('#ds-acercar').disabled = vista.hasta - vista.desde <= ZOOM_MINIMO_MS;
 }
 const escalar = f => {
  const c = vista.cursor ?? (vista.desde + vista.hasta) / 2, ancho = (vista.hasta - vista.desde) * f;
  let desde = c - ancho / 2, hasta = c + ancho / 2;
  if (desde < t0) { hasta += t0 - desde; desde = t0; }
  if (hasta > t1) { desde -= hasta - t1; hasta = t1; }
  mostrar(desde, hasta);
 };
 $('#ds-acercar').onclick = () => escalar(0.5);
 $('#ds-alejar').onclick = () => escalar(2);
 $('#ds-todo').onclick = () => mostrar(t0, t1, null);
 const irA = (desde, hasta, cursor) => {
  mostrar(desde, hasta, cursor); leer(cursor);
  $('#ds-graficas').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
 };

 document.querySelectorAll('.evento-salto').forEach(b => b.onclick = () => {
  const e = eventos.find(x => x.id === b.dataset.evento);
  irA(e.t_inicio_ms - VENTANA_EVENTO_MS, e.t_fin_ms + VENTANA_EVENTO_MS, e.t_deteccion_ms);
 });
 document.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => {
  const t = Number(b.dataset.ir);
  irA(t - 5000, t + 5000, t);
 });
 // El paquete del evento se arma con las mediciones ya cargadas: su ventana guardada.
 document.querySelectorAll('[data-exportar-evento]').forEach(b => b.onclick = () => {
  const e = eventos.find(x => x.id === b.dataset.exportarEvento);
  if (!e) { toast('No se encontró el evento.'); return; }
  const ventana = mediciones.filter(m => m.t_ms >= e.t_inicio_ms && m.t_ms <= e.t_fin_ms);
  openExport({version: 1, sesion, evento: e, mediciones: ventana});
 });
 mostrar(t0, t1, null);
}
