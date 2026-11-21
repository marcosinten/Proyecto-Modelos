// Pantalla Explicar: lectura del evento guardado (#explicar/ID).
import {app, $, escape, request, heading} from '../app.js';
import {eventTable, bindRows} from './historial.js';
import {mostrarExplicacion} from '../explanation-view.js';

export async function showExplanation(){
 const id=location.hash.slice('#explicar/'.length);
 const generation=app.liveGeneration;
 $('#main').innerHTML='<a class="back" href="#historial">Volver al historial</a><div class="bloque explain-empty" role="status">Cargando lecturas del evento…</div>';
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)){
  $('#main').innerHTML='<a class="back" href="#historial">Volver al historial</a><div class="bloque explain-empty" role="alert">El identificador del evento no es válido.</div>';return;
 }
 let paquete, aviso='';
 try{paquete=await (await request('/eventos/'+id)).json();}
 catch(e){
  // Sin API solo sirven los paquetes con mediciones (los ejemplos locales).
  paquete=app.events.find(p=>p.evento.id===id&&p.mediciones);
  if(!paquete){
   if(generation===app.liveGeneration&&app.page==='explicar')
    $('#main').innerHTML=`<a class="back" href="#historial">Volver al historial</a><div class="bloque explain-empty" role="alert">No se pudo abrir el evento. ${escape(e.message)} <a href="#historial">Revisa el historial</a> y vuelve a intentarlo.</div>`;
   return;
  }
  aviso='No se pudo actualizar el evento: se muestran las lecturas guardadas en esta página. Si llegaron más datos, vuelve a cargar el historial.';
 }
 if(generation!==app.liveGeneration||app.page!=='explicar'||location.hash!=='#explicar/'+id)return;
 app.cerrarExplicacion=mostrarExplicacion($('#main'),paquete,aviso);
}

// #explicar sin ID: elegir un evento guardado (los más recientes primero).
export function elegirEvento(){
 $('#main').innerHTML=heading('Explicar evento','Elige un evento para leer qué registró el sistema.')+`<section class="tarjeta lista-sesiones">${eventTable(app.events.slice(0,12))}</section>`+
  (app.events.length>12?'<p class="helper" style="margin-top:12px">Se muestran los 12 más recientes. Los demás están en <a href="#historial">Historial</a>.</p>':'');
 bindRows();
}
