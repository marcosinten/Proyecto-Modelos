import {recepcion} from './telemetria.js';

// Each opening owns a dialog, polls only while open and ignores late results.
export function buscarSesiones(get, seleccionar, toast, accion='Conectar') {
  const dialog=document.createElement('dialog');
  dialog.className='session-picker';
  dialog.setAttribute('aria-label','Buscar sesiones');
  dialog.innerHTML=`<form method="dialog"><button class="close" aria-label="Cerrar">×</button></form>
    <h2>Buscar sesiones</h2><p class="helper">Ordenadas por última recepción en la API.</p>
    <label>Filtrar por ID <input type="search" placeholder="Parte del identificador"></label>
    <div class="session-list"></div><small role="status"></small>`;
  document.body.append(dialog);dialog.showModal();
  const list=dialog.querySelector('.session-list'),filter=dialog.querySelector('input');
  let sesiones=[], ahora=0, timer;
  function draw(){
    const fragment=document.createDocumentFragment();
    for(const s of sesiones.filter(s=>s.id.toLowerCase().includes(filter.value.trim().toLowerCase()))){
      const row=document.createElement('article');
      row.innerHTML=`<code></code><small></small><div><button class="secondary small">Copiar ID</button> <button class="primary small">Conectar</button></div>`;
      row.querySelector('code').textContent=s.id;
      row.querySelector('.primary').textContent=accion;
      row.querySelector('small').textContent=`${s.origen==='real'?'Real':'Simulada'} · ${s.mediciones} muestras · ${recepcion(s.ultima_recepcion_ms,ahora,s.mediciones)}`;
      row.querySelector('.secondary').onclick=async()=>{try{await navigator.clipboard.writeText(s.id);toast('ID copiado');}catch{toast('Selecciona el ID para copiarlo.');}};
      row.querySelector('.primary').onclick=()=>{dialog.close();seleccionar(s.id);};
      fragment.append(row);
    }
    if(!fragment.childNodes.length)fragment.append('No hay sesiones con ese ID.');
    list.replaceChildren(fragment);
  }
  async function load(){
    try {
      const all=new Map();let offset=0;
      for(;;){
        const r=await get('/sesiones?limite=200&offset='+offset);
        if(!dialog.open)return;
        for(const s of r.sesiones)all.set(s.id,s);
        ahora=r.ahora_ms;
        if(!r.hay_mas)break;
        offset=r.siguiente_offset;
      }
      sesiones=[...all.values()];draw();dialog.querySelector('[role=status]').textContent='';
    } catch {if(dialog.open)dialog.querySelector('[role=status]').textContent='No se pudo actualizar. Reintentando…';}
    if(dialog.open)timer=setTimeout(load,2500);
  }
  dialog.onclose=()=>{clearTimeout(timer);dialog.remove();};
  filter.oninput=draw;filter.focus();list.textContent='Consultando…';load();
}
