// Exportación: Resumen y Datos técnicos (sesión completa en vivo, o evento/corrida en pantalla), y el
// libro completo (resumen + técnico) del botón «Exportar sesión» del Detalle de sesión.
// descargar() se usa desde los botones de acciones del Monitor y desde el diálogo «Exportar».
import {app, $, escape, get, toast} from '../app.js';
import {paginasSesion} from '../telemetria.js';
import {crearExcel} from '../../../compartido/libro-excel.js';

const NOMBRE_FORMATO = {resumen: 'Resumen', tecnico: 'Datos técnicos', completo: 'Libro completo'};
const SUFIJO = {resumen: 'resumen', tecnico: 'datos-tecnicos', completo: 'sesion-completa'};

// Reloj de la API para la hora aproximada (null si no se pudo consultar).
async function reloj(id) {
 try {
  const r = await get(`/sesiones/${id}/ultima`);
  return {ultima_recepcion_ms: r.ultima_recepcion_ms ?? null, t_ultima_medicion_ms: r.medicion?.t_ms ?? null};
 } catch { return null; }
}

// Eventos de una sesión hasta tMax (inclusive), sin duplicados.
async function eventosDeSesion(id, tMax = Infinity) {
 const eventos = new Map(); let offset = 0;
 for (;;) {
  const r = await get(`/eventos?sesion_id=${encodeURIComponent(id)}&limite=200&offset=${offset}`);
  for (const ev of r.eventos) if (ev.t_deteccion_ms <= tMax) eventos.set(ev.id, ev);
  if (!r.hay_mas) break;
  offset = r.siguiente_offset;
 }
 return [...eventos.values()];
}

// Sesión guardada completa: { version, sesion, mediciones, eventos, reloj }. Hasta la última medición
// que la API tenía al empezar (si la sesión sigue recibiendo, lo posterior no entra).
// alAvanzar(cargadas, total) informa el progreso de la descarga de mediciones.
export async function cargarSesionCompleta(id, {alAvanzar} = {}) {
 const [{sesion}, ultima] = await Promise.all([get('/sesiones/' + encodeURIComponent(id)), get(`/sesiones/${encodeURIComponent(id)}/ultima`).catch(() => null)]);
 const total = ultima?.medicion?.numero ?? 0, mediciones = [];
 alAvanzar?.(0, total);
 for await (const rows of paginasSesion(get, id, total)) { mediciones.push(...rows); alAvanzar?.(mediciones.length, total); }
 const eventos = await eventosDeSesion(id, mediciones.at(-1)?.t_ms ?? -Infinity);
 return {version: 1, sesion, mediciones, eventos,
  reloj: ultima ? {ultima_recepcion_ms: ultima.ultima_recepcion_ms ?? null, t_ultima_medicion_ms: ultima.medicion?.t_ms ?? null} : null};
}

// Foto de lo que se exporta y una preparación (perezosa, una sola vez) del paquete.
// Sin argumentos: lo que hay en pantalla (sesión completa si está en vivo, o el evento/corrida).
function exportable(actual = app.current, {completa = app.liveActive} = {}) {
 const p = structuredClone(actual);
 const ultimo = p.mediciones.at(-1)?.numero ?? 0;
 const nombre = completa || !p.evento ? p.sesion.id : p.evento.id;
 const alcance = completa ? `Sesión completa, desde el inicio hasta la muestra ${ultimo}`
   : p.evento ? `Evento ${p.evento.id} · ${p.mediciones.length} mediciones` : `Corrida ${p.sesion.id} · ${p.mediciones.length} mediciones`;
 let preparado;
 // Mediciones y eventos de toda la sesión (en vivo) y el reloj de la API para la hora aproximada.
 const preparar = () => preparado ??= (async () => {
  if (completa) {
    p.mediciones = [];
    for await (const rows of paginasSesion(get, p.sesion.id, ultimo)) p.mediciones.push(...rows);
    p.eventos = await eventosDeSesion(p.sesion.id, p.mediciones.at(-1)?.t_ms ?? -Infinity); delete p.evento;
  }
  p.reloj = await reloj(p.sesion.id);
  return p;
 })().catch(e => { preparado = undefined; throw e; });
 return {p, completa, nombre, alcance, preparar};
}

async function bajar(paquete, nombre, formato) {
 const {default: ExcelJS} = await import('exceljs');
 const buffer = await crearExcel(ExcelJS, paquete, {fuente: 'web', formato});
 const url = URL.createObjectURL(new Blob([buffer], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a = document.createElement('a');
 a.href = url; a.download = `${nombre}-${SUFIJO[formato]}.xlsx`; a.click();
 setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const generar = async (x, formato) => bajar(await x.preparar(), x.nombre, formato);

// «Exportar sesión»: un solo libro con el resumen y todas las muestras de una sesión ya cargada.
export async function exportarSesion(paquete, boton) {
 const texto = boton?.textContent;
 if (boton) { boton.disabled = true; boton.textContent = 'Preparando archivo…'; }
 try {
  const p = structuredClone(paquete); delete p.evento;
  p.reloj = await reloj(p.sesion.id) ?? p.reloj ?? null;
  await bajar(p, p.sesion.id, 'completo');
  toast(`Sesión exportada: ${p.sesion.id}-${SUFIJO.completo}.xlsx`);
 } catch (e) { toast('No se pudo preparar el archivo. ' + e.message); }
 finally { if (boton) { boton.disabled = false; boton.textContent = texto; } }
}

// Botón que descarga directamente; muestra el progreso en el propio botón.
export async function descargar(formato, boton) {
 const x = exportable(), texto = boton?.textContent;
 if (boton) { boton.disabled = true; boton.textContent = 'Preparando archivo…'; }
 try { await generar(x, formato); toast(`${NOMBRE_FORMATO[formato]} descargado: ${x.nombre}`); }
 catch (e) { toast('No se pudo preparar el archivo. ' + e.message); }
 finally { if (boton) { boton.disabled = false; boton.textContent = texto; } }
}

// Sin argumento: lo que hay en pantalla. Con un paquete de evento ({sesion, evento, mediciones}):
// «Exportar solo este evento» (lo usa la lista de eventos del Detalle de sesión).
export function openExport(paqueteEvento) {
 const x = paqueteEvento ? exportable(paqueteEvento, {completa: false}) : exportable(), {p, completa, nombre, alcance} = x;
 $('#export-body').innerHTML = `<h2>${completa ? 'Exportar la sesión completa' : p.evento ? 'Exportar solo este evento' : 'Exportar la corrida'}</h2>
  <p class="dialogo-subtitulo">${escape(alcance)} · ${p.sesion.origen === 'real' ? 'datos reales' : 'datos simulados'}</p>
  <div class="opcion-exportar"><h3>Resumen</h3><p>Para leer: qué pasó en cada evento (con una frase), los tramos inclinados y la rueda con sensor. Sin muestras sueltas.</p><small>Hojas Resumen, Eventos, Inclinaciones y Rueda · ${escape(nombre)}-resumen.xlsx</small></div>
  <div class="opcion-exportar"><h3>Datos técnicos</h3><p>Todas las muestras con rueda_pulsos, los eventos completos y los parámetros del firmware.</p><small>Hojas Datos, Eventos, Parámetros del firmware, ${p.parametros ? 'Parámetros simulación, ' : ''}Columnas, Léeme y Metadatos · ${escape(nombre)}-datos-tecnicos.xlsx</small></div>
  <div id="export-error" role="alert"></div>
  <div class="dialog-actions"><button id="cancel-export" class="boton">Cancelar</button><button id="download-tecnico" class="boton">Descargar datos técnicos</button><button id="download-resumen" class="boton primario">Descargar resumen</button></div>`;
 $('#export-dialog').showModal(); $('#cancel-export').onclick = () => $('#export-dialog').close();
 for (const formato of ['resumen', 'tecnico']) {
  const b = $('#download-' + formato), texto = b.textContent;
  b.onclick = async () => {
   b.disabled = true; b.textContent = 'Preparando archivo…'; $('#export-error').textContent = '';
   try { await generar(x, formato); toast('Descarga iniciada'); }
   catch (e) { $('#export-error').textContent = 'No se pudo preparar el archivo. ' + e.message; }
   finally { b.disabled = false; b.textContent = texto; }
  };
 }
}
