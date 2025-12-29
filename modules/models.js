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
  geo.center();
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
