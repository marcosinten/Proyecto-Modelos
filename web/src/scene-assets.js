import * as T from 'three';

export function prepareWheels(model) {
  const source = model.getObjectByName('wheels_M_Wheel_0');
  if (!source?.isMesh) return [];
  const geometry = source.geometry.toNonIndexed();
  geometry.computeBoundingBox();
  const middle = geometry.boundingBox.getCenter(new T.Vector3());
  const positions = geometry.attributes.position;
  const groups = [[], [], [], []];
  const quadrant = i => (positions.getX(i) > middle.x ? 1 : 0) + (positions.getY(i) > middle.y ? 2 : 0);
  for (let i = 0; i < positions.count; i += 3) {
    const group = quadrant(i);
    if (quadrant(i + 1) !== group || quadrant(i + 2) !== group) {
      geometry.dispose(); return []; // Retain original mesh if topology changes.
    }
    groups[group].push(i, i + 1, i + 2);
  }
  if (groups.some(group => !group.length)) { geometry.dispose(); return []; }
  const container = new T.Group();
  container.position.copy(source.position);
  container.quaternion.copy(source.quaternion);
  container.scale.copy(source.scale);
  const wheels = groups.map(indices => {
    const part = new T.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const values = new attribute.array.constructor(indices.length * attribute.itemSize);
      indices.forEach((index, i) => {
        for (let j = 0; j < attribute.itemSize; j++) values[i * attribute.itemSize + j] = attribute.array[index * attribute.itemSize + j];
      });
      part.setAttribute(name, new T.BufferAttribute(values, attribute.itemSize, attribute.normalized));
    }
    part.computeBoundingBox();
    const center = part.boundingBox.getCenter(new T.Vector3());
    const radius = (part.boundingBox.max.y - part.boundingBox.min.y) / 2;
    part.translate(-center.x, -center.y, -center.z);
    const wheel = new T.Mesh(part, source.material);
    wheel.name = 'animated-wheel'; wheel.position.copy(center);
    wheel.userData.localRadius = radius;
    container.add(wheel); return wheel;
  });
  source.parent.add(container); source.removeFromParent();
  source.geometry.dispose(); geometry.dispose();
  return wheels;
}

export function prepareRoad(model, roadTop) {
  model.updateMatrixWorld(true);
  const surface = model.getObjectByName('Object_7');
  if (!surface?.isMesh) throw new Error('No se encontró la superficie de la carretera.');
  const geometry = surface.geometry;
  const vertices = geometry.attributes.position;
  const index = geometry.index;
  const count = index?.count ?? vertices.count;
  const triangles = [];
  for (let i = 0; i < count; i += 3) triangles.push([0, 1, 2].map(j => new T.Vector3().fromBufferAttribute(vertices, index ? index.getX(i + j) : i + j).applyMatrix4(surface.matrixWorld)));
  const scale = .6;
  const points = [];
  for (let z = -52; z <= 84; z += 2) {
    const hits = [];
    for (const triangle of triangles) for (let i = 0; i < 3; i++) {
      const a = triangle[i], b = triangle[(i + 1) % 3];
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) hits.push(a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z));
    }
    if (hits.length) points.push(new T.Vector3(((Math.min(...hits) + Math.max(...hits)) / 2 + 1.45) * scale, 0, z * scale));
  }
  if (points.length < 60) throw new Error('Trayectoria incompleta.');
  model.traverse(object => { if (/^Cone(?:[._])/.test(object.name)) object.visible = false; });
  const wrapper = new T.Group(); wrapper.add(model);
  wrapper.scale.setScalar(scale); wrapper.position.y = roadTop;
  const path = new T.CatmullRomCurve3(points); path.arcLengthDivisions = 1000;
  return { wrapper, path, length: path.getLength() };
}
