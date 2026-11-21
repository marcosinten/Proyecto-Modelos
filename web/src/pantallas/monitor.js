// Pantalla Monitor (Demostración y En vivo), Detalle de un evento y tablero de Simulación.
// Orden de importancia: estado del carro y conexión; modelo 3D; tres lecturas grandes; gráficas;
// eventos de la sesión; acciones. Lo técnico (ejes X/Y/Z, tabla, protocolo) va plegado al final.
import {app, $, number, escape, label, seconds, get, toast} from '../app.js';
import {crearVisor} from '../car.js';
import {buscarSesiones} from '../selector.js';
import {vueltasEntre} from '../telemetria.js';
import {PULSOS_POR_VUELTA, POSICION_RUEDA_SENSOR, NOMBRE_RUEDA, distanciaM, CONSTANTES_INO} from '../../../compartido/parametros-firmware.js';
import {analizarEvento, direccionRoll, direccionPitch, NOMBRE_TIPO} from '../../../compartido/exportacion.js';
import {htmlGraficas, htmlGraficasTecnicas, crearGraficas, actualizarGraficas, moverCursor, modoPresentacion} from '../graficas.js';
import {icono} from '../iconos.js';
import {PAUSA_MS, VENTANA_CONECTABLE_MS} from '../telemetria.js';
import {horaDe} from '../../../compartido/exportacion.js';
import {textoHora} from '../../../compartido/hora.js';
import {activarPresentacion} from './presentacion.js';
import {estadoCarro} from '../estado-carro.js';
import {bindRows, tablaMediciones, historialSesion} from './historial.js';
import {openExport, descargar} from './exportar.js';
import {simulationForm, bindSimulation} from './simulacion.js';
import {connectLive} from './vivo.js';

const uno = v => v.toLocaleString('es-EC', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const dos = v => v.toLocaleString('es-EC', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const ATRIBUCION = 'Modelo 3D: <a href="https://sketchfab.com/3d-models/oldsmobile-cutlass-supreme-sedan-71-78f76d386a4341b0b71745bdc50fd5ab" target="_blank" rel="noopener noreferrer">Barbo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> · adaptado al visor';

function lectura(serie, ic, titulo, id, idDetalle, extra = '') {
 return `<div class="tarjeta lectura" data-serie="${serie}"><div class="lectura-cabecera"><span class="lectura-icono">${icono(ic)}</span><span class="etiqueta-tarjeta">${titulo}</span></div><strong id="${id}">—</strong><span class="lectura-detalle" id="${idDetalle}"></span>${extra}</div>`;
}
function tecnico(nombre, id, unidad) {
 return `<div class="dato"><span>${nombre}</span><strong id="${id}">—</strong><small>${unidad}</small></div>`;
}
const RANGOS = [['6', '6 s'], ['30', '30 s'], ['120', '2 min'], ['sesion', 'Sesión']];
export const RANGO_INICIAL = '6';   // el más liviano en vivo (300 muestras); 30 s redibuja 1500 puntos por consulta
export const segundosRango = v => v === 'sesion' ? Infinity : Number(v);

// Tablero de En vivo, Detalle de un evento y Simulación. La rejilla de 12 columnas se reordena con CSS en
// pantalla completa (body.presentacion): barra superior, 3D + gráficas, franja de lecturas.
export function dashboard() {
 return `<div class="tablero">
  <section class="tarjeta t-estado" aria-label="Estado del carro">
   <span class="etiqueta-tarjeta">Estado del carro</span>
   <div class="chip-estado" id="estado-carro" data-estado="sin-datos" aria-live="polite"><span id="estado-icono">${icono('sin-datos')}</span><strong id="estado-texto">—</strong></div>
   <p class="estado-detalle" id="estado-detalle"></p>
  </section>
  <section class="tarjeta t-conexion" aria-label="Conexión y sesión">
   <div class="tarjeta-cabecera"><span class="etiqueta-tarjeta">Conexión y sesión</span><span class="chip" id="origin">Datos simulados</span></div>
   <div class="conexion-linea"><span class="punto" id="conexion-punto" data-estado="demo"></span><strong id="conexion-texto">—</strong></div>
   <div class="sesion-linea"><code id="sesion-actual" hidden></code><button type="button" class="text-button small" id="copiar-sesion" hidden>${icono('copiar')}Copiar</button><button type="button" class="secondary small" id="cambiar-sesion" hidden>Cambiar sesión</button></div>
   <div class="conexion-meta"><span class="ayuda" id="mode-help"></span></div>
  </section>
  <section class="tarjeta t-ultimo" aria-labelledby="t-ultimo"><span class="etiqueta-tarjeta" id="t-ultimo">Último evento</span><div id="ultimo-evento" class="ultimo"></div></section>
  <section class="tarjeta t-escena" aria-label="Modelo 3D del carro">
   <div class="escena-cabecera"><div class="escena-titulo"><span class="etiqueta-tarjeta" id="escena-nombre">Vista 3D</span><span class="mono" id="sample-time"></span></div>
    <div class="segmentado camera-controls" role="group" aria-label="Cámara"><button type="button" data-camera="seguimiento" class="selected" aria-pressed="true">Seguimiento</button><button type="button" data-camera="lateral" aria-pressed="false">Lateral</button><button type="button" data-camera="frontal" aria-pressed="false">Frontal</button><button type="button" data-camera="libre" aria-pressed="false" title="Arrastra para girar; rueda o pellizco para acercar">Libre</button></div></div>
   <div class="escena-extra" id="escena-extra"></div>
   <div class="stage"><div id="car"></div><span class="axis-guide">X adelante · Y izquierda · Z arriba</span></div>
   <div class="player"><button type="button" id="play" class="primary small">Reproducir</button><button type="button" id="reset" class="secondary small">Volver al inicio</button>
    <label class="speed">Ritmo <select id="speed"><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
    <span class="mono" id="clock"></span>
    <input id="timeline" type="range" aria-label="Tiempo de la sesión en milisegundos" step="1">
    <div class="timeline-labels"><span id="range-start"></span><span id="range-end"></span></div></div>
   <p class="atribucion">${ATRIBUCION}</p>
  </section>
  <section class="tarjeta t-graficas" aria-label="Gráficas">
   <div class="graficas-cabecera"><span class="etiqueta-tarjeta">Gráficas</span>
    <div class="segmentado" id="ventana" role="group" aria-label="Rango de tiempo de las gráficas" hidden>${RANGOS.map(([v, t]) => `<button type="button" data-ventana="${v}" aria-pressed="${v === RANGO_INICIAL}">${t}</button>`).join('')}</div></div>
   ${htmlGraficas('', {valores: 'Ahora'})}
  </section>
  <div class="t-lecturas" role="group" aria-label="Lecturas actuales">
   ${lectura('roll', 'lateral', 'Lateral', 'roll', 'roll-dir')}
   ${lectura('pitch', 'frontal', 'Frontal', 'pitch', 'pitch-dir')}
   ${lectura('total', 'aceleracion', 'Aceleración total', 'acel-total', 'acel-detalle')}
   ${lectura('rueda', 'rueda', 'Rueda', 'rueda-estado', 'wheel-info', '<span class="chip" id="rueda-chip"></span>')}
  </div>
  <button type="button" class="secondary t-salir" id="salir-presentacion">${icono('salir')}Salir</button>
 </div>
 <div class="avisos-evento" id="avisos-evento" role="status" aria-live="polite"></div>
 <section class="bloque recent" aria-labelledby="t-eventos">
  <header class="bloque-cabecera"><h2 id="t-eventos">Eventos</h2><a href="#historial">Ver historial</a></header>
  <div id="lista-eventos"></div>
 </section>
 <section class="bloque acciones" aria-label="Acciones">
  <button type="button" class="secondary" id="accion-sesion" hidden>Buscar sesiones</button>
  <button type="button" class="primary" id="accion-resumen">${icono('exportar')}Descargar resumen</button>
  <button type="button" class="secondary" id="accion-tecnico">Descargar datos técnicos</button>
  <button type="button" class="text-button" id="export">Qué contiene cada archivo</button>
 </section>
 <details class="bloque tecnico" id="detalle-tecnico"><summary>Detalle técnico</summary>
  ${htmlGraficasTecnicas('')}
  <div class="datos-tecnicos">${tecnico('Aceleración X', 'ax', 'm/s²')}${tecnico('Aceleración Y', 'ay', 'm/s²')}${tecnico('Aceleración Z', 'az', 'm/s²')}${tecnico('Roll', 'roll-raw', '°')}${tecnico('Pitch', 'pitch-raw', '°')}</div>
  <output id="graph-reading" class="lectura-tecnica" aria-label="Lectura seleccionada"></output>
  <div class="result-strip" id="result"></div><p class="ayuda" id="protocol" role="status"></p>
  <details class="data-table"><summary>Tabla de mediciones <span id="sample-count"></span></summary><div class="table-scroll" id="samples"></div></details>
 </details>`;
}

// Texto y punto de la conexión en vivo («Conexión activa · hace 0 s»).
export function ponerConexion(texto, estado) {
 $('#conexion-texto').textContent = texto.replace(/^Conexión: /, 'Conexión ');
 $('#conexion-punto').dataset.estado = estado;
}
export const estadoConexion = (ultimaMs, ahora) => ultimaMs == null ? 'desconectada'
  : ahora - ultimaMs <= PAUSA_MS ? 'activa' : ahora - ultimaMs <= VENTANA_CONECTABLE_MS ? 'atrasada' : 'desconectada';

// Hora del instante t de la sesión: hh:mm:ss con el reloj de la API (en vivo) o «12,3 s».
export const horaSesion = t => { const h = app.liveActive ? horaDe(app.reloj, t) : null; return h == null ? `${(t / 1000).toLocaleString('es-EC', {maximumFractionDigits: 1})} s` : textoHora(h); };

// Valor principal de un evento: ángulo máximo (inclinación, vuelco) o aceleración máxima (golpe).
export function valorEvento(e, mediciones) {
 const a = analizarEvento(e, mediciones);
 if (!a.mediciones) return {valor: null, detalle: 'sin mediciones en la ventana', a};
 if (e.tipo === 'golpe') return {valor: `${uno(a.aceleracion_max.valor)} m/s²`, detalle: 'aceleración total', a};
 return {valor: `${uno(Math.abs(a.angulo_max.valor))}°`, detalle: a.angulo_max.eje, a};
}

function pintarUltimo() {
 const caja = $('#ultimo-evento'); if (!caja) return;
 const e = app.current.evento;
 if (!e) { caja.innerHTML = `<p class="ultimo-vacio">${app.liveActive ? 'Sin eventos en esta sesión todavía.' : 'Sin evento en estos datos.'}</p>`; return; }
 const {valor, detalle} = valorEvento(e, app.current.mediciones);
 const guardado = app.liveActive || app.page === 'detalle';
 caja.innerHTML = `<div class="ultimo-linea"><span class="chip-evento" data-tipo="${escape(e.tipo)}">${escape(NOMBRE_TIPO[e.tipo] ?? e.tipo)}</span><span class="mono">${escape(horaSesion(e.t_deteccion_ms))}</span></div>
  <div class="ultimo-valor">${valor ?? '—'}<small>${escape(detalle)}</small></div>
  ${guardado ? `<div class="ultimo-acciones"><a class="text-button boton-enlace small" href="#explicar/${escape(e.id)}">Explicar</a>${app.liveActive ? `<a class="text-button boton-enlace small" href="#sesion/${encodeURIComponent(app.current.sesion.id)}">Ver sesión</a>` : ''}</div>` : ''}`;
}

export const start=()=>app.liveActive ? app.current.mediciones[0]?.t_ms??0 : app.current.evento?.t_inicio_ms??app.current.mediciones[0]?.t_ms??0;
export const end=()=>app.liveActive ? app.current.mediciones.at(-1)?.t_ms??1000 : app.current.evento?.t_fin_ms??app.current.mediciones.at(-1)?.t_ms??1000;

// Eventos de la sesión conectada (en vivo), el evento abierto (detalle), o los recientes (demostración).
export function pintarEventos() {
 pintarUltimo();
 const caja = $('#lista-eventos'); if (!caja) return;
 const enVivo = app.liveActive, detalle = app.page === 'detalle';
 $('#t-eventos').textContent = enVivo ? 'Eventos de esta sesión' : detalle ? 'Este evento' : app.page === 'simulacion' ? 'Resultado de la corrida' : 'Eventos recientes';
 let lista = enVivo ? app.events.filter(p => p.sesion?.id === app.current.sesion.id)
   : detalle || app.page === 'simulacion' ? (app.current.evento ? [{evento: app.current.evento, sesion: app.current.sesion}] : []) : app.events.slice(0, 3);
 if (!lista.length) {
  caja.innerHTML = `<p class="vacio">${enVivo ? 'Todavía no hay eventos guardados en esta sesión. Un evento aparece aquí cuando el carro lo cierra: 0,5 s después de que pasa la inclinación o el golpe, o a los 5 s como máximo.'
    : app.page === 'simulacion' ? 'Sin incidente en esta corrida. Puedes exportar las mediciones o probar otro escenario.' : 'No hay eventos guardados todavía. Conecta el carro en «En vivo» o guarda una corrida de Simulación.'}</p>`;
  return;
 }
 caja.innerHTML = `<ol class="eventos-lista">${lista.map(({evento: e, sesion: s}) => {
  // La frase solo se calcula si las mediciones del evento están en pantalla.
  const muestras = app.current.mediciones.filter(m => m.t_ms >= e.t_inicio_ms && m.t_ms <= e.t_fin_ms);
  const frase = muestras.length ? analizarEvento(e, app.current.mediciones).frase : '';
  const navegar = detalle || app.page === 'simulacion' ? '' : `<button class="text-button" data-event="${escape(e.id)}">Ver detalle</button>`;
  return `<li class="evento" data-tipo="${escape(e.tipo)}"><span><span class="chip-evento" data-tipo="${escape(e.tipo)}">${escape(NOMBRE_TIPO[e.tipo] ?? e.tipo)}</span></span>
   <div class="evento-texto"><strong>${escape(frase || `${NOMBRE_TIPO[e.tipo] ?? e.tipo} detectado a los ${seconds(e.t_deteccion_ms)} s de la sesión`)}</strong>
   <small><span class="mono">${escape(horaSesion(e.t_deteccion_ms))}</span> · ${escape(e.id)} · ${s?.origen === 'real' ? 'real' : 'simulado'} · respuesta de la alarma ${e.t_activacion_ms == null ? 'sin medir' : (e.t_activacion_ms - e.t_deteccion_ms) + ' ms'}</small></div>
   <div class="evento-acciones">${navegar}${app.page === 'simulacion' ? '' : `<button class="secondary small" data-explain="${escape(e.id)}" aria-label="Explicar evento ${escape(e.id)}">Explicar</button>`}</div></li>`;
 }).join('')}</ol>`;
 bindRows();
}

export function refreshData() {
 $('#timeline').min=start();$('#timeline').max=end();
 $('#range-start').textContent=seconds(start())+' s';$('#range-end').textContent=seconds(end())+' s';
 $('#sample-count').textContent=app.current.mediciones.length+' muestras';
 if(!app.liveActive||$('.data-table').open)$('#samples').innerHTML=tablaMediciones(app.current.mediciones.slice(-1000));
 const e=app.current.evento;
 app.impactTime = undefined;
 if (app.current.parametros?.escenario === 'impacto' || e?.tipo === 'golpe') {
  let peak = -Infinity;
  for (const m of app.current.mediciones) {
   const magnitude = Math.hypot(m.ax, m.ay, m.az);
   if (magnitude > peak) { peak = magnitude; app.impactTime = m.t_ms; }
  }
 }
 $('#result').innerHTML=e?`<div><strong>${escape(label[e.tipo]||e.tipo)} detectado</strong><small>Detección ${e.t_deteccion_ms} ms · activación ${e.t_activacion_ms??'sin medir'}${e.t_activacion_ms===null?'':' ms'} · gravedad ${escape(label[e.gravedad]??e.gravedad)}</small></div><div class="result-response"><strong>${e.t_activacion_ms===null?'—':e.t_activacion_ms-e.t_deteccion_ms+' ms'}</strong><small>Tiempo de respuesta</small></div><small>${e.ubicacion?escape(e.ubicacion.latitud+', '+e.ubicacion.longitud):'Sin ubicación disponible'}</small>`:'<div><strong>Sin incidente detectado</strong><small>Resultado de las reglas de esta corrida</small></div>';
 app.wheelTurnsBySample = [];
 let turns = 0;
 app.current.mediciones.forEach((m,i) => {
  turns += vueltasEntre(app.current.mediciones[i-1],m);
  app.wheelTurnsBySample.push(turns);
 });
 // La postura y los números tienen prioridad sobre preparar las series.
 update(false);
 if (app.graficas) {
  const eventos = app.current.eventos ?? (app.current.evento ? [app.current.evento] : []);
  const r = actualizarGraficas(app.graficas, {mediciones: app.current.mediciones, eventos, desde: start(), hasta: end(),
    cursor: app.liveActive ? null : app.position, umbralGolpe: app.current.parametros?.aceleracion, reloj: app.liveActive ? app.reloj : null});
  const max = app.current.mediciones.reduce((v,m)=>Math.max(v,Math.abs(m.roll_deg)),0);
  $('#graph-summary').textContent=app.current.mediciones.length?`Inclinación lateral máxima de ${max.toLocaleString('es-EC',{maximumFractionDigits:1})}° ${app.liveActive?'en la ventana':'en estas mediciones'}.`:'Sin mediciones todavía.';
  app.maxTotal = r.maxTotal;
 }
}

export function update(drawCharts=true){
 const m=app.current.mediciones.findLast(m=>m.t_ms<=app.position)??app.current.mediciones[0];if(!m)return;
 for(const key of ['ax','ay','az'])$('#'+key).textContent=number(m[key]);
 $('#roll-raw').textContent=number(m.roll_deg);$('#pitch-raw').textContent=number(m.pitch_deg);
 $('#roll').textContent=uno(m.roll_deg)+'°';$('#pitch').textContent=uno(m.pitch_deg)+'°';
 $('#roll-dir').textContent=Math.abs(m.roll_deg)<2?'sin inclinación lateral':direccionRoll(m.roll_deg);
 $('#pitch-dir').textContent=Math.abs(m.pitch_deg)<2?'sin inclinación frontal':direccionPitch(m.pitch_deg);
 $('#sample-time').textContent=Math.round(app.position)+' ms';$('#clock').textContent=dos(app.position/1000)+' / '+dos(end()/1000)+' s';
 $('#timeline').value=app.position;$('#play').textContent=app.running?'Pausar':'Reproducir';
 const sampleIndex = app.current.mediciones.indexOf(m);
 // Interpolate between samples so the wheel turns smoothly instead of jumping every 20 ms.
 const next = app.current.mediciones[sampleIndex + 1];
 const fraction = next && next.t_ms > m.t_ms ? Math.min(1, Math.max(0, (app.position - m.t_ms) / (next.t_ms - m.t_ms))) : 0;
 const turns = m.rueda_rps == null ? undefined
   : app.wheelTurnsBySample[sampleIndex] + (next?.rueda_rps != null ? (app.wheelTurnsBySample[sampleIndex + 1] - app.wheelTurnsBySample[sampleIndex]) * fraction : 0);
 const totalTurns = app.wheelTurnsBySample.at(-1);
 const avance = !app.liveActive && app.current.sesion.origen === 'simulado' && end() > start()
   ? turns != null ? (totalTurns > 0 ? turns / totalTurns : 0) : Math.min(1, Math.max(0, (app.position-start())/(end()-start())))
   : undefined;
 const elapsed = app.position - app.impactTime;
 const impact = avance != null && elapsed >= 0 && elapsed < 500
   ? -.48 * Math.sin(elapsed * Math.PI / 150) * (1 - elapsed / 500) ** 2
   : 0;
  app.viewer.update(m, avance, impact, app.liveActive ? app.liveTurns : turns, app.liveActive);
 const detected = app.current.evento && app.position >= app.current.evento.t_deteccion_ms;
 $('#protocol').textContent = detected
   ? app.current.sesion.origen === 'simulado'
     ? 'Protocolo simulado: encender LED, activar buzzer y levantar señal. Respuesta física pendiente de medir.'
     : app.current.evento.t_activacion_ms != null && app.position >= app.current.evento.t_activacion_ms
       ? 'El dispositivo registró la activación del protocolo de emergencia.'
       : 'Evento recibido. Activación del protocolo pendiente de confirmar por el dispositivo.'
   : 'Protocolo de emergencia en espera.';

 // Estado del carro (palabra grande; el color solo acompaña).
 const est = estadoCarro(app.current.mediciones, app.position, {umbralGolpe: app.current.parametros?.aceleracion});
 const estado = app.liveActive && app.stale ? 'sin-datos' : est.estado;
 if ($('#estado-carro').dataset.estado !== estado) { $('#estado-carro').dataset.estado = estado; $('#estado-icono').innerHTML = icono(estado); }
 $('#estado-texto').textContent = est.texto;
 $('#estado-detalle').textContent = app.liveActive && app.stale ? 'Último dato recibido; la conexión está atrasada' : est.detalle;
 if (!app.liveActive) ponerConexion(app.page === 'detalle' ? 'Reproducción de datos guardados' : app.page === 'simulacion' ? 'Simulación en esta página' : 'Demostración con datos simulados', 'demo');

 const rueda = m.rueda_rps == null ? 'Sin dato' : app.liveActive && app.stale ? 'Sin datos recientes' : m.rueda_rps > 0.01 ? 'Girando' : 'Detenida';
 $('#rueda-estado').textContent = rueda;
 $('#rueda-chip').textContent = 'Rueda: ' + (m.rueda_rps == null ? 'sin dato' : app.liveActive && app.stale ? 'sin datos recientes' : m.rueda_rps > 0.01 ? `${uno(m.rueda_rps)} vueltas/s` : 'detenida');
 $('#graph-reading').innerHTML = `<strong>Lectura a ${seconds(m.t_ms)} s</strong>
  <span>X ${number(m.ax)} · Y ${number(m.ay)} · Z ${number(m.az)} m/s²</span>
   <span>Lateral ${number(m.roll_deg)}° · Frontal ${number(m.pitch_deg)}°</span><span>${NOMBRE_RUEDA}: ${rueda.toLowerCase()}${m.rueda_rps!=null?' · '+m.rueda_rps.toLocaleString('es-EC',{maximumFractionDigits:3})+' vueltas/s (estimación Hall)':''}${m.rueda_pulsos!=null?' · '+m.rueda_pulsos+' pulsos':''}</span>`;

 // Contador acumulado (sirve para la prueba de pulsos por vuelta) y distancia solo si se conoce el diámetro.
 const pulsos=m.rueda_pulsos;
 const vueltas=pulsos==null?null:pulsos/PULSOS_POR_VUELTA;
 const distancia=distanciaM(vueltas);
 const rps = m.rueda_rps == null ? '' : `${uno(m.rueda_rps)} vueltas/s · `;
 const info = rps + (pulsos == null ? 'contador sin dato' : `${pulsos} pulsos`) + (distancia == null ? '' : ` · ${distancia.toLocaleString('es-EC', {maximumFractionDigits: 2})} m`);
 $('#wheel-info').textContent = info;
 $('#wheel-info').title = rps + (pulsos == null ? 'contador sin dato' : `contador ${pulsos} pulsos = ${vueltas.toLocaleString('es-EC', {maximumFractionDigits: 2})} vueltas`) + (distancia == null ? ' · distancia sin medir (diámetro de la rueda desconocido)' : '');

 // Valor actual grande junto a cada gráfica.
 $('#valor-inclinacion').textContent = `${uno(m.roll_deg)}° · ${uno(m.pitch_deg)}°`;
 const total = Math.hypot(m.ax, m.ay, m.az);
 $('#valor-golpe').textContent = `${uno(total)} m/s²`;
 $('#acel-total').textContent = `${uno(total)} m/s²`;
 $('#acel-detalle').textContent = `${uno(total / 9.81)} g · golpe desde ${CONSTANTES_INO.UMBRAL_GOLPE_MS2} m/s²`;
 if ($('#valor-ejes')) $('#valor-ejes').textContent = `${uno(m.ax)} · ${uno(m.ay)} · ${uno(m.az)}`;
 const v = app.wheelTurnsBySample[sampleIndex];
 $('#valor-rueda').textContent = m.rueda_rps == null && m.rueda_pulsos == null ? 'Sin dato' : `${uno(v ?? 0)} vueltas`;
 if(drawCharts && app.graficas) moverCursor(app.graficas, app.liveActive ? null : app.position);
}

export function frame(time){
  if(app.liveActive && app.liveTurns!==app.wheelTo && app.current.mediciones.length){
    const f=Math.max(0,Math.min(1,(time-app.wheelStart)/app.wheelDuration));
    app.liveTurns=f===1?app.wheelTo:app.wheelFrom+(app.wheelTo-app.wheelFrom)*f;
    app.viewer.update(app.current.mediciones.at(-1),undefined,0,app.liveTurns,true);
  }
 if(app.running){if(app.lastFrame)app.position=Math.min(end(),app.position+(time-app.lastFrame)*app.speed);app.lastFrame=time;if(app.position>=end())app.running=false;update();}requestAnimationFrame(frame);}

export function renderMonitor() {
 const detail=app.page==='detalle';
 const simulation=app.page==='simulacion';
 const title=detail?`${NOMBRE_TIPO[app.current.evento.tipo]||app.current.evento.tipo} · ${app.current.evento.id}`:simulation?'Simulación':'En vivo';
 const desc=detail?`Sesión ${app.current.sesion.id} · reproducción de las mediciones guardadas`:simulation?'Escenarios sintéticos con las mismas reglas que el firmware.':'Postura, golpes y rueda del carro.';
 $('#main').innerHTML=`<div class="monitor">`+(detail?'<a class="back" href="#historial">Volver al historial</a>':'')+
  `<div class="page-heading"><div><h1>${escape(title)}</h1><p>${escape(desc)}</p></div><div class="page-actions">`+
  (detail?`<a class="secondary boton-enlace" href="#sesion/${encodeURIComponent(app.current.sesion.id)}">Ver la sesión completa</a><a class="secondary boton-enlace" href="#explicar/${escape(app.current.evento.id)}">Explicar evento</a>`:'')+
  (!simulation&&!detail?`<div class="segmentado" role="group" aria-label="Fuente de datos"><button type="button" id="demo-mode" aria-pressed="true">Demostración</button><button type="button" id="live-mode" aria-pressed="false">En vivo</button></div>`:'')+
  `<button type="button" class="secondary" id="presentation-mode" aria-pressed="false" aria-keyshortcuts="F" title="Pantalla completa (tecla F; Esc para salir)">${icono('pantalla')}Pantalla completa</button></div></div>`+
  (simulation?simulationForm():detail?'':`<form id="live-form" class="tarjeta form-sesion" hidden><label>ID de la sesión <input name="session" placeholder="RC-… (monitor serie del ESP32)" required pattern="[A-Za-z0-9_\\-]{1,64}" autocomplete="off" spellcheck="false"></label><button class="primary" id="connect-session">Conectar</button><button type="button" class="secondary" id="find-session">Buscar sesiones</button></form><div id="live-notices"></div>`)+
  dashboard()+`</div>`;
 $('#export').onclick=()=>openExport();
 // En el detalle de un evento la exportación es solo de ese evento: un botón con ese nombre
 // (abre el diálogo con Resumen y Datos técnicos) para no confundirla con «Exportar sesión».
 if(detail){$('#accion-resumen').hidden=true;$('#accion-tecnico').hidden=true;$('#export').innerHTML=icono('exportar')+'Exportar solo este evento';$('#export').className='primary';}
 for (const f of ['resumen','tecnico']) $('#accion-'+f).onclick=e=>descargar(f, e.currentTarget);
 $('#presentation-mode').onclick=()=>activarPresentacion(!app.presentacion);
 $('#salir-presentacion').onclick=()=>activarPresentacion(false);
 if(detail)$('#origin').textContent=app.current.sesion.origen==='real'?'Mediciones reales · historial':'Datos simulados · historial';
 else $('#origin').textContent=app.current.sesion.origen==='real'?'Mediciones reales':'Datos simulados';
 if(detail){$('#sesion-actual').hidden=false;$('#sesion-actual').textContent=app.current.sesion.id;$('#copiar-sesion').hidden=false;}
 $('#copiar-sesion').onclick=()=>navigator.clipboard.writeText($('#sesion-actual').textContent).then(()=>toast('ID copiado'),()=>toast('Selecciona el ID para copiarlo.'));
 app.viewer=crearVisor($('#car'));
 if(app.viewer.mode==='2d'){
   $('#escena-nombre').textContent='Vista 2D';
   document.querySelector('[data-camera=seguimiento]').hidden=true;
   document.querySelector('[data-camera=lateral]').classList.add('selected');
   document.querySelector('[data-camera=libre]').hidden=true;
 }
 document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>{app.viewer.camera(b.dataset.camera);document.querySelectorAll('[data-camera]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});});
 $('#play').onclick=()=>{if(app.position>=end())app.position=start();app.running=!app.running;app.lastFrame=0;update();};
 $('#reset').onclick=()=>{app.running=false;app.position=start();update();};
 $('#speed').onchange=e=>app.speed=Number(e.target.value);
 $('#timeline').oninput=e=>{app.running=false;app.position=Number(e.target.value);update();};
 app.graficas=crearGraficas('', {onClick(_e, puntos, chart){
   if (app.liveActive || !puntos.length) return;
   app.position = chart.data.datasets[puntos[0].datasetIndex].data[puntos[0].index].x;
   app.running = false; update();
 }});
 app.charts=app.graficas.todas;
 app.alCambiarPresentacion=activo=>{if(app.graficas)modoPresentacion(app.graficas,activo);};
 if(app.presentacion)activarPresentacion(true);
 app.pintarEventos=pintarEventos;
 refreshData(); pintarEventos();
 $('.data-table').ontoggle=()=>{if(app.liveActive&&$('.data-table').open)refreshData();};
 if(simulation)bindSimulation();
 if(!simulation&&!detail){
  const buscar=()=>buscarSesiones(get,connectLive,toast,{modo:'vivo',verAnteriores:()=>buscarSesiones(get,historialSesion,toast,{modo:'historial'})});
  $('#demo-mode').onclick=()=>{app.current=app.demo;app.position=0;app.render();};
  $('#live-mode').onclick=()=>{
    $('#demo-mode').setAttribute('aria-pressed','false');$('#live-mode').setAttribute('aria-pressed','true');
    $('#live-form').hidden=false;$('#accion-sesion').hidden=false;
    if(!app.liveActive){$('#conexion-texto').textContent='Sin sesión conectada';$('#mode-help').textContent='Busca una sesión que esté enviando datos o escribe el ID que muestra el monitor serie del ESP32.';$('#estado-texto').textContent='—';$('#estado-detalle').textContent='Conecta una sesión para ver el carro en vivo';$('#estado-carro').dataset.estado='sin-datos';$('#live-form input').focus();}
  };
  $('#find-session').onclick=buscar;$('#accion-sesion').onclick=buscar;$('#cambiar-sesion').onclick=buscar;
  $('#live-form').onsubmit=e=>{e.preventDefault();connectLive(new FormData(e.target).get('session'));};
  const rangoActual=app.ventanaS==null?RANGO_INICIAL:app.ventanaS===Infinity?'sesion':String(app.ventanaS);
  for(const x of $('#ventana').querySelectorAll('button'))x.setAttribute('aria-pressed',String(x.dataset.ventana===rangoActual));
  $('#ventana').onclick=e=>{
    const b=e.target.closest('[data-ventana]'); if(!b)return;
    app.ventanaS=segundosRango(b.dataset.ventana);
    for(const x of $('#ventana').querySelectorAll('button'))x.setAttribute('aria-pressed',String(x===b));
    app.reiniciarVivo?.();
  };
 }
}
