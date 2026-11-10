import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './style.css';
import Chart from 'chart.js/auto';
import {crearVisor} from './car.js';
import {generarEscenario} from './simulation.js';
import ev1 from '../../ejemplos/vuelco.json';
import ev2 from '../../ejemplos/vuelco-002.json';

const $ = s => document.querySelector(s);
const number = n => Number(n).toLocaleString('es-EC',{maximumFractionDigits:2,minimumFractionDigits:2});
const escape = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label = {golpe:'Impacto',vuelco:'Vuelco',inclinacion:'Inclinación',alta:'Alta',media:'Media',baja:'Baja'};
let current=ev2, page='monitor', running=false, position=1500, speed=1, lastFrame=0;
let viewer, charts=[], events=[ev2,ev1], apiAvailable=false, liveTimer, liveSession='', cursor=0;
let liveSamples=[], liveActive=false, pageNumber=0, previousRuns=[];
let liveBusy=false, liveGeneration=0;
async function request(path,body) {
 const response=await fetch('/api/v1'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(6000)});
 if(!response.ok){const e=await response.json().catch(()=>({}));throw new Error(e.error?.mensaje||'No se pudo completar la solicitud');}
 return response;
}
function toast(message) {$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function layout() {
 $('#app').innerHTML=`<aside><a class="brand" href="#monitor"><span class="brand-icon">↗</span><span>telemetría<span class="brand-small">RC / GRUPO 11</span></span></a><div class="nav-caption">ESPACIO DE TRABAJO</div><nav><a href="#monitor" data-nav="monitor">◉ <span>Monitor</span></a><a href="#simulacion" data-nav="simulacion">▷ <span>Simulación</span></a><a href="#historial" data-nav="historial">▤ <span>Historial</span></a></nav><div class="aside-bottom"><span class="status-dot"></span> Laboratorio de movimiento<small>Modelos y Simulación · Grupo 11</small></div></aside><div class="workspace"><header><span>Proyecto experimental <span class="divider">/</span> Telemetría vehicular</span><span id="connection" class="badge neutral">Comprobando API</span></header><main id="main"></main><footer>TELEMETRÍA RC <span>Datos en movimiento. Decisiones con contexto.</span><span>Grupo 11 · v1.1</span></footer></div><div id="toast" role="status"></div><dialog id="export-dialog"><form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><div id="export-body"></div></dialog>`;
}
function heading(title,description,action='') {return `<div class="page-heading"><div><div class="eyebrow">OBSERVAR · ANALIZAR · COMPRENDER</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;}
function metric(name,id,unit,color='') {return `<div class="metric"><span><i style="background:${color||'#64748b'}"></i>${name}</span><strong id="${id}">—</strong><small>${unit}</small></div>`;}
function dashboard() {
 return `<div class="metrics">${metric('Aceleración X','ax','m/s²','#1d4ed8')}${metric('Aceleración Y','ay','m/s²','#0f766e')}${metric('Aceleración Z','az','m/s²','#7e22ce')}${metric('Inclinación lateral','roll','Roll · grados')}${metric('Inclinación frontal','pitch','Pitch · grados')}</div><div class="visual-grid"><section class="card stage-card"><div class="card-title"><div><h2>Postura del carro</h2><p>Orientación medida · recorrido ilustrativo en simulación</p></div><span class="badge purple" id="origin">Datos simulados</span></div><div class="stage"><div class="scene-label"><span class="status-dot"></span> VISTA 3D <small id="sample-time">1 500 ms</small></div><div id="car"></div><div class="camera-controls"><button data-camera="lateral" class="selected">Lateral</button><button data-camera="perspectiva">3/4</button><button data-camera="frontal">Frontal</button><button data-camera="libre" title="Arrastra para girar y usa la rueda o pellizca para acercar">Libre 3D</button></div><span class="axis-guide">X → &nbsp; Y ↗ &nbsp; Z ↑</span></div><div class="player"><div class="player-top"><button id="play" class="primary small">▶ Reproducir</button><button id="reset" class="secondary small" title="Volver al inicio">↺ Reiniciar</button><label class="speed"><span>Velocidad</span><select id="speed"><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label><span class="mono" id="clock"></span></div><input id="timeline" type="range" aria-label="Tiempo de la sesión en milisegundos" step="1"><div class="timeline-labels"><span id="range-start"></span><span>Tiempo desde inicio de sesión</span><span id="range-end"></span></div></div></section><div class="chart-stack"><section class="card"><div class="card-title"><h2>Aceleración por eje</h2><span class="unit">m/s²</span></div><div class="chart-wrap"><canvas id="accel"></canvas></div></section><section class="card"><div class="card-title"><h2>Inclinación</h2><span class="unit">grados</span></div><div class="chart-wrap"><canvas id="angles"></canvas></div></section></div></div><div class="result-strip" id="result"></div><details class="card data-table"><summary>Ver tabla de mediciones <span id="sample-count"></span></summary><div class="table-scroll" id="samples"></div></details>`;
}
function render() {
 running=false; clearInterval(liveTimer); liveGeneration++; liveActive=false;
 viewer?.destroy(); charts.forEach(c=>c.destroy());charts=[];
 document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===page));
 if(page==='historial'){renderHistory();return;}
 const detail=page==='detalle';
 const simulation=page==='simulacion';
 let title=detail?`${label[current.evento.tipo]||current.evento.tipo} · ${current.evento.id}`:simulation?'Simulación de incidentes':'Monitor de telemetría';
 const desc=detail?`Sesión ${current.sesion.id} · Reproducción de las mediciones registradas`:simulation?'Explora escenarios y observa cómo responden las reglas de detección.':'Una vista completa del movimiento, la orientación y los incidentes del carro.';
 $('#main').innerHTML=(detail?'<a class="back" href="#historial">← Volver al historial</a>':'')+heading(title,desc,`<button class="secondary" id="export">↓ Exportar Excel</button>`)+(simulation?simulationForm():detail?'':`<div class="mode-row"><div class="tabs"><button id="demo-mode" class="selected">Demostración</button><button id="live-mode">En vivo</button></div><span class="helper" id="mode-help">Escenario local · puedes explorarlo sin conectar el circuito</span></div><form id="live-form" hidden><label>Identificador de sesión <input name="session" placeholder="SES-001 o ID del ESP32" required pattern="[A-Za-z0-9_-]{1,64}"></label><button class="primary">Conectar sesión</button></form>`)+dashboard()+(!simulation&&!detail?`<section class="card recent"><div class="card-title"><div><h2>Eventos recientes</h2><p>El registro de tus últimas pruebas</p></div><a href="#historial">Ver historial →</a></div>${eventTable(events.slice(0,3))}</section>`:'');
 $('#export').onclick=openExport;
 viewer=crearVisor($('#car'));
 if(viewer.mode==='2d'){
   document.querySelector('.scene-label').innerHTML='<span class="status-dot"></span> VISTA 2D <small id="sample-time"></small>';
   document.querySelector('[data-camera=perspectiva]').hidden=true;
   document.querySelector('[data-camera=libre]').hidden=true;
 }
 document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>{viewer.camera(b.dataset.camera);document.querySelectorAll('[data-camera]').forEach(x=>x.classList.toggle('selected',x===b));});
 $('#play').onclick=()=>{if(position>=end())position=start();running=!running;lastFrame=0;update();};
 $('#reset').onclick=()=>{running=false;position=start();update();};
 $('#speed').onchange=e=>speed=Number(e.target.value);
 $('#timeline').oninput=e=>{running=false;position=Number(e.target.value);update();};
 charts=[makeChart('accel',['ax','ay','az'],['X','Y','Z'],['#1d4ed8','#0f766e','#7e22ce']),makeChart('angles',['roll_deg','pitch_deg'],['Roll','Pitch'],['#1d4ed8','#d97706'])];
 bindRows(); refreshData();
 if(simulation)bindSimulation();
 if(!simulation&&!detail){
  $('#demo-mode').onclick=()=>{current=ev2;position=1500;render();};
  $('#live-mode').onclick=()=>{$('#live-form').hidden=false;$('#mode-help').textContent='Escribe la sesión creada por el dispositivo o el emisor de pruebas.';$('#live-form input').focus();};
  $('#live-form').onsubmit=e=>{e.preventDefault();connectLive(new FormData(e.target).get('session'));};
 }
}
const start=()=>current.evento?.t_inicio_ms??current.mediciones[0]?.t_ms??0;
const end=()=>current.evento?.t_fin_ms??current.mediciones.at(-1)?.t_ms??1000;
function makeChart(id,keys,names,colors) {
 const cursorPlugin={id:'timeCursor',afterDraw(chart){const {ctx,chartArea,scales}=chart;const x=scales.x.getPixelForValue(position);if(x<chartArea.left||x>chartArea.right)return;ctx.save();ctx.setLineDash([3,4]);ctx.strokeStyle='#94a3b8';ctx.beginPath();ctx.moveTo(x,chartArea.top);ctx.lineTo(x,chartArea.bottom);ctx.stroke();ctx.restore();}};
 return new Chart($('#'+id),{type:'line',data:{datasets:keys.map((k,i)=>({label:names[i],data:current.mediciones.map(m=>({x:m.t_ms,y:m[k]})),borderColor:colors[i],backgroundColor:colors[i],borderDash:i===1?[6,3]:i===2?[2,3]:[],borderWidth:2,pointRadius:current.mediciones.length<10?3:0,tension:0}))},plugins:[cursorPlugin],options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false},onClick:(e)=>{if(!liveActive){position=Math.max(start(),Math.min(end(),charts.find(c=>c.canvas.id===id).scales.x.getValueForPixel(e.x)));running=false;update();}},plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:7,font:{family:'Inter',size:11}}}},scales:{x:{type:'linear',min:start(),max:end(),grid:{display:false},ticks:{maxTicksLimit:5,font:{size:10}},title:{display:true,text:'Tiempo de sesión (ms)',font:{size:10}}},y:{grid:{color:'#eef2f7'},ticks:{maxTicksLimit:4,font:{size:10}}}}}});
}
function refreshData() {
 $('#timeline').min=start();$('#timeline').max=end();
 $('#range-start').textContent=start()+' ms';$('#range-end').textContent=end()+' ms';
 $('#sample-count').textContent=current.mediciones.length+' muestras';
 $('#samples').innerHTML='<table><thead><tr>'+['Muestra','Tiempo (ms)','X (m/s²)','Y (m/s²)','Z (m/s²)','Roll (°)','Pitch (°)'].map(s=>'<th>'+s+'</th>').join('')+'</tr></thead><tbody>'+current.mediciones.slice(-1000).map(m=>'<tr>'+[m.numero,m.t_ms,m.ax,m.ay,m.az,m.roll_deg,m.pitch_deg].map(v=>'<td>'+number(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 const e=current.evento;
 $('#result').innerHTML=e?`<span class="event-mark">↻</span><div><strong>${escape(label[e.tipo]||e.tipo)} detectado</strong><small>Detección ${e.t_deteccion_ms} ms · Activación ${e.t_activacion_ms??'sin medir'}${e.t_activacion_ms===null?'':' ms'}</small></div><span class="badge ${e.gravedad==='alta'?'danger':'warning'}">${label[e.gravedad]}</span><div class="result-response"><strong>${e.t_activacion_ms===null?'—':e.t_activacion_ms-e.t_deteccion_ms+' ms'}</strong><small>Tiempo de respuesta</small></div><small>${e.ubicacion?escape(e.ubicacion.latitud+', '+e.ubicacion.longitud):'Sin ubicación disponible'}</small>`:'<span class="status-dot"></span><div><strong>Sin incidente detectado</strong><small>Resultado de las reglas de esta corrida</small></div>';
 charts.forEach((c,i)=>{const keys=i?['roll_deg','pitch_deg']:['ax','ay','az'];c.data.datasets.forEach((d,j)=>d.data=current.mediciones.map(m=>({x:m.t_ms,y:m[keys[j]]})));c.options.scales.x.min=start();c.options.scales.x.max=end();c.update();});update();
}
function update(){
 const m=current.mediciones.findLast(m=>m.t_ms<=position)??current.mediciones[0];if(!m)return;
 for(const key of ['ax','ay','az'])$('#'+key).textContent=number(m[key]);
 $('#roll').textContent=number(m.roll_deg)+'°';$('#pitch').textContent=number(m.pitch_deg)+'°';
 $('#sample-time').textContent=Math.round(position)+' ms';$('#clock').textContent=(position/1000).toFixed(2)+' / '+(end()/1000).toFixed(2)+' s';
 $('#timeline').value=position;$('#play').textContent=running?'Ⅱ Pausar':'▶ Reproducir';
 const avance = !liveActive && current.sesion.origen === 'simulado' && end() > start()
   ? Math.min(1, Math.max(0, (position-start())/(end()-start())))
   : undefined;
 viewer.update(m, avance);
 charts.forEach(c=>c.draw());
}
function frame(time){if(running){if(lastFrame)position=Math.min(end(),position+(time-lastFrame)*speed);lastFrame=time;if(position>=end())running=false;update();}requestAnimationFrame(frame);}
function eventTable(list){return `<div class="table-scroll"><table><thead><tr><th>Evento / sesión</th><th>Tipo</th><th>Gravedad</th><th>Origen</th><th>Respuesta</th><th></th></tr></thead><tbody>${list.map(p=>`<tr><td><strong>${escape(p.evento.id)}</strong><small>${escape(p.sesion.id)}</small></td><td>${escape(label[p.evento.tipo]||p.evento.tipo)}</td><td><span class="badge ${p.evento.gravedad==='alta'?'danger':'warning'}">${escape(label[p.evento.gravedad]||p.evento.gravedad)}</span></td><td><span class="badge ${p.sesion.origen==='real'?'neutral':'purple'}">${p.sesion.origen==='real'?'Real':'Simulado'}</span></td><td class="mono">${p.evento.t_activacion_ms===null?'—':p.evento.t_activacion_ms-p.evento.t_deteccion_ms+' ms'}</td><td><button class="text-button" data-event="${escape(p.evento.id)}">Ver detalle →</button></td></tr>`).join('')||'<tr><td colspan="6">No hay eventos con estos filtros.</td></tr>'}</tbody></table></div>`;}
function bindRows(){document.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>{current=events.find(p=>p.evento.id===b.dataset.event);position=current.evento.t_deteccion_ms;location.hash='detalle';});}
function renderHistory(){
 $('#main').innerHTML=heading('Historial de eventos','Consulta, reproduce y exporta los registros de tus pruebas.',`<button id="reload" class="secondary">↻ Actualizar</button>`)+`<div class="filters card"><label>Buscar<input id="search" placeholder="Evento o sesión"></label><label>Tipo<select id="type"><option value="">Todos los tipos</option><option value="vuelco">Vuelco</option><option value="golpe">Impacto</option><option value="inclinacion">Inclinación</option></select></label><label>Gravedad<select id="severity"><option value="">Todas</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label><label>Origen<select id="filter-origin"><option value="">Todos</option><option value="simulado">Simulado</option><option value="real">Real</option></select></label><button class="text-button" id="clear">Limpiar filtros</button></div><section class="card" id="history-list"></section><div class="pagination"><button class="secondary" id="prev">← Anterior</button><span id="page-count"></span><button class="secondary" id="next">Siguiente →</button></div><p class="helper">${apiAvailable?'Registros consultados en la API local.':'Ejemplos locales disponibles mientras la API está desconectada.'}</p>`;
 const filtered=()=>events.filter(p=>(p.evento.id+' '+p.sesion.id).toLowerCase().includes($('#search').value.toLowerCase())&&(!$('#type').value||p.evento.tipo===$('#type').value)&&(!$('#severity').value||p.evento.gravedad===$('#severity').value)&&(!$('#filter-origin').value||p.sesion.origen===$('#filter-origin').value));
 function draw(){const list=filtered();pageNumber=Math.min(pageNumber,Math.max(0,Math.ceil(list.length/8)-1));$('#history-list').innerHTML=eventTable(list.slice(pageNumber*8,pageNumber*8+8));$('#page-count').textContent=list.length+' eventos · Página '+(pageNumber+1);$('#prev').disabled=pageNumber===0;$('#next').disabled=(pageNumber+1)*8>=list.length;bindRows();}
 for(const s of ['search','type','severity','filter-origin'])$('#'+s).oninput=()=>{pageNumber=0;draw();};
 $('#prev').onclick=()=>{pageNumber--;draw();};$('#next').onclick=()=>{pageNumber++;draw();};
 $('#clear').onclick=()=>{for(const s of ['search','type','severity','filter-origin'])$('#'+s).value='';draw();};
 $('#reload').onclick=async()=>{await loadEvents();renderHistory();};draw();
}
function simulationForm(){return `<form id="simulation-form" class="card simulation-form"><label>Escenario<select name="type"><option value="vuelco">Vuelco</option><option value="normal">Marcha normal</option><option value="frenada">Frenada brusca</option><option value="impacto">Impacto</option><option value="inclinacion">Inclinación</option></select></label><label>Umbral de aceleración (m/s²)<input name="acceleration" type="number" min="10" max="100" step="0.1" value="16" required></label><label>Ángulo mínimo (°)<input name="angle" type="number" min="5" max="180" value="60" required></label><label>Permanencia (ms)<input name="duration" type="number" min="0" max="5000" step="100" value="100" required></label><button class="primary">▷ Ejecutar simulación</button><button type="reset" class="secondary">Restablecer</button><p class="helper">Señales sintéticas · Reglas experimentales sobre aceleración total e inclinación · Muestreo 100 ms</p></form><div id="simulation-actions"><button class="secondary" id="save-run">Guardar evento en API</button><span class="helper" id="simulation-status">Ejecuta un escenario para obtener un resultado.</span></div><details class="card compare"><summary>Comparar corridas de esta sesión</summary><div id="comparisons"></div></details>`;}
function bindSimulation(){
 $('#simulation-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);current=generarEscenario(f.get('type'),Number(f.get('acceleration')),Number(f.get('angle')),Number(f.get('duration')));previousRuns.push(current);position=0;running=false;refreshData();$('#simulation-status').textContent=current.evento?'Evento listo para guardar. La activación física está sin medir.':'Sin incidente. Puedes exportar las mediciones.';$('#save-run').disabled=!current.evento;$('#comparisons').innerHTML='<div class="table-scroll"><table><tr><th>Escenario</th><th>Umbral</th><th>Ángulo</th><th>Permanencia</th><th>Resultado</th></tr>'+previousRuns.map(p=>`<tr><td>${escape(p.parametros.escenario)}</td><td>${p.parametros.aceleracion} m/s²</td><td>${p.parametros.angulo}°</td><td>${p.parametros.permanencia} ms</td><td>${p.evento?escape(label[p.evento.tipo]):'Sin incidente'}</td></tr>`).join('')+'</table></div>';};
 $('#save-run').disabled=!current.parametros||!current.evento;
 $('#save-run').onclick=async()=>{const button=$('#save-run');button.disabled=true;const p=current;try{await request('/sesiones',{version:1,sesion:p.sesion});await request('/sesiones/'+p.sesion.id+'/mediciones',{version:1,mediciones:p.mediciones});await request('/eventos',{version:1,evento:p.evento});toast('Evento guardado. Disponible en el historial.');await loadEvents();}catch(e){toast(e.message);button.disabled=false;}};
}
async function connectLive(id){
 const generation=++liveGeneration;clearInterval(liveTimer);running=false;cursor=0;liveSamples=[];liveSession=id;
 try {const session=(await (await request('/sesiones/'+id)).json()).sesion;if(generation!==liveGeneration)return;current={version:1,sesion:session,evento:null,mediciones:[]};liveActive=true;$('#origin').textContent=session.origen==='real'?'Mediciones reales':'Emisor simulado';$('#mode-help').textContent='Consultando sesión '+id;$('#play').disabled=true;$('#timeline').disabled=true;
 async function poll(){if(liveBusy||generation!==liveGeneration)return;liveBusy=true;try{const r=await (await request('/sesiones/'+id+'/mediciones?despues_numero='+cursor+'&limite=1000')).json();if(generation!==liveGeneration)return;cursor=r.siguiente_numero;liveSamples.push(...r.mediciones);current.mediciones=liveSamples.slice(-1000);$('#mode-help').textContent=r.mediciones.length?'Lecturas recibidas · '+liveSamples.length+' muestras':'Esperando nuevas mediciones · '+liveSamples.length+' recibidas';if(current.mediciones.length){position=current.mediciones.at(-1).t_ms;refreshData();}}catch(e){if(generation===liveGeneration)$('#mode-help').textContent='Conexión interrumpida. Reintentando…';}finally{liveBusy=false;}}
 await poll();liveTimer=setInterval(poll,500);
 }catch(e){toast(e.message);}
}
async function loadEvents(){try{let list=[],offset=0;while(true){const r=await (await request('/eventos?limite=200&offset='+offset)).json();list.push(...r.eventos);if(!r.hay_mas)break;offset=r.siguiente_offset;}const loaded=[];for(const e of list){loaded.push(await (await request('/eventos/'+e.id)).json());}events=loaded;apiAvailable=true;}catch{apiAvailable=false;}$('#connection').textContent=apiAvailable?'● API conectada':'○ Modo local';$('#connection').className='badge '+(apiAvailable?'success':'neutral');}
function openExport(){
 const p=structuredClone(current);
 $('#export-body').innerHTML=`<div class="export-icon">↓</div><h2>Exportar ${p.evento?'evento':'corrida'}</h2><p>Las mediciones del escenario seleccionado, listas para analizar.</p><div class="export-info"><strong>${escape(p.evento?.id||p.sesion.id)}.xlsx</strong><span>${p.mediciones.length} mediciones · ${p.sesion.origen==='real'?'Datos reales':'Datos simulados'}</span><small>Hojas Datos, ${p.evento?'Evento, ':''}Metadatos${p.parametros?', Parámetros':''}</small></div><div id="export-error" role="alert"></div><div class="dialog-actions"><button id="cancel-export" class="secondary">Cancelar</button><button id="download" class="primary">↓ Descargar .xlsx</button></div>`;
 $('#export-dialog').showModal();$('#cancel-export').onclick=()=>$('#export-dialog').close();
 $('#download').onclick=async()=>{const b=$('#download');b.disabled=true;b.textContent='Preparando archivo…';try{
 const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();
 const sheet=(name,rows)=>{const h=book.addWorksheet(name);if(rows.length){h.columns=Object.keys(rows[0]).map(k=>({header:k,key:k,width:22}));h.addRows(rows);h.getRow(1).font={bold:true};h.views=[{state:'frozen',ySplit:1}];}};
 sheet('Datos',p.mediciones);if(p.evento){const {ubicacion,...e}=p.evento;sheet('Evento',[{...e,latitud:ubicacion?.latitud??null,longitud:ubicacion?.longitud??null,respuesta_ms:e.t_activacion_ms===null?null:e.t_activacion_ms-e.t_deteccion_ms}]);}
 sheet('Metadatos',[{sesion:p.sesion.id,origen:p.sesion.origen,aceleracion:'m/s²',angulos:'grados',tiempo:'ms desde inicio de sesión'}]);if(p.parametros)sheet('Parámetros',[p.parametros]);
 const url=URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=(p.evento?.id||p.sesion.id)+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);$('#export-dialog').close();toast('Descarga iniciada');
 }catch(e){$('#export-error').textContent='No se pudo preparar el archivo. '+e.message;}finally{b.disabled=false;b.textContent='↓ Descargar .xlsx';}};
}
function route(){const hash=location.hash.slice(1);page=['simulacion','historial','detalle'].includes(hash)?hash:'monitor';if(page==='detalle'&&!current.evento){current=ev2;}if(page==='monitor'){current=ev2;position=1500;}if(page==='simulacion'){current=generarEscenario('vuelco');position=0;}render();}
layout();route();requestAnimationFrame(frame);window.addEventListener('hashchange',route);loadEvents().then(()=>{if(page==='monitor'||page==='historial')render();});
