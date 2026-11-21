import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generarEscenario} from '../../web/src/simulation.js';
import {validar, loteSchema} from '../src/aplicacion/contratos.js';
import {crearRepositorio} from '../src/adaptadores/sqlite/repositorio.js';

test('cinco escenarios, gravedad, parada, postura y detección coherentes',()=>{
 for (const [type,expected] of [['normal',null],['frenada',null],['impacto','golpe'],['inclinacion',null],['vuelco','vuelco']]) {
  const p=generarEscenario(type);
  validar(loteSchema,{version:1,mediciones:p.mediciones});
  assert.equal(p.evento?.tipo??null,expected,type);
  assert.equal(p.mediciones[0].rueda_rps,0);
  assert.equal(p.mediciones.at(-1).rueda_rps,0);
  assert.ok(p.mediciones.some(m=>m.rueda_rps>0));
  // Marcha normal: el carro no se inclina (ángulo real 0). El estimado, como el del firmware, ve unos grados
  // aparentes por la aceleración del arranque, pero queda lejos del umbral de 10°.
  if(type==='normal'){
   assert(p.angulosReales.every(a=>a.roll_deg===0&&a.pitch_deg===0));
   assert(p.mediciones.every(m=>m.roll_deg===0&&Math.abs(m.pitch_deg)<3&&Math.abs(m.az-9.81)<1e-9));
  }
  if(type==='vuelco') {
   assert.equal(p.mediciones.at(-1).roll_deg,180);
   assert(Math.abs(p.mediciones.at(-1).az+9.81)<1e-9);
   const m=p.mediciones.find(m=>m.t_ms>=p.evento.t_deteccion_ms);
   assert(m.roll_deg>=90);
  }
  const repo=crearRepositorio(':memory:');
  repo.crearSesion(p.sesion);
  repo.guardarMediciones(p.sesion.id,p.mediciones);
  assert.equal(repo.guardarMediciones(p.sesion.id,p.mediciones).insertadas,0);
  assert.deepEqual(repo.listarMediciones(p.sesion.id,0,1000).mediciones,p.mediciones);
  repo.cerrar();
 }
});
test('parámetros realmente alteran las decisiones sin cambiar las mediciones',()=>{
 const standard=generarEscenario('impacto');
 const filtered=generarEscenario('impacto',100);
 assert.equal(filtered.evento,null);
 assert.deepEqual(standard.mediciones,filtered.mediciones);
 assert.equal(generarEscenario('inclinacion',16,30,100).evento.tipo,'inclinacion');
 assert.equal(generarEscenario('impacto',16,60,100,2000).evento,null);
});
test('contrato admite históricos y rechaza Hall inválido',()=>{
 const m=generarEscenario('normal').mediciones[0];
 const {rueda_rps,...legacy}=m;
 validar(loteSchema,{version:1,mediciones:[legacy]});
 for(const invalid of [-1,Infinity,1001])assert.throws(()=>validar(loteSchema,{version:1,mediciones:[{...m,rueda_rps:invalid}]}));
});
test('modelo de sensor: reproducible y con saturación',()=>{
 const o={ruido:.3,semilla:7,rango_g:8};
 assert.deepEqual(generarEscenario('impacto',16,60,150,20,o).mediciones,generarEscenario('impacto',16,60,150,20,o).mediciones);
 validar(loteSchema,{version:1,mediciones:generarEscenario('vuelco',16,60,150,20,o).mediciones});
 const limite=2*9.80665;
 assert(generarEscenario('impacto',16,60,150,20,{rango_g:2}).mediciones.every(m=>Math.abs(m.ax)<=limite));
 assert.throws(()=>generarEscenario('impacto',16,60,150,20,{rango_g:3}));
});
test('frenada: la trompa baja y la gravedad se suma a la desaceleración',()=>{
 const m=generarEscenario('frenada').mediciones.reduce((a,b)=>b.ax<a.ax?b:a);
 assert(m.pitch_deg<0&&m.ax<-4);
});
test('mismas reglas que el firmware: lecturas a 250 Hz y golpe con 2 lecturas',()=>{
 // Un golpe real de 20 ms dura menos que la permanencia de inclinación, pero el firmware lo detecta.
 const corto=generarEscenario('impacto',16,60,150,8,{duracion_impacto_ms:20});
 assert.equal(corto.evento?.tipo,'golpe');
 // La muestra publicada conserva el pico, como la telemetría del firmware.
 assert(corto.mediciones.some(m=>Math.hypot(m.ax,m.ay,m.az)>=16));
 // 50 Hz publicados, con tiempos crecientes.
 assert.equal(corto.mediciones.length,501);
 assert(corto.mediciones.every((m,i,a)=>i===0||m.t_ms>a[i-1].t_ms));
 // Una sola lectura alta no basta (permanencia de 8 ms = 2 lecturas).
 assert.equal(corto.parametros.lecturas_golpe,2);
 // Inclinación y vuelco siguen necesitando 150 ms sostenidos.
 assert.equal(generarEscenario('inclinacion',16,30,150).evento.tipo,'inclinacion');
 assert.equal(generarEscenario('vuelco').evento.tipo,'vuelco');
});

test('frenada: solo acelerómetro da inclinación aparente; el filtro complementario del firmware no',()=>{
 const frenada=alfa=>generarEscenario('frenada',16,10,150,8,{alfa});
 const pitchMax=p=>Math.max(...p.mediciones.map(m=>Math.abs(m.pitch_deg)));
 const soloAcel=frenada(0), filtro=frenada(0.999);
 assert.equal(soloAcel.evento?.tipo,'inclinacion');
 assert(pitchMax(soloAcel)>25,'el acelerómetro ve unos 26° aparentes');
 assert.equal(filtro.evento,null);
 assert(pitchMax(filtro)<5);
 assert.equal(frenada(0.98).evento?.tipo,'inclinacion','α = 0,98 (τ ≈ 0,2 s) no alcanza');
 // El ángulo real del modelo no cambia con α y es pequeño (cabeceo de 3,4°).
 assert.deepEqual(soloAcel.angulosReales.map(a=>a.pitch_deg),filtro.angulosReales.map(a=>a.pitch_deg));
 assert(Math.max(...filtro.angulosReales.map(a=>Math.abs(a.pitch_deg)))<4);
 // Una inclinación real (con giro) se sigue detectando igual con el filtro.
 assert.equal(generarEscenario('inclinacion',16,10,150,8).detecciones[0].latencia_deteccion_ms,152);
 assert.throws(()=>generarEscenario('frenada',16,10,150,8,{alfa:1}));
});
