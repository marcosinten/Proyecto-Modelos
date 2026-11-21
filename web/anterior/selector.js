import {recepcion, estadoRecepcion, cargarSesiones} from './telemetria.js';

// Each opening owns a dialog, polls only while open and ignores late results.
// modo 'vivo': solo sesiones que reciben datos ahora (≤ VENTANA_CONECTABLE_MS con el reloj de la API).
// modo 'historial': todas las sesiones guardadas.
export function buscarSesiones(get, seleccionar, toast, {modo='historial', accion, verAnteriores}={}) {
  const vivo=modo==='vivo';
  accion??=vivo?'Conectar':'Ver mediciones';
  const dialog=document.createElement('dialog');
  dialog.className='session-picker';
  dialog.dataset.modo=modo;
  dialog.setAttribute('aria-label',vivo?'Sesiones que están enviando datos':'Buscar sesiones');
  dialog.innerHTML=`<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form>
    <h2>${vivo?'Sesiones enviando datos ahora':'Buscar sesiones'}</h2>
    <p class="helper">${vivo?'Solo aparecen las sesiones que recibieron datos en los últimos 10 s. La lista se actualiza sola.':'Todas las sesiones guardadas, ordenadas por última recepción en la API.'}</p>
    <label>Filtrar por ID <input type="search" placeholder="Parte del identificador"></label>
    <div class="session-list" aria-live="polite"></div><small role="status"></small>`;
  document.body.append(dialog);dialog.showModal();
  const list=dialog.querySelector('.session-list'),filter=dialog.querySelector('input');
  let sesiones=[], ahora=0, timer, cargado=false;
  function fila(s, activa){
    const row=document.createElement('article');
    if(activa)row.className='session-active';
    const {edad,etiqueta}=estadoRecepcion(s.ultima_recepcion_ms,ahora);
    row.innerHTML=`${activa?'<span class="session-active-label">Sesión activa</span>':''}<code></code><small></small><div class="session-row-actions"><button class="secondary small">Copiar ID</button> <button class="primary small">Conectar</button></div>`;
    row.querySelector('code').textContent=s.id;
    row.querySelector('.primary').textContent=accion;
    const origen=s.origen==='real'?'Real':'Simulada';
    const info=row.querySelector('small');
    if(vivo){
      info.textContent=`${origen} · hace ${Math.floor(edad/1000)} s · `;
      const tag=document.createElement('span');
      tag.className='badge '+(etiqueta==='Recibiendo'?'success':'warning');
      tag.textContent=etiqueta;
      info.append(tag);
    } else info.textContent=`${origen} · ${s.mediciones} muestras · ${recepcion(s.ultima_recepcion_ms,ahora,s.mediciones)}`;
    row.querySelector('.secondary').onclick=async()=>{try{await navigator.clipboard.writeText(s.id);toast('ID copiado');}catch{toast('Selecciona el ID para copiarlo.');}};
    row.querySelector('.primary').onclick=()=>{dialog.close();seleccionar(s.id);};
    return row;
  }
  function draw(){
    if(!cargado)return;
    const fragment=document.createDocumentFragment();
    const texto=filter.value.trim().toLowerCase();
    const visibles=sesiones.filter(s=>s.id.toLowerCase().includes(texto));
    for(const s of visibles)fragment.append(fila(s, vivo && sesiones.length===1));
    if(!visibles.length){
      if(vivo && !sesiones.length){
        const vacio=document.createElement('div');
        vacio.className='session-empty';
        vacio.innerHTML='<p>Ninguna sesión está enviando datos ahora. Enciende el carro: cuando el ESP32 se conecte al Wi-Fi aparecerá aquí sola.</p><button type="button" class="secondary small">Ver sesiones anteriores</button>';
        vacio.querySelector('button').onclick=()=>{dialog.close();verAnteriores?.();};
        if(!verAnteriores)vacio.querySelector('button').remove();
        fragment.append(vacio);
      } else fragment.append('No hay sesiones con ese ID.');
    }
    // Conserva el foco si estaba en un botón de la lista (la lista se rehace cada 2,5 s).
    const enfocado=list.contains(document.activeElement)?[...list.querySelectorAll('button')].indexOf(document.activeElement):-1;
    list.replaceChildren(fragment);
    if(enfocado>=0)list.querySelectorAll('button')[enfocado]?.focus();
  }
  async function load(){
    try {
      const r=await cargarSesiones(get,modo,()=>dialog.open);
      if(!r)return;
      ({sesiones,ahora}=r);
      cargado=true;draw();dialog.querySelector('[role=status]').textContent='';
    } catch {if(dialog.open)dialog.querySelector('[role=status]').textContent='No se pudo actualizar. Reintentando…';}
    if(dialog.open)timer=setTimeout(load,2500);
  }
  dialog.onclose=()=>{clearTimeout(timer);dialog.remove();};
  filter.oninput=draw;filter.focus();list.textContent='Consultando…';load();
  return dialog;
}
