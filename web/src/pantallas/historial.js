// Pantalla Historial: lista de eventos con filtros, mediciones por sesión y la tabla de eventos
// que también usa «Eventos recientes» del Monitor.
import {app, $, number, escape, label, get, toast, heading} from '../app.js';
import {buscarSesiones} from '../selector.js';

export function eventTable(list){return `<div class="table-scroll"><table><thead><tr><th>Evento / sesión</th><th>Tipo</th><th>Gravedad</th><th>Origen</th><th>Respuesta</th><th>Acciones</th></tr></thead><tbody>${list.map(p=>`<tr><td><strong>${escape(p.evento.id)}</strong><small>${escape(p.sesion.id)}</small></td><td>${escape(label[p.evento.tipo]||p.evento.tipo)}</td><td><span class="badge ${p.evento.gravedad==='alta'?'danger':'warning'}">${escape(label[p.evento.gravedad]||p.evento.gravedad)}</span></td><td><span class="badge ${p.sesion.origen==='real'?'neutral':'purple'}">${p.sesion.origen==='real'?'Real':'Simulado'}</span></td><td class="mono">${p.evento.t_activacion_ms===null?'—':p.evento.t_activacion_ms-p.evento.t_deteccion_ms+' ms'}</td><td><div class="event-actions"><button class="text-button" data-event="${escape(p.evento.id)}">Ver detalle</button><button class="explain-action" data-explain="${escape(p.evento.id)}" aria-label="Explicar evento ${escape(p.evento.id)}">Explicar →</button></div></td></tr>`).join('')||'<tr><td colspan="6">No hay eventos con estos filtros.</td></tr>'}</tbody></table></div>`;}

export function tablaMediciones(rows){
 const headers=['Muestra','Tiempo (ms)','X (m/s²)','Y (m/s²)','Z (m/s²)','Lateral (°)','Frontal (°)','Rueda (vueltas/s)','Pulsos'];
 return '<table><thead><tr>'+headers.map(s=>`<th>${s}</th>`).join('')+'</tr></thead><tbody>'+rows.map(m=>'<tr>'+[m.numero,m.t_ms,...[m.ax,m.ay,m.az,m.roll_deg,m.pitch_deg].map(number),m.rueda_rps?.toLocaleString('es-EC',{maximumFractionDigits:3})??'—',m.rueda_pulsos??'—'].map(v=>`<td>${v}</td>`).join('')+'</tr>').join('')+'</tbody></table>';
}

export function historialSesion(id){
 const d=document.createElement('dialog');d.className='session-history';
 d.innerHTML=`<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><h2>Mediciones de ${escape(id)}</h2>
 <form class="sample-jump"><label>Desde la muestra <input type="number" min="1" max="${Number.MAX_SAFE_INTEGER}" step="1" required value="1"></label><button class="secondary">Ir a muestra</button></form>
 <div class="table-scroll"></div><div class="pagination"><button class="secondary">Anterior</button><small role="status"></small><button class="secondary">Siguiente</button></div>`;
 document.body.append(d);d.showModal();d.onclose=()=>d.remove();
 const cursores=[0], [prev,next]=d.querySelectorAll('.pagination button');
 let peticion=0;
 const salto=d.querySelector('.sample-jump');
 salto.onsubmit=e=>{
   e.preventDefault();
   const cursor=salto.querySelector('input').valueAsNumber-1;
   if(cursores.at(-1)!==cursor)cursores.push(cursor);
   mostrar();
 };
 async function mostrar(){
   const turno=++peticion;
   prev.disabled=next.disabled=true;
   try{
     const r=await get(`/sesiones/${id}/mediciones?limite=100&despues_numero=${cursores.at(-1)}`);
     if(!d.open||turno!==peticion)return;
     d.querySelector('.table-scroll').innerHTML=tablaMediciones(r.mediciones);
     d.querySelector('.table-scroll').scrollTop=0;
     d.querySelector('small').textContent=r.mediciones.length?`Muestras ${r.mediciones[0].numero}–${r.mediciones.at(-1).numero}`:'No hay mediciones desde ese número.';
     prev.disabled=cursores.length===1;next.disabled=!r.hay_mas;
     next.onclick=()=>{cursores.push(r.siguiente_numero);mostrar();};
     prev.onclick=()=>{cursores.pop();mostrar();};
   }catch(e){if(d.open&&turno===peticion)d.querySelector('small').textContent=e.message;}
 }
 mostrar();
}

export function bindRows(){document.querySelectorAll('[data-event]').forEach(b=>b.onclick=async()=>{
 const generation=app.liveGeneration;
 try{
   const p=app.events.find(p=>p.evento.id===b.dataset.event);
   const detalle=p.mediciones?p:await get('/eventos/'+p.evento.id);
   if(!b.isConnected||generation!==app.liveGeneration)return;
   app.current=detalle;app.position=detalle.evento.t_deteccion_ms;location.hash='detalle';
 }catch(e){toast(e.message);}
});
 document.querySelectorAll('[data-explain]').forEach(b=>b.onclick=()=>{location.hash='explicar/'+b.dataset.explain;});
}

export function renderHistory(){
 $('#main').innerHTML=heading('Historial de eventos','Consulta, reproduce y exporta los registros de tus pruebas.',`<button id="reload" class="secondary">↻ Actualizar</button>`)+`<div class="filters card"><label>Buscar<input id="search" placeholder="Evento o sesión"></label><label>Tipo<select id="type"><option value="">Todos los tipos</option><option value="vuelco">Vuelco</option><option value="golpe">Impacto</option><option value="inclinacion">Inclinación</option></select></label><label>Gravedad<select id="severity"><option value="">Todas</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label><label>Origen<select id="filter-origin"><option value="">Todos</option><option value="simulado">Simulado</option><option value="real">Real</option></select></label><button class="text-button" id="clear">Limpiar filtros</button></div><section class="card" id="history-list"></section><div class="pagination"><button class="secondary" id="prev">← Anterior</button><span id="page-count"></span><button class="secondary" id="next">Siguiente →</button></div><p class="helper">${app.apiAvailable?'Registros consultados en la API local.':'Ejemplos locales disponibles mientras la API está desconectada.'}</p>`;
 const filtered=()=>app.events.filter(p=>(p.evento.id+' '+p.sesion.id).toLowerCase().includes($('#search').value.toLowerCase())&&(!$('#type').value||p.evento.tipo===$('#type').value)&&(!$('#severity').value||p.evento.gravedad===$('#severity').value)&&(!$('#filter-origin').value||p.sesion.origen===$('#filter-origin').value));
 function draw(){const list=filtered();app.pageNumber=Math.min(app.pageNumber,Math.max(0,Math.ceil(list.length/8)-1));$('#history-list').innerHTML=eventTable(list.slice(app.pageNumber*8,app.pageNumber*8+8));$('#page-count').textContent=list.length+' eventos · Página '+(app.pageNumber+1);$('#prev').disabled=app.pageNumber===0;$('#next').disabled=(app.pageNumber+1)*8>=list.length;bindRows();}
 for(const s of ['search','type','severity','filter-origin'])$('#'+s).oninput=()=>{app.pageNumber=0;draw();};
 $('#prev').onclick=()=>{app.pageNumber--;draw();};$('#next').onclick=()=>{app.pageNumber++;draw();};
 $('#clear').onclick=()=>{for(const s of ['search','type','severity','filter-origin'])$('#'+s).value='';draw();};
 $('#reload').insertAdjacentHTML('beforebegin','<button class="secondary" id="history-sessions">Mediciones por sesión</button>');
 $('#history-sessions').onclick=()=>buscarSesiones(get,historialSesion,toast,{modo:'historial'});
 $('#reload').onclick=async()=>{await loadEvents();if(app.page==='historial')renderHistory();};draw();
 // Los eventos nuevos aparecen solos (cada 5 s) sin perder filtros ni página.
 const generation=app.liveGeneration;
 const refrescar=async()=>{
   const antes=app.events.map(p=>p.evento.id).join();
   await loadEvents();
   if(generation!==app.liveGeneration||app.page!=='historial')return;
   if(app.events.map(p=>p.evento.id).join()!==antes)draw();
   app.historyTimer=setTimeout(refrescar,5000);
 };
 app.historyTimer=setTimeout(refrescar,app.apiAvailable?5000:0);
}

export function refrescarRecientes(){
 if(app.page==='monitor'&&$('.recent .table-scroll')){$('.recent .table-scroll').outerHTML=eventTable(app.events.slice(0,3));bindRows();}
}

export async function loadEvents(){
 try{
   let list=[],offset=0;
   while(true){const r=await get('/eventos?limite=200&offset='+offset);list.push(...r.eventos);if(!r.hay_mas)break;offset=r.siguiente_offset;}
   const sessions=new Map();
   for(const e of list)if(!sessions.has(e.sesion_id))sessions.set(e.sesion_id,(await get('/sesiones/'+e.sesion_id)).sesion);
   app.events=list.map(evento=>({evento,sesion:sessions.get(evento.sesion_id)}));app.apiAvailable=true;
 }catch{app.apiAvailable=false;}
 $('#connection').textContent=app.apiAvailable?'● API conectada':'○ Modo local';$('#connection').className='badge '+(app.apiAvailable?'success':'neutral');
}
