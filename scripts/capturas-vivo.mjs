// Capturas del visor En vivo en las cuatro cámaras con varias posturas.
// Uso: node scripts/capturas-vivo.mjs [carpeta]  (por defecto evidencias/vivo-apoyo)
// API y SQLite temporales, como scripts/probar-monitor.mjs. Comprueba además que el carro
// quede dentro del cuadro (sus vértices proyectados caen dentro del lienzo).
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import {crearRepositorio} from '../servidor/src/adaptadores/sqlite/repositorio.js';
import {crearApp} from '../servidor/src/adaptadores/http/app.js';

const salida=process.argv[2]||'evidencias/vivo-apoyo';
const dir=await mkdtemp(join(tmpdir(),'capturas-rc-'));
const repo=crearRepositorio(join(dir,'prueba.sqlite'));
const api=crearApp({repositorio:repo}).listen(0,'127.0.0.1');
await once(api,'listening');
const base=`http://127.0.0.1:${api.address().port}`;
const web=await createServer({root:'web',configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0,proxy:{'/api':base}}});
let browser;
try {
  await web.listen();
  await mkdir(salida,{recursive:true});
  const post=async(path,body)=>{
    const r=await fetch(base+'/api/v1'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,...body})});
    assert.ok(r.ok,await r.text());
  };
  const id='CAPTURAS-VIVO';
  await post('/sesiones',{sesion:{id,origen:'simulado'}});
  let n=0;
  const rad=Math.PI/180;
  const sample=(roll,pitch)=>({numero:++n,t_ms:n*20,ax:9.81*Math.sin(pitch*rad),ay:9.81*Math.sin(roll*rad),az:9.81*Math.cos(roll*rad)*Math.cos(pitch*rad),roll_deg:roll,pitch_deg:pitch,rueda_rps:0});
  const enviar=(roll,pitch)=>post('/sesiones/'+id+'/mediciones',{mediciones:Array.from({length:5},()=>sample(roll,pitch))});
  await enviar(0,0);
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],defaultViewport:{width:1280,height:900}});
  const tab=await browser.newPage();
  await tab.evaluateOnNewDocument(()=>{
    window.__THREE_DEVTOOLS__=new EventTarget();
    __THREE_DEVTOOLS__.addEventListener('observe',({detail})=>{if(detail.isWebGLRenderer){
      const render=detail.render.bind(detail);
      detail.render=(scene,camera)=>{render(scene,camera);window.testScene=scene;window.testCamera=camera;window.ultimoMs=parseInt(document.querySelector('#sample-time')?.textContent);};
    }});
  });
  await tab.goto(web.resolvedUrls.local[0]);
  await tab.waitForFunction(()=>window.testScene?.getObjectByName('animated-wheel'));
  await tab.click('#live-mode');
  await tab.type('#live-form input',id);
  await tab.$eval('#live-form',f=>f.requestSubmit());
  await tab.waitForFunction(ms=>window.ultimoMs===ms,{},n*20);
  const posturas=[[0,0],[20,0],[90,0],[180,0],[0,-20],[0,20]];
  const resultados=[];
  for(const vista of ['seguimiento','lateral','frontal','libre']){
    await tab.$eval(`[data-camera=${vista}]`,b=>b.click());
    for(const [roll,pitch] of posturas){
      await enviar(roll,pitch);
      await tab.waitForFunction(ms=>window.ultimoMs===ms,{},n*20);
      await new Promise(r=>setTimeout(r,120));
      // Fracción de vértices del carro fuera del lienzo y punto más bajo.
      const medida=await tab.evaluate(()=>{
        let fuera=0,total=0,min=Infinity;
        const cam=window.testCamera,v3=window.testScene.getObjectByName('car-body').position.clone();
        window.testScene.getObjectByName('vehicle').traverse(o=>{
          if(!o.isMesh)return;
          const p=o.geometry.attributes.position,e=o.matrixWorld.elements;
          for(let i=0;i<p.count;i+=7){
            v3.set(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(o.matrixWorld);
            min=Math.min(min,v3.y);
            v3.project(cam);total++;
            if(Math.abs(v3.x)>1||Math.abs(v3.y)>1)fuera++;
          }
        });
        return {fuera:fuera/total,min};
      });
      const nombre=`${vista}-roll${roll}-pitch${pitch}`;
      await (await tab.$('#car')).screenshot({path:join(salida,nombre+'.png')});
      resultados.push({nombre,...medida});
    }
  }
  for(const r of resultados)console.log(`${r.nombre.padEnd(28)} fuera de cuadro ${(r.fuera*100).toFixed(1)} %  punto más bajo ${r.min.toFixed(4)}`);
  const peor=resultados.reduce((a,b)=>b.fuera>a.fuera?b:a);
  assert.ok(peor.fuera===0,`El carro sale del cuadro en ${peor.nombre}`);
  console.log(`PASS: carro completo en cuadro en las cuatro cámaras y apoyado en la carretera. Capturas en ${salida}`);
} finally {
  await browser?.close();await web.close();api.close();repo.cerrar();await rm(dir,{recursive:true,force:true});
}
