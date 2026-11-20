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
 $('#app').innerHTML=`<aside><a class="brand" href="#monitor"><span class="brand-icon">↗</span><span>telemetría<span class="brand-small">RC / GRUPO 11</span></span></a><div class="nav-caption">ESPACIO DE TRABAJO</div><nav><a href="#monitor" data-nav="monitor">◉ <span>Monitor</span></a><a href="#simulacion" data-nav="simulacion">▷ <span>Simulación</span></a><a href="#historial" data-nav="historial">▤ <span>Historial</span></a></nav><div class="aside-bottom"><span class="status-dot"></span> Laboratorio de movimiento<small>Modelos y Simulación · Grupo 11</small></div></aside><div class="workspace"><header><span>Proyecto experimental <span class="divider">/</span> Telemetría vehicular</span><span id="connection" class="badge neutral">Comprobando API</span></header><main id="main"></main><footer>TELEMETRÍA RC <span>Datos en movimiento. Decisiones con contexto.</span><span>Grupo 11 · v1.1</span></footer></div><div id="toast" role="status"></div><dialog id="export-dialog"><form method="dialog"><button class="close" aria-label="Cerrar">×</button></form><div id="export-body"></div></dialog>`;
}
function render() {
  app.running=false; clearInterval(app.liveTimer); clearTimeout(app.historyTimer); app.liveGeneration++; app.liveActive=false;
  app.viewer?.destroy(); app.viewer=undefined; app.charts.forEach(c=>c.destroy());app.charts=[];
  app.cerrarExplicacion?.(); app.cerrarExplicacion=undefined;
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(app.page==='explicar'?'historial':app.page)));
  if(app.page==='historial'){renderHistory();return;}
  if(app.page==='explicar'){showExplanation();return;}
 renderMonitor();
}
function route(){const hash=location.hash.slice(1);app.page=hash.startsWith('explicar/')?'explicar':['simulacion','historial','detalle'].includes(hash)?hash:'monitor';if(app.page==='detalle'&&!app.current.evento){app.current=ev2;}if(app.page==='monitor'){app.current=demo;app.position=0;}if(app.page==='simulacion'){app.current=generarEscenario('vuelco');app.position=0;}render();}
app.render=render;
layout();route();requestAnimationFrame(frame);window.addEventListener('hashchange',route);loadEvents().then(()=>{
 if(app.page==='historial')renderHistory();
 else refrescarRecientes();
});

// Monitor, Detalle y Simulación comparten el mismo tablero.
