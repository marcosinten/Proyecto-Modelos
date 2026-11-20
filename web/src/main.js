import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './style.css';
import Chart from 'chart.js/auto';
import {crearVisor} from './car.js';
import {buscarSesiones} from './selector.js';
import {vueltasEntre, VENTANA, PAUSA_MS, recepcion, paginasSesion, sesionMasReciente} from './telemetria.js';
import {horaAproximadaMs, textoHora, NOTA_HORA} from '../../compartido/hora.js';
import {PULSOS_POR_VUELTA, POSICION_RUEDA_SENSOR, NOMBRE_RUEDA, distanciaM} from '../../compartido/parametros-firmware.js';
import {generarEscenario} from './simulation.js';
import {mostrarExplicacion} from './explanation-view.js';
import {crearExcel} from '../../compartido/libro-excel.js';
import ev1 from '../../ejemplos/vuelco.json';
import ev2 from '../../ejemplos/vuelco-002.json';
import {app, $, number, escape, label, seconds, request, get, toast, heading} from './app.js';
import {eventTable, tablaMediciones, historialSesion, bindRows, renderHistory, loadEvents, refrescarRecientes} from './pantallas/historial.js';

const demo = generarEscenario('vuelco', 16, 90, 100);
app.current=demo;app.page='monitor';app.running=false;app.position=0;app.speed=1;app.lastFrame=0;
app.viewer=undefined;app.charts=[];app.events=[ev2,ev1];app.apiAvailable=false;app.liveTimer=undefined;
app.liveActive=false;app.pageNumber=0;app.previousRuns=[];
app.liveGeneration=0;
app.impactTime=undefined;
app.wheelTurnsBySample=[];
app.liveTurns=0;app.wheelFrom=0;app.wheelTo=0;app.wheelStart=0;app.wheelDuration=0;app.stale=false;
app.cerrarExplicacion=undefined;app.historyTimer=undefined;
const tipoAviso={golpe:'Golpe',inclinacion:'Inclinación',vuelco:'Vuelco'};
function layout() {
 $('#app').innerHTML=`<aside><a class="brand" href="#monitor"><span class="brand-icon">↗</span><span>telemetría<span class="brand-small">RC / GRUPO 11</span></span></a><div class="nav-caption">ESPACIO DE TRABAJO</div><nav><a href="#monitor" data-nav="monitor">◉ <span>Monitor</span></a><a href="#simulacion" data-nav="simulacion">▷ <span>Simulación</span></a><a href="#historial" data-nav="historial">▤ <span>Historial</span></a></nav><div class="aside-bottom"><span class="status-dot"></span> Laboratorio de movimiento<small>Modelos y Simulación · Grupo 11</small></div></aside><div class="workspace"><header><span>Proyecto experimental <span class="divider">/</span> Telemetría vehicular</span><span id="connection" class="badge neutral">Comprobando API</span></header><main id="main"></main><footer>TELEMETRÍA RC <span>Datos en movimiento. Decisiones con contexto.</span><span>Grupo 11 · v1.1</span></footer></div><div id="toast" role="status"></div><dialog id="export-dialog"><form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><div id="export-body"></div></dialog>`;
}
function metric(name,id,unit,color='') {return `<div class="metric"><span><i style="background:${color||'#64748b'}"></i>${name}</span><strong id="${id}">—</strong><small>${unit}</small></div>`;}
function dashboard() {
 return `<div class="metrics">${metric('Aceleración X','ax','m/s²','#1d4ed8')}${metric('Aceleración Y','ay','m/s²','#0f766e')}${metric('Aceleración Z','az','m/s²','#7e22ce')}${metric('Inclinación lateral','roll','Roll · grados')}${metric('Inclinación frontal','pitch','Pitch · grados')}</div><div class="visual-grid"><section class="card stage-card"><div class="card-title"><div><h2>Postura del carro</h2><p>Orientación según datos · recorrido y ruedas ilustrativos en simulación</p><p style="font-size:10px">Modelo: <a href="https://sketchfab.com/3d-models/oldsmobile-cutlass-supreme-sedan-71-78f76d386a4341b0b71745bdc50fd5ab" target="_blank" rel="noopener noreferrer">Barbo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> · Adaptado al visor</p></div><span class="badge purple" id="origin">Datos simulados</span></div><div class="stage"><div class="scene-label"><span class="status-dot"></span> VISTA 3D <small id="sample-time">1 500 ms</small></div><div id="car"></div><div class="camera-controls"><button data-camera="seguimiento" class="selected">Seguimiento</button><button data-camera="lateral">Lateral</button><button data-camera="frontal">Frontal</button><button data-camera="libre" title="Arrastra para girar y usa la rueda o pellizca para acercar">Libre 3D</button></div><span class="axis-guide">X → &nbsp; Y ↗ &nbsp; Z ↑</span></div><div class="player"><div class="player-top"><button id="play" class="primary small">▶ Reproducir</button><button id="reset" class="secondary small" title="Volver al inicio">↺ Reiniciar</button><label class="speed"><span>Ritmo de reproducción</span><select id="speed"><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label><span class="mono" id="clock"></span></div><input id="timeline" type="range" aria-label="Tiempo de la sesión en milisegundos" step="1"><div class="timeline-labels"><span id="range-start"></span><span>Tiempo desde inicio de sesión</span><span id="range-end"></span></div></div></section><div class="chart-stack"><section class="card"><div class="card-title"><h2>Aceleración por eje</h2><span class="unit">m/s²</span></div><div class="chart-wrap"><canvas id="accel"></canvas></div></section><section class="card"><div class="card-title"><h2>Inclinación</h2><span class="unit">grados</span></div><div class="chart-wrap"><canvas id="angles"></canvas></div></section><section class="card"><div class="card-title"><h2>Aceleración total</h2><span class="unit">m/s² · incluye gravedad</span></div><div class="chart-wrap"><canvas id="magnitude"></canvas></div></section><section class="card"><div class="card-title"><div><h2>${NOMBRE_RUEDA} (${POSICION_RUEDA_SENSOR})</h2><p id="wheel-info" title="El movimiento se estima solo con esta rueda; las cuatro ruedas del modelo giran igual">Contador: — · estimación con una sola rueda</p></div><span class="unit">vueltas/s</span></div><div class="chart-wrap"><canvas id="wheel"></canvas></div></section><p class="card graph-reading" id="graph-summary"></p><output id="graph-reading" class="card graph-reading" aria-label="Lectura seleccionada"></output></div></div><div class="result-strip" id="result"></div><p class="helper" id="protocol" role="status"></p><details class="card data-table"><summary>Ver tabla de mediciones <span id="sample-count"></span></summary><div class="table-scroll" id="samples"></div></details>`;
}
function render() {
  app.running=false; clearInterval(app.liveTimer); clearTimeout(app.historyTimer); app.liveGeneration++; app.liveActive=false;
  app.viewer?.destroy(); app.viewer=undefined; app.charts.forEach(c=>c.destroy());app.charts=[];
  app.cerrarExplicacion?.(); app.cerrarExplicacion=undefined;
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(app.page==='explicar'?'historial':app.page)));
  if(app.page==='historial'){renderHistory();return;}
  if(app.page==='explicar'){showExplanation();return;}
 const detail=app.page==='detalle';
 const simulation=app.page==='simulacion';
 let title=detail?`${label[app.current.evento.tipo]||app.current.evento.tipo} · ${app.current.evento.id}`:simulation?'Simulación de incidentes':'Monitor de telemetría';
 const desc=detail?`Sesión ${app.current.sesion.id} · Reproducción de las mediciones registradas`:simulation?'Explora escenarios y observa cómo responden las reglas de detección.':'Una vista completa del movimiento, la orientación y los incidentes del carro.';
 $('#main').innerHTML=(detail?'<a class="back" href="#historial">← Volver al historial</a>':'')+heading(title,desc,`${detail?`<a class="secondary explain-detail-link" href="#explicar/${escape(app.current.evento.id)}">Explicar evento →</a>`:''}<button class="secondary" id="export">↓ Exportar Excel</button>`)+(simulation?simulationForm():detail?'':`<div class="mode-row"><div class="tabs"><button id="demo-mode" class="selected">Demostración</button><button id="live-mode">En vivo</button></div><span class="helper" id="mode-help">Escenario local · puedes explorarlo sin conectar el circuito</span></div><form id="live-form" hidden><label>Identificador de sesión <input name="session" placeholder="SES-001 o ID del ESP32" required pattern="[A-Za-z0-9_\\-]{1,64}"></label><button class="primary" id="connect-session">Conectar sesión</button><button type="button" class="secondary" id="find-session">Buscar sesiones</button></form><div id="live-notices"></div>`)+dashboard()+(!simulation&&!detail?`<section class="card recent"><div class="card-title"><div><h2>Eventos recientes</h2><p>El registro de tus últimas pruebas</p></div><a href="#historial">Ver historial →</a></div>${eventTable(app.events.slice(0,3))}</section>`:'');
 $('#export').onclick=openExport;
 if(detail)$('#origin').textContent=app.current.sesion.origen==='real'?'Mediciones reales · historial':'Datos simulados · historial';
 app.viewer=crearVisor($('#car'));
 if(app.viewer.mode==='2d'){
   document.querySelector('.scene-label').innerHTML='<span class="status-dot"></span> VISTA 2D <small id="sample-time"></small>';
   document.querySelector('[data-camera=seguimiento]').hidden=true;
   document.querySelector('[data-camera=lateral]').classList.add('selected');
   document.querySelector('[data-camera=libre]').hidden=true;
 }
 document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>{app.viewer.camera(b.dataset.camera);document.querySelectorAll('[data-camera]').forEach(x=>x.classList.toggle('selected',x===b));});
 $('#play').onclick=()=>{if(app.position>=end())app.position=start();app.running=!app.running;app.lastFrame=0;update();};
 $('#reset').onclick=()=>{app.running=false;app.position=start();update();};
 $('#speed').onchange=e=>app.speed=Number(e.target.value);
 $('#timeline').oninput=e=>{app.running=false;app.position=Number(e.target.value);update();};
  app.charts=[makeChart('accel',['ax','ay','az'],['X · adelante/atrás','Y · lado a lado','Z · arriba/abajo'],['#1d4ed8','#0f766e','#7e22ce']),makeChart('angles',['roll_deg','pitch_deg'],['Lateral','Frontal'],['#1d4ed8','#d97706']),makeChart('magnitude',['total'],['Aceleración total'],['#be123c']),makeChart('wheel',['rueda_rps'],[NOMBRE_RUEDA],['#0f766e'])];
 bindRows(); refreshData();
 $('.data-table').ontoggle=()=>{if(app.liveActive&&$('.data-table').open)refreshData();};
 if(simulation)bindSimulation();
 if(!simulation&&!detail){
  $('#demo-mode').onclick=()=>{app.current=demo;app.position=0;render();};
   $('#live-mode').onclick=()=>{$('#demo-mode').classList.remove('selected');$('#live-mode').classList.add('selected');$('#live-form').hidden=false;if(!app.liveActive){$('#mode-help').textContent='Busca una sesión o escribe el ID del dispositivo.';$('#live-form input').focus();}};
   $('#find-session').onclick=()=>buscarSesiones(get,connectLive,toast,{modo:'vivo',verAnteriores:()=>buscarSesiones(get,historialSesion,toast,{modo:'historial'})});
  $('#live-form').onsubmit=e=>{e.preventDefault();connectLive(new FormData(e.target).get('session'));};
 }
}
const start=()=>app.liveActive ? app.current.mediciones[0]?.t_ms??0 : app.current.evento?.t_inicio_ms??app.current.mediciones[0]?.t_ms??0;
const end=()=>app.liveActive ? app.current.mediciones.at(-1)?.t_ms??1000 : app.current.evento?.t_fin_ms??app.current.mediciones.at(-1)?.t_ms??1000;
function makeChart(id, keys, names, colors) {
 const unit = id === 'angles' ? '°' : id==='wheel' ? ' vueltas/s' : ' m/s²';
 const cursor = {
  id:'timeCursor',
  afterDraw(chart) {
    const {ctx, chartArea, scales} = chart;
    if(id==='angles'){
      for(const event of app.current.eventos ?? (app.current.evento?[app.current.evento]:[])){
        const px=scales.x.getPixelForValue(event.t_deteccion_ms);
        if(px<chartArea.left || px>chartArea.right)continue;
        ctx.save();ctx.strokeStyle='#9333a1';ctx.fillStyle='#6b287d';ctx.setLineDash([3,2]);
        ctx.beginPath();ctx.moveTo(px,chartArea.top);ctx.lineTo(px,chartArea.bottom);ctx.stroke();
        const lane={golpe:0,inclinacion:1,vuelco:2}[event.tipo];
        ctx.textAlign=px>chartArea.right-55?'right':'left';ctx.fillText(label[event.tipo],px,chartArea.top+11+lane*12);ctx.restore();
      }
    }
   const x = scales.x.getPixelForValue(app.position);
   if (x < chartArea.left || x > chartArea.right) return;
   ctx.save();
   ctx.setLineDash([3,4]);
   ctx.strokeStyle = '#64748b';
   ctx.beginPath();
   ctx.moveTo(x, chartArea.top);
   ctx.lineTo(x, chartArea.bottom);
   ctx.stroke();
   ctx.restore();
   if (id === 'magnitude') {
    const lines = [{value:9.81,text:'Gravedad ≈ 9,81',color:'#64748b'}];
    if (app.current.parametros) lines.push({value:app.current.parametros.aceleracion,text:'Umbral de impacto',color:'#dc2626'});
    for (const line of lines) {
     const y = scales.y.getPixelForValue(line.value);
     if (y < chartArea.top || y > chartArea.bottom) continue;
     ctx.save();
     ctx.strokeStyle=line.color;
     ctx.fillStyle=line.color;
     ctx.setLineDash([4,4]);
     ctx.beginPath();ctx.moveTo(chartArea.left,y);ctx.lineTo(chartArea.right,y);ctx.stroke();
     ctx.font='10px Inter';ctx.fillText(line.text,chartArea.left+6,y-4);
     ctx.restore();
    }
   }
  }
 };
 return new Chart($('#'+id), {
  type:'line',
  data:{datasets:keys.map((key,i)=>({
   label:names[i], data:[], borderColor:colors[i], backgroundColor:colors[i],
   borderDash:i===1?[6,3]:i===2?[2,3]:[], borderWidth:2,
   pointRadius:app.current.mediciones.length<10?3:0, pointHoverRadius:5, tension:0
  }))},
  plugins:[cursor],
  options:{
   responsive:true, maintainAspectRatio:false, animation:false, parsing:false, normalized:true,
   interaction:{mode:'index', axis:'x', intersect:false},
   onClick(_event, points, chart) {
    if (app.liveActive || !points.length) return;
    app.position = chart.data.datasets[points[0].datasetIndex].data[points[0].index].x;
    app.running = false;
    update();
   },
   plugins:{
    decimation:{enabled:true, algorithm:'min-max', threshold:1500},
    tooltip:{callbacks:{
     title:items=>seconds(items[0].parsed.x)+' s',
     label:item=>item.dataset.label+' · '+number(item.parsed.y)+unit
    }},
    legend:{position:'bottom', labels:{usePointStyle:true,boxWidth:7,font:{family:'Inter',size:11}}}
   },
   scales:{
    x:{type:'linear',min:start(),max:end(),grid:{display:false},
     ticks:{maxTicksLimit:5,font:{size:10},callback:seconds},
     title:{display:true,text:'Tiempo de sesión (s)',font:{size:10}}},
    y:{grid:{color:'#eef2f7'},ticks:{maxTicksLimit:4,font:{size:10}}}
   }
  }
 });
}
function refreshData() {
 $('#timeline').min=start();$('#timeline').max=end();
 $('#range-start').textContent=start()+' ms';$('#range-end').textContent=end()+' ms';
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
 $('#result').innerHTML=e?`<span class="event-mark">↻</span><div><strong>${escape(label[e.tipo]||e.tipo)} detectado</strong><small>Detección ${e.t_deteccion_ms} ms · Activación ${e.t_activacion_ms??'sin medir'}${e.t_activacion_ms===null?'':' ms'}</small></div><span class="badge ${e.gravedad==='alta'?'danger':'warning'}">${label[e.gravedad]}</span><div class="result-response"><strong>${e.t_activacion_ms===null?'—':e.t_activacion_ms-e.t_deteccion_ms+' ms'}</strong><small>Tiempo de respuesta</small></div><small>${e.ubicacion?escape(e.ubicacion.latitud+', '+e.ubicacion.longitud):'Sin ubicación disponible'}</small>`:'<span class="status-dot"></span><div><strong>Sin incidente detectado</strong><small>Resultado de las reglas de esta corrida</small></div>';
 app.wheelTurnsBySample = [];
 let turns = 0;
 app.current.mediciones.forEach((m,i) => {
  const previous = app.current.mediciones[i-1];
  turns += vueltasEntre(previous,m);
  app.wheelTurnsBySample.push(turns);
 });
 // La postura y los números tienen prioridad sobre preparar las cuatro series.
 // chart.update() ya pinta su cursor; no redibujar todos los gráficos dos veces.
 update(false);
 app.charts.forEach((chart,i) => {
  const keys = [['ax','ay','az'],['roll_deg','pitch_deg'],['total'],['rueda_rps']][i];
   chart.data.datasets.forEach((dataset,j) => {
   dataset.data = app.current.mediciones.map(m => ({
     x:m.t_ms, y:keys[j]==='total' ? Math.hypot(m.ax,m.ay,m.az) : m[keys[j]] ?? null
   }));
  });
  chart.options.scales.x.min=start();
  chart.options.scales.x.max=end();
  chart.update();
 });
  const max=app.current.mediciones.reduce((v,m)=>Math.max(v,Math.abs(m.roll_deg)),0);
  $('#graph-summary').textContent=app.current.mediciones.length?`Inclinación lateral máxima de ${max.toLocaleString('es-EC',{maximumFractionDigits:1})}° ${app.liveActive?'en la ventana reciente':'en estas mediciones'}.`:'Sin mediciones.';
}
function update(drawCharts=true){
 const m=app.current.mediciones.findLast(m=>m.t_ms<=app.position)??app.current.mediciones[0];if(!m)return;
 for(const key of ['ax','ay','az'])$('#'+key).textContent=number(m[key]);
 $('#roll').textContent=number(m.roll_deg)+'°';$('#pitch').textContent=number(m.pitch_deg)+'°';
 $('#sample-time').textContent=Math.round(app.position)+' ms';$('#clock').textContent=(app.position/1000).toFixed(2)+' / '+(end()/1000).toFixed(2)+' s';
 $('#timeline').value=app.position;$('#play').textContent=app.running?'Ⅱ Pausar':'▶ Reproducir';
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

 $('#result').style.opacity = detected || !app.current.evento ? '1' : '.55';
 $('#result').setAttribute('aria-label', detected ? 'Evento detectado en este instante' : 'Resultado final de la corrida');

 $('#graph-reading').innerHTML = `<strong>Lectura a ${seconds(m.t_ms)} s</strong>
  <span>X ${number(m.ax)} · Y ${number(m.ay)} · Z ${number(m.az)} m/s²</span>
   <span>Lateral ${number(m.roll_deg)}° · Frontal ${number(m.pitch_deg)}°</span><span>${NOMBRE_RUEDA}: ${app.liveActive&&app.stale?'último dato desactualizado':m.rueda_rps == null ? "sin dato" : m.rueda_rps > 0 ? "girando" : "detenida"}${m.rueda_rps!=null?' · '+m.rueda_rps.toLocaleString('es-EC',{maximumFractionDigits:3})+' vueltas/s (estimación Hall)':''}${m.rueda_pulsos!=null?' · '+m.rueda_pulsos+' pulsos':''}</span>`;

 // Contador acumulado (sirve para la prueba de pulsos por vuelta) y distancia solo si se conoce el diámetro.
 const pulsos=m.rueda_pulsos;
 const vueltas=pulsos==null?null:pulsos/PULSOS_POR_VUELTA;
 const distancia=distanciaM(vueltas);
 $('#wheel-info').textContent=(pulsos==null?'Contador: sin dato':`Contador: ${pulsos} pulsos = ${vueltas.toLocaleString('es-EC',{maximumFractionDigits:2})} vueltas desde el arranque`)+' · Distancia: '+(distancia==null?'sin medir (diámetro desconocido)':distancia.toLocaleString('es-EC',{maximumFractionDigits:2})+' m');
 if(drawCharts)app.charts.forEach(c=>c.draw());
}
function frame(time){
  if(app.liveActive && app.liveTurns!==app.wheelTo && app.current.mediciones.length){
    const f=Math.max(0,Math.min(1,(time-app.wheelStart)/app.wheelDuration));
    app.liveTurns=f===1?app.wheelTo:app.wheelFrom+(app.wheelTo-app.wheelFrom)*f;
    app.viewer.update(app.current.mediciones.at(-1),undefined,0,app.liveTurns,true);
  }
 if(app.running){if(app.lastFrame)app.position=Math.min(end(),app.position+(time-app.lastFrame)*app.speed);app.lastFrame=time;if(app.position>=end())app.running=false;update();}requestAnimationFrame(frame);}
function simulationForm(){return `<form id="simulation-form" class="card simulation-form"><label>Escenario<select name="type"><option value="vuelco">Vuelco</option><option value="normal">Marcha normal</option><option value="frenada">Frenada brusca</option><option value="impacto">Impacto</option><option value="inclinacion">Inclinación</option></select></label><label>Umbral de aceleración (m/s²)<input name="acceleration" type="number" min="10" max="100" step="0.1" value="16" required></label><label>Ángulo mínimo (°)<input name="angle" type="number" min="5" max="180" value="60" required></label><label>Permanencia (ms)<input name="duration" type="number" min="0" max="5000" step="10" value="150" required></label><label>Permanencia de impacto (ms)<input name="impact-duration" type="number" min="0" max="5000" step="4" value="8" required></label><label>Rango del sensor<select name="range"><option value="">Ideal · sin límite</option><option value="2">±2 g · valor de fábrica</option><option value="4">±4 g</option><option value="8">±8 g</option><option value="16">±16 g</option></select></label><label>Duración del golpe (ms)<input name="impact-length" type="number" min="1" max="1000" step="1" value="100" required></label><label>Ruido del sensor (m/s²)<input name="noise" type="number" min="0" max="5" step="0.05" value="0" required></label><button class="primary">▷ Ejecutar simulación</button><button type="reset" class="secondary">Restablecer</button><p class="helper">Señales sintéticas · Reglas experimentales sobre aceleración total e inclinación · Muestreo 20 ms · Impacto: permanencia independiente</p></form><div id="simulation-actions"><button class="secondary" id="save-run">Guardar corrida en API</button><span class="helper" id="simulation-status">Ejecuta un escenario para obtener un resultado.</span></div><details class="card compare"><summary>Comparar corridas de esta sesión</summary><div id="comparisons"></div></details>`;}
function bindSimulation(){
 $('#simulation-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);app.current=generarEscenario(f.get('type'),Number(f.get('acceleration')),Number(f.get('angle')),Number(f.get('duration')),Number(f.get('impact-duration')),{rango_g:f.get('range')?Number(f.get('range')):null,duracion_impacto_ms:Number(f.get('impact-length')),ruido:Number(f.get('noise'))});app.previousRuns.push(app.current);app.position=0;app.running=false;refreshData();$('#simulation-status').textContent=app.current.evento?'Evento listo para guardar. La activación física está sin medir.':'Sin incidente. Puedes exportar las mediciones.';$('#save-run').disabled=false;$('#comparisons').innerHTML='<div class="table-scroll"><table><tr><th>Escenario</th><th>Umbral</th><th>Ángulo</th><th>Permanencia</th><th>Sensor</th><th>Golpe</th><th>Resultado</th></tr>'+app.previousRuns.map(p=>`<tr><td>${escape(p.parametros.escenario)}</td><td>${p.parametros.aceleracion} m/s²</td><td>${p.parametros.angulo}°</td><td>${p.parametros.permanencia} ms</td><td>${typeof p.parametros.rango_g==='number'?'±'+p.parametros.rango_g+' g':'Ideal'}</td><td>${p.parametros.duracion_impacto_ms} ms</td><td>${p.evento?escape(label[p.evento.tipo]):'Sin incidente'}</td></tr>`).join('')+'</table></div>';};
 $('#save-run').disabled=!app.current.parametros;
 $('#save-run').onclick=async()=>{const button=$('#save-run');button.disabled=true;const p=app.current;try{await request('/sesiones',{version:1,sesion:p.sesion});await request('/sesiones/'+p.sesion.id+'/mediciones',{version:1,mediciones:p.mediciones});if(p.evento)await request('/eventos',{version:1,evento:p.evento});toast('Corrida guardada: '+p.sesion.id);await loadEvents();}catch(e){toast(e.message);button.disabled=false;}};
}
async function connectLive(id){
 const generation=++app.liveGeneration, valid=()=>generation===app.liveGeneration;
 clearTimeout(app.liveTimer);app.running=false;app.liveActive=false;
 const input=$('#live-form input'),btn=$('#connect-session');
 input.value=id;input.disabled=true;btn.disabled=true;
 $('#mode-help').textContent='Conectando a '+id+'…';
 let session;
 try{({sesion:session}=await get('/sesiones/'+id));}
 catch(e){if(valid()){toast(e.message);$('#mode-help').textContent=e.message;input.disabled=false;btn.disabled=false;}return;}
 if(!valid())return;
 app.current={version:1,sesion:session,evento:null,eventos:[],mediciones:[]};
 app.liveActive=true;app.wheelTo=app.wheelFrom=app.liveTurns=0;app.position=0;
 $('#origin').textContent=session.origen==='real'?'Mediciones reales':'Emisor simulado';
 for(const s of ['play','reset','timeline','speed'])$('#'+s).disabled=true;
 btn.hidden=true;$('#find-session').textContent='Cambiar sesión';
 for(const s of ['ax','ay','az','roll','pitch','clock','sample-time','graph-reading','protocol','samples'])$('#'+s).textContent='—';
 $('#car').style.visibility='hidden';refreshData();
 let reset=true, lastRecepcion=null, markerKey='', eventoVisto;
 $('#live-notices').replaceChildren();
 const descartadas=new Set();
 // 1b: otra sesión real «Recibiendo» más reciente (p. ej. el ESP32 se reinició). Solo avisa; no cambia sola.
 async function vigilar(){
   if(!valid())return;
   try{
     const r=await get('/sesiones?limite=20&offset=0');
     if(!valid())return;
     const nueva=sesionMasReciente(r.sesiones,r.ahora_ms,id,lastRecepcion,descartadas);
     if(nueva&&!$('#new-session'))avisarSesionNueva(nueva,r.ahora_ms,()=>descartadas.add(nueva.id));
   }catch{}
   if(valid())setTimeout(vigilar,2500);
 }
 setTimeout(vigilar,2500);
 async function poll(){
   try{
     const prev=app.current.mediciones.at(-1);
     const since=!reset && prev?`&despues_numero=${prev.numero}&desde_ms=${start()}`:'';
     const r=await get(`/sesiones/${id}/ultima?ventana=${VENTANA}${since}`);
     if(!valid())return;
     const data=r.mediciones;
     lastRecepcion=r.ultima_recepcion_ms;
     const oldStale=app.stale;
     app.stale=lastRecepcion==null || r.ahora_ms-lastRecepcion>PAUSA_MS;
     $('#mode-help').textContent=recepcion(lastRecepcion,r.ahora_ms,!!r.medicion);
     if(!reset && !r.recortada && data.length && !app.stale){
       let a=prev, delta=0;
       for(const b of data){delta+=vueltasEntre(a,b);a=b;}
       if(delta>0){
         app.wheelFrom=app.liveTurns;app.wheelTo+=delta;app.wheelStart=performance.now();
         app.wheelDuration=Math.max(100,Math.min(240,a.t_ms-(prev??data[0]).t_ms));
       }
     }
     app.current.mediciones=reset||r.recortada?data:[...app.current.mediciones,...data].slice(-VENTANA);
     reset=false;
     const events=r.eventos.filter(e=>e.t_deteccion_ms>=start());
     const key=JSON.stringify([r.ultimo_evento?.id,events.map(e=>e.id)]);
     app.current.eventos=events;app.current.evento=r.ultimo_evento;
     // 1a: un evento nuevo de esta sesión (el primero visto al conectar es la referencia).
     const ultimoId=r.ultimo_evento?.id??null;
     if(eventoVisto===undefined)eventoVisto=ultimoId;
     else if(ultimoId!==eventoVisto){
       eventoVisto=ultimoId;
       avisarEvento(r.ultimo_evento,horaAproximadaMs(r.ultima_recepcion_ms,r.medicion?.t_ms,r.ultimo_evento.t_deteccion_ms));
       loadEvents().then(()=>{if(valid())refrescarRecientes();});
     }
     if(r.medicion){
       app.position=r.medicion.t_ms;$('#car').style.visibility='';
       if(data.length||key!==markerKey)refreshData();
       else if(oldStale!==app.stale)update();
     }
     markerKey=key;
   } catch(e){
     if(!valid())return;
     reset=true;app.stale=true;app.wheelTo=app.liveTurns;
     $('#mode-help').textContent='Conexión interrumpida. Reintentando…'+(lastRecepcion?' Última recepción: '+new Date(lastRecepcion).toLocaleString('es-EC'):'');
     if(app.current.mediciones.length)update();
   }
   if(valid())app.liveTimer=setTimeout(poll,200);
 }
 poll();
}
function avisarEvento(ev,horaMs){
 const hora=textoHora(horaMs);
 let aviso=$('#event-saved');
 if(!aviso){aviso=document.createElement('div');aviso.id='event-saved';aviso.className='live-notice event-saved';aviso.setAttribute('role','status');$('#live-notices').prepend(aviso);}
 aviso.innerHTML=`<strong>Evento guardado: ${escape(tipoAviso[ev.tipo]||ev.tipo)} · ${hora?`${hora}</strong> <small>(${NOTA_HORA})</small>`:`${seconds(ev.t_deteccion_ms)} s de sesión</strong> <small>(hora sin medir)</small>`} <a href="#explicar/${escape(ev.id)}">Explicar →</a>`;
 aviso.classList.remove('flash');void aviso.offsetWidth;aviso.classList.add('flash');
}
function avisarSesionNueva(s,ahora,ignorar){
 const aviso=document.createElement('div');
 aviso.id='new-session';aviso.className='live-notice new-session';aviso.setAttribute('role','alert');
 aviso.innerHTML=`<span>Otra sesión real está recibiendo datos: <code></code> · hace ${Math.floor(Math.max(0,ahora-s.ultima_recepcion_ms)/1000)} s. ¿Se reinició el ESP32?</span><button type="button" class="primary small">Cambiar a la nueva sesión</button><button type="button" class="text-button">Ignorar</button>`;
 aviso.querySelector('code').textContent=s.id;
 aviso.querySelector('.primary').onclick=()=>{aviso.remove();connectLive(s.id);};
 aviso.querySelector('.text-button').onclick=()=>{ignorar();aviso.remove();};
 $('#live-notices').append(aviso);
}
async function showExplanation(){
 const id=location.hash.slice('#explicar/'.length);
 const generation=app.liveGeneration;
 $('#main').innerHTML='<a class="back" href="#historial">← Volver al historial</a><div class="card explain-empty" role="status">Cargando lecturas del evento…</div>';
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)){
  $('#main').innerHTML='<a class="back" href="#historial">← Volver al historial</a><div class="card explain-empty" role="alert">El identificador del evento no es válido.</div>';return;
 }
 let paquete, aviso='';
 try{paquete=await (await request('/eventos/'+id)).json();}
 catch(e){
  // Sin API solo sirven los paquetes con mediciones (los ejemplos locales).
  paquete=app.events.find(p=>p.evento.id===id&&p.mediciones);
  if(!paquete){
   if(generation===app.liveGeneration&&app.page==='explicar')
    $('#main').innerHTML=`<a class="back" href="#historial">← Volver al historial</a><div class="card explain-empty" role="alert">No se pudo abrir el evento. ${escape(e.message)} <a href="#historial">Revisa el historial</a> y vuelve a intentarlo.</div>`;
   return;
  }
  aviso='No se pudo actualizar el evento: se muestran las lecturas guardadas en esta página. Si llegaron más datos, vuelve a cargar el historial.';
 }
 if(generation!==app.liveGeneration||app.page!=='explicar'||location.hash!=='#explicar/'+id)return;
 app.cerrarExplicacion=mostrarExplicacion($('#main'),paquete,aviso);
}
function openExport(){
 const p=structuredClone(app.current);
 const completa=app.liveActive, ultimo=p.mediciones.at(-1)?.numero??0;
 const nombre=completa||!p.evento?p.sesion.id:p.evento.id;
 const alcance=completa?`Sesión completa, desde el inicio hasta la muestra ${ultimo}`:p.evento?`Evento ${p.evento.id} · ${p.mediciones.length} mediciones`:`Corrida ${p.sesion.id} · ${p.mediciones.length} mediciones`;
 $('#export-body').innerHTML=`<div class="export-icon">↓</div><h2>${completa?'Exportar sesión completa':p.evento?'Exportar evento':'Exportar corrida'}</h2><p>${escape(alcance)} · ${p.sesion.origen==='real'?'Datos reales':'Datos simulados'}</p>
  <div class="export-info"><strong>Resumen</strong><span>Para leer: qué pasó en cada evento, tramos inclinados y la rueda con sensor. Sin muestras sueltas.</span><small>Hojas Resumen, Eventos, Inclinaciones y Rueda · ${escape(nombre)}-resumen.xlsx</small></div>
  <div class="export-info"><strong>Datos técnicos</strong><span>Todas las muestras con rueda_pulsos, eventos completos y parámetros del firmware.</span><small>Hojas Datos, Eventos, Parámetros del firmware, ${p.parametros?'Parámetros simulación, ':''}Columnas, Léeme y Metadatos · ${escape(nombre)}-datos-tecnicos.xlsx</small></div>
  <div id="export-error" role="alert"></div><div class="dialog-actions"><button id="cancel-export" class="secondary">Cancelar</button><button id="download-tecnico" class="secondary">↓ Descargar datos técnicos</button><button id="download-resumen" class="primary">↓ Descargar resumen</button></div>`;
 $('#export-dialog').showModal();$('#cancel-export').onclick=()=>$('#export-dialog').close();
 let preparado;
 // Una sola preparación para ambos botones: mediciones y eventos de la sesión, y el reloj para la hora aproximada.
 const preparar=()=>preparado??=(async()=>{
  if(completa){
    p.mediciones=[];
    for await(const rows of paginasSesion(get,p.sesion.id,ultimo))p.mediciones.push(...rows);
    const eventos=new Map();let offset=0;
    for(;;){
      const r=await get(`/eventos?sesion_id=${p.sesion.id}&limite=200&offset=${offset}`);
      for(const ev of r.eventos)if(ev.t_deteccion_ms<=p.mediciones.at(-1)?.t_ms)eventos.set(ev.id,ev);
      if(!r.hay_mas)break;
      offset=r.siguiente_offset;
    }
    p.eventos=[...eventos.values()];delete p.evento;
  }
  try{
    const r=await get(`/sesiones/${p.sesion.id}/ultima`);
    p.reloj={ultima_recepcion_ms:r.ultima_recepcion_ms??null,t_ultima_medicion_ms:r.medicion?.t_ms??null};
  }catch{p.reloj=null;}
  return p;
 })();
 for(const formato of ['resumen','tecnico']){
  const b=$('#download-'+formato), texto=b.textContent;
  b.onclick=async()=>{b.disabled=true;b.textContent='Preparando archivo…';$('#export-error').textContent='';try{
   const paquete=await preparar();
   const {default:ExcelJS}=await import('exceljs');
   const buffer=await crearExcel(ExcelJS,paquete,{fuente:'web',formato});
   const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=`${nombre}-${formato==='resumen'?'resumen':'datos-tecnicos'}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('Descarga iniciada');
  }catch(e){preparado=undefined;$('#export-error').textContent='No se pudo preparar el archivo. '+e.message;}finally{b.disabled=false;b.textContent=texto;}};
 }
}
function route(){const hash=location.hash.slice(1);app.page=hash.startsWith('explicar/')?'explicar':['simulacion','historial','detalle'].includes(hash)?hash:'monitor';if(app.page==='detalle'&&!app.current.evento){app.current=ev2;}if(app.page==='monitor'){app.current=demo;app.position=0;}if(app.page==='simulacion'){app.current=generarEscenario('vuelco');app.position=0;}render();}
layout();route();requestAnimationFrame(frame);window.addEventListener('hashchange',route);loadEvents().then(()=>{
 if(app.page==='historial')renderHistory();
 else refrescarRecientes();
});
