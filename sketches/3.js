import { Scene, Mesh, Group, Vector2, TextureLoader, Color } from "three";
import { renderer, getCamera, isRunning } from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { TorusKnot } from "../third_party/CurveExtras.js";

import Painted from "../modules/painted.js";

const painted = Painted(renderer, { minLevel: -0.4 });

// palette.range = [
//   "#FFFFFF",
//   "#B9131E",
//   "#FF1F54",
//   "#34373C",
//   "#9C9092",
//   "#FE5587",
//   "#0FB3BF",
// ];

// palette.range = [
//   "#b88845",
//   "#26170b",
//   "#794c23",
//   "#f4e9ca",
//   "#533117",
//   "#a23809",
//   "#15543d",
//   "#948c6c",
//   "#948474",
//   "#584c44",
// ];

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

palette.range = ["#20a0aa", "#ec4039", "#ffae12"];

// palette.range = ["#000", "#eee"];

const gradient = new gradientLinear(palette.range);
const curve = new TorusKnot();

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const group = new Group();
const controls = new OrbitControls(camera, canvas);

camera.position.set(5, -2.5, -26);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);
painted.backgroundColor.set(new Color(0xf6f2e9));

const strokeTexture = new TextureLoader().load("./assets/brush4.png");
const resolution = new Vector2(canvas.width, canvas.height);

const POINTS = 200;
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
    lineWidth: w / 2,
    offset: Maf.randomInRange(-100, 100),
  });

  var mesh = new Mesh(g.geometry, material);
  mesh.geo = geo;
  mesh.g = g;

  return mesh;
}

const spread = 1;
const LINES = 30;
const REPEAT = 3;
for (let i = 0; i < LINES; i++) {
  const w = 1 * Maf.randomInRange(0.8, 1.2);
  const radius = 0.05 * Maf.randomInRange(4.5, 5.5);
  const color = Maf.randomInRange(0, 1); // i / LINES;
  const offset = Maf.randomInRange(0, Maf.TAU / 8);
  const range = Maf.TAU / 2;
  const x = Maf.randomInRange(-spread, spread);
  const y = Maf.randomInRange(-spread, spread);
  const z = Maf.randomInRange(-spread, spread);
  const mesh = prepareMesh(w, color);
  mesh.position.set(x, y, z);
  group.add(mesh);
  meshes.push({
    mesh,
    radius,
    offset,
    range,
  });
}
group.scale.setScalar(0.75);
scene.add(group);

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  const t = performance.now();

  if (isRunning) {
    time += (t - lastTime) / 1000 / 20;
  }

  meshes.forEach((m) => {
    const geo = m.mesh.geo;
    const g = m.mesh.g;
    const range = m.range;
    const r = m.radius;
    for (var j = 0; j < geo.length; j += 3) {
      const t2 = time * Maf.TAU + (j * range) / geo.length + m.offset;
      const p = curve.getPoint(1 - Maf.mod(t2 / Maf.TAU, 1));
      geo[j] = r * p.x;
      geo[j + 1] = r * p.y;
      geo[j + 2] = r * p.z;
    }
    g.setPoints(geo);
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(scene, camera);
  lastTime = t;
}

export { draw, canvas };
