import { Scene, Mesh, Group, Vector3, Color, Vector2 } from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  wait,
  brushes,
  brushOptions,
  addInfo,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import { pointsOnSphere } from "../modules/points-sphere.js";
import { curl, generateNoiseFunction, seedFunc } from "../modules/curl.js";
import { signal, effectRAF } from "../modules/reactive.js";

import GUI from "../modules/gui.js";

const defaults = {
  lines: 200,
  segments: 500,
  seedScale: 0.02,
  noiseScale: 0.75,
  radius: 0.8,
  lineSpread: 0,
  lineWidth: [0.1, 0.9],
  seed: 6340.200000000186,
  opacity: [0.6, 0.9],
  brush: "brush4",
  palette: "florian",
};

const params = {
  lines: signal(defaults.lines),
  segments: signal(defaults.segments),
  seedScale: signal(defaults.seedScale),
  noiseScale: signal(defaults.noiseScale),
  radius: signal(defaults.radius),
  lineSpread: signal(defaults.lineSpread),
  lineWidth: signal(defaults.lineWidth),
  seed: signal(defaults.seed),
  brush: signal(defaults.brush),
  opacity: signal(defaults.opacity),
  palette: signal(defaults.palette),
};

const gui = new GUI(
  "Curl noise shells",
  document.querySelector("#gui-container")
);
gui.addLabel(
  "Tracing lines following a curl noise field on different spherical shells."
);
gui.addSlider("Segments per line", params.segments, 50, 500, 1);
gui.addSlider("Lines", params.lines, 1, 400, 1);
gui.addSlider("Seed scale", params.seedScale, 0.01, 2, 0.01);
gui.addSlider("Noise scale", params.noiseScale, 0.5, 1.5, 0.01);
gui.addSlider("Radius", params.radius, 0.1, 2, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);

gui.addSeparator();
gui.addSelect("Brush", brushOptions, params.brush);
gui.addSelect("Palette", paletteOptions, params.palette);
gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01);

gui.addSeparator();
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);

addInfo(gui);

effectRAF(() => {
  serialize();
});

function serialize() {
  const fields = [];
  for (const key of Object.keys(params)) {
    fields.push([key, params[key]()]);
  }
  const data = fields.map((v) => `${v[0]}=${v[1]}`).join("|");
  setHash(data);
}

function deserialize(data) {
  const fields = data.split("|");
  for (const field of fields) {
    const [key, value] = field.split("=");
    switch (typeof defaults[key]) {
      case "number":
        params[key].set(parseFloat(value));
        break;
      case "object":
        params[key].set(value.split(",").map((v) => parseFloat(v)));
        break;
      case "string":
        params[key].set(value);
        break;
    }
  }
}

function reset() {
  for (const key of Object.keys(defaults)) {
    params[key].set(defaults[key]);
  }
}

const painted = new Painted({ minLevel: -0.2 });

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const group = new Group();
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.addEventListener("change", () => {
  painted.invalidate();
});
painted.backgroundColor.set(new Color(0xf6f2e9));

camera.position
  .set(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808)
  .multiplyScalar(1.9);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const meshes = [];

async function generateShape(abort) {
  Math.seedrandom(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));
  const noiseFunc = generateNoiseFunction();

  const map = brushes[params.brush()];
  const POINTS = params.segments();
  const LINES = params.lines();
  const noiseScale = params.noiseScale();
  const radius = params.radius();
  const lineSpread = params.lineSpread() / 10;
  const seedScale = params.seedScale();
  const repeat = Math.round(POINTS / 50); // Math.round(Maf.randomInRange(5, 10));
  const opacity = params.opacity();
  const lineWidth = params.lineWidth();

  const points = pointsOnSphere(LINES);
  for (let j = 0; j < LINES; j++) {
    if (abort.aborted) {
      return;
    }
    if (j % 10 === 0) {
      await wait();
    }
    painted.invalidate();
    const offset = Maf.randomInRange(-1, 0);
    const vertices = [];
    const r = seedScale;
    let p = new Vector3();
    p.copy(points[j]).multiplyScalar(r);
    const v = p.y;
    p.x += Maf.randomInRange(-lineSpread, lineSpread);
    p.y += Maf.randomInRange(-lineSpread, lineSpread);
    p.z += Maf.randomInRange(-lineSpread, lineSpread);
    const tmp = p.clone();
    for (let i = 0; i < POINTS; i++) {
      const res = curl(tmp.multiplyScalar(noiseScale), noiseFunc);
      res.normalize().multiplyScalar(0.03);
      p.add(res);
      p.normalize().multiplyScalar(0.5);
      tmp.copy(p);
      p.multiplyScalar(1 + (radius * j) / LINES);
      vertices[i * 3] = p.x;
      vertices[i * 3 + 1] = p.y;
      vertices[i * 3 + 2] = p.z;
    }

    var g = new MeshLine();
    g.setPoints(vertices, (p) => Maf.parabola(p, 0.5));

    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(Maf.map(-r, r, 0, 1, v)),
      lineWidth: Maf.randomInRange(lineWidth[0], lineWidth[1]) / 20,
      repeat: new Vector2(repeat, 1),
      // dashArray: new Vector2(1, 1),
      // useDash: true,
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    var mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    group.add(mesh);

    mesh.scale.setScalar(5);
    const speed = Math.round(Maf.randomInRange(1, 3));
    meshes.push({ mesh, offset, speed });
  }
}

group.scale.setScalar(0.06);
scene.add(group);

let abortController = new AbortController();

effectRAF(() => {
  console.log("effectRAF2");
  abortController.abort();
  clearScene();
  abortController = new AbortController();
  generateShape(abortController.signal);
});

function clearScene() {
  for (const mesh of meshes) {
    mesh.mesh.geometry.dispose();
    mesh.mesh.material.dispose();
    group.remove(mesh.mesh);
  }
  meshes.length = 0;
}

function randomize() {
  params.seed.set(performance.now());
  console.log(params.seed());
}

function randomizeParams() {
  params.lines.set(Maf.intRandomInRange(50, 500));
  // params.segments.set(Maf.intRandomInRange(200, 500));
  params.seedScale.set(Maf.randomInRange(0.01, 2));
  params.noiseScale.set(Maf.randomInRange(0.5, 1.5));
  params.radius.set(Maf.randomInRange(0.1, 1));
  params.lineSpread.set(Maf.randomInRange(0, 1));
  const v = 0.1;
  params.lineWidth.set([v, Maf.randomInRange(v, 0.9)]);
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
  const o = 0.5;
  params.opacity.set([o, Maf.randomInRange(o, 1)]);
}

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  controls.update();
  const t = performance.now();

  if (isRunning) {
    time += (t - lastTime) / 10000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = -(time + m.offset);
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

function start() {
  serialize();
  controls.enabled = true;
  gui.show();
  painted.invalidate();
}

function stop() {
  controls.enabled = false;
  gui.hide();
}

const index = 12;
export { index, start, stop, draw, randomize, deserialize, canvas };
