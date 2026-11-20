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
     detail.render=(scene,camera)=>{render(scene,camera); window.testScene=scene;
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
 await tab.$eval('#live-form',f=>f.requestSubmit());
 await tab.waitForFunction(()=>document.querySelector('#origin').textContent==='Emisor simulado' && parseInt(document.querySelector('#sample-time').textContent)>5000);
 const first=await tab.$eval('#sample-time',e=>e.textContent);
 console.log('Primera postura observada (última disponible: 600000 ms):',first);
 assert.equal(first,'600000 ms');
 assert.equal(await tab.$eval('#sample-count',e=>e.textContent),'300 muestras');
 const waitText=async(sel,value)=>tab.waitForFunction((s,v)=>document.querySelector(s)?.textContent.includes(v),{},sel,value);
 const state=()=>tab.evaluate(()=>framesRC.at(-1));
 const snap=async name=>{if(process.env.CAPTURAS){await mkdir(process.env.CAPTURAS,{recursive:true});await tab.screenshot({path:join(process.env.CAPTURAS,name+'.png')});}};
 const chartModule=await tab.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).find(url=>url.includes('/chart__js_auto.js')||url.includes('/chart_js_auto.js')));
 assert.ok(chartModule,'Módulo de Chart.js');
 await tab.evaluate(async url=>{window.testChart=(await import(url)).default;},chartModule);
 const origin=await state(),latencias=[];
 await tab.$eval('[data-camera=lateral]',b=>b.click());
 for(const [roll,pitch,tipo] of [[0,0,null],[0,20,'inclinacion'],[90,0,null],[180,0,'vuelco'],[0,0,'golpe']]){
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
   assert.equal(frame.x,origin.x);assert.equal(frame.y,origin.y);
   await waitText('#roll',roll.toLocaleString('es-EC',{minimumFractionDigits:2})+'°');
   await waitText('#pitch',pitch.toLocaleString('es-EC',{minimumFractionDigits:2})+'°');
   const charts=await tab.evaluate(()=>['angles','wheel','accel'].map(id=>testChart.getChart(id).data.datasets.map(d=>d.data.slice(-10))));
   assert.equal(charts[0][0].at(-1).y,roll);assert.equal(charts[0][1].at(-1).y,pitch);
   assert.equal(charts[1][0][4].y,5);assert.equal(charts[1][0].at(-1).y,0);
   assert.equal(charts[2][2][6].y,rows[6].az);
   // 5 vueltas/s durante el pulso triangular de 20 ms: +0,1 vuelta, aunque termine en cero.
   await tab.waitForFunction(angle=>Math.abs(framesRC.at(-1).angle-angle)<1e-7,{},before.angle-.2*Math.PI);
   await pause(500);
   assert.ok(Math.abs((await state()).angle-before.angle+.2*Math.PI)<1e-7);
   if(tipo){
     const label={golpe:'Impacto',vuelco:'Vuelco',inclinacion:'Inclinación'}[tipo];
     await tab.waitForFunction((name,t)=>markers.some(([label,x])=>label===name&&Math.abs(x-testChart.getChart('angles').scales.x.getPixelForValue(t))<.1),{},label,rows[6].t_ms);
   }
   if(roll===180)await snap('boca-abajo');
 }
 console.log('POST → primer render WebGL observado (ms), horizontal / 20° / lado / invertido / horizontal:',latencias);
 await waitText('#graph-summary','180°');
 await waitText('#mode-help','Sin datos recientes');
 const stopped=await state();
 await pause(500);assert.equal((await state()).angle,stopped.angle);
 const pulse=[sample(),sample(),sample()];pulse.forEach((s,i)=>s.rueda_pulsos=i?1:0);
 await batch(pulse);
 await waitText('#mode-help','Recibiendo');
 await tab.waitForFunction(angle=>Math.abs(framesRC.at(-1).angle-angle)<1e-7,{},stopped.angle-Math.PI);
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
 console.log('PASS: ventana, tres marcas de evento, giro dentro del lote, pulso aislado, pausa, reconexión, cambio con petición pendiente e historial desde la primera muestra.');
 assert.deepEqual(errors,[]);
} finally {
 await browser?.close(); await web.close(); api.close(); await once(api,'close'); repo.cerrar(); await rm(dir,{recursive:true,force:true});
}
