import { Scene, Mesh, Group } from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  brushOptions,
  brushes,
  addInfo,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { TorusKnot as Curve } from "../third_party/CurveExtras.js";
import { Painted } from "../modules/painted.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { signal, effectRAF, batch } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const defaults = {
  lines: 20,
  lineWidth: [0.1, 1.2],
  brush: "brush3",
  palette: "florian",
  seed: 13373,
};

const params = {
  lines: signal(defaults.lines),
  lineWidth: signal(defaults.lineWidth),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI("Torus knot", document.querySelector("#gui-container"));
gui.addSlider("Lines", params.lines, 1, 50, 1);
gui.addRangeSlider("Line width", params.lineWidth, 0.01, 2, 0.01);
gui.addSeparator();
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);
gui.addSeparator();
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);
addInfo(gui);

const painted = new Painted();

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

const curve = new Curve();
const POINTS = 100;
const meshes = [];

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const group = new Group();
const controls = new OrbitControls(camera, canvas);
controls.addEventListener("change", () => painted.invalidate());

camera.position.set(5, -2.5, -26);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

function clearScene() {
  for (const { mesh } of meshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
    group.remove(mesh);
  }
  meshes.length = 0;
}

const sketchEffect = effectRAF(() => {
  Math.seedrandom(params.seed());
  clearScene();

  const gradient = new gradientLinear(getPalette(params.palette()));
  const map = brushes[params.brush()];
  const [wMin, wMax] = params.lineWidth();
  const spread = 1;

  for (let i = 0; i < params.lines(); i++) {
    const w = Maf.randomInRange(wMin, wMax);
    const radius = 0.05 * Maf.randomInRange(4.5, 5.5);
    const color = Maf.randomInRange(0, 1);
    const offset = Maf.randomInRange(0, Maf.TAU);
    const range = Maf.TAU / 4;

    const geo = new Float32Array(POINTS * 3);
    const g = new MeshLine();
    g.setPoints(geo, (p) => p);

    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(color),
      lineWidth: w * 2,
      offset: Maf.randomInRange(-100, 100),
      opacity: Maf.randomInRange(0.9, 1),
    });

    const mesh = new Mesh(g.geometry, material);
    mesh.geo = geo;
    mesh.g = g;
    mesh.position.set(
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
    );
    group.add(mesh);
    meshes.push({ mesh, radius, offset, range });
  }

  painted.invalidate();
});

group.scale.setScalar(0.75);
scene.add(group);

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  controls.update();
  const t = performance.now();

  if (isRunning) {
    time += (t - lastTime) / 5000;
    painted.invalidate();
  }

  for (const m of meshes) {
    const { geo, g } = m.mesh;
    const { range, radius, offset } = m;
    for (let j = 0; j < geo.length; j += 3) {
      const t2 = time * Maf.TAU + (j * range) / geo.length + offset;
      const p = curve.getPoint(1 - Maf.mod(t2 / Maf.TAU, 1));
      geo[j]     = radius * p.x;
      geo[j + 1] = radius * p.y;
      geo[j + 2] = radius * p.z;
    }
    g.setPoints(geo);
  }

  group.rotation.y = (time * Maf.TAU) / 10;
  painted.render(renderer, scene, camera);
  lastTime = t;
}

function randomizeParams() {
  batch(() => {
    params.lines.set(Maf.intRandomInRange(10, 50));
    params.brush.set(Maf.randomElement(brushOptions)[0]);
    params.palette.set(Maf.randomElement(paletteOptions)[0]);
    const wMin = Maf.randomInRange(0.01, 0.5);
    params.lineWidth.set([wMin, Maf.randomInRange(wMin, 2)]);
    params.seed.set(performance.now());
  });
}

function reset() {
  batch(() => {
    for (const [k, v] of Object.entries(defaults)) {
      params[k].set(v);
    }
  });
}

function randomize() {
  params.seed.set(performance.now());
}

function start() {
  sketchEffect.resume();
  controls.enabled = true;
  gui.show();
  painted.invalidate();
}

function stop() {
  sketchEffect.pause();
  controls.enabled = false;
  gui.hide();
}

const index = 32;
export { index, start, stop, draw, randomize, params, defaults, canvas };
