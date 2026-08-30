import {
  Group,
  Mesh,
  Vector2,
  Vector3,
} from "three";
import {
  renderer,
  isRunning,
  brushOptions,
  brushes,
  wait,
  addInfo,
} from "../modules/three.js";
import {
  camera,
  clearGroup,
  controls,
  hide,
  painted,
  scene,
  show,
} from "../modules/stage.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import { HopfFibration } from "../modules/hopf-fibration.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollAscending,
  rollPair,
  rollWithin,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { createRebuilder } from "../modules/rebuilder.js";
import { random, seed } from "../modules/random.js";

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

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI("Hopf fibration", document.querySelector("#gui-container"));
gui.addLabel(
  "Each concentric ring of start points traces one toroidal family of fibers. " +
  "Tilt and Twist rotate the fibration, revealing different cross-sections."
);
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const fibersSection = gui.addSection("Fibers");
rollWithin(gui.addSlider("Bands", params.bands, 1, 12, 1), 3, 10, 1);
rollWithin(
  gui.addSlider("Lines / band", params.linesPerBand, 3, 60, 1),
  8, 40, 1,
);
rollWithin(
  gui.addSlider("Inner radius", params.innerRadius, 0.1, 3, 0.05),
  0.2, 1.5, 0.05,
);
rollWithin(
  gui.addSlider("Outer radius", params.outerRadius, 0.2, 6, 0.1),
  1.5, 5, 0.1,
);
rollWithin(
  gui.addSlider("Start Z", params.startZ, -2, 2, 0.05),
  -1.5, 1.5, 0.05,
);

const integrationSection = gui.addSection("Integration");
rollWithin(gui.addSlider("Steps", params.steps, 50, 800, 10), 150, 600, 10);
rollWithin(
  gui.addSlider("Step size", params.stepSize, 0.005, 0.15, 0.005),
  0.02, 0.1, 0.005,
);

const orientationSection = gui.addSection("Orientation");
rollWithin(
  gui.addSlider("Tilt", params.tilt, -Math.PI, Math.PI, 0.01),
  -Math.PI, Math.PI, 0.01,
);
rollWithin(
  gui.addSlider("Twist", params.twist, -Math.PI, Math.PI, 0.01),
  -Math.PI, Math.PI, 0.01,
);

gui.addSection("Ink");
rollAscending(
  gui.addRangeSlider("Line width", params.lineWidth, 0.001, 0.3, 0.001),
  [0.01, 0.05], 0.2, 0.001,
);
rollAscending(
  gui.addRangeSlider("Line repeat", params.lineRepeat, 1, 80, 1),
  [1, 20], 60, 1,
);
rollWithin(
  gui.addSlider("Dash ratio", params.dashRatio, 0.05, 0.95, 0.05),
  0.1, 0.9, 0.05,
);
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);
rollPair(
  gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.05),
  [0.4, 0.7], [1, 1], 0.05,
);

gui.addSection("Params");
const randomizeParams = addRandomizeParams(gui, "Randomize params", () =>
  serialize(),
);
gui.addButton("Reset params", reset);
addInfo(gui);


// Paused while another sketch is on screen, resumed in start(). The module is cached, so
// without this every sketch ever visited resizes its Painted on every window resize.

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(0, 0, 8);


const meshes = [];

function clearScene() {
  clearGroup(group, meshes);
}

async function generateLines(abort) {
  seed(params.seed());

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
        // random(), not Math.random(): the flow direction belongs to the seed like
        // everything else here. See modules/random.js.
        flowSpeed: Maf.randomInRange(0.3, 1.0) * (random() > 0.5 ? 1 : -1),
      });

      painted.invalidate();
    }
  }
}


const rebuild = createRebuilder(clearScene, generateLines);

let lastTime = performance.now();
let time = 0;

function draw(frameStart) {
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

  painted.render(renderer, scene, camera, frameStart);
  lastTime = t;
}

function randomize() {
  // Three sections, because this sketch's form is spread across them. Ink and Params are
  // deliberately not passed.
  randomizeSection(gui, fibersSection, integrationSection, orientationSection);
  params.seed.set(performance.now());
}

function start() {
  show(group, cameraPose);
  rebuild.start();
  gui.show();
  painted.invalidate();
}

function stop() {
  hide();
  rebuild.stop();
  gui.hide();
}

const index = 33;
export { index, start, stop, draw, randomize, params, defaults};
