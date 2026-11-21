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
    // The model's front wheels come steered about 10°: spinning them about the car's X axis made
    // them wobble. Each wheel's own axle is found as the direction of least spread of its vertices,
    // the wheel is turned so that axle lines up with the car's X axis (straight ahead, as the car
    // drives in a straight line) and then it spins about it.
    const axle = axleOf(part.attributes.position);
    if (axle.x < 0) axle.negate(); // same spin direction on every wheel
    const steer = new T.Quaternion().setFromUnitVectors(new T.Vector3(1, 0, 0), axle);
    part.applyQuaternion(steer.clone().invert());
    part.computeBoundingBox();
    const center = part.boundingBox.getCenter(new T.Vector3());
    const radius = (part.boundingBox.max.y - part.boundingBox.min.y) / 2;
    part.translate(-center.x, -center.y, -center.z);
    const pivot = new T.Group();
    pivot.name = 'wheel-pivot';
    pivot.position.copy(center.applyQuaternion(steer)); // same hub position, wheel straightened
    const wheel = new T.Mesh(part, source.material);
    wheel.name = 'animated-wheel';
    wheel.userData.localRadius = radius;
    pivot.add(wheel); container.add(pivot); return wheel;
  });
  source.parent.add(container); source.removeFromParent();
  source.geometry.dispose(); geometry.dispose();
  return wheels;
}

// Unit eigenvector of the smallest eigenvalue of the vertex covariance (Jacobi rotations).
export function axleOf(positions) {
  const n = positions.count, mean = [0, 0, 0];
  for (let i = 0; i < n; i++) { mean[0] += positions.getX(i) / n; mean[1] += positions.getY(i) / n; mean[2] += positions.getZ(i) / n; }
  const a = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    const v = [positions.getX(i) - mean[0], positions.getY(i) - mean[1], positions.getZ(i) - mean[2]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) a[r][c] += v[r] * v[c] / n;
  }
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let p = 0, q = 1;
    for (let r = 0; r < 3; r++) for (let c = r + 1; c < 3; c++) if (Math.abs(a[r][c]) > Math.abs(a[p][q])) { p = r; q = c; }
    if (Math.abs(a[p][q]) < 1e-15) break;
    const t = .5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), cs = Math.cos(t), sn = Math.sin(t);
    for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = cs * x - sn * y; a[k][q] = sn * x + cs * y; }
    for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = cs * x - sn * y; a[q][k] = sn * x + cs * y; }
    for (let k = 0; k < 3; k++) { const x = v[k][p], y = v[k][q]; v[k][p] = cs * x - sn * y; v[k][q] = sn * x + cs * y; }
  }
  const k = [0, 1, 2].reduce((m, i) => a[i][i] < a[m][m] ? i : m, 0);
  return new T.Vector3(v[0][k], v[1][k], v[2][k]).normalize();
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
