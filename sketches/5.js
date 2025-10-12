import { Scene, Mesh, Group, Vector2, TextureLoader, Color } from "three";
import { renderer, getCamera, isRunning, onResize } from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";

import { Painted } from "../modules/painted.js";

const painted = new Painted({ minLevel: -0.2 });

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

palette.range = [
  "#F62D62",
  "#FFFFFF",
  "#FDB600",
  "#F42D2D",
  "#544C98",
  "#ECACBC",
];

const gradient = new gradientLinear(palette.range);

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const group = new Group();
const controls = new OrbitControls(camera, canvas);
controls.addEventListener("change", () => {
  painted.invalidate();
});

camera.position.set(-6.8, 7.4, 7.1);
camera.lookAt(group.position);
renderer.setClearColor(0xf2e9d9, 1);

const strokeTexture = new TextureLoader().load("./assets/brush4.png");
const resolution = new Vector2(canvas.width, canvas.height);

const POINTS = 100;
const meshes = [];

function prepareMesh(w, c) {
  var geo = new Float32Array(POINTS * 3);
  for (var j = 0; j < geo.length; j += 3) {
    geo[j] = geo[j + 1] = geo[j + 2] = 0;
  }

  var g = new MeshLine();
  g.setPoints(geo, function (p) {
    return p;
  });

  const material = new MeshLineMaterial({
    useMap: true,
    map: strokeTexture,
    color: gradient.getAt(c),
    opacity: 0.9,
    resolution: resolution,
    sizeAttenuation: true,
    lineWidth: w / 2,
    opacity: 0.75,
  });

  var mesh = new Mesh(g.geometry, material);
  mesh.geo = geo;
  mesh.g = g;

  return mesh;
}

/*const a = Math.round(Maf.randomInRange(2, 5));
const b = Math.round(Maf.randomInRange(2, 5));
const c = Math.round(Maf.randomInRange(2, 5));
const d = Math.round(Maf.randomInRange(2, 5));
const e = Math.round(Maf.randomInRange(2, 5));
console.log(a, b, c, d, e);*/

const a = 2;
const b = 4;
const c = 4;
const d = 4;
const e = 3;
// 2 5 4 5 4
// 2 4 4 4 3

const spread = 0.5;
const STEPS = 10;
const COPIES = 3;
for (let i = 0; i < STEPS; i++) {
  const c = Maf.randomInRange(0, 1);
  for (let j = 0; j < COPIES; j++) {
    const color = c + Maf.randomInRange(-0.05, 0.05);
    const offset = (i * Maf.TAU) / STEPS + Maf.randomInRange(-0.1, 0.1);
    const range = Maf.TAU / STEPS + Maf.randomInRange(-0.1, 0.1);
    const radius = Maf.randomInRange(0.8, 1.2) + 0.1 * j;
    const w = Maf.randomInRange(0.8, 1.2) - 0.1 * j;
    const mesh = prepareMesh(w, color);
    group.add(mesh);
    mesh.position.set(
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread)
    );
    meshes.push({
      mesh,
      radius,
      offset,
      range,
      a,
      b,
      c,
      d,
      e,
    });
  }
}
scene.add(group);

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  const t = performance.now();

  if (isRunning) {
    time += (t - lastTime) / 5000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    const geo = m.mesh.geo;
    const g = m.mesh.g;
    const range = m.range;
    const r = m.radius;
    for (var j = 0; j < geo.length; j += 3) {
      const t2 =
        Maf.TAU - (time * Maf.TAU + (j * range) / geo.length + m.offset);
      const x = r * Math.cos(m.a * t2) + r * Math.cos(m.b * t2);
      const y = r * Math.sin(m.a * t2) + r * Math.sin(m.d * t2);
      const z = 2 * r * Math.sin(m.e * t2);
      geo[j] = x;
      geo[j + 1] = y;
      geo[j + 2] = z;
    }
    g.setPoints(geo);
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas };
