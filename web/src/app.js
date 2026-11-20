// Estado compartido de la interfaz y utilidades comunes a todas las pantallas.
export const app = {};

export const $ = s => document.querySelector(s);
export const number = n => Number(n).toLocaleString('es-EC',{maximumFractionDigits:2,minimumFractionDigits:2});
export const escape = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const label = {golpe:'Impacto',vuelco:'Vuelco',inclinacion:'Inclinación',alta:'Alta',media:'Media',baja:'Baja'};
export const seconds = ms => (ms / 1000).toLocaleString('es-EC', {maximumFractionDigits:3});

export async function request(path,body) {
 const response=await fetch('/api/v1'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(6000)});
 if(!response.ok){const e=await response.json().catch(()=>({}));throw new Error(e.error?.mensaje||'No se pudo completar la solicitud');}
 return response;
}
export const get=async path=>(await request(path)).json();
export function toast(message) {$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}

export function heading(title,description,action='') {return `<div class="page-heading"><div><div class="eyebrow">OBSERVAR · ANALIZAR · COMPRENDER</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;}
