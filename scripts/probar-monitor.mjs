// Chrome local con perfil temporal; API y SQLite aisladas de servidor/.env y de la base física.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import ExcelJS from 'exceljs';
import {PULSOS_POR_VUELTA} from '../compartido/parametros-firmware.js';
import {crearRepositorio} from '../servidor/src/adaptadores/sqlite/repositorio.js';
import {crearApp} from '../servidor/src/adaptadores/http/app.js';

const dir=await mkdtemp(join(tmpdir(),'monitor-rc-'));
const repo=crearRepositorio(join(dir,'prueba.sqlite'));
const api=crearApp({repositorio:repo}).listen(0,'127.0.0.1');
await once(api,'listening');
const base=`http://127.0.0.1:${api.address().port}`;
const web=await createServer({root:'web',configFile:false,server:{host:'127.0.0.1',port:0,proxy:{'/api':base}}});
let browser;
try {
 await web.listen();
 const post=async(path,body)=>{
   const r=await fetch(base+'/api/v1'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,...body})});
   assert.ok(r.ok,await r.text());
 };
 const id='PRUEBA-30000';
 await post('/sesiones',{sesion:{id,origen:'simulado'}});
 let n=0;
 const sample=(roll_deg=0,pitch_deg=0,rueda_rps=0)=>({numero:++n,t_ms:n*20,ax:9.81*Math.sin(pitch_deg*Math.PI/180),ay:9.81*Math.sin(roll_deg*Math.PI/180),az:9.81*Math.cos(roll_deg*Math.PI/180)*Math.cos(pitch_deg*Math.PI/180),roll_deg,pitch_deg,rueda_rps});
 const batch=mediciones=>post('/sesiones/'+id+'/mediciones',{mediciones});
 for(let i=0;i<30;i++)await batch(Array.from({length:1000},()=>sample()));
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],defaultViewport:{width:1200,height:840}});
 const tab=await browser.newPage();
 const errors=[];
 tab.on('pageerror',e=>errors.push(String(e)));
 await tab.evaluateOnNewDocument(()=>{
   window.framesRC=[];window.markers=[];
   const text=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(label,x,y,...rest){
     if(this.canvas.id==='angles'&&['Inclinación','Vuelco','Impacto'].includes(label))window.markers.push([label,x]);
     return text.call(this,label,x,y,...rest);
   };
   window.__THREE_DEVTOOLS__=new EventTarget();
   __THREE_DEVTOOLS__.addEventListener('observe',({detail})=>{if(detail.isWebGLRenderer){
     const render=detail.render.bind(detail);
      detail.render=(scene,camera)=>{render(scene,camera); window.testScene=scene;window.testCamera=camera;
       const body=scene.getObjectByName('car-body'), wheel=scene.getObjectByName('animated-wheel');
       if(body&&wheel)window.framesRC.push({ms:parseInt(document.querySelector('#sample-time')?.textContent),at:Date.now(),
         roll:body.rotation.x*180/Math.PI,pitch:body.rotation.z*180/Math.PI,angle:wheel.rotation.x,x:body.parent.position.x,y:body.position.y});
     };
   }});
 });
 await tab.goto(web.resolvedUrls.local[0]);
 await tab.waitForFunction(()=>window.testScene?.getObjectByName('animated-wheel'));
 await tab.click('#live-mode');
 await tab.type('#live-form input',id);
 // No congelar el emisor para comparar con una «última» que ya habría cambiado:
 // la referencia es la muestra que SQLite devolvió en la primera consulta /ultima.
 let emitting=true, pitchNow=-12;
 const enviados=[];
 async function emitir(){
   const pitch=pitchNow, rows=Array.from({length:5},()=>sample(0,pitch));
   enviados.push({pitch,ultimo:rows.at(-1).t_ms,post:Date.now()});
   await batch(rows);
 }
 await emitir();
 const flujo=(async()=>{while(emitting){await pause(100);if(emitting)await emitir();}})();
 try {
   const snapshot=tab.waitForResponse(r=>r.url().includes('/'+id+'/ultima?'));
   const submit=await tab.$eval('#live-form',f=>{const now=Date.now();f.requestSubmit();return now;});
   const head=(await (await snapshot).json()).medicion;
   await tab.waitForFunction(ms=>framesRC.some(f=>f.ms===ms),{},head.t_ms);
   const first=await tab.evaluate(()=>framesRC.find(f=>f.ms>=600000));
   assert.equal(first.ms,head.t_ms);assert.equal(head.pitch_deg,-12);assert.ok(Math.abs(first.pitch+12)<1e-6);
   console.log(`Conectar → primer render: ${first.at-submit} ms; muestra ${head.numero} (cola consultada), pitch ${first.pitch.toFixed(2)}°`);
   pitchNow=20;
   await tab.waitForFunction(()=>framesRC.some(f=>f.ms>600000&&Math.abs(f.pitch-20)<1e-6));
   const cambio=await tab.evaluate(()=>framesRC.find(f=>f.ms>600000&&Math.abs(f.pitch-20)<1e-6));
   const cambioPost=enviados.find(l=>l.pitch===20);
   assert.ok(cambio.ms>=cambioPost.ultimo);
   console.log(`Emisión continua, primer POST de 20° → render de 20°: ${cambio.at-cambioPost.post} ms (muestra ${cambio.ms/20})`);
 } finally {emitting=false;await flujo;}
 await tab.waitForFunction(ms=>framesRC.at(-1)?.ms===ms,{},n*20);
 assert.equal(await tab.$eval('#sample-count',e=>e.textContent),'300 muestras');
 const waitText=async(sel,value)=>tab.waitForFunction((s,v)=>document.querySelector(s)?.textContent.includes(v),{},sel,value);
 const state=()=>tab.evaluate(()=>framesRC.at(-1));
 const snap=async name=>{if(process.env.CAPTURAS){await mkdir(process.env.CAPTURAS,{recursive:true});await tab.screenshot({path:join(process.env.CAPTURAS,name+'.png')});}};
 const chartModule=await tab.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).find(url=>url.includes('/chart__js_auto.js')||url.includes('/chart_js_auto.js')));
 assert.ok(chartModule,'Módulo de Chart.js');
 await tab.evaluate(async url=>{window.testChart=(await import(url)).default;},chartModule);
  const origin=await state(),latencias=[];
  await tab.$eval('[data-camera=lateral]',b=>b.click());
 // Comparar imágenes de la misma rueda, sin texto, reloj, cámara ni postura en movimiento.
 async function fotoRueda(nombre) {
   const clip=await tab.evaluate(()=>{
     const cam=window.testCamera;
     const wheels=window.testScene.getObjectsByProperty('name','animated-wheel');
     const centros=wheels.map(w=>w.getWorldPosition(w.position.clone()).project(cam)).sort((a,b)=>a.z-b.z);
     const p=centros[0],r=document.querySelector('#car canvas').getBoundingClientRect();
     const lado=Math.round(r.width*.065);
     return {x:Math.round(scrollX+r.left+(p.x+1)*r.width/2-lado/2),y:Math.round(scrollY+r.top+(1-p.y)*r.height/2-lado/2),width:lado,height:lado};
   });
   if(process.env.CAPTURAS)await mkdir(process.env.CAPTURAS,{recursive:true});
   return Buffer.from(await tab.screenshot({clip,path:process.env.CAPTURAS?join(process.env.CAPTURAS,nombre+'.png'):undefined}));
 }
 await batch([sample()]);await waitText('#sample-time',`${n*20} ms`);
 const ruedaInicial=await fotoRueda('hall-antes');
  for(const [roll,pitch,tipo] of [[0,0,null],[0,20,'inclinacion'],[90,0,null],[180,0,'vuelco'],[0,0,'golpe']]){
   if(roll===90)await tab.$eval('[data-camera=frontal]',b=>b.click());
   const rows=Array.from({length:10},(_,i)=>sample(roll,pitch,i===4?5:0));
   if(tipo==='golpe')rows[6].az=18;
   const end=rows.at(-1), before=await state();
   const sent=Date.now();
   await batch(rows);
   if(tipo)await post('/eventos',{evento:{id:'EV-'+tipo,sesion_id:id,tipo,gravedad:'alta',estado:'confirmado',t_inicio_ms:rows[0].t_ms,t_deteccion_ms:rows[6].t_ms,t_fin_ms:end.t_ms,t_activacion_ms:rows[7].t_ms,ubicacion:null}});
   await tab.waitForFunction(ms=>framesRC.some(f=>f.ms===ms),{},end.t_ms);
   const frame=await tab.evaluate(ms=>framesRC.find(f=>f.ms===ms),end.t_ms);
   latencias.push(frame.at-sent);
   assert.ok(Math.abs(frame.pitch-pitch)<.001 && Math.abs((frame.roll-roll)%360)<.001,JSON.stringify(frame));
   assert.equal(frame.x,origin.x);
   // En vivo el carro se apoya en la carretera: su punto más bajo toca la superficie (−0,57 + 0,008).
   const bajo=await tab.evaluate(()=>{
     let min=Infinity;
     window.testScene.getObjectByName('vehicle').traverse(o=>{
       if(!o.isMesh)return;
       const v=o.geometry.attributes.position,e=o.matrixWorld.elements;
       for(let i=0;i<v.count;i++)min=Math.min(min,e[1]*v.getX(i)+e[5]*v.getY(i)+e[9]*v.getZ(i)+e[13]);
     });
     return min;
   });
   assert.ok(Math.abs(bajo-(-.57+.008))<1e-3,`Punto más bajo ${bajo} con roll ${roll}, pitch ${pitch}`);
   await waitText('#roll',roll.toLocaleString('es-EC',{minimumFractionDigits:2})+'°');
   await waitText('#pitch',pitch.toLocaleString('es-EC',{minimumFractionDigits:2})+'°');
   const charts=await tab.evaluate(()=>['angles','wheel','accel'].map(id=>testChart.getChart(id).data.datasets.map(d=>d.data.slice(-10))));
   assert.equal(charts[0][0].at(-1).y,roll);assert.equal(charts[0][1].at(-1).y,pitch);
   assert.equal(charts[1][0][4].y,5);assert.equal(charts[1][0].at(-1).y,0);
   assert.equal(charts[2][2][6].y,rows[6].az);
   // 5 vueltas/s durante el pulso triangular de 20 ms: +0,1 vuelta, aunque termine en cero.
   await tab.waitForFunction(angle=>Math.abs(framesRC.at(-1).angle-angle)<1e-7,{},before.angle-.2*Math.PI);
   const ruedaFinal=tipo===null&&roll===0?await fotoRueda('hall-despues'):null;
   await pause(500);
   assert.ok(Math.abs((await state()).angle-before.angle+.2*Math.PI)<1e-7);
   if(ruedaFinal){
     assert.notDeepEqual(ruedaFinal,ruedaInicial,'Los píxeles de la rueda deben cambiar');
     assert.deepEqual(await fotoRueda('hall-detenida'),ruedaFinal,'La rueda detenida debe conservar su imagen');
   }
   if(tipo){
     // 1a: aviso del evento recién guardado y Eventos recientes sin pulsar Actualizar.
     const aviso={golpe:'Golpe',vuelco:'Vuelco',inclinacion:'Inclinación'}[tipo];
     await waitText('#event-saved','Evento guardado: '+aviso+' · ');
     assert.match(await tab.$eval('#event-saved',e=>e.textContent),/\d\d:\d\d:\d\d.*±1 s/);
     await waitText('.recent','EV-'+tipo);
     const label={golpe:'Impacto',vuelco:'Vuelco',inclinacion:'Inclinación'}[tipo];
     await tab.waitForFunction((name,t)=>markers.some(([label,x])=>label===name&&Math.abs(x-testChart.getChart('angles').scales.x.getPixelForValue(t))<.1),{},label,rows[6].t_ms);
   }
   if(pitch===20||roll===90||roll===180||tipo==='golpe'){
     await tab.$eval('#car canvas',c=>c.scrollIntoView({block:'center'}));
     await snap(pitch===20?'frontal-20':roll===90?'costado-90':roll===180?'boca-abajo':'horizontal');
   }
 }
 console.log('POST → primer render WebGL observado (ms), horizontal / 20° / lado / invertido / horizontal:',latencias);
 await waitText('#graph-summary','180°');
 await waitText('#mode-help','Sin datos recientes');
 const stopped=await state();
 await pause(500);assert.equal((await state()).angle,stopped.angle);
 const pulse=[sample(),sample(),sample()];pulse.forEach((s,i)=>s.rueda_pulsos=i?1:0);
 await batch(pulse);
 await waitText('#mode-help','Recibiendo');
 // Un pulso del contador = 1/PULSOS_POR_VUELTA de vuelta, aunque la velocidad estimada sea cero.
 await tab.waitForFunction(angle=>Math.abs(framesRC.at(-1).angle-angle)<1e-7,{},stopped.angle-2*Math.PI/PULSOS_POR_VUELTA);
 const exportCount=n;
 const cdp=await tab.createCDPSession();
 await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir,eventsEnabled:true});
 const download=new Promise(resolve=>cdp.on('Browser.downloadProgress',e=>{if(e.state==='completed')resolve();}));
 await tab.click('#export');await tab.click('#download');
 await tab.waitForFunction(()=>!document.querySelector('#export-dialog').open,{timeout:45000});
 await Promise.race([download,pause(10000).then(()=>{throw new Error('Falta descarga Excel');})]);
 const libro=new ExcelJS.Workbook();await libro.xlsx.readFile(join(dir,id+'.xlsx'));
 const datos=libro.getWorksheet('Datos');
 assert.equal(datos.rowCount,exportCount+1);assert.equal(datos.getCell('A2').value,1);
 assert.equal(datos.getCell('A'+datos.rowCount).value,exportCount);
 assert.equal(libro.getWorksheet('Eventos').rowCount,4);
 console.log(`Excel verificado: ${exportCount} mediciones y 3 eventos`);
 // Interrumpir solo las consultas del navegador; la API sigue recibiendo 1200 muestras.
 await tab.setRequestInterception(true);
 let offline=true,hold=false,release;
 tab.on('request',req=>{
   if(req.url().includes('/'+id+'/ultima')){
     if(offline)return void req.abort();
     if(hold){hold=false;release=()=>req.continue();return;}
   }
   void req.continue();
 });
 await waitText('#mode-help','interrumpida');
 for(let i=0;i<2;i++)await batch(Array.from({length:600},()=>sample(-37)));
 offline=false;
 await waitText('#sample-time',`${n*20} ms`);await waitText('#roll','37');
 const other='SEGUNDA-SESION';
 await post('/sesiones',{sesion:{id:other,origen:'real'}});
 await post('/sesiones/'+other+'/mediciones',{mediciones:[{...sample(28),numero:1,t_ms:12}]});
 // 1b: otra sesión real «Recibiendo» más reciente: aviso con botón, sin cambiar sola.
 await tab.waitForSelector('#new-session',{timeout:10000});
 assert.ok((await tab.$eval('#new-session',e=>e.textContent)).includes(other));
 assert.ok(await tab.$eval('#new-session button.primary',b=>b.textContent==='Cambiar a la nueva sesión'));
 assert.equal(await tab.$eval('#live-form input',e=>e.value),id,'no cambia de sesión sola');
 hold=true;
 await tab.click('#find-session');await tab.type('.session-picker input',other);
 await tab.waitForSelector('.session-list article button.primary');
 await snap('selector');
 assert.equal(await tab.$eval('.session-list code',e=>e.textContent),other);
 await browser.defaultBrowserContext().setPermission(web.resolvedUrls.local[0],{permission:{name:'clipboard-read'},state:'granted'});
 await tab.click('.session-list button.secondary');
 assert.equal(await tab.evaluate(()=>navigator.clipboard.readText()),other);
 await tab.click('.session-list button.primary');
 await waitText('#sample-time','12 ms');assert.equal((await state()).roll,28);
 assert.ok(release,'Petición de la sesión anterior en vuelo');await release();await pause(500);
 assert.equal((await state()).roll,28);
 assert.ok(await tab.$eval('#live-form input',e=>e.disabled&&e.value==='SEGUNDA-SESION'));
 await tab.$eval('[href="#historial"]',e=>e.click());await tab.click('#history-sessions');
 await tab.type('.session-picker input',id);await tab.waitForSelector('.session-list button.primary');await tab.click('.session-list button.primary');
 await waitText('.session-history tbody','600');assert.equal(await tab.$eval('.session-history td',e=>e.textContent),'1');
 // Historial: un evento nuevo aparece solo, sin pulsar Actualizar.
 await tab.keyboard.press('Escape');
 await post('/eventos',{evento:{id:'EV-HISTORIAL-AUTO',sesion_id:other,tipo:'golpe',gravedad:'media',estado:'confirmado',t_inicio_ms:0,t_deteccion_ms:12,t_fin_ms:12,t_activacion_ms:null,ubicacion:null}});
 await tab.waitForFunction(()=>document.querySelector('#history-list')?.textContent.includes('EV-HISTORIAL-AUTO'),{timeout:12000});
 console.log('PASS: ventana, tres marcas de evento, giro dentro del lote, pulso aislado, aviso de evento guardado, aviso de sesión nueva, historial que se actualiza solo, pausa, reconexión, cambio con petición pendiente e historial desde la primera muestra.');
 assert.deepEqual(errors,[]);
} finally {
 await browser?.close(); await web.close(); api.close(); await once(api,'close'); repo.cerrar(); await rm(dir,{recursive:true,force:true});
}
