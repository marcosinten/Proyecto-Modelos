import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareRoad, prepareWheels } from '../web/src/scene-assets.js';
globalThis.self = globalThis;
globalThis.ProgressEvent = class {};
globalThis.createImageBitmap = async () => ({width:1,height:1,close(){}});
async function load(name) {
 const bytes = await fs.readFile(new URL('../web/src/assets/'+name, import.meta.url));
 return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), '')).scene;
}
const model = await load('oldsmobile_cutlass_supreme_sedan_71.glb');
model.getObjectByName('ground_M_Dome_0')?.removeFromParent();
const before = new T.Box3().setFromObject(model,true);
const original = model.getObjectByName('wheels_M_Wheel_0');
const triangles = (original.geometry.index?.count ?? original.geometry.attributes.position.count)/3;
const wheels = prepareWheels(model);
assert.equal(wheels.length,4);
assert.equal(wheels.reduce((n,w)=>n+w.geometry.attributes.position.count/3,0),triangles);
const after = new T.Box3().setFromObject(model,true);
assert(before.min.distanceTo(after.min)<.001 && before.max.distanceTo(after.max)<.001);
const originalCenter = wheels.map(w=>w.getWorldPosition(new T.Vector3()));
wheels.forEach(w=>w.rotation.x=1.3);
model.updateMatrixWorld(true);
wheels.forEach((w,i)=>assert(w.getWorldPosition(new T.Vector3()).distanceTo(originalCenter[i])<1e-8));
const road = await load('road__highway.glb');
const route = prepareRoad(road,-.57);
route.wrapper.updateMatrixWorld(true);
assert(route.length>70 && route.length<100);
const surface=road.getObjectByName('Object_7');
surface.material.side=T.DoubleSide;
const ray=new T.Raycaster();
for(let i=0;i<=100;i++){
 const station=.3+(11.3*i/100)/route.length;
 const p=route.path.getPointAt(station);
 ray.set(new T.Vector3(p.x,10,p.z),new T.Vector3(0,-1,0));
 const hits=ray.intersectObject(surface);
 assert(hits.length,`Road missing at ${i}`);
 assert(Math.abs(hits[0].point.y+.57)<.005,`Road not flat at ${i}`);
}
console.log('PASS: four complete wheels, stable pivots, unchanged model bounds, continuous flat road under 101 replay positions.');
