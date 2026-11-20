import * as T from 'three';
import { prepareWheels } from './scene-assets.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// Unwrap before applying a 0.25° visual deadband. Large changes take effect in this frame.
function liveAngle(previous, degrees) {
  if (previous == null) return degrees;
  const d = T.MathUtils.euclideanModulo(degrees - previous + 180, 360) - 180;
  return Math.abs(d) < .25 ? previous : previous + d;
}

export function crearVisor(element) {
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); }
  catch {
    element.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 650 240" role="img" aria-label="Carro deportivo en una pista recta">
      <rect width="650" height="240" fill="#101b30"/>
      <path d="M0 163H650V205H0Z" fill="#273449"/>
      <path d="M0 163H650M0 205H650" stroke="#70839e" stroke-width="2"/>
      <path d="M0 184H650" stroke="#ffd470" stroke-width="2" stroke-dasharray="24 16"/>
      <g id="fallback-shadow"><ellipse cy="158" rx="77" ry="7" fill="#070e1c" opacity=".6"/></g>
      <g id="fallback-car">
        <g data-side>
          <path d="M-78 9L-75-12Q-73-21-60-22L-38-25-19-41Q-10-48 10-47Q25-47 36-37L51-26 72-19Q81-15 82-4L80 9 68 14H-65Z" fill="#2584f5" stroke="#93c5fd" stroke-width="1.5"/>
          <path d="M-31-25L-13-39Q-5-44 8-43L20-42 39-26Z" fill="#132a40" stroke="#a5caff" stroke-width="1.2"/>
          <path d="M4-42L2-26M-20-21L-24 5 31 5 39-22M-6-17H5" fill="none" stroke="#1b4b90" stroke-width="1.5"/>
          <path d="M53-24L73-17 76-12 58-14Z" fill="#e0f2fe"/>
          <path d="M-75-15L-62-17-65-10-76-9Z" fill="#ff6c6c"/>
          <path d="M-77-30H-52L-49-26H-76Z" fill="#3b9afa"/><path d="M-70-27V-22" stroke="#93c5fd" stroke-width="3"/>
          <path d="M-74 9H78L70 15H-65Z" fill="#142239"/>
          <g fill="#101824" stroke="#53657e" stroke-width="1.5"><circle cx="-49" cy="11" r="15"/><circle cx="50" cy="11" r="15"/></g>
          <g fill="#dbe7f4" stroke="#8a9bb1" stroke-width="1.5"><circle cx="-49" cy="11" r="8"/><circle cx="50" cy="11" r="8"/></g>
          <g stroke="#657891" stroke-width="2"><path data-spoke="-49" d="M-49 4V17M-55 11H-43"/><path data-spoke="50" d="M50 4V17M44 11H56"/></g>
        </g>
        <g data-front visibility="hidden">
          <rect x="-50" y="-19" width="100" height="35" rx="9" fill="#2584f5" stroke="#93c5fd"/>
          <path d="M-37-19L-26-43H26L37-19Z" fill="#132a40" stroke="#93c5fd" stroke-width="2"/>
          <rect x="-47" y="9" width="17" height="17" rx="4" fill="#101824"/><rect x="30" y="9" width="17" height="17" rx="4" fill="#101824"/>
          <path d="M-42-11H-25M25-11H42" stroke="#e0f2fe" stroke-width="5" stroke-linecap="round"/>
          <path d="M-16 3H16" stroke="#142239" stroke-width="5" stroke-linecap="round"/>
        </g>
      </g>
    </svg>`;
    const car = element.querySelector('#fallback-car');
    const shadow = element.querySelector('#fallback-shadow');
    let view = 'lateral';
    let sample = { roll_deg: 0, pitch_deg: 0 };
    let progress;
    let jolt = 0;
    function draw() {
      const front = view === 'frontal';
      const x = front || progress == null ? 325 : 100 + 450 * progress;
      const roll = sample.roll_deg * Math.PI / 180;
      const scaleY = front ? 1 : Math.sign(Math.cos(roll) || 1) * Math.max(.36, Math.abs(Math.cos(roll)));
      car.setAttribute('transform', `translate(${x + jolt * 28} 136) rotate(${front ? sample.roll_deg : -sample.pitch_deg}) scale(1 ${scaleY})`);
      shadow.setAttribute('transform', `translate(${x})`);
      car.querySelector('[data-side]').setAttribute('visibility', front ? 'hidden' : 'visible');
      car.querySelector('[data-front]').setAttribute('visibility', front ? 'visible' : 'hidden');
    }
    draw();
    return {
      mode: '2d',
      update(m, avance, impact = 0, turns, live = false) {
        sample = m; progress = live ? undefined : avance; jolt = impact;
        for (const spoke of car.querySelectorAll('[data-spoke]')) spoke.setAttribute('transform',`rotate(${(turns ?? 0)*360} ${spoke.dataset.spoke} 11)`);
        draw();
      },
      camera(next) { view = next; draw(); },
      destroy() { element.replaceChildren(); }
    };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x101b30);
  element.append(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-8, 8, 3, -3, .1, 100);
  camera.position.set(0, 2.7, 12); camera.lookAt(0, .15, 0);
  let view = 'seguimiento';
  let progress;
  const chaseCamera = new T.PerspectiveCamera(48, 1, .1, 110);
  scene.fog = new T.Fog(0x101b30, 14, 32);
  scene.add(new T.HemisphereLight(0xc2ddff, 0x364769, 3));
  const light = new T.DirectionalLight(0xffffff, 4); light.position.set(3, 7, 5); scene.add(light);
  const roadTop = -.57;
  const fallbackRoad = new T.Group(); scene.add(fallbackRoad);
  const verge = new T.Mesh(new T.PlaneGeometry(104, 26), new T.MeshStandardMaterial({color:0x253b30}));
  verge.rotation.x = -Math.PI / 2;
  verge.position.set(14, roadTop - .06, 1.6);
  scene.add(verge);
  let wheels = [];
  let wheelRadius = .25;
  let wheelTurns;
  let live = false;
  const roadThickness = .08;
  const road = new T.Mesh(new T.BoxGeometry(104, roadThickness, 6.4), new T.MeshStandardMaterial({color:0x273449}));
  road.name = 'straight-road';
  road.position.set(14, roadTop - roadThickness / 2, 1.6);
  fallbackRoad.add(road);
  const roadLine = new T.MeshBasicMaterial({color:0x75879f});
  const dash = new T.MeshBasicMaterial({color:0xffd470});
  for (const z of [-1.45, 4.65]) {
    const edge = new T.Mesh(new T.PlaneGeometry(104, .045), roadLine);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(14, roadTop + .005, z);
    fallbackRoad.add(edge);
  }
  for (let x = -36; x <= 64; x += 2.6) {
    const stripe = new T.Mesh(new T.PlaneGeometry(1.45, .065), dash);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(x, roadTop + .006, 1.6);
    fallbackRoad.add(stripe);
  }
  const vehicle = new T.Group(); scene.add(vehicle);
  const car = new T.Group(); vehicle.add(car);
  car.name = 'car-body'; vehicle.name = 'vehicle';
  const blue = new T.MeshStandardMaterial({color:0x2563eb,metalness:.6,roughness:.25});
  const glass = new T.MeshStandardMaterial({color:0x163346,metalness:.65,roughness:.15});
  const black = new T.MeshStandardMaterial({color:0x10151c,roughness:.85});
  function box(w,h,d,x,y,z,mat) {
    const m = new T.Mesh(new T.BoxGeometry(w,h,d), mat); m.position.set(x,y,z); car.add(m); return m;
  }
  // Longitudinal axis X. Roll rotates about X, pitch about Z.
  function profile(points, width, material, bevel) {
    const shape = new T.Shape();
    points.forEach(([x,y], i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y));
    shape.closePath();
    const model = new T.Mesh(new T.ExtrudeGeometry(shape, {
      depth: width, bevelEnabled: true, bevelSegments: 3, steps: 1,
      bevelThickness: bevel, bevelSize: bevel
    }), material);
    model.position.z = -width / 2;
    car.add(model);
  }
  profile([[-1.8,-.11],[-1.76,.22],[-1.5,.35],[-.77,.43],[.58,.4],[1.27,.31],[1.73,.21],[1.84,.06],[1.77,-.11]], 1.48, blue, .075);
  profile([[-.82,.40],[-.46,.75],[-.25,.83],[.33,.83],[.52,.74],[.95,.40]], 1.13, glass, .05);
  profile([[-.49,.77],[-.26,.84],[.34,.84],[.53,.76]], 1.15, blue, .026);
  box(3.42,.09,1.55,0,-.13,0,black);
  box(.09,.23,1.7,-1.45,.65,0,black);
  box(.55,.06,1.85,-1.45,.8,0,blue);
  const rim = new T.MeshStandardMaterial({color:0xcbd5e1,metalness:.9,roughness:.25});
  for(const x of [-1.15,1.15]) for(const z of [-.84,.84]) {
    const wheel=new T.Mesh(new T.CylinderGeometry(.39,.39,.23,32),black);
    wheel.rotation.x=Math.PI/2; wheel.position.set(x,-.12,z); car.add(wheel);
    const hub=new T.Mesh(new T.CylinderGeometry(.23,.23,.25,12),rim);
    hub.rotation.x=Math.PI/2; hub.position.copy(wheel.position); car.add(hub);
  }
  const head=new T.MeshStandardMaterial({color:0xdbeafe,emissive:0x93c5fd,emissiveIntensity:1});
  for(const z of [-.56,.56]) {
    box(.04,.12,.35,1.81,.08,z,head);
    box(.04,.1,.38,-1.81,.12,z,new T.MeshStandardMaterial({color:0xef4444,emissive:0xff2020,emissiveIntensity:.5}));
  }
  // Tail details are visible from the chase camera.
  box(.07,.13,1.45,-1.82,-.025,0,black);
  const exhaustMaterial = new T.MeshStandardMaterial({color:0x64748b,metalness:.7,roughness:.35});
  for (const z of [-.48,.48]) {
    const exhaust = new T.Mesh(new T.TorusGeometry(.056,.014,8,20),exhaustMaterial);
    exhaust.rotation.y = Math.PI / 2;
    exhaust.position.set(-1.86,-.055,z);
    car.add(exhaust);
  }

  // Soft contact shadow makes the reference plane readable without WebGL shadow maps.
  const shadowSize = 32;
  const shadowPixels = new Uint8Array(shadowSize * shadowSize * 4);
  for (let y = 0; y < shadowSize; y++) {
    for (let x = 0; x < shadowSize; x++) {
      const radius = Math.hypot((x + .5) / shadowSize * 2 - 1, (y + .5) / shadowSize * 2 - 1);
      shadowPixels[(y * shadowSize + x) * 4 + 3] = 120 * Math.max(0, 1 - radius) ** 1.4;
    }
  }
  const shadowTexture = new T.DataTexture(shadowPixels,shadowSize,shadowSize);
  shadowTexture.magFilter = T.LinearFilter;
  shadowTexture.needsUpdate = true;
  const shadow = new T.Mesh(new T.PlaneGeometry(6,3.3),
    new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = roadTop + .007;
  scene.add(shadow);

  // Cache the mesh vertices relative to the car pivot for road contact.
  const contactPoints = [];
  const point = new T.Vector3();
  const localMatrix = new T.Matrix4();
  const inverseCar = new T.Matrix4();
  function collectContactPoints() {
    contactPoints.length = 0;
    car.updateWorldMatrix(true, true);
    inverseCar.copy(car.matrixWorld).invert();
    car.traverse(mesh => {
      if (!mesh.isMesh) return;
      localMatrix.multiplyMatrices(inverseCar, mesh.matrixWorld);
      const vertices = mesh.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        point.fromBufferAttribute(vertices, i).applyMatrix4(localMatrix);
        contactPoints.push(point.x, point.y, point.z);
      }
    });
  }
  collectContactPoints();
  const orientation = new T.Matrix4();

  function fitToRoad() {
    const rotation = orientation.makeRotationFromQuaternion(car.quaternion).elements;
    let lowest = Infinity;
    for (let i = 0; i < contactPoints.length; i += 3) {
      const y = rotation[1] * contactPoints[i] +
        rotation[5] * contactPoints[i + 1] +
        rotation[9] * contactPoints[i + 2];
      lowest = Math.min(lowest, y);
    }
    car.position.y = roadTop - lowest + .008;
  }
  // Live and replay rest on the road: the lowest point of the model touches it.
  // Flat = on its wheels, tilted = pivoting on its lowest point, upside down = on its roof.
  fitToRoad();

  const render = () => renderer.render(scene, view === 'seguimiento' ? chaseCamera : camera);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.enablePan = false;
  controls.minZoom = .65;
  controls.maxZoom = 3;
  controls.minPolarAngle = .12;
  controls.maxPolarAngle = Math.PI / 2;
  controls.target.set(0, .15, 0);
  controls.update();
  controls.addEventListener('change', render);

  function resizeCamera() {
    const w = element.clientWidth;
    const h = element.clientHeight;
    if (!w || !h) return;
    const halfWidth = view === 'lateral' && !live ? 8 : 4.1;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfWidth * h / w;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    chaseCamera.aspect = w / h;
    chaseCamera.updateProjectionMatrix();
  }

  const forward = new T.Vector3(1, 0, 0);
  const lateral = new T.Vector3(0, 0, 1);
  const previousTarget = new T.Vector3();
  function advanceOnRoad() {
    const fraction = progress == null ? 0 : T.MathUtils.clamp(progress, 0, 1);
    const distance = 11.3 * fraction;
    vehicle.position.set(progress == null ? 0 : -5.65 + distance, 0, 0);
    const target = vehicle.position.clone(); target.y = .15;
    if (view === 'libre') {
      camera.position.add(target.clone().sub(previousTarget));
      controls.target.copy(target);
    } else if (view !== 'seguimiento') {
      camera.position.copy(target).addScaledVector(view === 'frontal' ? forward : lateral, 12);
      camera.position.y = 2.7;
      camera.lookAt(target);
      controls.target.copy(target);
    }
    previousTarget.copy(target);
    shadow.position.x = vehicle.position.x + car.position.x;
    shadow.position.z = vehicle.position.z;
    shadow.rotation.z = vehicle.rotation.y;
    if (view === 'seguimiento') {
      chaseCamera.position.copy(vehicle.position).addScaledVector(forward, -6.8);
      chaseCamera.position.y = roadTop + 3.7;
      const look = vehicle.position.clone().addScaledVector(forward, 5);
      look.y = roadTop + .4;
      chaseCamera.lookAt(look);
    }
    let moved = false;
    for (const wheel of wheels) {
      const angle = progress != null ? -distance / (wheel.userData.radius ?? wheelRadius) : -(wheelTurns ?? 0) * Math.PI * 2;
      moved ||= wheel.rotation.x !== angle;
      wheel.rotation.x = angle;
    }
    if (moved && !live) {
      collectContactPoints();
      fitToRoad();
    }
  }
  advanceOnRoad();

  const observer = new ResizeObserver(() => {
    if (!element.clientWidth || !element.clientHeight) return;
    renderer.setSize(element.clientWidth, element.clientHeight);
    resizeCamera();
    render();
  });
  observer.observe(element);

  function disposeModel(model) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    model.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const material of [].concat(object.material)) materials.add(material);
      }
    });
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
      material.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
  }

  let destroyed = false;
  let lastRoll, lastPitch;
  const modelUrl = new URL('./assets/oldsmobile_cutlass_supreme_sedan_71.glb', import.meta.url).href;
  new GLTFLoader().loadAsync(modelUrl).then(({scene: model}) => {
    if (destroyed) {
      disposeModel(model);
      return;
    }

    // The downloaded scene includes its own presentation floor.
    const floor = model.getObjectByName('ground_M_Dome_0');
    if (floor) {
      floor.removeFromParent();
      disposeModel(floor);
    }
    wheels = prepareWheels(model);
    const aligned = new T.Group();
    aligned.add(model);
    aligned.rotation.y = -Math.PI / 2;
    const bounds = new T.Box3().setFromObject(aligned, true);
    const center = bounds.getCenter(new T.Vector3());
    const scale = 3.8 / (bounds.max.x - bounds.min.x);
    aligned.scale.setScalar(scale);
    aligned.position.copy(center).multiplyScalar(-scale);

    disposeModel(car);
    car.clear();
    car.add(aligned);
    if (wheels.length) {
      car.updateWorldMatrix(true, true);
      wheels.forEach(wheel => {
        wheel.userData.radius = wheel.userData.localRadius * wheel.getWorldScale(new T.Vector3()).y;
      });
      wheelRadius = wheels[0].userData.radius;
    }
    advanceOnRoad();
    collectContactPoints();
    fitToRoad();
    render();
  }).catch(error => console.warn('Se conserva el carro de respaldo:', error));

  return {
    update(sample, advance, impact = 0, turns, enVivo = false) {
      const changedMode = live !== enVivo;
      live = enVivo;
      if (changedMode) resizeCamera();
      wheelTurns = turns;
      progress = live ? undefined : advance;
      car.position.x = live ? 0 : impact;
      advanceOnRoad();
      if (changedMode || sample.roll_deg !== lastRoll || sample.pitch_deg !== lastPitch) {
        lastRoll = live ? liveAngle(changedMode ? null : lastRoll, sample.roll_deg) : sample.roll_deg;
        lastPitch = live ? liveAngle(changedMode ? null : lastPitch, sample.pitch_deg) : sample.pitch_deg;
        // Roll first, then pitch about the level lateral axis: the same order the telemetry model uses.
        car.rotation.set(T.MathUtils.degToRad(lastRoll), 0, T.MathUtils.degToRad(lastPitch), 'YZX');
        // Contact points are refreshed when switching mode (connecting), not for each live wheel turn.
        if (changedMode) collectContactPoints();
        fitToRoad();
      }
      render();
    },
    camera(next) {
      view = next;
      controls.enabled = view === 'libre';
      controls.target.set(0, .15, 0);
      previousTarget.set(0, .15, 0);
      camera.zoom = 1;
      camera.position.set(...(view === 'frontal' ? [12,2,0] : view === 'lateral' ? [0,2.7,12] : [7,4,9]));
      advanceOnRoad();
      resizeCamera();
      controls.update();
      render();
    },
    destroy() {
      destroyed = true;
      observer.disconnect();
      controls.dispose();
      disposeModel(scene);
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
