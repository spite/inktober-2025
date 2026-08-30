import { OBJLoader } from "../third_party/OBJLoader.js";
import { LoopSubdivision } from "../third_party/LoopSubdivision.js";
import { Mesh, BufferGeometry, Matrix4, BufferAttribute } from "three";

function mergeMesh(mesh) {
  let count = 0;
  //   mesh.traverse((m) => {
  //     if (m instanceof Mesh) {
  //       m.geometry = m.geometry.toNonIndexed();
  //     }
  //   });
  mesh.traverse((m) => {
    if (m instanceof Mesh) {
      count += m.geometry.attributes.position.count;
    }
  });
  let geo = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  count = 0;
  mesh.traverse((m) => {
    if (m instanceof Mesh) {
      const mat = new Matrix4().makeTranslation(
        m.position.x,
        m.position.y,
        m.position.z
      );
      m.geometry.applyMatrix4(mat);
      const pos = m.geometry.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        positions[(count + j) * 3] = pos.array[j * 3];
        positions[(count + j) * 3 + 1] = pos.array[j * 3 + 1];
        positions[(count + j) * 3 + 2] = pos.array[j * 3 + 2];
      }
      count += pos.count;
    }
  });
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  return geo;
}

// Centres a model on the centroid of its surface rather than the middle of its bounding
// box. geometry.center() does the latter, and for the bunny the box is staked out by the
// ear tips and the tail — extremities with almost no surface around them. Every sketch that
// uses these models scatters points over the surface, so what reads as the middle of the
// drawing is where the area is, and the body sits well off the box's centre: the bunny
// landed 5% of the canvas right of and below every other model.
//
// Area-weighted, so a dense patch of small triangles does not outvote a large flat one.
// mergeMesh leaves the positions as an unindexed triangle soup, so each run of nine floats
// is one triangle.
function centerOnSurface(geometry) {
  const pos = geometry.attributes.position.array;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let total = 0;
  for (let i = 0; i + 8 < pos.length; i += 9) {
    const ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
    const bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5];
    const cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const area = Math.hypot(nx, ny, nz) * 0.5;
    if (!area) continue;
    sx += (area * (ax + bx + cx)) / 3;
    sy += (area * (ay + by + cy)) / 3;
    sz += (area * (az + bz + cz)) / 3;
    total += area;
  }
  if (total > 0) {
    geometry.translate(-sx / total, -sy / total, -sz / total);
  }
  return geometry;
}

async function loadModel(file) {
  return new Promise((resolve, reject) => {
    const loader = new OBJLoader();
    loader.load(file, resolve, null, reject);
  });
}

async function loadSuzanne() {
  const model = await loadModel("./assets/suzanne.obj");
  const geo = mergeMesh(model);
  const modified = LoopSubdivision.modify(geo, 2);
  return modified;
}

async function loadLeePerrySmith() {
  const model = await loadModel("./assets/LeePerrySmith.obj");
  const geo = mergeMesh(model);
  return geo;
}

async function loadStanfordBunny() {
  const model = await loadModel("./assets/bunny.obj");
  const geo = mergeMesh(model);
  centerOnSurface(geo);
  return geo;
}

async function loadIcosahedron() {
  const model = await loadModel("./assets/icosahedron.obj");
  const geo = mergeMesh(model);
  return geo;
}

async function loadDodecahedron() {
  const model = await loadModel("./assets/dodecahedron.obj");
  const geo = mergeMesh(model);
  return geo;
}

export {
  loadIcosahedron,
  loadDodecahedron,
  loadSuzanne,
  loadLeePerrySmith,
  loadStanfordBunny,
  mergeMesh,
};
