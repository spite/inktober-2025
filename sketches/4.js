import { Scene, Mesh, Group, Vector2, TextureLoader, Color } from "three";
import { renderer, getCamera, isRunning, onResize } from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { DecoratedTorusKnot4a as Curve } from "../third_party/CurveExtras.js";
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
const curve = new Curve();

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

const strokeTexture = new TextureLoader().load("./assets/brush3.jpg");
const resolution = new Vector2(canvas.width, canvas.height);

const POINTS = 500;
const meshes = [];

function prepareMesh(w, c, r) {
  var geo = new Float32Array(POINTS * 3);
  let ptr = 0;
  for (var j = 0; j < geo.length; j += 3) {
    let i = ptr / (POINTS - 1);
    if (i === 1) {
      i = 0;
    }
    const p = curve.getPoint(i);
    geo[j] = r * p.x;
    geo[j + 1] = r * p.y;
    geo[j + 2] = r * p.z;
    ptr++;
  }

  var g = new MeshLine();
  g.setPoints(geo);

  const repeat = Math.round(Maf.randomInRange(10, 20));
  const material = new MeshLineMaterial({
    map: strokeTexture,
    useMap: true,
    color: gradient.getAt(c),
    resolution: resolution,
    lineWidth: w,
    offset: Maf.randomInRange(-100, 100),
    repeat: new Vector2(2 * repeat, 1),
    dashArray: new Vector2(1, repeat - 1),
    useDash: true,
    opacity: 0.8,
  });

  var mesh = new Mesh(g.geometry, material);
  mesh.geo = geo;
  mesh.g = g;

  return mesh;
}

const spread = 1;
const LINES = 200;
for (let i = 0; i < LINES; i++) {
  const w = Maf.randomInRange(0.1, 0.6);
  const radius = 0.05 * Maf.randomInRange(4.5, 5.5);
  const color = i / LINES;
  const offset = Maf.randomInRange(0, Maf.TAU);
  const range = Maf.randomInRange(0.125 * Maf.TAU, 0.25 * Maf.TAU);
  const mesh = prepareMesh(w, color, radius);
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
    m.mesh.material.uniforms.uvOffset.value.x = -(
      m.offset +
      0.5 * m.speed * time
    );
  });

  group.rotation.y = (time * Maf.TAU) / 4;

  // renderer.render(scene, camera);
  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas };
