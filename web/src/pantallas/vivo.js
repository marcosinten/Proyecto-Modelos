import {actualizarCierreAutomatico} from './prueba-fisica.js';
// En vivo: conexión a una sesión, consulta periódica de la postura, avisos de evento guardado
// y de sesión nueva.
import {app, $, escape, seconds, get, toast} from '../app.js';
import {vueltasEntre, PAUSA_MS, recepcion, sesionMasReciente, textoConexion} from '../telemetria.js';
import {horaAproximadaMs, textoHora, NOTA_HORA} from '../../../compartido/hora.js';
import {refreshData, update, start, pintarEventos, ponerConexion, estadoConexion, valorEvento, segundosRango, RANGO_INICIAL} from './monitor.js';

// Ventana en vivo seleccionable: 6 s, 30 s, 2 min o la sesión completa, a 50 Hz. /ultima entrega hasta
// 1000 muestras; para ventanas mayores se rellena hacia atrás con /mediciones al (re)conectar.
const MAX_ULTIMA = 1000;
const ventanaS = () => app.ventanaS ?? segundosRango(RANGO_INICIAL);
const muestrasVentana = () => ventanaS() * 50;
async function rellenar(id, datos, valid) {
  const faltan = muestrasVentana() - datos.length;
  if (faltan <= 0 || !datos.length || datos[0].numero <= 1) return datos;
  const antes = [];
  let cursor = Math.max(0, datos[0].numero - 1 - faltan);
  while (cursor < datos[0].numero - 1) {
    const r = await get(`/sesiones/${id}/mediciones?despues_numero=${cursor}&limite=1000`);
    if (!valid() || !r.mediciones.length) break;
    antes.push(...r.mediciones.filter(m => m.numero < datos[0].numero));
    cursor = r.siguiente_numero;
    if (!r.hay_mas) break;
  }
  return [...antes, ...datos];
}
import {loadEvents, refrescarRecientes} from './historial.js';
import {montarRegistroPrueba} from './prueba-fisica.js';

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
 $('#ventana').hidden=false;
 $('.monitor').classList.add('en-vivo');
 $('#live-form').hidden=true;
 $('#sesion-actual').hidden=false;$('#sesion-actual').textContent=id;$('#cambiar-sesion').hidden=false;$('#copiar-sesion').hidden=false;
 ponerConexion('Conectando…','atrasada');app.reloj=null;
 for(const s of ['play','reset','timeline','speed'])$('#'+s).disabled=true;
 btn.hidden=true;$('#find-session').textContent='Cambiar sesión';$('#accion-sesion').textContent='Cambiar sesión';
 for(const s of ['ax','ay','az','roll','pitch','clock','sample-time','graph-reading','protocol','samples','estado-texto','estado-detalle','acel-total','rueda-estado'])$('#'+s).textContent='—';
 $('#car').style.visibility='hidden';refreshData();
 let reset=true, lastRecepcion=null, markerKey='', eventoVisto;
 app.reiniciarVivo=()=>{if(valid())reset=true;};
 $('#live-notices').replaceChildren();
 montarRegistroPrueba(session,valid);
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
     const r=await get(`/sesiones/${id}/ultima?ventana=${Math.min(MAX_ULTIMA,muestrasVentana())}${since}`);
     if(!valid())return;
     let data=r.mediciones;
     if(reset||r.recortada)data=await rellenar(id,data,valid);
     if(!valid())return;
     lastRecepcion=r.ultima_recepcion_ms;
     app.reloj={ultima_recepcion_ms:r.ultima_recepcion_ms??null,t_ultima_medicion_ms:r.medicion?.t_ms??null};
     const oldStale=app.stale;
     app.stale=lastRecepcion==null || r.ahora_ms-lastRecepcion>PAUSA_MS;
     $('#mode-help').textContent=recepcion(lastRecepcion,r.ahora_ms,!!r.medicion);
     ponerConexion(textoConexion(lastRecepcion,r.ahora_ms),estadoConexion(lastRecepcion,r.ahora_ms));
     if(!reset && !r.recortada && data.length && !app.stale){
       let a=prev, delta=0;
       for(const b of data){delta+=vueltasEntre(a,b);a=b;}
       if(delta>0){
         app.wheelFrom=app.liveTurns;app.wheelTo+=delta;app.wheelStart=performance.now();
         app.wheelDuration=Math.max(100,Math.min(240,a.t_ms-(prev??data[0]).t_ms));
       }
     }
     app.current.mediciones=reset||r.recortada?data:[...app.current.mediciones,...data];
     // Conserva la ventana elegida por tiempo (6 s, 30 s, 2 min o toda la sesión).
     const desde=app.current.mediciones.at(-1)?.t_ms-ventanaS()*1000;
     const corte=app.current.mediciones.findIndex(m=>m.t_ms>desde);
     if(corte>0)app.current.mediciones=app.current.mediciones.slice(corte);
     reset=false;
     const events=r.eventos.filter(e=>e.t_deteccion_ms>=start());
     const key=JSON.stringify([r.ultimo_evento?.id,events.map(e=>e.id)]);
     app.current.eventos=events;app.current.evento=r.ultimo_evento;
     actualizarCierreAutomatico();
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
       if(key!==markerKey)pintarEventos();
       else if(oldStale!==app.stale)update();
     }
     markerKey=key;
   } catch(e){
     if(!valid())return;
     reset=true;app.stale=true;app.wheelTo=app.liveTurns;
     ponerConexion('Conexión interrumpida · reintentando','desconectada');
     $('#mode-help').textContent='Conexión interrumpida. Reintentando…'+(lastRecepcion?' Última recepción: '+new Date(lastRecepcion).toLocaleString('es-EC'):'');
     if(app.current.mediciones.length)update();
   }
   if(valid())app.liveTimer=setTimeout(poll,200);
 }
 poll();
}

// Aviso «Evento guardado»: píldora con el tipo, el valor principal y la hora; dura 4 s y se apilan
// como mucho 3 (la más nueva arriba). #event-saved es siempre la más reciente.
const MAX_AVISOS = 3, DURACION_AVISO_MS = 4000, SALIDA_MS = 200;
export function avisarEvento(ev,horaMs){
 const caja=$('#avisos-evento'); if(!caja)return;
 const hora=textoHora(horaMs);
 const {valor}=valorEvento(ev,app.current.mediciones);
 caja.querySelector('#event-saved')?.removeAttribute('id');
 const aviso=document.createElement('div');
 aviso.className='aviso-evento';aviso.id='event-saved';aviso.dataset.tipo=ev.tipo;
 aviso.innerHTML=`<svg class="visto" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12.5"/><path d="M9 14.5l3.4 3.4L19.5 10.8"/></svg><strong>Evento guardado</strong><span class="chip-evento"></span>`;
 const chip=aviso.querySelector('.chip-evento');
 chip.dataset.tipo=ev.tipo;
 chip.textContent=[tipoAviso[ev.tipo]||ev.tipo,valor,hora??`${seconds(ev.t_deteccion_ms)} s de sesión`].filter(Boolean).join(' · ');
 chip.title=hora?`Hora ${NOTA_HORA}`:'Hora sin medir';
 caja.prepend(aviso);
 while(caja.children.length>MAX_AVISOS)caja.lastElementChild.remove();
 const sinMovimiento=matchMedia('(prefers-reduced-motion: reduce)').matches;
 setTimeout(()=>{aviso.classList.add('sale');setTimeout(()=>aviso.remove(),sinMovimiento?0:SALIDA_MS);},DURACION_AVISO_MS);
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
