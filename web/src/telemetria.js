export const VENTANA = 300; // 6 s a 50 Hz
export const PAUSA_MS = 3000; // seis lotes de 500 ms sin datos nuevos

export function vueltasEntre(a,b) {
  if (!a || !b) return 0;
  if (a.rueda_pulsos != null && b.rueda_pulsos != null)
    return Math.max(0,b.rueda_pulsos-a.rueda_pulsos)/2;
  const dt = (b.t_ms-a.t_ms)/1000;
  return dt>0 && dt<=.5 && a.rueda_rps!=null && b.rueda_rps!=null
    ? (a.rueda_rps+b.rueda_rps)*dt/2 : 0;
}

export function recepcion(ms, ahora, tieneDatos) {
  if(ms==null) return tieneDatos ? 'Guardada · hora de recepción desconocida' : 'Sin mediciones';
  const edad=Math.max(0,ahora-ms);
  return (edad<=PAUSA_MS?'Recibiendo':'Sin datos recientes')+
    ' · Última recepción: '+new Date(ms).toLocaleString('es-EC')+' · hace '+Math.floor(edad/1000)+' s';
}

// Un límite superior fijo evita perseguir una sesión que sigue creciendo.
export async function* paginasSesion(get,id,ultimo) {
  let cursor=0;
  while(cursor<ultimo) {
    const r=await get(`/sesiones/${id}/mediciones?despues_numero=${cursor}&limite=1000`);
    if(!r.mediciones.length)break;
    yield r.mediciones.filter(m=>m.numero<=ultimo);
    cursor=r.siguiente_numero;
    if(!r.hay_mas)break;
  }
}
