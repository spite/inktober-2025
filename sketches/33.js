import { Scene, Mesh, Group, Vector3, Vector2 } from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  brushOptions,
  brushes,
  wait,
  addInfo,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { HopfFibration } from "../modules/hopf-fibration.js";
import { Painted } from "../modules/painted.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { signal, effectRAF, batch } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const defaults = {
  // Fiber structure
  bands: 5,
  linesPerBand: 20,
  innerRadius: 0.5,
  outerRadius: 3.0,
  startZ: 0,
  // Integration
  steps: 400,
  stepSize: 0.05,
  // Field orientation — rotating tilt/twist shows different cross-sections
  // of the same fibration (genuinely different, not just camera rotation)
  tilt: 0,
  twist: 0,
  // Appearance
  lineWidth: [0.05, 0.2],
  lineRepeat: [8, 20],
  dashRatio: 0.5,
  opacity: [0.7, 1.0],
  brush: "brush4",
  palette: "vibrantNights",
  seed: 13373,
};

const params = {
  bands: signal(defaults.bands),
  linesPerBand: signal(defaults.linesPerBand),
  innerRadius: signal(defaults.innerRadius),
  outerRadius: signal(defaults.outerRadius),
  startZ: signal(defaults.startZ),
  steps: signal(defaults.steps),
  stepSize: signal(defaults.stepSize),
  tilt: signal(defaults.tilt),
  twist: signal(defaults.twist),
  lineWidth: signal(defaults.lineWidth),
  lineRepeat: signal(defaults.lineRepeat),
  dashRatio: signal(defaults.dashRatio),
  opacity: signal(defaults.opacity),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI("Hopf fibration", document.querySelector("#gui-container"));
gui.addLabel(
  "Each concentric ring of start points traces one toroidal family of fibers. " +
  "Tilt and Twist rotate the fibration, revealing different cross-sections."
);
gui.addSlider("Bands", params.bands, 1, 12, 1);
gui.addSlider("Lines / band", params.linesPerBand, 3, 60, 1);
gui.addSlider("Inner radius", params.innerRadius, 0.1, 3, 0.05);
gui.addSlider("Outer radius", params.outerRadius, 0.2, 6, 0.1);
gui.addSlider("Start Z", params.startZ, -2, 2, 0.05);
gui.addSeparator();
gui.addSlider("Steps", params.steps, 50, 800, 10);
gui.addSlider("Step size", params.stepSize, 0.005, 0.15, 0.005);
gui.addSeparator();
gui.addSlider("Tilt", params.tilt, -Math.PI, Math.PI, 0.01);
gui.addSlider("Twist", params.twist, -Math.PI, Math.PI, 0.01);
gui.addSeparator();
gui.addRangeSlider("Line width", params.lineWidth, 0.001, 0.3, 0.001);
gui.addRangeSlider("Line repeat", params.lineRepeat, 1, 80, 1);
gui.addSlider("Dash ratio", params.dashRatio, 0.05, 0.95, 0.05);
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);
gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.05);
gui.addSeparator();
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);
addInfo(gui);

const painted = new Painted();

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const group = new Group();
const controls = new OrbitControls(camera, canvas);
controls.addEventListener("change", () => painted.invalidate());

camera.position.set(0, 0, 8);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const meshes = [];

function clearScene() {
  for (const { mesh } of meshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
    group.remove(mesh);
  }
  meshes.length = 0;
}

async function generateLines(abort) {
  Math.seedrandom(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));
  const map = brushes[params.brush()];
  const [lwMin, lwMax] = params.lineWidth();
  const [opMin, opMax] = params.opacity();
  const [lrMin, lrMax] = params.lineRepeat();
  const dashRatio      = params.dashRatio();
  const bands       = params.bands();
  const lpb         = params.linesPerBand();
  const steps       = params.steps();
  const innerR      = params.innerRadius();
  const outerR      = params.outerRadius();
  const startZ      = params.startZ();

  const hopf = new HopfFibration();
  hopf.h     = params.stepSize();
  hopf.tilt  = params.tilt();
  hopf.twist = params.twist();

  for (let b = 0; b < bands; b++) {
    if (abort.aborted) return;

    // Each band is a circle of starting points at a fixed radius in the
    // z = startZ plane. Points at the same radius share the same latitude
    // on S², so they all belong to the same Hopf torus.
    const t = bands === 1 ? 0.5 : b / (bands - 1);
    const r = Maf.mix(innerR, outerR, t);
    // Color per band so the same torus shares a hue.
    const colorBase = t;

    for (let l = 0; l < lpb; l++) {
      if (abort.aborted) return;
      await wait();

      const phi = (l / lpb) * Maf.TAU;
      const p = new Vector3(r * Math.cos(phi), r * Math.sin(phi), startZ);

      const pts = new Float32Array((steps + 1) * 3);
      pts[0] = p.x; pts[1] = p.y; pts[2] = p.z;

      let count = 1;
      for (let s = 0; s < steps; s++) {
        hopf.step(p);
        if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) break;
        if (p.length() > 30) break;
        pts[count * 3]     = p.x;
        pts[count * 3 + 1] = p.y;
        pts[count * 3 + 2] = p.z;
        count++;
      }

      if (count < 3) continue;

      const g = new MeshLine();
      g.setPoints(pts.slice(0, count * 3));

      const repeat = Math.round(Maf.randomInRange(lrMin, lrMax));
      const material = new MeshLineMaterial({
        map,
        useMap: true,
        color: gradient.getAt(Maf.clamp(colorBase + Maf.randomInRange(-0.05, 0.05), 0, 1)),
        lineWidth: Maf.randomInRange(lwMin, lwMax),
        opacity: Maf.randomInRange(opMin, opMax),
        uvOffset: new Vector2(Maf.randomInRange(0, 1), 0),
        useDash: true,
        repeat: new Vector2(repeat, 1),
        dashArray: new Vector2(dashRatio, 1 - dashRatio),
      });

      if (abort.aborted) return;

      const mesh = new Mesh(g.geometry, material);
      group.add(mesh);
      meshes.push({
        mesh,
        flowSpeed: Maf.randomInRange(0.3, 1.0) * (Math.random() > 0.5 ? 1 : -1),
      });

      painted.invalidate();
    }
  }
}

scene.add(group);

let abortController = new AbortController();

const sketchEffect = effectRAF(() => {
  abortController.abort();
  clearScene();
  abortController = new AbortController();
  generateLines(abortController.signal);
});

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  controls.update();
  const t = performance.now();

  if (isRunning) {
    time += (t - lastTime) / 20000;
    for (const m of meshes) {
      m.mesh.material.uniforms.uvOffset.value.x += m.flowSpeed * (t - lastTime) / 20000;
    }
    group.rotation.y = time * Maf.TAU * 0.2;
    group.rotation.x = time * Maf.TAU * 0.07;
    painted.invalidate();
  }

  painted.render(renderer, scene, camera);
  lastTime = t;
}

function randomizeParams() {
  batch(() => {
    params.bands.set(Maf.intRandomInRange(3, 10));
    params.linesPerBand.set(Maf.intRandomInRange(8, 40));
    params.innerRadius.set(parseFloat(Maf.randomInRange(0.2, 1.5).toFixed(2)));
    params.outerRadius.set(parseFloat(Maf.randomInRange(1.5, 5.0).toFixed(2)));
    params.startZ.set(parseFloat(Maf.randomInRange(-1.5, 1.5).toFixed(2)));
    params.steps.set(Maf.intRandomInRange(150, 600));
    params.stepSize.set(parseFloat(Maf.randomInRange(0.02, 0.1).toFixed(3)));
    params.tilt.set(parseFloat(Maf.randomInRange(-Math.PI, Math.PI).toFixed(2)));
    params.twist.set(parseFloat(Maf.randomInRange(-Math.PI, Math.PI).toFixed(2)));
    params.brush.set(Maf.randomElement(brushOptions)[0]);
    params.palette.set(Maf.randomElement(paletteOptions)[0]);
    const lwMin = Maf.randomInRange(0.01, 0.05);
    params.lineWidth.set([lwMin, Maf.randomInRange(lwMin, 0.2)]);
    const lrMin = Maf.intRandomInRange(1, 20);
    params.lineRepeat.set([lrMin, Maf.intRandomInRange(lrMin, 60)]);
    params.dashRatio.set(parseFloat(Maf.randomInRange(0.1, 0.9).toFixed(2)));
    const opMin = Maf.randomInRange(0.4, 0.7);
    params.opacity.set([opMin, 1.0]);
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
  abortController.abort();
  controls.enabled = false;
  gui.hide();
}

const index = 33;
export { index, start, stop, draw, randomize, params, defaults, canvas };
