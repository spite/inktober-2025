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
  Matrix4,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
  ArrowHelper,
  LineBasicMaterial,
  Line,
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
import { curl, seedFunc, generateNoiseFunction } from "../modules/curl.js";
import { RoundedCylinderGeometry } from "../modules/rounded-cylinder-geometry.js";
import { march, sdIcosahedron } from "../modules/raymarch.js";
import { Poisson2D } from "../modules/poisson-2d.js";
import { init } from "../modules/dipoles-3d.js";

const WIDTH = 1;
const HEIGHT = 1;
const DEPTH = 1;
const points = pointsOnSphere(2000);
const chargePoints = pointsOnSphere(50);
const charges = init(50, WIDTH, HEIGHT, DEPTH, 0.01);
const tmp = new Vector3();
charges.charges.forEach((p, i) => {
  const pc = chargePoints[i];
  tmp.set(pc.x, pc.y, pc.z);
  // tmp.set(p.x, p.y, p.z);
  tmp.normalize();
  p.x = tmp.x;
  p.y = tmp.y;
  p.z = tmp.z;
});

const painted = new Painted({ minLevel: -0.2 });
// const curl = generateNoiseFunction();

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

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
// palette.range = [
//   "#2f7f8d",
//   "#ca3542",
//   "#f3b440",
//   "#f8f5f1",
//   "#98bec0",
//   "#f3d394",
//   "#61c8b0",
//   "#e09599",
//   "#dcc4c9",
//   "#616735",
// ];

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

camera.position
  .set(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808)
  .multiplyScalar(2);
// camera.position.set(3, 3, 3);
camera.lookAt(group.position);
renderer.setClearColor(0xf8fcfe, 1);

const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;

const meshes = [];

async function generateLines() {
  const v = new Vector3();
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];

    if (i % 10 === 0) {
      await waitForRender();
      painted.invalidate();
    }

    v.set(pt.x, pt.y, pt.z).normalize();
    const y = v.y;
    let m = 5;
    let d = { x: 0, y: 0, z: 0 };
    let a;

    const colors = [];
    const POINTS = 100; //Math.round(Maf.randomInRange(50, 100));

    const geo = new Float32Array(POINTS * 3);
    let ptr = 0;
    const s = 0.01;

    for (let j = 0; j < POINTS; j++) {
      const dir = charges.calcDirection(v.x, v.y, v.z);
      // let aTo = Math.atan2(dir.y, dir.x,  );
      // //const dA = clamp(deltaAngle(a, aTo), -r, r);
      // //a += dA;
      // a = aTo;
      // d.x = Math.cos(a) * m;
      // d.y = Math.sin(a) * m;
      // tx += d.x;
      // ty += d.y;
      v.x += dir.x * s;
      v.y += dir.y * s;
      v.z += dir.z * s;
      v.normalize();

      const t = v.clone();
      t.multiplyScalar(1 + (j * 0.1) / POINTS);
      geo[ptr] = t.x; // (tx - 0.5 * WIDTH) / WIDTH;
      geo[ptr + 1] = t.y; // (ty - 0.5 * HEIGHT) / HEIGHT;
      geo[ptr + 2] = t.z; //(tz - 0.5 * DEPTH) / DEPTH;

      const col = j / 100;
      colors.push(col, col, col);

      ptr += 3;
    }
    const repeat = Math.round(Maf.randomInRange(1, 10));

    const material = new MeshLineMaterial({
      map: strokeTexture,
      useMap: true,
      color: gradient.getAt(Maf.map(-1, 1, 0, 1, y)),
      // color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth: 0.05 / 4,
      // repeat: new Vector2(repeat, 1),
      // dashArray: new Vector2(1, repeat - 1),
      // useDash: true,
      // dashOffset: 0,
    });

    var g = new MeshLine();
    g.setPoints(geo, (p) => Maf.parabola(p, 0.4));

    var mesh = new Mesh(g.geometry, material);
    mesh.geo = geo;
    mesh.g = g;

    meshes.push({
      mesh,
      offset: Maf.randomInRange(-100, 100),
      speed: Maf.randomInRange(1, 2),
    });
    group.add(mesh);
    // lineGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    // const line = new Line(lineGeometry, material);
    // group.add(line);
  }
}
group.scale.set(0.25, 0.25, 0.25);
scene.add(group);

async function generate() {
  clearScene();
  await generateLines();
  painted.invalidate();
}

function clearScene() {
  for (const mesh of meshes) {
    group.remove(mesh.mesh);
  }
}

generate();

function randomize() {
  generate();
}

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

export { draw, canvas, renderer, camera, randomize };
