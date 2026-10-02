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
  wait,
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
import { pointsOnSphere } from "../modules/points-sphere.js";
import { MarchingSquares } from "../modules/marching-squares.js";
import { superShape3D, presets } from "../modules/supershape.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { batch } from "../modules/reactive.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  rollWithin,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { createRebuilder } from "../modules/rebuilder.js";
import { random, seed } from "../modules/random.js";

const params1 = presets[3].a;
const params2 = presets[3].b;

const defaults = {
  lines: 200,
  aa: params1.a,
  ab: params1.b,
  am: params1.m,
  an1: params1.n1,
  an2: params1.n2,
  an3: params1.n3,
  ba: params2.a,
  bb: params2.b,
  bm: params2.m,
  bn1: params2.n1,
  bn2: params2.n2,
  bn3: params2.n3,
  round: false,
  lineWidth: [0.4, 0.5],
  repeatFactor: 10,
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "autumnIntoWinter",
  seed: 13373,
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI("Isolines IV", document.querySelector("#gui-container"));
gui.addLabel("Lines generated following the surface of a supershape.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
rollWithin(
  gui.addSlider("Lines", params.lines, 10, 300, 1),
  100, 200, 1,
);
gui.addLabel("Shape 1");
gui.addSlider("A", params.aa, 0.5, 2.5, 0.01);
gui.addSlider("B", params.ab, 0.5, 2.5, 0.01);
gui.addSlider("M", params.am, 0, 20, 0.01);
gui.addSlider("N1", params.an1, -50, 50, 0.01);
gui.addSlider("N2", params.an2, -50, 50, 0.01);
gui.addSlider("N3", params.an3, -50, 50, 0.01);
gui.addLabel("Shape 2");
gui.addSlider("A", params.ba, 0.5, 2.5, 0.01);
gui.addSlider("B", params.bb, 0.5, 2.5, 0.01);
gui.addSlider("M", params.bm, 0, 20, 0.01);
gui.addSlider("N1", params.bn1, -50, 50, 0.01);
gui.addSlider("N2", params.bn2, -50, 50, 0.01);
gui.addSlider("N3", params.bn3, -50, 50, 0.01);
gui.addCheckbox("Round", params.round);

rollPair(
  gui.addRangeSlider("Line width", params.lineWidth, 0.1, 1, 0.01),
  [0.7, 0.7], [0.7, 1], 0.01,
);
gui.addSlider("Repeat factor", params.repeatFactor, 10, 40, 1);
gui.addSection("Ink");
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);
rollPair(
  gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01),
  [0.5, 0.5], [1, 1], 0.01,
);

gui.addSeparator();
gui.addLabel(
  "Some random combinations might not produce an output. Keep trying.",
);
// The twelve shape sliders above each reroll on their own, but a *good* supershape is not
// twelve independent numbers — most combinations collapse to something with no surface worth
// tracing. So after the panel-wide reroll, the pair is drawn together and retried until it
// encloses enough volume, which is what the old randomizeParams() did with its do/while.
const randomizeParams = addRandomizeParams(gui, "Randomize params", () => {
  rollSuperShape();
  serialize();
});
gui.addButton("Reset params", reset);

addInfo(gui);

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(1, 1, 1).multiplyScalar(0.5);


function randomParams() {
  const p = {
    a: 1,
    b: 1,
    m: Maf.randomInRange(0, 20),
    n1: Maf.randomInRange(0.5, 50),
    n2: Maf.randomInRange(0.5, 50),
    n3: Maf.randomInRange(0.5, 50),
  };

  // if (p.n1 === 0) p.n1 = 0.25;
  // if (p.n2 === 0) p.n2 = 0.25;
  // if (p.n3 === 0) p.n3 = 0.25;

  p.n1 *= random() > 0.5 ? 1 : -1;
  p.n2 *= random() > 0.5 ? 1 : -1;
  p.n3 *= random() > 0.5 ? 1 : -1;
  return p;
}

// Rejection sampling: generateSuperShape() sets `scale` from the shape's own extent, and a
// shape that stays under 0.2 has folded in on itself. Cheap enough to just draw again.
function rollSuperShape() {
  batch(() => {
    // Capped: nothing guarantees a draw ever clears the threshold, and an unbounded loop
    // here runs with no frames in between — a run of bad luck would read as a hung tab.
    // Giving up leaves the last pair in place, which is what the panel's note is about.
    for (let attempt = 0; attempt < 50; attempt++) {
      const a = randomParams();
      params.aa.set(a.a);
      params.ab.set(a.b);
      params.am.set(a.m);
      params.an1.set(a.n1);
      params.an2.set(a.n2);
      params.an3.set(a.n3);

      const b = randomParams();
      params.ba.set(b.a);
      params.bb.set(b.b);
      params.bm.set(b.m);
      params.bn1.set(b.n1);
      params.bn2.set(b.n2);
      params.bn3.set(b.n3);

      generateSuperShape();
      if (scale >= 0.2) break;
    }
  });
}

function roundParams(p) {
  if (params.round()) {
    p.m = Math.round(p.m);
    p.n1 = Math.round(p.n1 * 1) / 1;
    p.n2 = Math.round(p.n2 * 1) / 1;
    p.n3 = Math.round(p.n3 * 1) / 1;
  }
  // if (p.n1 === 0) p.n1 = 0.25;
  // if (p.n2 === 0) p.n2 = 0.25;
  // if (p.n3 === 0) p.n3 = 0.25;

  return p;
}

function map(offset) {
  const params1 = roundParams({
    a: params.aa(),
    b: params.ab(),
    m: params.am(),
    n1: params.an1(),
    n2: params.an2(),
    n3: params.an3(),
  });
  const params2 = roundParams({
    a: params.ba(),
    b: params.bb(),
    m: params.bm(),
    n1: params.bn1(),
    n2: params.bn2(),
    n3: params.bn3(),
  });
  return (p) => {
    return superShape3D(p, params1, params2, offset);
  };
}

const maxDistance = 1000;
const references = pointsOnSphere(100, maxDistance);
function computeSDFBoundaries(fn) {
  let min = maxDistance;
  for (const p of references) {
    const d = fn(p);
    if (
      d !== 0 &&
      d !== maxDistance &&
      d !== Infinity &&
      d !== -Infinity &&
      !isNaN(d)
    ) {
      min = Math.min(d, min);
    }
  }
  return maxDistance - min;
}

const meshes = [];

const SIZE = 5;
const WIDTH = 200;
const DEPTH = 200;

let scale = 1;
let fn;

function generateSuperShape() {
  fn = map(0);
  scale = 1 / (SIZE * computeSDFBoundaries(fn));
}

async function generateLines(abort) {
  seed(params.seed());

  const LAYERS = params.lines();

  const gradient = new gradientLinear(getPalette(params.palette()));
  const map = brushes[params.brush()];
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();
  const repeatFactor = params.repeatFactor();

  const axis = new Vector3(
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1),
  ).normalize();

  const rot = new Matrix4().makeRotationAxis(
    axis,
    Maf.randomInRange(0, 2 * Math.PI),
  );

  for (let k = 0; k < LAYERS; k++) {
    if (abort.aborted) {
      return;
    }
    await wait();
    painted.invalidate();

    const y = Maf.map(0, LAYERS - 1, -0.5 * SIZE, 0.5 * SIZE, k);

    const p = new Vector3();
    const values = [];
    for (let z = 0; z < DEPTH; z++) {
      values[z] = [];
      for (let x = 0; x < WIDTH; x++) {
        p.set(
          Maf.map(0, WIDTH, -0.5 * SIZE, 0.5 * SIZE, x),
          y,
          Maf.map(0, DEPTH, -0.5 * SIZE, 0.5 * SIZE, z),
        );
        p.multiplyScalar(2 * scale).applyMatrix4(rot);
        values[z][x] = fn(p);
      }
    }

    const lines = MarchingSquares.generateIsolines(
      values,
      0,
      1 / WIDTH,
      1 / DEPTH,
    );

    for (const line of lines) {
      await wait();
      painted.invalidate();
      const repeat = Math.round(
        Maf.randomInRange(1, Math.round(line.length / repeatFactor)),
      );
      const material = new MeshLineMaterial({
        map,
        useMap: true,
        color: gradient.getAt(Maf.map(0, LAYERS - 1, 0, 1, k)),
        lineWidth: 0.005 * Maf.randomInRange(lineWidth[0], lineWidth[1]),
        opacity: Maf.randomInRange(opacity[0], opacity[1]),
        repeat: new Vector2(repeat, 1),
        useDash: true,
        dashArray: new Vector2(
          1,
          Math.round(Maf.randomInRange(1, (repeat - 1) / 10)),
        ),
        uvOffset: new Vector2(Maf.randomInRange(0, 1), 0),
      });

      const points = line.map((p) =>
        new Vector3(SIZE * (p.x - 0.5), y, SIZE * (p.y - 0.5)).applyMatrix4(
          rot,
        ),
      );
      var g = new MeshLine();
      g.setPoints(points);

      var mesh = new Mesh(g.geometry, material);
      mesh.g = g;

      if (abort.aborted) {
        return;
      }
      group.add(mesh);

      meshes.push({
        mesh,
        offset: Maf.randomInRange(-10, 10),
        speed: Maf.randomInRange(0.7, 1.3),
      });
    }
  }
}

group.scale.setScalar(0.1);

const rebuild = createRebuilder(clearScene, (signal) => {
  // Inside the rebuild, not once at import: generateSuperShape() reads the twelve shape
  // signals through map(), so this is what subscribes the rebuild to them — and what keeps
  // `fn` and `scale` in step with the sliders rather than frozen at their startup values.
  generateSuperShape();
  return generateLines(signal);
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
    time += (t - lastTime) / 20000;
    for (const m of meshes) {
      m.mesh.material.uniforms.uvOffset.value.x = m.offset - time * m.speed;
      // m.mesh.material.uniforms.dashOffset.value = m.offset - time * m.speed;
    }
    painted.invalidate();
  }

  // group.rotation.x = 0.9 * time * Maf.TAU;
  // group.rotation.y = 2 * time * Maf.TAU;
  // group.rotation.z = 1.1 * time * Maf.TAU;

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

const index = 25;
export { index, start, stop, draw, randomize, params, defaults};
