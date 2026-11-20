// Pantalla Monitor (Demostración y En vivo), Detalle de un evento y tablero de Simulación:
// modelo 3D, lecturas, gráficas, reproducción y tabla de mediciones.
import Chart from 'chart.js/auto';
import {app, $, number, escape, label, seconds, get, toast, heading} from '../app.js';
import {crearVisor} from '../car.js';
import {buscarSesiones} from '../selector.js';
import {vueltasEntre} from '../telemetria.js';
import {PULSOS_POR_VUELTA, POSICION_RUEDA_SENSOR, NOMBRE_RUEDA, distanciaM} from '../../../compartido/parametros-firmware.js';
import {eventTable, bindRows, tablaMediciones, historialSesion} from './historial.js';
import {openExport} from './exportar.js';
import {simulationForm, bindSimulation} from './simulacion.js';
import {connectLive} from './vivo.js';

export function metric(name,id,unit,color='') {return `<div class="metric"><span><i style="background:${color||'#64748b'}"></i>${name}</span><strong id="${id}">—</strong><small>${unit}</small></div>`;}

export function dashboard() {
 return `<div class="metrics">${metric('Aceleración X','ax','m/s²','#1d4ed8')}${metric('Aceleración Y','ay','m/s²','#0f766e')}${metric('Aceleración Z','az','m/s²','#7e22ce')}${metric('Inclinación lateral','roll','Roll · grados')}${metric('Inclinación frontal','pitch','Pitch · grados')}</div><div class="visual-grid"><section class="card stage-card"><div class="card-title"><div><h2>Postura del carro</h2><p>Orientación según datos · recorrido y ruedas ilustrativos en simulación</p><p style="font-size:10px">Modelo: <a href="https://sketchfab.com/3d-models/oldsmobile-cutlass-supreme-sedan-71-78f76d386a4341b0b71745bdc50fd5ab" target="_blank" rel="noopener noreferrer">Barbo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> · Adaptado al visor</p></div><span class="badge purple" id="origin">Datos simulados</span></div><div class="stage"><div class="scene-label"><span class="status-dot"></span> VISTA 3D <small id="sample-time">1 500 ms</small></div><div id="car"></div><div class="camera-controls"><button data-camera="seguimiento" class="selected">Seguimiento</button><button data-camera="lateral">Lateral</button><button data-camera="frontal">Frontal</button><button data-camera="libre" title="Arrastra para girar y usa la rueda o pellizca para acercar">Libre 3D</button></div><span class="axis-guide">X → &nbsp; Y ↗ &nbsp; Z ↑</span></div><div class="player"><div class="player-top"><button id="play" class="primary small">▶ Reproducir</button><button id="reset" class="secondary small" title="Volver al inicio">↺ Reiniciar</button><label class="speed"><span>Ritmo de reproducción</span><select id="speed"><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label><span class="mono" id="clock"></span></div><input id="timeline" type="range" aria-label="Tiempo de la sesión en milisegundos" step="1"><div class="timeline-labels"><span id="range-start"></span><span>Tiempo desde inicio de sesión</span><span id="range-end"></span></div></div></section><div class="chart-stack"><section class="card"><div class="card-title"><h2>Aceleración por eje</h2><span class="unit">m/s²</span></div><div class="chart-wrap"><canvas id="accel"></canvas></div></section><section class="card"><div class="card-title"><h2>Inclinación</h2><span class="unit">grados</span></div><div class="chart-wrap"><canvas id="angles"></canvas></div></section><section class="card"><div class="card-title"><h2>Aceleración total</h2><span class="unit">m/s² · incluye gravedad</span></div><div class="chart-wrap"><canvas id="magnitude"></canvas></div></section><section class="card"><div class="card-title"><div><h2>${NOMBRE_RUEDA} (${POSICION_RUEDA_SENSOR})</h2><p id="wheel-info" title="El movimiento se estima solo con esta rueda; las cuatro ruedas del modelo giran igual">Contador: — · estimación con una sola rueda</p></div><span class="unit">vueltas/s</span></div><div class="chart-wrap"><canvas id="wheel"></canvas></div></section><p class="card graph-reading" id="graph-summary"></p><output id="graph-reading" class="card graph-reading" aria-label="Lectura seleccionada"></output></div></div><div class="result-strip" id="result"></div><p class="helper" id="protocol" role="status"></p><details class="card data-table"><summary>Ver tabla de mediciones <span id="sample-count"></span></summary><div class="table-scroll" id="samples"></div></details>`;
}

export const start=()=>app.liveActive ? app.current.mediciones[0]?.t_ms??0 : app.current.evento?.t_inicio_ms??app.current.mediciones[0]?.t_ms??0;

export const end=()=>app.liveActive ? app.current.mediciones.at(-1)?.t_ms??1000 : app.current.evento?.t_fin_ms??app.current.mediciones.at(-1)?.t_ms??1000;

export function makeChart(id, keys, names, colors) {
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

export function refreshData() {
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

export function update(drawCharts=true){
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
  $('#demo-mode').onclick=()=>{app.current=app.demo;app.position=0;app.render();};
   $('#live-mode').onclick=()=>{$('#demo-mode').classList.remove('selected');$('#live-mode').classList.add('selected');$('#live-form').hidden=false;if(!app.liveActive){$('#mode-help').textContent='Busca una sesión o escribe el ID del dispositivo.';$('#live-form input').focus();}};
   $('#find-session').onclick=()=>buscarSesiones(get,connectLive,toast,{modo:'vivo',verAnteriores:()=>buscarSesiones(get,historialSesion,toast,{modo:'historial'})});
  $('#live-form').onsubmit=e=>{e.preventDefault();connectLive(new FormData(e.target).get('session'));};
 }
}
