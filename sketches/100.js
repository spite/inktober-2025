import {
  Scene,
  Mesh,
  Group,
  Vector2,
  Vector3,
  TextureLoader,
  Color,
  RepeatWrapping,
  MeshNormalMaterial,
  IcosahedronGeometry,
  MeshBasicMaterial,
  Matrix4,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
  TorusKnotGeometry,
  TorusGeometry,
  ArrowHelper,
  LineBasicMaterial,
  TubeGeometry,
  CatmullRomCurve3,
  Line,
  Raycaster,
} from "three";
import { renderer, getCamera, onResize } from "../modules/three.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { pointsOnSphere } from "../modules/points-sphere.js";
import { seedFunc, generateNoiseFunction } from "../modules/curl.js";
import { init } from "../modules/dipoles-3d.js";
import { CustomTubeGeometry } from "../modules/CustomTubeGeometry.js";
import { GLTFExporter } from "../third_party/GLTFExporter.js";
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from "../third_party/bvh.js";
import { MeshSurfaceSampler } from "../third_party/MeshSurfaceSampler.js";
import {
  loadStanfordBunny,
  loadSuzanne,
  mergeMesh,
} from "../modules/models.js";
import { generate as generateMetaballs } from "./metaballs.js";
import { march, sdIcosahedron } from "../modules/raymarch.js";

// Add the extension functions
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

function map(p) {
  let d = sdIcosahedron(p, 1, 50);
  return d;
}

function shrinkWrap() {
  const geometry = new IcosahedronGeometry(3, 10);
  const v = new Vector3();
  const ro = new Vector3();
  const rd = new Vector3();
  const center = new Vector3(0, 0, 0);
  const positions = geometry.attributes.position.array;
  for (let i = 0; i < positions.length; i += 3) {
    v.set(positions[i], positions[i + 1], positions[i + 2]);
    ro.copy(v);
    const rd = ro.clone().sub(center).normalize().multiplyScalar(-1);
    const d = march(ro, rd, map);
    const intersects = rd.multiplyScalar(d).add(ro);
    positions[i] = intersects.x;
    positions[i + 1] = intersects.y;
    positions[i + 2] = intersects.z;
  }
  return geometry;
}

const group = new Group();

const WIDTH = 1;
const HEIGHT = 1;
const DEPTH = 1;

let obj = {};
let points = [];
let charges = [];

async function initPoints() {
  // obj = initSphere();
  // obj = await initSuzanne();
  // obj = await initStanfordBunnt();
  obj = intTorus();

  renderLines();
}

function initSphere() {
  const r = 0.25;
  points = pointsOnSphere(2000, r);
  const chargePoints = pointsOnSphere(20);
  const mesh = new Mesh(new IcosahedronGeometry(r, 7), material);
  group.add(mesh);

  charges = init(chargePoints.length, WIDTH, HEIGHT, DEPTH, 0.01);
  const tmp = new Vector3();
  charges.charges.forEach((p, i) => {
    const pc = chargePoints[i];
    tmp.set(pc.x, pc.y, pc.z);
    tmp.normalize().multiplyScalar(r);
    p.x = tmp.x;
    p.y = tmp.y;
    p.z = tmp.z;
  });

  return {
    fn: (v) => v.normalize(),
    step: (v) => {
      const dir = charges.calcDirection(v.x, v.y, v.z);
      tmp.set(dir.x, dir.y, dir.z).clampLength(0, 0.002);
      v.add(tmp);
      v.normalize().multiplyScalar(r);
    },
  };
}

function intTorus() {
  // const geo = generateMetaballs();
  // const geo = new IcosahedronGeometry(0.75, 1);
  // const geo = new TorusGeometry(0.75, 0.25, 300, 72);
  // const geo = new TorusKnotGeometry(0.75, 0.25, 300, 72, 2, 1);
  const geo = shrinkWrap();
  geo.scale(0.25, 0.25, 0.25);
  geo.computeBoundsTree();

  const mesh = new Mesh(geo, material);
  group.add(mesh);

  const sampler = new MeshSurfaceSampler(mesh).build();
  const position = new Vector3();

  for (let i = 0; i < 4000; i++) {
    sampler.sample(position);
    points.push(position.clone());
  }

  charges = init(50, 1, 1, 1, 1);
  charges.charges.forEach((p, i) => {
    sampler.sample(position);
    p.x = position.x;
    p.y = position.y;
    p.z = position.z;
    p.charge = Maf.randomInRange(-100, 100);
  });

  const tmp = new Vector3();
  return {
    step: (v) => {
      const dir = charges.calcDirection(v.x, v.y, v.z);
      // tmp.copy(v).multiplyScalar(6);
      // const dir = curl(tmp);
      tmp.copy(dir).clampLength(0, 0.002);
      v.add(tmp);
      geo.boundsTree.closestPointToPoint(v, tmp);
      v.copy(tmp.point);
    },
  };
}

async function initSuzanne() {
  const geo = await loadSuzanne();
  geo.scale(0.25, 0.25, 0.25);
  geo.computeBoundsTree();

  const mesh = new Mesh(geo, material);

  group.add(mesh);

  const sampler = new MeshSurfaceSampler(mesh).build();
  const position = new Vector3();

  for (let i = 0; i < POINTS; i++) {
    sampler.sample(position);
    points.push(position.clone());
  }

  charges = init(50, 1, 1, 1, 1);
  charges.charges.forEach((p, i) => {
    sampler.sample(position);
    p.x = position.x;
    p.y = position.y;
    p.z = position.z;
    p.charge = Maf.randomInRange(-100, 100);
  });

  const tmp = new Vector3();
  return {
    step: (v) => {
      const dir = charges.calcDirection(v.x, v.y, v.z);
      tmp.copy(dir).clampLength(0, 0.002);
      v.add(tmp);
      geo.boundsTree.closestPointToPoint(v, tmp);
      v.copy(tmp.point);
    },
  };
}

async function initStanfordBunnt() {
  const geo = await loadStanfordBunny();
  geo.scale(2, 2, 2);
  geo.computeBoundsTree();

  const mesh = new Mesh(geo, material);

  group.add(mesh);

  const sampler = new MeshSurfaceSampler(mesh).build();
  const position = new Vector3();

  for (let i = 0; i < POINTS; i++) {
    sampler.sample(position);
    points.push(position.clone());
  }

  charges = init(50, 1, 1, 1, 1);
  charges.charges.forEach((p, i) => {
    sampler.sample(position);
    p.x = position.x;
    p.y = position.y;
    p.z = position.z;
    p.charge = Maf.randomInRange(-100, 100);
  });

  const tmp = new Vector3();
  return {
    step: (v) => {
      const dir = charges.calcDirection(v.x, v.y, v.z);
      tmp.copy(dir).clampLength(0, 0.002);
      v.add(tmp);
      geo.boundsTree.closestPointToPoint(v, tmp);
      v.copy(tmp.point);
    },
  };
}

const curl = generateNoiseFunction();

palette.range = [
  "#026BFA",
  "#028DFA",
  "#1D43BB",
  "#53C2FB",
  "#FB1A20",
  "#ABD0E3",
  "#7C505F",
];
palette.range = [
  "#1e242c",
  "#4a5b6b",
  "#8da0b4",
  "#cdd9e6",
  "#f5f8fb",
  // "#3a8beb",
  // "#6b9dd8",
  // "#3ab485",
  "#ebb43a",
  "#e74c3c",
];

const gradient = new gradientLinear(palette.range);

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const controls = new OrbitControls(camera, canvas);
controls.screenSpacePanning = true;

camera.position
  .set(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808)
  .multiplyScalar(2);
// camera.position.set(3, 3, 3);
camera.lookAt(group.position);
renderer.setClearColor(0xf8fcfe, 1);

const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;

const meshes = [];

const material = new MeshNormalMaterial({ wireframe: !true });
// material.flatShading = true;
// const material = new MeshBasicMaterial(); //{ wireframe: true, color: 0 });

function renderLines() {
  const SEGMENTS = 200; //Math.round(Maf.randomInRange(50, 100));
  const v = new Vector3();
  const curves = [];
  let minLength = Number.MAX_SAFE_INTEGER;
  let maxLength = Number.MIN_SAFE_INTEGER;

  for (const pt of points) {
    v.set(pt.x, pt.y, pt.z);

    // const m = new Mesh(
    //   new IcosahedronGeometry(0.001, 3),
    //   new MeshBasicMaterial({ color: 0xb70000 })
    // );
    // m.position.copy(v);
    // group.add(m);

    const colors = [];

    const pts = [];
    const t = new Vector3();

    for (let j = 0; j < SEGMENTS; j++) {
      obj.step(v);

      pts.push(v.clone());

      const col = j / 100;
      colors.push(col, col, col);
    }

    const curve = new CatmullRomCurve3(pts);
    const l = curve.getLength();
    minLength = Math.min(minLength, l);
    maxLength = Math.max(maxLength, l);

    curves.push(curve);
  }

  const range = maxLength - minLength;
  for (const curve of curves) {
    const tubeGeometry = new CustomTubeGeometry(
      curve,
      SEGMENTS / 2,
      Maf.map(
        Math.exp(0),
        Math.exp(1 * 2),
        0.002,
        0.008,
        Math.exp((2 * (curve.getLength() - minLength)) / range)
      ),
      8,
      false,
      (p) => Maf.parabola(p, 1)
    );
    const tube = new Mesh(tubeGeometry, material);
    group.add(tube);
  }
}

const link = document.createElement("a");
link.style.display = "none";
document.body.appendChild(link); // Firefox workaround, see #6594

function save(blob, filename) {
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();

  // URL.revokeObjectURL( url ); breaks Firefox...
}

function saveString(text, filename) {
  save(new Blob([text], { type: "text/plain" }), filename);
}

function saveArrayBuffer(buffer, filename) {
  save(new Blob([buffer], { type: "application/octet-stream" }), filename);
}

function exportGLTF(input) {
  const gltfExporter = new GLTFExporter();

  gltfExporter.parse(
    input,
    function (result) {
      if (result instanceof ArrayBuffer) {
        saveArrayBuffer(result, "scene.glb");
      } else {
        const output = JSON.stringify(result, null, 2);
        saveString(output, "scene.gltf");
      }
    },
    function (error) {
      console.log("An error happened during parsing", error);
    },
    {}
  );
}

const button = document.createElement("button");
button.textContent = "Download GLTF";
button.addEventListener("click", (e) => {
  exportGLTF(group);
  e.preventDefault();
});
document.body.querySelector(".recordPanel").append(button);

scene.add(group);

function draw(startTime) {
  const t = performance.now();

  renderer.render(scene, camera);
}

initPoints();

export { draw, canvas, renderer, camera };
