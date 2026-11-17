import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as T from 'three';
globalThis.self=globalThis;
globalThis.ProgressEvent=class {};
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
globalThis.devicePixelRatio=1;
globalThis.ResizeObserver=class{observe(){} disconnect(){}};
let source=await fs.readFile('web/src/car.js','utf8');
source=source.replace("import { OrbitControls } from 'three/addons/controls/OrbitControls.js';",`class OrbitControls {constructor(){this.target=new T.Vector3()} update(){} addEventListener(){} dispose(){}}`);
source=source.replace("import { prepareWheels } from './scene-assets.js';","import { prepareWheels } from '../web/src/scene-assets.js';");
source=source.replace('new T.WebGLRenderer({ antialias: true, alpha: true })',`new class {domElement={remove(){}}; setPixelRatio(){} setClearColor(){} setSize(){} dispose(){} render(scene,camera){scene.updateMatrixWorld(true); globalThis.captured={scene,camera};}}`);
for(const name of ['oldsmobile_cutlass_supreme_sedan_71.glb']){
 const bytes=await fs.readFile('web/src/assets/'+name);
 source=source.replace(`new URL('./assets/${name}', import.meta.url).href`,JSON.stringify('data:model/gltf-binary;base64,'+bytes.toString('base64')));
}
await fs.writeFile('scripts/.viewer-harness.mjs',source);
try {
 const {crearVisor}=await import('./.viewer-harness.mjs');
 const viewer=crearVisor({append(){},clientWidth:900,clientHeight:350});
 for(let i=0;i<100;i++){
  await new Promise(r=>setTimeout(r,20));
  if(globalThis.captured?.scene.getObjectByName('animated-wheel')&&globalThis.captured.scene.getObjectByName('straight-road'))break;
 }
 assert(globalThis.captured?.scene.getObjectByName('straight-road'));
 for(const view of ['seguimiento','lateral','frontal','libre']){
  viewer.camera(view);
  for(const roll of [0,45,90,135,180]){
   const sample=Object.freeze({roll_deg:roll,pitch_deg:15});
   viewer.update(sample,.5);
   const wheel=globalThis.captured.scene.getObjectByName('animated-wheel');
   // Find vehicle root by walking up to scene.
   let root=wheel; while(root.parent && !root.parent.isScene)root=root.parent;
   const box=new T.Box3().setFromObject(root,true);
   assert(Math.abs(box.min.y-(-.57+.008))<1e-5,`${view} ${roll} contact ${box.min.y}`);
   const rotation=wheel.rotation.x;
   viewer.update(sample,.5); assert.equal(wheel.rotation.x,rotation);
   viewer.update(sample,.2); const rewind=wheel.rotation.x;
   viewer.update(sample,.5); assert.equal(wheel.rotation.x,rotation);
   assert.notEqual(rewind,rotation);
   viewer.update(sample,undefined); assert(Math.abs(wheel.rotation.x)<1e-12);
  }
 }
 const flat=Object.freeze({roll_deg:0,pitch_deg:0});
 viewer.camera('seguimiento');
 const wheel=globalThis.captured.scene.getObjectByName('animated-wheel');
 const r=wheel.userData.radius;
 // Real replay (car standing): Hall turns spin the wheel in place at the visual scale.
 viewer.update(flat,undefined,0,1);
 const center=wheel.position.clone();
 viewer.update(flat,undefined,0,1.25);
 assert(wheel.position.equals(center),'Wheel axle must not translate when spinning');
 assert(Math.abs(wheel.rotation.x+1.25*.17/r)<1e-9);
 const stopped=wheel.rotation.x;
 viewer.update(flat,undefined,0,1.25);
 assert.equal(wheel.rotation.x,stopped,'Stationary Hall signal must keep wheel pose');
 // Simulated replay on the road: the wheel follows the distance travelled, whatever the Hall turns say.
 viewer.update(flat,.5,0,40);
 assert(Math.abs(wheel.rotation.x+11.3*.5/r)<1e-9,'Wheel must roll with the car, without slipping');
 // Live loop: travel and wheel angle come from the same rolled distance and stay continuous at the wrap.
 let previous;
 for(let turns=0;turns<=140;turns+=.25){
  viewer.update(flat,undefined,0,turns,true);
  if(previous!==undefined)assert(Math.abs(wheel.rotation.x-previous)<=.25*.17/r+1e-9,'Wheel must not jump when the car re-enters the road');
  previous=wheel.rotation.x;
 }
 // At the simulated top speed (10,6 turns/s) a 60 fps frame turns the wheel well under a quarter turn.
 assert(10.6/60*.17/r<Math.PI/4,'Wheel speed must stay below the stroboscopic limit');
 viewer.destroy();
 console.log('PASS: viewer loads the Oldsmobile and straight road; contact at 20 camera/roll combinations; pause, rewind, real-data stationary mode; Hall turns spin in place at the visual scale, wheels roll with the car, no jump at the live wrap; frozen telemetry untouched.');
} finally {await fs.unlink('scripts/.viewer-harness.mjs');}
