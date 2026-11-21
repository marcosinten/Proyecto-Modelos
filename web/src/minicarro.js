// Carros en miniatura con la postura de un instante (para las marcas A, B, C… de la gráfica de fuerza por eje,
// como en las figuras del artículo de referencia). Un solo renderizador WebGL fuera de pantalla dibuja el carro
// en cada postura y copia el resultado a un <canvas> 2D; después se libera el contexto.
// Convención igual que car.js: eje longitudinal X (trompa en +X), Y arriba, Z a la derecha;
// rotación Euler(roll, 0, pitch, 'YZX'): roll gira sobre X (positivo eleva el lado izquierdo) y pitch sobre Z
// (positivo eleva la trompa).
import * as T from 'three';

export const ANCHO_CARRO = 104, ALTO_CARRO = 66;

function carroSimple() {
  const car = new T.Group();
  const azul = new T.MeshStandardMaterial({ color: 0x2563eb, metalness: .45, roughness: .35 });
  const vidrio = new T.MeshStandardMaterial({ color: 0x163346, metalness: .5, roughness: .2 });
  const negro = new T.MeshStandardMaterial({ color: 0x10151c, roughness: .85 });
  const perfil = (puntos, ancho, material, bisel) => {
    const forma = new T.Shape();
    puntos.forEach(([x, y], i) => i ? forma.lineTo(x, y) : forma.moveTo(x, y));
    forma.closePath();
    const malla = new T.Mesh(new T.ExtrudeGeometry(forma, { depth: ancho, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelThickness: bisel, bevelSize: bisel }), material);
    malla.position.z = -ancho / 2; car.add(malla);
  };
  const caja = (w, h, d, x, y, z, material) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), material); m.position.set(x, y, z); car.add(m); };
  // Mismas proporciones que el carro de respaldo de car.js.
  perfil([[-1.8, -.11], [-1.76, .22], [-1.5, .35], [-.77, .43], [.58, .4], [1.27, .31], [1.73, .21], [1.84, .06], [1.77, -.11]], 1.48, azul, .075);
  perfil([[-.82, .40], [-.46, .75], [-.25, .83], [.33, .83], [.52, .74], [.95, .40]], 1.13, vidrio, .05);
  caja(3.42, .09, 1.55, 0, -.13, 0, negro);
  const llanta = new T.MeshStandardMaterial({ color: 0xcbd5e1, metalness: .8, roughness: .3 });
  for (const x of [-1.15, 1.15]) for (const z of [-.84, .84]) {
    const rueda = new T.Mesh(new T.CylinderGeometry(.39, .39, .23, 24), negro);
    rueda.rotation.x = Math.PI / 2; rueda.position.set(x, -.12, z); car.add(rueda);
    const cubo = new T.Mesh(new T.CylinderGeometry(.23, .23, .25, 12), llanta);
    cubo.rotation.x = Math.PI / 2; cubo.position.copy(rueda.position); car.add(cubo);
  }
  // Faros blancos adelante y luces rojas atrás: así se distingue hacia dónde mira el carro.
  const faro = new T.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xdbeafe, emissiveIntensity: .8 });
  const trasera = new T.MeshStandardMaterial({ color: 0xef4444, emissive: 0xb91c1c, emissiveIntensity: .6 });
  for (const z of [-.56, .56]) { caja(.05, .13, .36, 1.82, .08, z, faro); caja(.05, .11, .38, -1.82, .12, z, trasera); }
  return car;
}

const liberar = objeto => objeto.traverse(o => { o.geometry?.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m?.dispose()); });

// Respaldo sin WebGL: vista frontal girada por el roll (como la figura 10 del artículo).
function dibujar2D(posturas, ancho, alto, dpr) {
  return posturas.map(({ roll }) => {
    const c = document.createElement('canvas'); c.width = ancho * dpr; c.height = alto * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); ctx.translate(ancho / 2, alto / 2 + 4); ctx.rotate(-roll * Math.PI / 180);
    ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.roundRect(-26, -8, 52, 18, 5); ctx.fill();
    ctx.fillStyle = '#163346'; ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(-12, -20); ctx.lineTo(12, -20); ctx.lineTo(18, -8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#10151c'; ctx.fillRect(-25, 8, 9, 8); ctx.fillRect(16, 8, 9, 8);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(-21, -3, 9, 3); ctx.fillRect(12, -3, 9, 3);
    return c;
  });
}

// posturas: [{roll, pitch}] en grados. Devuelve un <canvas> por postura (ANCHO_CARRO × ALTO_CARRO px CSS).
export function imagenesCarro(posturas, { ancho = ANCHO_CARRO, alto = ALTO_CARRO } = {}) {
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  if (!posturas.length) return [];
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); }
  catch { return dibujar2D(posturas, ancho, alto, dpr); }
  renderer.setPixelRatio(dpr); renderer.setSize(ancho, alto, false); renderer.setClearColor(0x000000, 0);
  const escena = new T.Scene();
  escena.add(new T.HemisphereLight(0xffffff, 0x8794aa, 2.4));
  const luz = new T.DirectionalLight(0xffffff, 3); luz.position.set(4, 7, 5); escena.add(luz);
  // Vista de tres cuartos desde adelante a la derecha: se leen el roll y el pitch a la vez.
  const camara = new T.PerspectiveCamera(30, ancho / alto, .1, 50);
  const direccion = new T.Vector3(7.2, 2.6, 4.4).normalize(), esquina = new T.Vector3(), caja = new T.Box3();
  // Sombra fija en el suelo como referencia horizontal (no gira con el carro).
  const sombra = new T.Mesh(new T.CircleGeometry(1.9, 32), new T.MeshBasicMaterial({ color: 0x1d2939, transparent: true, opacity: .12, depthWrite: false }));
  sombra.rotation.x = -Math.PI / 2; sombra.scale.set(1.15, .62, 1); sombra.position.y = -1.05; escena.add(sombra);
  const carro = carroSimple(); escena.add(carro);
  const salida = posturas.map(({ roll, pitch }) => {
    carro.rotation.set(T.MathUtils.degToRad(roll), 0, T.MathUtils.degToRad(pitch), 'YZX');
    // Encuadre por postura: el carro llena el recuadro esté plano, de lado o de trompa.
    caja.setFromObject(carro); const centro = caja.getCenter(new T.Vector3());
    let d = 8;
    for (let paso = 0; paso < 2; paso++) {
      camara.position.copy(centro).addScaledVector(direccion, d); camara.lookAt(centro); camara.updateMatrixWorld();
      let ext = 0;
      for (let i = 0; i < 8; i++) {
        esquina.set(i & 1 ? caja.max.x : caja.min.x, i & 2 ? caja.max.y : caja.min.y, i & 4 ? caja.max.z : caja.min.z).project(camara);
        ext = Math.max(ext, Math.abs(esquina.x), Math.abs(esquina.y));
      }
      d *= ext / .92;
    }
    sombra.position.set(centro.x, caja.min.y - .04, centro.z);
    renderer.render(escena, camara);
    const c = document.createElement('canvas'); c.width = ancho * dpr; c.height = alto * dpr;
    c.getContext('2d').drawImage(renderer.domElement, 0, 0, c.width, c.height);   // copia en la misma tarea que el render
    return c;
  });
  liberar(escena); renderer.dispose(); renderer.forceContextLoss();
  return salida;
}
