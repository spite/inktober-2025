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
  canvas,
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
import { effectRAF } from "../modules/reactive.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  rollWithin,
  setActiveRandomize,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { random, seed } from "../modules/random.js";

const defaults = {
  lines: 200,
  segments: 200,
  loops: 5,
  radius: 5,
  radiusSpread: 0.5,
  lineRepeat: [10, 50],
  lineSpread: 0.2,
  lineWidth: [0.1, 0.9],
  seed: 1337,
  opacity: [0.5, 1],
  brush: "brush4",
  palette: "basic",
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI(
  "Torus at heart I",
  document.querySelector("#gui-container"),
);
gui.addLabel("Tracing lines following a general toroidal shape.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Segments per line", params.segments, 100, 300, 1, {
  randomizable: false,
});
gui.addSlider("Loops", params.loops, 1, 10, 1);
rollWithin(
  gui.addSlider("Lines", params.lines, 1, 400, 1),
  100, 400, 1,
);
rollWithin(
  gui.addSlider("Radius", params.radius, 1, 10, 0.1),
  4, 6, 0.1,
);
gui.addSlider("Radius spread", params.radiusSpread, 0, 1, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
rollPair(
  gui.addRangeSlider("Line repeat range", params.lineRepeat, 1, 80, 1),
  [10, 30], [30, 50], 1,
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
const cameraPose = new Vector3(35, 15, -35).multiplyScalar(0.07);


const meshes = [];

function generateShape() {
  seed(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  const LINES = params.lines();
  const POINTS = params.segments();
  const RSEGS = POINTS / params.loops();
  for (let j = 0; j < LINES; j++) {
    const offset = Maf.randomInRange(0, 1);
    const vertices = [];
    const mat = new Matrix4();
    const d = new Vector3();
    const r1 =
      (Maf.randomInRange(1, 1 + 0.5 * params.radiusSpread()) *
        params.radius()) /
      5;
    const r2 =
      (Maf.randomInRange(0.35, 0.35 + 0.8 * params.radiusSpread()) *
        params.radius()) /
      5;
    const offAngle = Maf.randomInRange(0, 0.1 * Maf.TAU);
    for (let i = 0; i < POINTS; i++) {
      const segment = i / RSEGS;
      const ringAngle = (i * Maf.TAU) / RSEGS;
      const segAngle = (segment * Maf.TAU) / (POINTS / RSEGS);
      const p = new Vector3(
        r1 * Math.cos(segAngle),
        0,
        r1 * Math.sin(segAngle),
      );
      d.set(r2 * Math.cos(ringAngle), r2 * Math.sin(ringAngle), 0);
      mat.makeRotationY(-segAngle + offAngle);
      d.applyMatrix4(mat);
      p.add(d);
      vertices.push(p);
    }
    vertices.push(vertices[0].clone());

    // Filled once, further down, after the mesh exists — MeshLine's `geometry` getter
    // returns itself, so the Mesh can be built around it first. There used to be a
    // setPoints here as well, with a width callback that the later call then dropped:
    // the second call wins, so the ribbons have always been uniform width and this one
    // was a whole geometry rebuild per line, thrown away.
    const g = new MeshLine();

    const repeat = Math.round(
      Maf.map(
        0,
        1,
        params.lineRepeat()[0],
        params.lineRepeat()[1],
        random(),
      ),
    );

    const material = new MeshLineMaterial({
      map: brushes[params.brush()],
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth:
        Maf.randomInRange(params.lineWidth()[0], params.lineWidth()[1]) / 10,
      opacity: Maf.randomInRange(params.opacity()[0], params.opacity()[1]),
      repeat: new Vector2(repeat, 1),
    });

    const mesh = new Mesh(g.geometry, material);
    group.add(mesh);
    mesh.g = g;

    const spread = params.lineSpread();
    mesh.position.set(
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
    );

    //   mesh.material.uniforms.dashArray.value.set(Maf.randomInRange(0.5, 0.5), 2);
    mesh.g.setPoints(vertices);
    mesh.scale.setScalar(5);
    const speed = 1; // Math.floor(Maf.randomInRange(1, 4));
    meshes.push({ mesh, offset, speed });
  }
  painted.invalidate();
}

group.scale.setScalar(0.1);

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
  const t = performance.now();
  controls.update();

  if (isRunning) {
    time += (t - lastTime) / 10000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.dashOffset.value = -1 * time - m.offset;
    m.mesh.material.uniforms.uvOffset.value.x = m.offset + time * m.speed;
  });

  group.rotation.y = time * Maf.TAU;
  group.rotation.z = (time * Maf.TAU) / 16;

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

const index = 6;
export { index, start, stop, draw, randomize, params, defaults, canvas };
