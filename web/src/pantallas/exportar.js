// Diálogo de exportación: Resumen y Datos técnicos (sesión completa en vivo, o evento/corrida).
import {app, $, escape, get, toast} from '../app.js';
import {paginasSesion} from '../telemetria.js';
import {crearExcel} from '../../../compartido/libro-excel.js';

export function openExport(){
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
