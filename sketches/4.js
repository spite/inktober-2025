import {
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
  canvas,
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
import { effectRAF } from "../modules/reactive.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  rollWithin,
  setActiveRandomize,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { Easings } from "../modules/easings.js";
import { random, seed } from "../modules/random.js";

const defaults = {
  lines: 100,
  segments: 400,
  radius: 5,
  radiusSpread: 0.5,
  lineRepeat: [5, 10],
  lineSpread: 0.2,
  lineWidth: [0.1, 0.9],
  seed: 1337,
  twist: 1,
  opacity: [0.1, 1],
  brush: "brush8",
  palette: "florian",
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI("Winders", document.querySelector("#gui-container"));
gui.addLabel("Lines generated tracing a winder.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Segments per line", params.segments, 200, 600, 1, {
  randomizable: false,
});
gui.addSlider("Twist", params.twist, 0, 1, 0.01);
gui.addSlider("Lines", params.lines, 1, 200, 1);
rollWithin(
  gui.addSlider("Radius", params.radius, 1, 10, 0.1),
  4, 6, 0.1,
);
gui.addSlider("Radius spread", params.radiusSpread, 0, 1, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
rollPair(
  gui.addRangeSlider("Line repeat range", params.lineRepeat, 1, 50, 1),
  [1, 1], [1, 10], 1,
);
rollPair(
  gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01),
  [0.1, 0.1], [0.1, 0.9], 0.01,
);

gui.addSection("Ink");
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);
gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01);

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
const cameraPose = new Vector3(5, -2.5, -16).multiplyScalar(0.72);




const meshes = [];

function generateShape() {
  seed(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  const spread = params.lineSpread();
  const LINES = params.lines();
  const POINTS = params.segments();

  for (let i = 0; i < LINES; i++) {
    const vertices = [];
    const t =
      Maf.map(0, LINES, 0, 0.1, i) + Maf.map(0, 1, 0, 0.5, params.twist());
    const radius =
      params.radius() +
      Maf.map(0, LINES, 0, 1, i) +
      Maf.randomInRange(-params.radiusSpread(), params.radiusSpread());
    const lineSpread = new Vector3(
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
    );
    const q = Easings.InOutQuad(0.5 + 0.5 * Math.cos(Maf.PI + t * Maf.TAU));
    const r = radius;
    for (let i = 0; i < POINTS; i++) {
      const tw = 2.5 * Math.PI * q;
      const th = (i * Maf.TAU) / POINTS;

      const ph = Math.cos(th) * tw;
      const y = r * Math.cos(th);
      const x = r * Math.sin(th) * Math.cos(ph);
      const z = r * Math.sin(th) * Math.sin(ph);

      vertices.push(new Vector3(x, y, z).add(lineSpread));
    }

    vertices.push(vertices[0].clone());

    // Rotates the closed loop so the seam falls somewhere new on each line. `vertices` is
    // closed — the last entry is a clone of the first — and the two slices overlap by one
    // point, so the result is the same n+1 points starting at sliceOffset - 1.
    //
    // From 1, not 0. intRandomInRange(0, n) can return 0, and slice(-1) is the *last*
    // element rather than the whole array, so those lines came out as a single point:
    // MeshLine.process then divides by l - 1 === 0 for the UVs and reads copyV3(-1),
    // filling the buffers with NaN. One line in every POINTS or so was quietly lost.
    const sliceOffset = Maf.intRandomInRange(1, vertices.length);
    const points = [
      ...vertices.slice(sliceOffset - 1),
      ...vertices.slice(0, sliceOffset),
    ];

    const repeat = Math.round(
      Maf.map(
        0,
        1,
        params.lineRepeat()[0],
        params.lineRepeat()[1],
        random(),
      ),
    );
    const offset = Maf.randomInRange(-10, 10);
    const material = new MeshLineMaterial({
      map: brushes[params.brush()],
      useMap: true,
      color: gradient.getAt(i / LINES),
      lineWidth:
        0.5 * Maf.randomInRange(params.lineWidth()[0], params.lineWidth()[1]),
      offset: Maf.randomInRange(-100, 100),
      repeat: new Vector2(repeat, 1),
      dashArray: new Vector2(1, repeat - 1),
      useDash: true,
      opacity: Maf.randomInRange(params.opacity()[0], params.opacity()[1]),
      uvOffset: new Vector2(offset, 0),
      // wireframe: true,
    });

    const line = new MeshLine();
    line.setPoints(points);

    const mesh = new Mesh(line.geometry, material);
    group.add(mesh);

    const speed = Maf.randomInRange(0.5, 1.5) * 3;
    meshes.push({ mesh, t, line, radius, offset, speed });
  }

  painted.invalidate();
}

group.scale.setScalar(0.5);

const sketchEffect = effectRAF(() => {
  clearScene();
  generateShape();
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
  randomizeSection(gui, shapeSection);
  params.seed.set(performance.now());
}

let lastTime = performance.now();
let time = 0;

function draw(frameStart) {
  controls.update();

  const t = performance.now();
  if (isRunning) {
    time += (t - lastTime) / 1000 / 40;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = -(m.offset + m.speed * time);
  });

  group.rotation.y = (time * Maf.TAU) / 2;

  painted.render(renderer, scene, camera, frameStart);
  lastTime = t;
}

function start() {
  show(group, cameraPose);
  setActiveRandomize(randomizeParams);
  sketchEffect.resume();
  gui.show();
  painted.invalidate();
}

function stop() {
  hide();
  setActiveRandomize(null);
  sketchEffect.pause();
  gui.hide();
}

const index = 4;
export { index, start, stop, draw, randomize, params, defaults, canvas };
