import { Scene, Mesh, Group, Vector2, TextureLoader, Color } from "three";
import { renderer, getCamera, isRunning, onResize } from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { KnotCurve } from "../third_party/CurveExtras.js";
import { Painted } from "../modules/painted.js";

const painted = new Painted({ minLevel: -0.5 });

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

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
//   "#DDAA44",
//   "#B9384C",
//   "#7E9793",
//   "#F8F6F2",
//   "#3D5443",
//   "#2F2D30",
//   "#AEC2DA",
//   "#8C7F70",
// ];
//palette.range = ["#000000", "#555555"];

const gradient = new gradientLinear(palette.range);
const curve = new KnotCurve();

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const group = new Group();

const controls = new OrbitControls(camera, canvas);

controls.addEventListener("change", () => {
  painted.invalidate();
});

camera.position.set(5, -2.5, -26);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);
painted.backgroundColor.set(new Color(0xf6f2e9));

const strokeTexture = new TextureLoader().load("./assets/brush4.png");
const resolution = new Vector2(canvas.width, canvas.height);

const POINTS = 50;
const meshes = [];

function prepareMesh(w, c) {
  var geo = new Float32Array(POINTS * 3);
  for (var j = 0; j < geo.length; j += 3) {
    geo[j] = geo[j + 1] = geo[j + 2] = 0;
  }

  var g = new MeshLine();
  g.setPoints(geo, (p) => p);

  const material = new MeshLineMaterial({
    map: strokeTexture,
    color: gradient.getAt(c),
    resolution: resolution,
    lineWidth: w,
    offset: Maf.randomInRange(-100, 100),
    opacity: 0.8,
  });

  var mesh = new Mesh(g.geometry, material);
  mesh.geo = geo;
  mesh.g = g;

  return mesh;
}

const spread = 1;
const LINES = 80;
for (let i = 0; i < LINES; i++) {
  const w = Maf.randomInRange(0.4, 0.6);
  const radius = 0.05 * Maf.randomInRange(4.5, 5.5);
  const color = i / LINES;
  const offset = Maf.randomInRange(0, Maf.TAU);
  const range = Maf.randomInRange(0.125 * Maf.TAU, 0.25 * Maf.TAU);
  const mesh = prepareMesh(w, color);
  const speed = Maf.randomInRange(1, 10);
  mesh.position.set(
    Maf.randomInRange(-spread, spread),
    Maf.randomInRange(-spread, spread),
    Maf.randomInRange(-spread, spread)
  );
  group.add(mesh);
  meshes.push({
    mesh,
    radius,
    offset,
    speed,
    range,
  });
}
group.scale.setScalar(0.5);
group.position.y = -4;
scene.add(group);

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  const t = performance.now();
  if (isRunning) {
    time += (t - lastTime) / 1000 / 20;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    const geo = m.mesh.geo;
    const g = m.mesh.g;
    const range = m.range;
    const r = m.radius;
    for (var j = 0; j < geo.length; j += 3) {
      const t2 = time * Maf.TAU * m.speed + (j * range) / geo.length + m.offset;
      const p = curve.getPoint(1 - Maf.mod(t2 / Maf.TAU, 1));
      geo[j] = r * p.x;
      geo[j + 1] = r * p.y;
      geo[j + 2] = r * p.z;
    }
    g.setPoints(geo);
  });

  group.rotation.y = (time * Maf.TAU) / 4;

  // renderer.render(scene, camera);
  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas };
