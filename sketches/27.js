import {
  Group,
  Mesh,
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
import { gradientLinear } from "../modules/gradient.js";
import { pointsOnSphere } from "../modules/points-sphere.js";
import perlin from "../third_party/perlin.js";
import { Grid } from "../modules/grid-3d.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  rollWithin,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { createRebuilder } from "../modules/rebuilder.js";
import { random, seed } from "../modules/random.js";

const defaults = {
  segments: 100,
  scale: 0.075,
  density: 1,
  twistiness: 3,
  delay: 1,
  lineWidth: [0.8, 1],
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "autumnIntoWinter",
  seed: 13373,
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI(
  "Flow field lines II",
  document.querySelector("#gui-container"),
);
gui.addLabel(
  "Lines following a flow field of perlin noise on the surface of a sphere.",
);
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Max segments", params.segments, 10, 500, 1);
rollWithin(
  gui.addSlider("Noise scale", params.scale, 0.01, 0.5, 0.01),
  0.01, 0.3, 0.01,
);
gui.addSlider("Line density", params.density, 0.2, 1, 0.01);
rollWithin(
  gui.addSlider("Line twistiness", params.twistiness, 0.01, 5, 0.01),
  0.1, 5, 0.01,
);
rollWithin(
  gui.addSlider("Growth delay", params.delay, 0, 1, 0.01),
  0.1, 1, 0.01,
);
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


// Paused while another sketch is on screen, resumed in start(). The module is cached, so
// without this every sketch ever visited resizes its Painted on every window resize.

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(0, 0, 9.36).multiplyScalar(0.04);


const RADIUS = 8;

// This used to add a second offset of its own, drawn at module scope -- which is to say
// from the page-level Math.seedrandom(performance.now()) in index.html, before any sketch
// gets to seed anything. The flow field it sampled was therefore different on every page
// load, and #sketch=27+params=... never once reproduced the drawing it was a link to.
// generateFlowLines already draws an offset inside the seeded region and adds it at the
// call site below, which is the one that was meant to be here.
function pattern1(x, y, z, scale = 1) {
  return perlin.simplex3(x * scale, y * scale, z * scale);
}

const meshes = [];
const grid = new Grid(1);

const minDistance = 0.1;
const minDistanceSquared = minDistance ** 2;

function intersects(p, line) {
  const neighbours = grid.getNeighbours(p, 1);
  if (neighbours.length) {
    for (let neighbour of neighbours) {
      if (neighbour.line !== line) {
        const pp = neighbour.point;
        const dx = pp.x - p.x;
        const dy = pp.y - p.y;
        const dz = pp.z - p.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < minDistanceSquared) {
          return true;
        }
      }
    }
  }
  return false;
}

async function generateFlowLines(abort) {
  seed(params.seed());

  grid.reset();

  const SEGMENTS = params.segments();
  const delay = params.delay() * 100;
  const twistiness = params.twistiness();
  const map = brushes[params.brush()];
  const gradient = new gradientLinear(getPalette(params.palette()));
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();
  // Read here rather than further down. Everything past the first `await` runs outside
  // the effect, so a parameter first touched down there is never subscribed to and its
  // control cannot trigger a rebuild — the noise scale slider did nothing.
  const scale = params.scale();

  const points = pointsOnSphere(params.density() * 3000, RADIUS);
  const lines = [];

  points.sort(() => random() - 0.5);
  for (let i = 0; i < points.length; i++) {
    if (i % 1000 === 0) {
      await wait();
      painted.invalidate();
    }
    lines[i] = {
      active: true,
      points: [],
      offset: Maf.randomInRange(-Math.PI, Math.PI) / 100,
      delay: Math.round(Maf.randomInRange(0, delay)),
      segment: 0,
    };
  }

  await wait();
  painted.invalidate();

  const o = new Vector3();
  const n = new Vector3();
  const tan = new Vector3();
  const up = new Vector3(0, 1, 0);
  const offset = new Vector3(
    Maf.randomInRange(-100, 100),
    Maf.randomInRange(-100, 100),
    Maf.randomInRange(-100, 100),
  );

  // Width and opacity are drawn here, in index order, instead of at mesh-creation time.
  // Lines are emitted as they finish now, which is not index order, and pulling from the
  // shared seeded stream down there would hand every line a different value than it used
  // to get. As its own pass, sitting where the old emit loop's draws effectively sat --
  // the trace below consumes no randomness at all -- the sequence is unchanged, so the
  // same seed still produces the same drawing.
  for (let i = 0; i < lines.length; i++) {
    lines[i].lineWidth = 0.00125 * Maf.randomInRange(lineWidth[0], lineWidth[1]);
    lines[i].opacity = Maf.randomInRange(opacity[0], opacity[1]);
  }

  function addLine(i) {
    const line = lines[i];
    // A line that intersected on its very first point never got one, and MeshLine divides
    // by l - 1 for its UVs, so fewer than two points fills the buffers with NaN. The old
    // build handed those to setPoints as an empty array and added the empty mesh anyway.
    if (line.points.length < 2) {
      return;
    }

    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(i / lines.length),
      lineWidth: line.lineWidth,
      opacity: line.opacity,
    });

    const vertices = [];
    for (const p of line.points) {
      vertices.push(p.x, p.y, p.z);
    }
    const g = new MeshLine();
    g.setPoints(vertices);

    const mesh = new Mesh(g.geometry, material);
    mesh.g = g;
    group.add(mesh);

    meshes.push({ mesh, offset: 0, speed: 0 });
  }

  let p = 0;
  while (lines.some((l) => l.active === true)) {
    if (abort.aborted) {
      return;
    }

    for (let i = 0; i < points.length; i++) {
      const line = lines[i];

      // Finished lines used to be walked every pass until the last one died, doing
      // nothing but incrementing a counter they no longer read. Skipping them is also
      // what makes the emit at the bottom a clean edge: the body below only ever runs on
      // a line that was still growing when it started.
      if (!line.active) {
        continue;
      }

      p++;

      if (p % 1000 === 0) {
        await wait();
        painted.invalidate();
      }
      if (abort.aborted) {
        return;
      }

      const segment = line.segment - line.delay;
      line.segment++;

      if (segment === 0) {
        let skip = true;
        const pp = points[i];
        if (!intersects(pp, i)) {
          line.points[0] = pp;
          grid.add(pp, { point: pp, line: i });
          skip = false;

          continue;
        }
        if (skip) {
          line.active = false;
        }
      }

      if (segment > 0) {
        if (segment > SEGMENTS) {
          line.active = false;
        }

        if (line.active) {
          o.copy(line.points[line.points.length - 1]);
          const p = pattern1(
            scale * o.x + offset.x,
            scale * o.y + offset.y,
            scale * o.z + offset.z,
            1,
          );
          const a = line.offset + p * twistiness;
          n.copy(o).normalize();
          tan.crossVectors(up, n);
          tan.applyAxisAngle(n, a);
          tan.normalize().multiplyScalar(0.2);

          const t = o.clone().add(tan).normalize().multiplyScalar(RADIUS);

          if (line.active) {
            if (!intersects(t, i)) {
              grid.add(t, { point: t, line: i });
            } else {
              line.active = false;
            }
          }

          line.points.push(t);
        }
      }

      // Emitted the moment the line stops growing, rather than all at once in a final
      // pass. Nothing whatsoever used to reach the screen until every one of the ~3000
      // lines had finished tracing, which is why this sketch alone sat on blank paper for
      // its entire build while the others filled in as they went.
      if (!line.active) {
        addLine(i);
      }
    }
  }
}

group.scale.setScalar(0.01);

const rebuild = createRebuilder(clearScene, generateFlowLines);

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
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = -(time * m.speed + m.offset);
  });

  painted.render(renderer, scene, camera, frameStart);
  lastTime = t;
}

function start() {
  show(group, cameraPose, { screenSpacePanning: true });
  rebuild.start();
  gui.show();
  painted.invalidate();
}

function stop() {
  hide();
  rebuild.stop();
  gui.hide();
}

const index = 27;
export { index, start, stop, draw, randomize, params, defaults};
