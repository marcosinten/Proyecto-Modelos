import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './style.css';
import {generarEscenario} from './simulation.js';
import ev1 from '../../ejemplos/vuelco.json';
import ev2 from '../../ejemplos/vuelco-002.json';
import {app, $} from './app.js';
import {renderHistory, loadEvents, refrescarRecientes} from './pantallas/historial.js';
import {showExplanation} from './pantallas/explicar.js';
import {renderMonitor, frame} from './pantallas/monitor.js';
import {renderSesion} from './pantallas/sesion.js';

const demo = generarEscenario('vuelco', 16, 90, 100);
app.demo=demo;
app.current=demo;app.page='monitor';app.running=false;app.position=0;app.speed=1;app.lastFrame=0;
app.viewer=undefined;app.charts=[];app.events=[ev2,ev1];app.apiAvailable=false;app.liveTimer=undefined;
app.liveActive=false;app.pageNumber=0;app.previousRuns=[];
app.liveGeneration=0;
app.impactTime=undefined;
app.wheelTurnsBySample=[];
app.liveTurns=0;app.wheelFrom=0;app.wheelTo=0;app.wheelStart=0;app.wheelDuration=0;app.stale=false;
app.cerrarExplicacion=undefined;app.historyTimer=undefined;
function layout() {
 $('#app').innerHTML=`<a class="saltar" href="#main">Saltar al contenido</a>
 <header class="barra"><a class="marca" href="#monitor"><strong>Telemetría RC</strong><span>Grupo 11 · Modelos y Simulación</span></a>
  <nav aria-label="Secciones"><a href="#monitor" data-nav="monitor">Monitor</a><a href="#historial" data-nav="historial">Historial</a><a href="#simulacion" data-nav="simulacion">Simulación</a></nav>
  <span id="connection" class="etiqueta" data-estado="neutro">API: comprobando</span></header>
 <main id="main" tabindex="-1"></main>
 <div id="toast" role="status" aria-live="polite"></div>
 <dialog id="export-dialog" aria-label="Exportar a Excel"><form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><div id="export-body"></div></dialog>`;
}
function render() {
  app.running=false; clearInterval(app.liveTimer); clearTimeout(app.historyTimer); app.liveGeneration++; app.liveActive=false;
  app.viewer?.destroy(); app.viewer=undefined; app.charts.forEach(c=>c.destroy());app.charts=[];
  app.cerrarExplicacion?.(); app.cerrarExplicacion=undefined;
  app.alSalir?.(); app.alSalir=undefined;
  document.querySelectorAll('[data-nav]').forEach(a=>{const activa=a.dataset.nav===(['explicar','detalle','sesion'].includes(app.page)?'historial':app.page);a.classList.toggle('active',activa);activa?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current');});
  if(app.page!=='monitor'&&app.presentacion){app.presentacion=false;document.body.classList.remove('presentacion');}
  if(app.page==='historial'){renderHistory();return;}
  if(app.page==='explicar'){showExplanation();return;}
  if(app.page==='sesion'){renderSesion(app.sesionId);return;}
 renderMonitor();
}
function route(){const hash=location.hash.slice(1);if(hash.startsWith('sesion/')){app.page='sesion';app.sesionId=decodeURIComponent(hash.slice(7));render();return;}app.page=hash.startsWith('explicar/')?'explicar':['simulacion','historial','detalle'].includes(hash)?hash:'monitor';if(app.page==='detalle'&&!app.current.evento){app.current=ev2;}if(app.page==='monitor'){app.current=demo;app.position=0;}if(app.page==='simulacion'){app.current=generarEscenario('vuelco');app.position=0;}render();}
app.render=render;
layout();route();requestAnimationFrame(frame);window.addEventListener('hashchange',route);loadEvents().then(()=>{
 if(app.page==='historial')renderHistory();
 else refrescarRecientes();
});

// Monitor, Detalle y Simulación comparten el mismo tablero.
