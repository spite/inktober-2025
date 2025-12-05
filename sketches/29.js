import {
  Scene,
  Mesh,
  Group,
  Line,
  Vector2,
  Vector3,
  TextureLoader,
  Color,
  LineBasicMaterial,
  BufferGeometry,
  Matrix4,
  RepeatWrapping,
  MeshNormalMaterial,
  CatmullRomCurve3,
  BoxGeometry,
  MeshBasicMaterial,
  TorusGeometry,
  Raycaster,
} from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  waitForRender,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Easings } from "../modules/easings.js";
import { Painted } from "../modules/painted.js";
import { pointsOnSphere } from "../modules/points-sphere.js";
import { curl, seedFunc } from "../modules/curl.js";
import { MarchingSquares } from "../modules/marching-squares.js";
import perlin from "../third_party/perlin.js";
const painted = new Painted({ minLevel: -0.2 });
// const curl = generateNoiseFunction();
import { Poisson2D } from "../modules/poisson-2d.js";
import { Grid } from "../modules/grid-3d.js";

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

// palette.range = [
//   "#1e242c",
//   "#4a5b6b",
//   "#8da0b4",
//   "#cdd9e6",
//   "#f5f8fb",
//   // "#3a8beb",
//   // "#6b9dd8",
//   // "#3ab485",
//   //   "#ebb43a",
//   //   "#e74c3c",
// ];

// palette.range = [
//   "#DDAA44",
//   "#B9384C",
//   "#7E9793",
//   "#F8F6F2",
//   "#3D5443",
//   "#2F2D30",
//   "#ebb43a",
//   "#ffffff",
// ];
// palette.range = ["#000000", "#ffffff"];

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

camera.position.set(0, 0, 0.5);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const strokeTexture = new TextureLoader().load("./assets/brush2.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;

const R1 = 0.1;
const R2 = 0.05;
const SEGMENTS1 = 200;
const SEGMENTS2 = 100;
const meshes = [];

async function generateShape() {
  const p0 = new Vector3();
  const p1 = new Vector3();
  const rot = new Matrix4();
  for (let i = 0; i < SEGMENTS1; i++) {
    const a = (i * 2 * Math.PI) / SEGMENTS1;
    p0.set(R1 * Math.cos(a), 0, R1 * Math.sin(a));
    const points = [];
    rot.makeRotationY(-a);
    let bStart = 0.5 * Math.PI;
    let bEnd = -0.5 * Math.PI;
    let l = 2;

    if (i % 2 === 0) {
      bStart = Math.PI;
      bEnd = -Math.PI;
      l = 8;
    }

    if (i % 4 === 0) {
      bStart = 0.75 * Math.PI;
      bEnd = -0.75 * Math.PI;
      l = 4;
    }

    const offset = Maf.randomInRange(-0.1, 0.1);
    bStart += offset;
    bEnd += offset;

    for (let j = 0; j < SEGMENTS2; j++) {
      const b = Maf.map(0, SEGMENTS2 - 1, bStart, bEnd, j);
      p1.set(R2 * Math.cos(b), R2 * Math.sin(b), 0);
      p1.applyMatrix4(rot);
      p1.add(p0);
      points.push(p1.clone());
    }

    const material = new MeshLineMaterial({
      map: strokeTexture,
      useMap: true,
      color: new Color(0),
      sizeAttenuation: true,
      lineWidth: 0.0025,
      opacity: 0.8,
      // uvOffset: new Vector3(i / SEGMENTS1, 0),
      repeat: new Vector2(Math.round(Maf.randomInRange(l / 2, 2 * l)), 1),
      // dashArray: new Vector2(1, Math.round((i + 1) / 10)),
      // useDash: true,
      // dashOffset: Maf.randomInRange(-l, l),
    });

    var g = new MeshLine();
    g.setPoints(points);

    var mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    group.add(mesh);

    meshes.push({ mesh, offset: 0, speed: 0 });
  }
}

const e = 0.0015;
const mesh = new Mesh(
  new TorusGeometry(R1, R2 - e, SEGMENTS1, SEGMENTS1),
  new MeshBasicMaterial({ color: 0xf6f2e9 })
);
mesh.rotation.x = Math.PI / 2;
group.add(mesh);

generateShape();

group.scale.setScalar(1);
scene.add(group);

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  const t = performance.now();

  if (isRunning) {
    time += (t - lastTime) / 20000;
    painted.invalidate();
  }

  group.rotation.x = 0.9 * time * Maf.TAU;
  group.rotation.y = 2 * time * Maf.TAU;
  group.rotation.z = 1.1 * time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
