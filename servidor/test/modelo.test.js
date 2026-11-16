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
  if(type==='normal')assert(p.mediciones.every(m=>m.roll_deg===0&&m.pitch_deg===0&&Math.abs(m.az-9.81)<1e-9));
  if(type==='vuelco') {
   assert.equal(p.mediciones.at(-1).roll_deg,180);
   assert(Math.abs(p.mediciones.at(-1).az+9.81)<1e-9);
   const m=p.mediciones.find(m=>m.t_ms===p.evento.t_deteccion_ms);
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
test('modelo de sensor: reproducible, saturación y golpes más cortos que el muestreo',()=>{
 const o={ruido:.3,semilla:7,rango_g:8};
 assert.deepEqual(generarEscenario('impacto',16,60,150,20,o).mediciones,generarEscenario('impacto',16,60,150,20,o).mediciones);
 validar(loteSchema,{version:1,mediciones:generarEscenario('vuelco',16,60,150,20,o).mediciones});
 const limite=2*9.80665;
 assert(generarEscenario('impacto',16,60,150,20,{rango_g:2}).mediciones.every(m=>Math.abs(m.ax)<=limite));
 assert.equal(generarEscenario('impacto',16,60,150,20,{duracion_impacto_ms:20}).evento,null);
 assert.throws(()=>generarEscenario('impacto',16,60,150,20,{rango_g:3}));
});
test('frenada: la trompa baja y la gravedad se suma a la desaceleración',()=>{
 const m=generarEscenario('frenada').mediciones.reduce((a,b)=>b.ax<a.ax?b:a);
 assert(m.pitch_deg<0&&m.ax<-4);
});
