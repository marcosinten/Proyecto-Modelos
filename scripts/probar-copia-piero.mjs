// Regresión opcional con la instantánea fechada; no se distribuye la base.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import {crearRepositorio} from '../servidor/src/adaptadores/sqlite/repositorio.js';
import {crearApp} from '../servidor/src/adaptadores/http/app.js';

if(!process.argv[2])throw new Error('Uso: node scripts/probar-copia-piero.mjs RUTA_A_LA_INSTANTANEA');
const bytes=await readFile(process.argv[2]);
assert.equal(createHash('sha256').update(bytes).digest('hex'),'4205edefe266fbe5686763ddfab9801222b4c23902bdb042f6eb344304d09791','Se requiere la copia del 19/11/2026 23:35:31');
const dir=await mkdtemp(join(tmpdir(),'monitor-piero-'));
let repo,api,vite,browser;
try {
  const path=join(dir,'prueba.sqlite');
  await writeFile(path,bytes);
  repo=crearRepositorio(path);
  api=crearApp({repositorio:repo}).listen(0,'127.0.0.1');await once(api,'listening');
  const base=`http://127.0.0.1:${api.address().port}`;
  const get=async ruta=>{const r=await fetch(base+'/api/v1'+ruta);assert.ok(r.ok);return r.json();};
  const reales=(await get('/sesiones')).sesiones.filter(s=>s.origen==='real');
  assert.equal(reales.length,9);
  assert.equal(reales.reduce((n,s)=>n+s.mediciones,0),81529);
  assert.ok(reales.every(s=>s.ultima_recepcion_ms===null));
  const sesion='RC-077000-769E75F0',evento=sesion+'-EV007';
  const paquete=await get('/eventos/'+evento);
  assert.equal(paquete.mediciones.length,308);
  const m=paquete.mediciones.find(m=>m.t_ms===paquete.evento.t_deteccion_ms);
  assert.equal(m.roll_deg,94.566);assert.equal(m.pitch_deg,6.851);
  const ultima=await get('/sesiones/'+sesion+'/ultima?ventana=300');
  assert.equal(ultima.medicion.numero,48875);assert.equal(ultima.mediciones.length,300);
  vite=await createServer({root:'web',configFile:false,server:{host:'127.0.0.1',port:0,proxy:{'/api':base}}});await vite.listen();
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const tab=await browser.newPage(), errores=[];
  tab.on('pageerror',e=>errores.push(e.message));
  await tab.goto(vite.resolvedUrls.local[0]+'#historial');
  await tab.waitForFunction(()=>document.querySelector('#connection').textContent.includes('API conectada'));
  await tab.select('#type','vuelco');await tab.select('#filter-origin','real');
  await tab.click(`[data-event="${evento}"]`);
  await tab.waitForSelector('#sample-time');
  const text=sel=>tab.$eval(sel,e=>e.textContent);
  assert.equal(await text('#origin'),'Mediciones reales · historial');
  assert.equal(await text('#sample-time'),'311961 ms');
  assert.equal(await text('#roll'),'94,57°');assert.equal(await text('#pitch'),'6,85°');
  await tab.click('.back');await tab.waitForSelector('#history-sessions');await tab.click('#history-sessions');
  await tab.type('.session-picker input','2BB2D323');await tab.waitForSelector('.session-list article');
  await tab.click('.session-list .primary');
  await tab.waitForSelector('.session-history tbody td');
  const ir=async n=>{
    await tab.$eval('.sample-jump',(form,n)=>{form.querySelector('input').value=n;form.requestSubmit();},n);
    await tab.waitForFunction(n=>document.querySelector('.session-history td')?.textContent===String(n),{},n);
  };
  await ir(1341);
  const filas=await tab.$$eval('.session-history tbody tr',rs=>rs.slice(0,2).map(tr=>Array.from(tr.cells,td=>td.textContent)));
  assert.ok(Number(filas[0][7].replace(',','.'))>0);
  assert.equal(filas[1][7],'0');assert.equal(filas[1][8],'—');
  await ir(2368);assert.ok(await tab.$eval('.session-history .pagination button:last-child',b=>b.disabled));
  assert.deepEqual(errores,[]);
  console.log('OK: copia migrada en temporal, sesiones reales, última muestra, vuelco en historial y transición Hall positivo → cero sin contador.');
} finally {
  await browser?.close();await vite?.close();if(api)await new Promise(resolve=>api.close(resolve));
  repo?.cerrar();await rm(dir,{recursive:true,force:true});
}
