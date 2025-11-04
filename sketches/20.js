import {
  Scene,
  Mesh,
  Group,
  Vector2,
  Vector3,
  TextureLoader,
  Color,
  RepeatWrapping,
  MeshBasicMaterial,
  DoubleSide,
  Matrix4,
  BufferAttribute,
  Raycaster,
  IcosahedronGeometry,
  MeshNormalMaterial,
  BufferGeometry,
} from "three";
import { renderer, getCamera, isRunning, onResize } from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Easings } from "../modules/easings.js";
import { Painted } from "../modules/painted.js";
import { pointsOnSphere } from "../modules/points-sphere.js";
import { curl, seedFunc, generateNoiseFunction } from "../modules/curl.js";
import { march, sdRoundBox } from "../modules/raymarch.js";
import { RoundedBoxGeometry } from "../third_party/three-rounded-box.js";
import { OBJLoader } from "../third_party/OBJLoader.js";
import { LoopSubdivision } from "../third_party/LoopSubdivision.js";
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from "../third_party/bvh.js";
import { MeshSurfaceSampler } from "../third_party/MeshSurfaceSampler.js";
import { init } from "../modules/dipoles-3d.js";

// Add the extension functions
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

const painted = new Painted({ minLevel: -0.2 });
// const curl = generateNoiseFunction();

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

palette.range = [
  "#FE695A",
  "#0F2246",
  "#CE451C",
  "#FEF2CD",
  "#EEC1A6",
  "#57424A",
  "#E2902D",
];

const gradient = new gradientLinear(palette.range);

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const group = new Group();
const controls = new OrbitControls(camera, canvas);
controls.screenSpacePanning = true;
controls.addEventListener("change", () => {
  painted.invalidate();
});
painted.backgroundColor.set(new Color(0xf6f2e9));

camera.position.set(
  -0.38997204674241887,
  -0.1646326072361011,
  0.3548472598819808
);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;
const resolution = new Vector2(canvas.width, canvas.height);

const N = 20;

const geo = new Float32Array(N * 3);
const radius = 2;
const lineWidth = 1;

function prepareMesh(w, c) {
  var g = new MeshLine();
  g.setPoints(geo);

  const material = new MeshLineMaterial({
    map: strokeTexture,
    useMap: true,
    color: gradient.getAt(c),
    resolution: resolution,
    sizeAttenuation: true,
    lineWidth: w / 4,
  });

  var mesh = new Mesh(g.geometry, material);
  mesh.geo = geo;
  mesh.g = g;

  return mesh;
}

function mergeMesh(mesh) {
  let count = 0;
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
  const model = await loadModel("../assets/suzanne.obj");
  const geo = mergeMesh(model);
  const modified = LoopSubdivision.modify(geo, 2);
  return modified;
}

async function loadLeePerrySmith() {
  const model = await loadModel("../assets/LeePerrySmith.obj");
  const geo = mergeMesh(model);
  return geo;
}

const suzanneGeo = await loadSuzanne();
// const suzanneGeo = await loadLeePerrySmith();
// suzanneGeo.scale(5, 5, 5);
suzanneGeo.center();
suzanneGeo.computeBoundsTree();

const raycaster = new Raycaster(new Vector3(), new Vector3());
raycaster.firstHitOnly = true;

const LINES = 3000;

const cube = new Mesh(suzanneGeo, new MeshBasicMaterial({ color: 0xf6f2e9 }));
// cube.material.polygonOffset = true;
// cube.material.polygonOffsetFactor = 150;
// group.add(cube);

const sampler = new MeshSurfaceSampler(cube).build();
const position = new Vector3();

const charges = init(20, 1, 1, 1, 1);
charges.charges.forEach((p, i) => {
  sampler.sample(position);
  p.x = position.x;
  p.y = position.y;
  p.z = position.z;
  p.charge = Maf.randomInRange(-100, 100);
});

const points = [];
for (let i = 0; i < LINES; i++) {
  sampler.sample(position);
  points.push(position.clone());
}

const up = new Vector3(0, 1, 0);
const center = new Vector3(0, 0, 0);
const meshes = [];
for (let j = 0; j < LINES; j++) {
  const mesh = prepareMesh(
    0.02 * Maf.randomInRange(0.01, 1),
    Maf.randomInRange(0, 1)
  );
  group.add(mesh);
  const offset = Maf.randomInRange(-1, 0);
  const vertices = new Float32Array(N * 3);
  const r = 0.1;

  let p = points[j].clone();
  const s = 0.02;
  const t = new Vector3();
  const tmp = p.clone();
  for (let i = 0; i < N; i++) {
    const dir = charges.calcDirection(tmp.x, tmp.y, tmp.z);
    t.set(dir.x, dir.y, dir.z).normalize().multiplyScalar(s);

    p.add(t);

    suzanneGeo.boundsTree.closestPointToPoint(p, tmp);

    p.copy(tmp.point);
    tmp.copy(p);
    vertices[i * 3] = p.x;
    vertices[i * 3 + 1] = p.y;
    vertices[i * 3 + 2] = p.z;
  }
  mesh.material.uniforms.dashArray.value.set(
    1,
    Math.round(Maf.randomInRange(1, 2))
  );
  //   const repeat = Math.ceil(Maf.randomInRange(1, 10));
  //   mesh.material.uniforms.repeat.value.x = repeat;
  //   mesh.material.uniforms.dashArray.value.x = repeat - 1;
  mesh.g.setPoints(vertices, (p) => Maf.parabola(p, 0.5));
  //   mesh.scale.setScalar(5);
  const speed = 1 * Math.round(Maf.randomInRange(1, 3));
  meshes.push({ mesh, offset, speed });
}
group.scale.set(0.1, 0.1, 0.1);
scene.add(group);

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  const t = performance.now();

  if (isRunning) {
    time += (t - lastTime) / 20000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = -(
      time * 10 * m.speed +
      m.offset
    );
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
