import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {crearRepositorio} from '../src/adaptadores/sqlite/repositorio.js';
import {validar, paqueteSchema} from '../src/aplicacion/contratos.js';
import {generarEscenario} from '../../web/src/simulation.js';
test('EV-001 y EV-002 conviven y conservan sus muestras después de reenvíos',()=>{
 const repo=crearRepositorio(':memory:');
 try{
  for(const file of ['vuelco.json','vuelco-002.json']){
   const p=validar(paqueteSchema,JSON.parse(readFileSync(new URL('../../ejemplos/'+file,import.meta.url))));
   for(let i=0;i<2;i++){repo.crearSesion(p.sesion);repo.guardarMediciones(p.sesion.id,p.mediciones);repo.crearEvento(p.evento);}
   assert.deepEqual(repo.obtenerPaquete(p.evento.id),p);
  }
  assert.equal(repo.listarEventos(undefined,50,0).eventos.length,2);
 }finally{repo.cerrar();}
});
test('simulación normal sin incidente y vuelco con umbral y permanencia',()=>{
 assert.equal(generarEscenario('normal').evento,null);
 const p=generarEscenario('vuelco',16,90,100);
 assert.ok(p.evento);
 assert.equal(p.evento.t_activacion_ms,null);
 assert.equal(p.mediciones.at(-1).roll_deg,180);
 validar(paqueteSchema,p.evento?{version:p.version,sesion:p.sesion,evento:p.evento,mediciones:p.mediciones}:p);
});
test('un impacto breve se filtra con una permanencia prolongada',()=>{
 assert.ok(generarEscenario('impacto',16,60,0).evento);
 assert.equal(generarEscenario('impacto',16,60,2000).evento,null);
});
