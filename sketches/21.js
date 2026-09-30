import {
  Group,
  Mesh,
  Vector2,
  Vector3,
} from "three";
import {
  renderer,
  isRunning,
  wait,
  brushes,
  brushOptions,
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
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { gradientLinear } from "../modules/gradient.js";
import { computed } from "../modules/reactive.js";

import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  rollWithin,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { createRebuilder } from "../modules/rebuilder.js";
import { seed } from "../modules/random.js";

// `opts` carries the shape values the build captured up front. These used to read
// params.enneperN() and friends live from inside the loop, which left the captured copies
// looking unused — while they were in fact the only reason the effect was subscribed to
// those three sliders at all. Passing them in makes that dependency visible.
const surfaces = [
  {
    id: "enneper",
    name: "Enneper surface",
    fn: (u, v, tmp, opts) =>
      ennerperSurface(u, v, tmp, opts.enneperN, opts.enneperRange),
  },
  {
    id: "klein",
    name: 'Klein bottle ("Figure-8" Immersion)',
    fn: (u, v, tmp, opts) => kleinBottle(u, v, tmp, opts.kleinRadius),
  },
  {
    id: "boys",
    name: "Boy's Surface (Bryant-Kusner Parametrization)",
    fn: (u, v, tmp) => boysSurface(u, v, tmp),
  },
];
const surfaceOptions = surfaces.map((s) => [s.id, s.name]);

const defaults = {
  lines: 100,
  segments: 200,
  surface: "enneper",
  enneperN: 2,
  enneperRange: 1.25,
  kleinRadius: 3,
  lineSpread: 0,
  lineWidth: [0.1, 0.4],
  repeatFactor: 0.1,
  seed: 6340.200000000186,
  opacity: [0.6, 0.9],
  brush: "brush4",
  palette: "florian",
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI(
  "Minimal and Non-Orientable surfaces",
  document.querySelector("#gui-container"),
);
gui.addLabel("Tracing lines over different surfaces.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Segments per line", params.segments, 200, 500, 1, {
  randomizable: false,
});
rollWithin(
  gui.addSlider("Lines", params.lines, 1, 600, 1),
  50, 500, 1,
);
gui.addSelect("Surface", params.surface, surfaceOptions);
gui.addSlider(
  "Enneper order",
  params.enneperN,
  1,
  4,
  1,
  { disabledWhen: computed(() => params.surface() !== "enneper") },
);
rollWithin(
  gui.addSlider(
    "Enneper range",
    params.enneperRange,
    0,
    4,
    0.01,
    { disabledWhen: computed(() => params.surface() !== "enneper") },
  ),
  1, 2, 0.01,
);
gui.addSlider(
  "Klein bottle radius",
  params.kleinRadius,
  1,
  3,
  0.01,
  { disabledWhen: computed(() => params.surface() !== "klein") },
);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
rollPair(
  gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01),
  [0.1, 0.1], [0.1, 0.9], 0.01,
);
gui.addSlider("Repeat factor", params.repeatFactor, 0.1, 2, 0.01);

gui.addSection("Ink");
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);
rollPair(
  gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01),
  [0.5, 0.5], [0.5, 1], 0.01,
);

gui.addSection("Params");
const randomizeParams = addRandomizeParams(gui, "Randomize params", () =>
  serialize(),
);
gui.addButton("Reset params", reset);

addInfo(gui);

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808).multiplyScalar(0.8);


const meshes = [];

function ennerperSurface(u, v, target, n = 2, range = 2) {
  const r = u * range;
  const theta = v * Math.PI * 2;

  const r2n1 = Math.pow(r, 2 * n + 1);
  const rn1 = Math.pow(r, n + 1);

  const x =
    r * Math.cos(theta) - (r2n1 / (2 * n + 1)) * Math.cos((2 * n + 1) * theta);

  const y =
    -r * Math.sin(theta) - (r2n1 / (2 * n + 1)) * Math.sin((2 * n + 1) * theta);

  const z_height = ((2 * rn1) / (n + 1)) * Math.cos((n + 1) * theta);

  target.set(x, z_height, y);
}

function kleinBottle(u, v, target, r = 3) {
  const U = u * Maf.TAU;
  const V = v * Maf.TAU;

  const x =
    (r + Math.cos(U / 2) * Math.sin(V) - Math.sin(U / 2) * Math.sin(2 * V)) *
    Math.cos(U);
  const z =
    (r + Math.cos(U / 2) * Math.sin(V) - Math.sin(U / 2) * Math.sin(2 * V)) *
    Math.sin(U);
  const y = Math.sin(U / 2) * Math.sin(V) + Math.cos(U / 2) * Math.sin(2 * V);

  target.set(x, (y * (r + 1)) / 2, z).multiplyScalar(1 / r);
}

function boysSurface(u, v, target) {
  const r = u <= 0 ? 0.0001 : u;
  const theta = v * Maf.TAU;

  const pow = (n) => {
    const rn = Math.pow(r, n);
    const ang = n * theta;
    return { re: rn * Math.cos(ang), im: rn * Math.sin(ang) };
  };

  const w1 = pow(1);
  const w3 = pow(3);
  const w5 = pow(5);
  const w6 = pow(6);

  const sqrt5 = Math.sqrt(5);
  const D = {
    re: w6.re + sqrt5 * w3.re - 1,
    im: w6.im + sqrt5 * w3.im,
  };

  const div = (A, B) => {
    const denom = B.re * B.re + B.im * B.im;
    if (denom < 1e-9) return { re: 0, im: 0, isInf: true };
    return {
      re: (A.re * B.re + A.im * B.im) / denom,
      im: (A.im * B.re - A.re * B.im) / denom,
      isInf: false,
    };
  };

  const N1 = { re: w1.re - w5.re, im: w1.im - w5.im };
  const N2 = { re: w1.re + w5.re, im: w1.im + w5.im };
  const N3 = { re: 1 + w6.re, im: w6.im };

  const Q1 = div(N1, D);
  const Q2 = div(N2, D);
  const Q3 = div(N3, D);

  if (Q1.isInf || Q2.isInf || Q3.isInf) {
    target.set(0, 0, 0);
    return;
  }

  const g1 = -1.5 * Q1.im;
  const g2 = -1.5 * Q2.re;
  const g3 = Q3.im - 0.5;

  const mag2 = g1 * g1 + g2 * g2 + g3 * g3;

  target.set(g1, g2, g3).multiplyScalar(1 / mag2);
  target.z += 0.8;
}

async function generateShape(abort) {
  seed(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  const map = brushes[params.brush()];
  const POINTS = params.segments();
  const LINES = params.lines();
  const lineSpread = params.lineSpread() / 10;
  const opacity = params.opacity();
  const lineWidth = params.lineWidth();
  const surface = params.surface();
  const shape = {
    enneperN: params.enneperN(),
    enneperRange: params.enneperRange(),
    kleinRadius: params.kleinRadius(),
  };
  const surfaceFn = surfaces.find((s) => s.id === surface).fn;
  const repeatFactor = params.repeatFactor();


  const tmp = new Vector3();

  for (let j = 0; j < LINES; j++) {
    if (abort.aborted) {
      return;
    }
    if (j % 10 === 0) {
      await wait();
    }
    painted.invalidate();

    const u = Maf.map(0, LINES - 1, 0, 1, j);
    const vertices = [];
    const offset = Maf.randomInRange(-1, 0);

    for (let i = 0; i < POINTS; i++) {
      const v = Maf.map(0, POINTS - 1, 0, 1, i);
      surfaceFn(u, v, tmp, shape);
      vertices.push(tmp.x, tmp.y, tmp.z);
    }

    let length = 0;
    const a = new Vector3();
    const b = new Vector3();
    for (let i = 0; i < vertices.length - 3; i += 3) {
      a.set(vertices[i], vertices[i + 1], vertices[i + 2]);
      b.set(vertices[i + 3], vertices[i + 4], vertices[i + 5]);
      length += a.distanceTo(b);
    }
    const repeat = Math.ceil(repeatFactor * length);

    var g = new MeshLine();
    g.setPoints(vertices);

    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(Maf.map(0, LINES - 1, 0, 1, j)),
      lineWidth: Maf.randomInRange(lineWidth[0], lineWidth[1]) / 100,
      repeat: new Vector2(repeat, 1),
      dashArray: new Vector2(1, Maf.intRandomInRange(1, repeat - 1)),
      useDash: true,
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    var mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    const spread = new Vector3(
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread),
    );
    mesh.position.copy(spread);

    if (abort.aborted) {
      return;
    }
    group.add(mesh);

    const speed = Math.round(Maf.randomInRange(1, 3));
    meshes.push({ mesh, offset, speed });
  }
}

group.scale.setScalar(0.06);

const rebuild = createRebuilder(clearScene, generateShape);

function clearScene() {
  clearGroup(group, meshes);
}

function randomize() {
  randomizeSection(gui, shapeSection);
  params.seed.set(performance.now());
}

let lastTime = performance.now();
let time = 0;

function draw(frameStart) {
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

  painted.render(renderer, scene, camera, frameStart);
  lastTime = t;
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

const index = 21;
export { index, start, stop, draw, randomize, params, defaults};
