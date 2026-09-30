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
  wait,
  addInfo,
} from "../modules/three.js";
import {
  camera,
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
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  rollWithin,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { createRebuilder } from "../modules/rebuilder.js";
import { Circle } from "../modules/circle.js";
import { random, seed } from "../modules/random.js";

const defaults = {
  lines: 100,
  radius: [0.5, 1],
  branchFrequency: 80,
  branchAngle: 180,
  growthSpeed: 0.6,
  lineWidth: [0.8, 1],
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "florian",
  seed: 13373,
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI(
  "Lines on a sphere",
  document.querySelector("#gui-container"),
);
gui.addLabel(
  "Lines generated following circles on a sphere, stopping at intersections.",
);
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
rollWithin(
  gui.addSlider("Initial lines", params.lines, 10, 500, 1),
  10, 300, 1,
);
rollPair(
  gui.addRangeSlider("Radius range", params.radius, 0.1, 1, 0.01),
  [0.1, 0.5], [0.5, 1], 0.01,
);
rollWithin(
  gui.addSlider("Branching", params.branchFrequency, 0, 90, 1),
  10, 70, 1,
);
rollWithin(
  gui.addSlider("Angle", params.branchAngle, 0, 180, 1),
  10, 180, 1,
);
// Playback rate, not a shape control: the simulation advances in fixed ticks, so this
// changes how fast you watch the same drawing appear and never what it grows into.
// Left out of the reroll for that reason.
gui.addSlider("Growth speed", params.growthSpeed, 0.1, 3, 0.05, {
  randomizable: false,
});
rollPair(
  gui.addRangeSlider("Line width", params.lineWidth, 0.1, 1, 0.01),
  [0.7, 0.7], [0.7, 1], 0.01,
);
gui.addSection("Ink");
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);
rollPair(
  gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01),
  [0.5, 0.5], [1, 1], 0.01,
);

gui.addSection("Params");
const randomizeParams = addRandomizeParams(gui, "Randomize params", () =>
  serialize(),
);
gui.addButton("Reset params", reset);

addInfo(gui);

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(0, 0, 9.36).multiplyScalar(0.05);


const meshes = [];

let id = 0;
function uuid() {
  id++;
  return id;
}

const getRandomPointOnSphere = () => {
  const u = random();
  const v = random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);

  const x = Math.sin(phi) * Math.cos(theta);
  const y = Math.sin(phi) * Math.sin(theta);
  const z = Math.cos(phi);

  return new Vector3(x, y, z);
};

const generateCircleAtPoint = (point) => {
  const minRadius = params.radius()[0];
  const maxRadius = params.radius()[1];

  const r = minRadius + random() * (maxRadius - minRadius);
  const d = Math.sqrt(Math.max(0, 1 - r * r));

  const temp = getRandomPointOnSphere();
  const T = new Vector3().crossVectors(temp, point).normalize();
  const B = new Vector3().crossVectors(point, T).normalize();

  const signD = random() > 0.5 ? 1 : -1;
  const signR = random() > 0.5 ? 1 : -1;

  const normal = new Vector3()
    .copy(point)
    .multiplyScalar(d * signD)
    .add(B.multiplyScalar(r * signR))
    .normalize();

  const center = normal.clone().multiplyScalar(normal.dot(point));
  const radius = Math.sqrt(Math.max(0, 1 - center.lengthSq()));

  return { normal, center, radius };
};

const circles = [];

// Every arc is redrawn at this many samples for as long as it is growing, so its vertex
// count never changes and MeshLine can refresh the buffers in place. See circle.js.
const ARC_SEGMENTS = 128;

// One simulation tick is the fixed 0.01 of progress the growth was originally advanced by
// on each frame. Keeping the step fixed and deciding how many to run per frame is what
// makes the drawing reproducible: the same seed reaches the same state after the same
// number of ticks, no matter what the framerate did along the way.
const TICK_DELTA = 0.01;
const TICKS_PER_SECOND = 60;
const MAX_TICKS_PER_FRAME = 4;

// Captured from the params at build time rather than read per circle per frame. These
// shape the result, so changing one restarts the growth through the rebuild.
let simGradient = null;
let simBrush = null;
let simLineWidth = [0.8, 1];
let simOpacity = [0.8, 1];
let simRadius = [0.5, 1];
let simBranchFrequency = 0;
let simBranchAngle = 0;
let settled = true;
let tickAccumulator = 0;

// Appearance is drawn once, when the circle is born — inside the build for a seed, inside
// a tick for a branch. Both are deterministic points in the sequence; picking it later,
// when the arc happens to first be drawn, would tie the look to the framerate.
function addCircle(circle) {
  circle.arcWidth =
    Maf.randomInRange(simLineWidth[0], simLineWidth[1]) * 0.0025;
  circle.arcOpacity = Maf.randomInRange(simOpacity[0], simOpacity[1]);
  circle.arcLine = null;
  circles.push(circle);
  return circle;
}

async function generateLines(abort) {
  seed(params.seed());

  // Read up front, synchronously: this is what subscribes the rebuild to them.
  const LAYERS = params.lines();
  simGradient = new gradientLinear(getPalette(params.palette()));
  simBrush = brushes[params.brush()];
  simLineWidth = params.lineWidth();
  simOpacity = params.opacity();
  simRadius = params.radius();
  simBranchFrequency = params.branchFrequency();
  simBranchAngle = params.branchAngle();

  circles.length = 0;
  tickAccumulator = 0;
  settled = false;

  for (let k = 0; k < LAYERS; k++) {
    if (abort.aborted) {
      return;
    }
    if (k % 100 === 0) {
      await wait();
    }

    const point = getRandomPointOnSphere();
    const { normal, center, radius } = generateCircleAtPoint(point);

    const u = new Vector3().subVectors(point, center).normalize();
    const v = new Vector3().crossVectors(normal, u).normalize();

    addCircle(
      new Circle(
        {
          id: uuid(),
          center,
          radius,
          normal,
          u,
          v,
          // spawnBranch hands this straight to its children, so a seed and everything
          // that grows out of it share one colour and read as a single splitting line.
          color: simGradient.getAt(Maf.randomInRange(0, 1)),
          generation: 0,
          parentId: null,
        },
        simBranchFrequency,
      ),
    );
  }

  painted.invalidate();
}

function spawn(options, splitFrequency) {
  addCircle(new Circle({ id: uuid(), ...options }, splitFrequency));
}

// Advances every circle by one tick. Returns how many were still growing.
function tick() {
  // Snapshotted before the loop: a branch spawned during this pass is appended to
  // `circles` and starts growing on the next tick. Iterating the live array instead let
  // a new branch take a step in the tick that created it, which made the amount of
  // growth a circle got depend on when in the pass its parent happened to sit.
  const count = circles.length;
  let growing = 0;

  for (let i = 0; i < count; i++) {
    const circle = circles[i];
    if (circle.done()) continue;
    growing++;
    circle.update(
      TICK_DELTA,
      1,
      simBranchFrequency,
      simBranchAngle,
      simRadius[0],
      simRadius[1],
      circles,
      spawn,
    );
  }

  return growing;
}

// Redraws the arcs that moved. A circle gets its mesh as soon as it has any extent, and
// keeps it — the arc lengthens from both ends in place, which is the growth you watch.
function syncArcs() {
  for (const circle of circles) {
    if (circle.arcLine && circle.settledArc) continue;
    if (circle.progress - circle.progressNegative < 1e-3) continue;

    circle.generatePoints(ARC_SEGMENTS);

    if (!circle.arcLine) {
      const line = new MeshLine();
      line.setPoints(circle.points);
      const material = new MeshLineMaterial({
        map: simBrush,
        useMap: true,
        color: circle.color,
        lineWidth: circle.arcWidth,
        opacity: circle.arcOpacity,
      });
      const mesh = new Mesh(line.geometry, material);
      circle.arcLine = line;
      group.add(mesh);
      meshes.push({ mesh });
    } else {
      circle.arcLine.setPoints(circle.points);
    }

    // One last redraw once it stops, then leave it alone for good.
    if (circle.done()) circle.settledArc = true;
  }
}

group.scale.setScalar(0.1);

const rebuild = createRebuilder(clearScene, generateLines);

function clearScene() {
  circles.length = 0;
  for (const mesh of meshes) {
    mesh.mesh.geometry.dispose();
    mesh.mesh.material.dispose();
    group.remove(mesh.mesh);
  }
  while (group.children.length) {
    group.remove(group.children[0]);
  }
  meshes.length = 0;
}

function randomize() {
  randomizeSection(gui, shapeSection);
  params.seed.set(performance.now());
}

let lastTime = performance.now();

function draw(frameStart) {
  controls.update();
  const t = performance.now();
  const elapsed = (t - lastTime) / 1000;
  lastTime = t;

  if (!settled && isRunning) {
    // Real time buys ticks; the ticks themselves are fixed. Growth speed changes how many
    // you get per second and so how fast the drawing appears, never what it draws. The
    // clamp keeps a long frame — a background tab, a slow rebuild — from cashing in
    // hundreds of ticks at once and skipping the growth entirely.
    tickAccumulator +=
      Math.min(elapsed, 0.25) * TICKS_PER_SECOND * params.growthSpeed();
    let budget = MAX_TICKS_PER_FRAME;
    let growing = -1;

    while (tickAccumulator >= 1 && budget > 0) {
      tickAccumulator -= 1;
      budget -= 1;
      growing = tick();
      if (growing === 0) break;
    }

    // Only when a tick actually ran: a frame too short to buy one changed nothing, and
    // `growing` would still be its "no idea" -1.
    if (growing >= 0) {
      syncArcs();
      // Once every arc has stopped there is nothing left moving in the scene, so the
      // invalidate stops too and Painted is finally allowed to accumulate. Holding it
      // open every frame, as this did before, pinned the render at its first noisy
      // sample and the drawing never resolved.
      // `circles.length` matters: tick() returns 0 both for "every arc has finished" and
      // for "there is nothing here yet", and generateLines empties circles before the
      // await it yields on. A draw landing in that window used to read the empty set as
      // finished and latch settled for good, so the arcs never grew and the sketch stayed
      // on blank paper. It only looked fine because arriving with params in the URL
      // triggers a second rebuild whose timing happens to miss the window.
      if (growing === 0 && circles.length > 0) settled = true;
      painted.invalidate();
    }
  }

  painted.render(renderer, scene, camera, frameStart);
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

const index = 31;
export { index, start, stop, draw, randomize, params, defaults};
