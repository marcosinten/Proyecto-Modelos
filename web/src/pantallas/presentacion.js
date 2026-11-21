// Modo presentación: pantalla completa (Fullscreen API), tecla F para alternar, Esc para salir y
// Wake Lock para que la pantalla no se apague. Si el navegador no permite alguna de las dos, la vista
// de presentación se aplica igual (sin aviso).
import {app, $} from '../app.js';
import {icono} from '../iconos.js';

let bloqueo = null;
const PAGINAS = ['monitor', 'detalle', 'simulacion'];

async function pedirBloqueo() {
  try {
    bloqueo = await navigator.wakeLock?.request('screen') ?? null;
    bloqueo?.addEventListener('release', () => { bloqueo = null; });
  } catch { bloqueo = null; }
}

export function activarPresentacion(activar) {
  const cambio = !!app.presentacion !== activar;
  app.presentacion = activar;
  document.body.classList.toggle('presentacion', activar);
  const b = $('#presentation-mode');
  if (b) { b.setAttribute('aria-pressed', String(activar)); b.innerHTML = `${icono(activar ? 'salir' : 'pantalla')}${activar ? 'Salir de pantalla completa' : 'Pantalla completa'}`; }
  if (activar) {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.({navigationUI: 'hide'}).catch(() => {});
    if (!bloqueo) pedirBloqueo();
  } else {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    bloqueo?.release?.().catch(() => {}); bloqueo = null;
  }
  if (cambio || activar) app.alCambiarPresentacion?.(activar);
}

document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && app.presentacion) activarPresentacion(false); });
document.addEventListener('visibilitychange', () => { if (app.presentacion && document.visibilityState === 'visible' && !bloqueo) pedirBloqueo(); });
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.target.closest?.('input, select, textarea, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape' && app.presentacion) { activarPresentacion(false); return; }
  if ((e.key === 'f' || e.key === 'F') && PAGINAS.includes(app.page) && $('#presentation-mode')) { e.preventDefault(); activarPresentacion(!app.presentacion); }
});
// El tamaño de letra de las gráficas depende del alto disponible (celular horizontal o pantalla grande).
let altoAnterior = innerHeight > 500;
addEventListener('resize', () => {
  const alto = innerHeight > 500;
  if (app.presentacion && alto !== altoAnterior) app.alCambiarPresentacion?.(true);
  altoAnterior = alto;
});
