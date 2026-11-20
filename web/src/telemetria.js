export const VENTANA = 300; // 6 s a 50 Hz
export const PAUSA_MS = 3000; // seis lotes de 500 ms sin datos nuevos
// Una sesión se puede conectar en vivo si recibió datos hace como máximo 10 s
// (PAUSA_MS sigue siendo el indicador «Recibiendo» de la conexión).
export const VENTANA_CONECTABLE_MS = 10000;

// Edad y etiqueta de la última recepción con el reloj de la API (ahora_ms), no con Date.now().
export function estadoRecepcion(ultimaMs, ahora) {
  if (ultimaMs == null) return {edad:null, etiqueta:null};
  const edad = Math.max(0, ahora - ultimaMs);
  return {edad, etiqueta: edad <= PAUSA_MS ? 'Recibiendo' : edad <= VENTANA_CONECTABLE_MS ? 'Conexión inestable' : null};
}

export const esConectable = (s, ahora) =>
  s.mediciones > 0 && s.ultima_recepcion_ms != null && ahora - s.ultima_recepcion_ms <= VENTANA_CONECTABLE_MS;

// /sesiones ya viene ordenado por ultima_recepcion_ms DESC (las null al final): en cuanto una
// sesión cae fuera de la ventana, las siguientes también. «fin» indica que no hace falta paginar más.
export function filtrarConectables(sesiones, ahora) {
  const lista = [];
  for (const s of sesiones) {
    if (s.ultima_recepcion_ms == null || ahora - s.ultima_recepcion_ms > VENTANA_CONECTABLE_MS) return {lista, fin:true};
    if (s.mediciones > 0) lista.push(s);
  }
  return {lista, fin:false};
}

// Otra sesión real «Recibiendo» que llegó después que la conectada (p. ej. el ESP32 se reinició).
export function sesionMasReciente(sesiones, ahora, actualId, recepcionActual, descartadas = new Set()) {
  return sesiones.find(s => s.id !== actualId && !descartadas.has(s.id) && s.origen === 'real' && s.mediciones > 0 &&
    estadoRecepcion(s.ultima_recepcion_ms, ahora).etiqueta === 'Recibiendo' &&
    (recepcionActual == null || s.ultima_recepcion_ms > recepcionActual)) ?? null;
}

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

// Carga /sesiones paginando. En 'vivo' se detiene en cuanto una sesión cae fuera de la ventana.
export async function cargarSesiones(get, modo, sigue = () => true) {
  const all = new Map(); let offset = 0, ahora = 0;
  for (;;) {
    const r = await get('/sesiones?limite=200&offset=' + offset);
    if (!sigue()) return null;
    ahora = r.ahora_ms;
    if (modo === 'vivo') {
      const {lista, fin} = filtrarConectables(r.sesiones, ahora);
      for (const s of lista) all.set(s.id, s);
      if (fin) break;
    } else for (const s of r.sesiones) all.set(s.id, s);
    if (!r.hay_mas) break;
    offset = r.siguiente_offset;
  }
  return {sesiones: [...all.values()], ahora};
}
