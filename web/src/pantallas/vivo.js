// En vivo: conexión a una sesión, consulta periódica de la postura, avisos de evento guardado
// y de sesión nueva.
import {app, $, escape, seconds, get, toast} from '../app.js';
import {vueltasEntre, VENTANA, PAUSA_MS, recepcion, sesionMasReciente} from '../telemetria.js';
import {horaAproximadaMs, textoHora, NOTA_HORA} from '../../../compartido/hora.js';
import {refreshData, update, start} from './monitor.js';
import {loadEvents, refrescarRecientes} from './historial.js';

export const tipoAviso={golpe:'Golpe',inclinacion:'Inclinación',vuelco:'Vuelco'};

export async function connectLive(id){
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

export function avisarEvento(ev,horaMs){
 const hora=textoHora(horaMs);
 let aviso=$('#event-saved');
 if(!aviso){aviso=document.createElement('div');aviso.id='event-saved';aviso.className='live-notice event-saved';aviso.setAttribute('role','status');$('#live-notices').prepend(aviso);}
 aviso.innerHTML=`<strong>Evento guardado: ${escape(tipoAviso[ev.tipo]||ev.tipo)} · ${hora?`${hora}</strong> <small>(${NOTA_HORA})</small>`:`${seconds(ev.t_deteccion_ms)} s de sesión</strong> <small>(hora sin medir)</small>`} <a href="#explicar/${escape(ev.id)}">Explicar →</a>`;
 aviso.classList.remove('flash');void aviso.offsetWidth;aviso.classList.add('flash');
}

export function avisarSesionNueva(s,ahora,ignorar){
 const aviso=document.createElement('div');
 aviso.id='new-session';aviso.className='live-notice new-session';aviso.setAttribute('role','alert');
 aviso.innerHTML=`<span>Otra sesión real está recibiendo datos: <code></code> · hace ${Math.floor(Math.max(0,ahora-s.ultima_recepcion_ms)/1000)} s. ¿Se reinició el ESP32?</span><button type="button" class="primary small">Cambiar a la nueva sesión</button><button type="button" class="text-button">Ignorar</button>`;
 aviso.querySelector('code').textContent=s.id;
 aviso.querySelector('.primary').onclick=()=>{aviso.remove();connectLive(s.id);};
 aviso.querySelector('.text-button').onclick=()=>{ignorar();aviso.remove();};
 $('#live-notices').append(aviso);
}
