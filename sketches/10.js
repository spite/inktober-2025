import {
  Box3,
  Group,
  Mesh,
  Vector2,
  Vector3,
} from "three";
import {
  renderer,
  isRunning,
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
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import { LorenzAttractor } from "../modules/lorenz-attractor.js";
import { AizawaAttractor } from "../modules/aizawa-attractor.js";
import {
  AnishchenkoAstakhovAttractor,
} from "../modules/anishchenko-astakhov-attractor.js";
import { BurkeShawAttractor } from "../modules/burke-shaw-attractor.js";
import { HadleyAttractor } from "../modules/hadley-attractor.js";
import { effectRAF } from "../modules/reactive.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  rollWithin,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { seed } from "../modules/random.js";

const attractors = [
  LorenzAttractor,
  HadleyAttractor,
  AizawaAttractor,
  AnishchenkoAstakhovAttractor,
  BurkeShawAttractor,
].map((a) => new a());
const attractorOptions = attractors.map((a) => [a.id, a.id]);

const defaults = {
  lines: 190,
  segments: 480,
  radiusSpread: 1.0,
  lineSpread: 0,
  lineWidth: [0.1, 0.9],
  seed: 1337,
  opacity: [0.6, 0.9],
  brush: "brush9",
  palette: "mysticBliss",
  attractor: "Lorentz",
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI(
  "Strange attractors",
  document.querySelector("#gui-container")
);
gui.addLabel("Tracing lines based on strange attractors.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Segments per line", params.segments, 100, 500, 1, {
  randomizable: false,
});
rollWithin(
  gui.addSlider("Lines", params.lines, 1, 400, 1),
  100, 400, 1,
);
gui.addSelect("Attractor", params.attractor, attractorOptions);
rollWithin(
  gui.addSlider("Radius spread", params.radiusSpread, 0, 2, 0.01),
  0.1, 2, 0.01,
);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
rollPair(
  gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01),
  [0.1, 0.1], [0.1, 0.9], 0.01,
);

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


// Paused while another sketch is on screen, resumed in start(). The module is cached, so
// without this every sketch ever visited resizes its Painted on every window resize.

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(35, 15, -35).multiplyScalar(0.181);


const meshes = [];

function generateShape() {
  seed(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));
  const attractor = attractors.find((a) => a.id === params.attractor());

  const POINTS = params.segments();
  const LINES = params.lines();
  const bounds = new Box3();
  for (let j = 0; j < LINES; j++) {
    const offset = Maf.randomInRange(0, 1);
    const vertices = [];
    const r = attractor.spread * params.radiusSpread();
    const p = new Vector3(
      Maf.randomInRange(-r, r) + attractor.x,
      Maf.randomInRange(-r, r) + attractor.y,
      Maf.randomInRange(-r, r) + attractor.z
    );
    for (let i = 0; i < POINTS; i++) {
      const t = p.clone();
      vertices.push(t);
      bounds.expandByPoint(t);
      attractor.step(p);
    }

    const g = new MeshLine();
    const repeat = Math.floor(Maf.randomInRange(3, POINTS / 10));

    const material = new MeshLineMaterial({
      map: brushes[params.brush()],
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth:
        Maf.randomInRange(params.lineWidth()[0], params.lineWidth()[1]) / 5,
      repeat: new Vector2(repeat, 1),
      dashArray: new Vector2(1, 4),
      dashOffset: 0,
      useDash: true,
      opacity: Maf.randomInRange(params.opacity()[0], params.opacity()[1]),
    });

    const mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    const spread = params.lineSpread();
    mesh.position.set(
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread)
    );

    group.add(mesh);

    mesh.material.uniforms.dashArray.value.set(
      Maf.randomInRange(1, 2),
      Maf.randomInRange(4, 8)
    );
    mesh.g.setPoints(vertices, (p) => Maf.parabola(p, 0.4));
    mesh.rotation.y = Maf.randomInRange(-0.1, 0.1);
    const start = 1;
    const end = Math.round(Maf.randomInRange(start, repeat - 1));
    mesh.material.uniforms.dashArray.value.set(start, end);
    const speed = Math.floor(Maf.randomInRange(1, 2));
    meshes.push({ mesh, offset, speed });
  }

  const center = new Vector3();
  bounds.getCenter(center);
  group.position.copy(center.multiplyScalar(-0.09));

  painted.invalidate();
}

group.scale.setScalar(0.09);

const sketchEffect = effectRAF(() => {
  clearScene();
  generateShape();
});

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
    m.mesh.material.uniforms.uvOffset.value.x = -1 * time * m.speed - m.offset;
  });

  // group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera, frameStart);
  lastTime = t;
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

const index = 10;
export { index, start, stop, draw, randomize, params, defaults};
