import {
  Group,
  Matrix4,
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
import { createRebuilder } from "../modules/rebuilder.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  rollWithin,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { random, seed } from "../modules/random.js";

const defaults = {
  lines: 190,
  segments: 480,
  loops: 6,
  radius: 1.6,
  radiusSpread: 0.0,
  lineSpread: 0,
  lineWidth: [0.1, 0.9],
  seed: 1337,
  opacity: [0.6, 0.9],
  offset: 0.2,
  brush: "brush8",
  palette: "mysticBliss",
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI(
  "Out of phase torus",
  document.querySelector("#gui-container"),
);
gui.addLabel("Tracing lines following a torus out of phase.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Segments per line", params.segments, 100, 500, 1, {
  randomizable: false,
});
gui.addSlider("Loops", params.loops, 1, 10, 1);
gui.addSlider("Offset", params.offset, -0.2, 0.2, 0.01);
rollWithin(
  gui.addSlider("Lines", params.lines, 1, 400, 1),
  100, 400, 1,
);
gui.addSlider("Radius", params.radius, 1, 2, 0.1);
gui.addSlider("Radius spread", params.radiusSpread, 0, 1, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
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

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(35, 15, -35).multiplyScalar(0.1);


const meshes = [];

function generateShape() {
  seed(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  const POINTS = params.segments();
  const LINES = params.lines();

  for (let j = 0; j < LINES; j++) {
    const offset = Maf.randomInRange(0, 1);
    const vertices = [];
    const mat = new Matrix4();
    const d = new Vector3();
    const RSEGS = POINTS / params.loops();
    const r1 =
      params.radius() +
      (0.25 *
        j *
        Maf.randomInRange(-params.radiusSpread(), params.radiusSpread())) /
        LINES;
    const r2 = (1 * j) / LINES;
    const offAngle = (-j * params.offset() * Maf.TAU) / LINES;
    for (let i = 0; i < POINTS - 1; i++) {
      const segment = i / RSEGS;
      const ringAngle = (i * Maf.TAU) / RSEGS;
      const segAngle = (segment * 1 * Maf.TAU) / ((POINTS - 1) / RSEGS);
      const p = new Vector3(
        r1 * Math.cos(segAngle),
        0,
        r1 * Math.sin(segAngle),
      );
      d.set(r2 * Math.cos(ringAngle), r2 * Math.sin(ringAngle), 0);
      mat.makeRotationY(-segAngle);
      d.applyMatrix4(mat);
      p.add(d);
      vertices.push(p);
    }
    vertices.push(vertices[0].clone());

    var g = new MeshLine();
    g.setPoints(vertices);

    const repeat = Math.round(1 + (j * 10) / LINES);

    const material = new MeshLineMaterial({
      map: brushes[params.brush()],
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth:
        Maf.randomInRange(params.lineWidth()[0], params.lineWidth()[1]) / 10,
      opacity: Maf.randomInRange(params.opacity()[0], params.opacity()[1]),
      repeat: new Vector2(5 * repeat, 1),
      dashArray: new Vector2(1, Math.round(Maf.randomInRange(2, repeat - 1))),
      useDash: true,
      uvOffset: new Vector2(Maf.randomInRange(0, 1), 1),
    });

    var mesh = new Mesh(g.geometry, material);
    mesh.rotation.y = offAngle;

    const spread = params.lineSpread();
    mesh.position.set(
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
    );

    group.add(mesh);

    mesh.scale.setScalar(5);
    let speed = Math.floor(Maf.randomInRange(1, 2));
    if (random() > 0.5) speed *= -1;
    meshes.push({ mesh, offset, speed });
  }
  painted.invalidate();
}

group.scale.setScalar(0.1);

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
  const t = performance.now();
  controls.update();

  if (isRunning) {
    time += (t - lastTime) / 20000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = m.offset + (time * m.speed) / 2;
  });

  group.rotation.y = time * Maf.TAU;
  group.rotation.z = (time * Maf.TAU) / 16;

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

const index = 8;
export { index, start, stop, draw, randomize, params, defaults};
