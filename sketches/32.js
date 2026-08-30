import {
  Group,
  Mesh,
  Vector3,
} from "three";
import {
  renderer,
  isRunning,
  brushOptions,
  brushes,
  addInfo,
} from "../modules/three.js";
import {
  camera,
  canvas,
  controls,
  hide,
  painted,
  scene,
  show,
} from "../modules/stage.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";

import { getPalette, paletteOptions } from "../modules/palettes.js";
import { signal, effectRAF, batch } from "../modules/reactive.js";
import GUI, { randomizeSection } from "../modules/gui.js";
import { seed } from "../modules/random.js";

const defaults = {
  // p and q are the winding numbers of a (p, q) torus knot: p times around the axis of
  // symmetry, q times through the hole. q = 0 degenerates to a plain ring — the torus this
  // sketch is named after but never actually drew, since p and q were fixed at TorusKnot's
  // own defaults of 2 and 3. gcd(p, q) > 1 gives a link rather than a knot, which draws
  // just as happily, so the sliders are left free rather than constrained to coprimes.
  knotP: 2,
  knotQ: 3,
  // Each stroke is drawn at its own multiple of the curve, so the two ends of this range
  // are the smallest and largest copy in the drawing: hold them together for one clean band,
  // pull them apart for a nest of knots at every size. It is deliberately the *only* scale
  // control — an overall size knob on top of it would multiply with this one, and the pair
  // could then land three times oversized and walk straight out of frame.
  sizeRange: [0.225, 0.275],
  // Fraction of the full curve each stroke covers. Was a constant quarter turn.
  arc: 0.25,
  // Points per loop of the knot, not points per stroke. A stroke's own count is worked out
  // from this together with the arc it spans and the number of loops p puts in the curve, so
  // a long sweep of a 9-winding knot gets proportionally more of them than a short flick of
  // a ring. Fixed at 100 per stroke before, which is why a long arc came out blocky while a
  // short one spent the same hundred points on almost nothing.
  detail: 200,
  // Major radius over tube radius. CurveExtras' TorusKnot bakes this in as a literal 2 —
  // the one number that decides whether you are looking at a fat donut or a thin ring — so
  // the curve is written out below rather than imported, to get at it. Under 1 the tube
  // reaches past the axis and the winding folds through itself into a rosette.
  ratio: 2,
  // How far copies sit off the curve, as a multiple of the drawing's own size rather than a
  // distance in world units. Held absolute it went badly out of proportion the moment Size
  // range moved: the same offset that reads as a slight fray on a large knot throws a small
  // one apart into a cloud. 1 reproduces the constant this replaced.
  spread: 1,
  // Exponent of the width profile along each stroke. 0 is a flat ribbon of constant width —
  // effectively what this sketch drew before, since a linear ramp just made every stroke a
  // wedge. Higher tapers both ends, which is what turns a ribbon into a brush stroke, and is
  // what the rest of the set does.
  taper: 0.4,
  // How far each stroke's colour wanders from its position on the knot. At 0 the gradient
  // maps straight onto the winding and the braid's over-and-under reads clearly; at 1 it is
  // the per-stroke randomness this used to have, which hid the structure.
  colorNoise: 0.15,
  lines: 20,
  lineWidth: [0.1, 0.3],
  brush: "brush3",
  palette: "florian",
  seed: 13373,
};

const params = {
  knotP: signal(defaults.knotP),
  knotQ: signal(defaults.knotQ),
  sizeRange: signal(defaults.sizeRange),
  arc: signal(defaults.arc),
  detail: signal(defaults.detail),
  ratio: signal(defaults.ratio),
  spread: signal(defaults.spread),
  taper: signal(defaults.taper),
  colorNoise: signal(defaults.colorNoise),
  lines: signal(defaults.lines),
  lineWidth: signal(defaults.lineWidth),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI("Torus knot", document.querySelector("#gui-container"));
const shapeSection = gui.addSection("Shape");
gui.addSlider("Winding P", params.knotP, 1, 12, 1);
gui.addSlider("Winding Q", params.knotQ, 0, 12, 1);
gui.addSlider("Tube ratio", params.ratio, 0.5, 4, 0.05);
gui.addRangeSlider("Size range", params.sizeRange, 0.05, 0.3, 0.005);
gui.addSlider("Arc length", params.arc, 0.02, 1, 0.01);
// A quality knob, so it stays out of the reroll — the same reason Segments is held back in
// sketches 1, 2, 3 and 17.
gui.addSlider("Detail", params.detail, 40, 600, 10, { randomizable: false });
gui.addSlider("Scatter", params.spread, 0, 2.5, 0.05);
gui.addSlider("Lines", params.lines, 1, 200, 1);
gui.addSection("Ink");
gui.addRangeSlider("Line width", params.lineWidth, 0.01, 0.5, 0.01);
gui.addSlider("Taper", params.taper, 0, 1.5, 0.05);
gui.addSlider("Colour scatter", params.colorNoise, 0, 1, 0.01);
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);
gui.addSection("Params");
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);
addInfo(gui);



// CurveExtras' TorusKnot, with its hardcoded major/minor ratio opened up as an argument and
// a reusable target so draw() stops allocating a Vector3 per point per frame. Identical to
// the imported version at ratio = 2.
function makeKnot(p, q, ratio) {
  // Normalised so the widest point of the curve stays where it is at ratio = 2, the value
  // CurveExtras hardcodes. Without this the ratio doubles as a size control and fights Size
  // range for the frame: at 3.8 the knot simply walked off the canvas.
  const scale = 20 * (3 / (ratio + 1));
  return {
    getPoint(t, target) {
      t *= p * Math.PI * 2;
      const quOverP = (q / p) * t;
      const r = (ratio + Math.cos(quOverP)) * 0.5;
      return target
        .set(r * Math.cos(t), r * Math.sin(t), Math.sin(quOverP) * 0.5)
        .multiplyScalar(scale);
    },
  };
}

// Rebuilt rather than mutated: getPoint() is called from draw() every frame, and swapping
// the whole curve keeps that read consistent with whatever the last rebuild settled on.
let curve = makeKnot(defaults.knotP, defaults.knotQ, defaults.ratio);
const _point = new Vector3();
// Upper bound on a stroke's point count. draw() rewrites every point of every stroke each
// frame, so the cost is lines x points: the 200 lines and 12 windings the sliders allow would
// otherwise ask for close to a million curve evaluations a frame.
const MAX_POINTS = 600;
const meshes = [];

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(5, -2.5, -26);


function clearScene() {
  for (const { mesh } of meshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
    group.remove(mesh);
  }
  meshes.length = 0;
}

const sketchEffect = effectRAF(() => {
  seed(params.seed());
  clearScene();

  const gradient = new gradientLinear(getPalette(params.palette()));
  const map = brushes[params.brush()];
  const [wMin, wMax] = params.lineWidth();
  const spread = params.spread();
  const [rMin, rMax] = params.sizeRange();
  const arc = params.arc();
  // Curve's own scale stays at its default 10 — sizeRange is what scales each stroke, and
  // two scales in series is what put the drawing off the canvas.
  const knotP = params.knotP();
  curve = makeKnot(knotP, params.knotQ(), params.ratio());
  const taper = params.taper();
  const colorNoise = params.colorNoise();
  const points = Maf.clamp(
    Math.round(params.detail() * arc * knotP),
    16,
    MAX_POINTS,
  );
  // Measured against the mean stroke size, so the whole cloud keeps its proportions as the
  // size range moves. The factor is what makes spread = 1 the old hardcoded offset of 1.
  const scatter = spread * ((rMin + rMax) / 2) * 4;

  for (let i = 0; i < params.lines(); i++) {
    const w = Maf.randomInRange(wMin, wMax);
    const radius = Maf.randomInRange(rMin, rMax);
    const offset = Maf.randomInRange(0, Maf.TAU);
    // Where this stroke sits on the knot, nudged by colorNoise towards a free pick.
    const color = Maf.mix(
      offset / Maf.TAU,
      Maf.randomInRange(0, 1),
      colorNoise,
    );
    const range = arc * Maf.TAU;

    const geo = new Float32Array(points * 3);
    const g = new MeshLine();
    g.setPoints(geo, (p) => Maf.parabola(p, taper));

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
      Maf.randomInRange(-scatter, scatter),
      Maf.randomInRange(-scatter, scatter),
      Maf.randomInRange(-scatter, scatter),
    );
    group.add(mesh);
    meshes.push({ mesh, radius, offset, range });
  }

  painted.invalidate();
});

group.scale.setScalar(0.75);

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
      const p = curve.getPoint(1 - Maf.mod(t2 / Maf.TAU, 1), _point);
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
    params.knotP.set(Maf.intRandomInRange(1, 9));
    params.knotQ.set(Maf.intRandomInRange(0, 9));
    const r = Maf.randomInRange(0.07, 0.2);
    params.sizeRange.set([r, Maf.randomInRange(r, 0.28)]);
    params.arc.set(Maf.randomInRange(0.05, 0.6));
    params.spread.set(Maf.randomInRange(0, 1.5));
    params.ratio.set(Maf.randomInRange(1, 3.5));
    params.taper.set(Maf.randomInRange(0.1, 1));
    params.colorNoise.set(Maf.randomInRange(0, 0.6));
    params.lines.set(Maf.intRandomInRange(10, 120));
    params.brush.set(Maf.randomElement(brushOptions)[0]);
    params.palette.set(Maf.randomElement(paletteOptions)[0]);
    const wMin = Maf.randomInRange(0.02, 0.25);
    params.lineWidth.set([wMin, Maf.randomInRange(wMin, 0.5)]);
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
  randomizeSection(gui, shapeSection);
  params.seed.set(performance.now());
}

function start() {
  show(group, cameraPose);
  sketchEffect.resume();
  gui.show();
  painted.invalidate();
}

function stop() {
  hide();
  sketchEffect.pause();
  gui.hide();
}

const index = 32;
export { index, start, stop, draw, randomize, params, defaults, canvas };
