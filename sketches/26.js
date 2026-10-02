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
import perlin from "../third_party/perlin.js";
import { Poisson2D } from "../modules/poisson-2d.js";
import { Grid } from "../modules/grid-2d.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  rollWithin,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { createRebuilder } from "../modules/rebuilder.js";
import { seed } from "../modules/random.js";

const defaults = {
  segments: 100,
  scale: 0.1,
  density: 0.25,
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
  "Flow field lines I",
  document.querySelector("#gui-container"),
);
gui.addLabel("Lines following a flow field of perlin noise.");
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

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(0, 0, 9.36).multiplyScalar(0.05);


const SCALE = 1;
const WIDTH = 20 / SCALE;
const HEIGHT = 20 / SCALE;

const meshes = [];
const grid = new Grid(1);

const minDistance = 0.25;
const minDistanceSquared = minDistance ** 2;

function intersects(p, line) {
  const neighbours = grid.getNeighbours(p, 2 * minDistance);
  if (neighbours.length) {
    for (let neighbour of neighbours) {
      if (neighbour.line !== line) {
        const pp = neighbour.point;
        const dx = pp.x - p.x;
        const dy = pp.y - p.y;
        const d = dx * dx + dy * dy;
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

  const SEGMENTS = params.segments();
  const delay = params.delay() * 5;
  const twistiness = params.twistiness();

  const poisson2d = new Poisson2D(WIDTH, HEIGHT, params.density());
  const points = poisson2d.calculate();
  points.forEach((p) => {
    p.x -= 0.5 * WIDTH;
    p.y -= 0.5 * HEIGHT;
  });

  grid.reset();

  const map = brushes[params.brush()];
  const gradient = new gradientLinear(getPalette(params.palette()));
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();

  const lines = [];

  for (let i = 0; i < points.length; i++) {
    lines[i] = {
      active: true,
      points: [],
      offset: Maf.randomInRange(-Math.PI, Math.PI) / 100,
      delay: Math.round(Maf.randomInRange(0, delay * SEGMENTS)),
      segment: 0,
    };
  }

  const o = new Vector2();
  const d = new Vector2();
  const offset = new Vector2(
    Maf.randomInRange(-100, 100),
    Maf.randomInRange(-100, 100),
  );
  const scale = params.scale();


  while (lines.some((l) => l.active === true)) {
    if (abort.aborted) {
      return;
    }

    for (let i = 0; i < points.length; i++) {
      if (abort.aborted) {
        return;
      }

      const segment = lines[i].segment - lines[i].delay;
      lines[i].segment++;

      if (segment === 0) {
        // One attempt, not ten. `pp` is the same point on every pass and intersects()
        // ignores neighbours belonging to this same line, so once the point had been
        // added the remaining nine retries all trivially succeeded and added it to the
        // grid again — nine phantom neighbours sitting exactly on the line's own start,
        // crowding out every line that came near it afterwards.
        const pp = points[i];
        if (intersects(pp, i)) {
          lines[i].active = false;
        } else {
          lines[i].points[0] = pp;
          grid.add(pp, { point: pp, line: i });
        }
      }

      if (segment > 0) {
        if (segment > SEGMENTS) {
          lines[i].active = false;
        }

        if (lines[i].active) {
          o.copy(lines[i].points[lines[i].points.length - 1]);
          const p = perlin.simplex2(
            scale * o.x + offset.x,
            scale * o.y + offset.y,
          );
          const a = lines[i].offset + p * twistiness;
          d.set(Math.cos(a), Math.sin(a)).normalize().multiplyScalar(0.2);

          const t = o.clone().add(d);

          if (lines[i].active) {
            if (!intersects(t, i)) {
              grid.add(t, { point: t, line: i });
            } else {
              lines[i].active = false;
            }
          }

          lines[i].points.push(t);
          if (
            t.x < -0.5 * WIDTH ||
            t.x > 0.5 * WIDTH ||
            t.y < -0.5 * HEIGHT ||
            t.y > 0.5 * HEIGHT
          ) {
            lines[i].active = false;
          }
        }
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (i % 40 === 0) {
      await wait();
      painted.invalidate();
    }
    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(i / lines.length),
      sizeAttenuation: true,
      lineWidth: 0.0025 * Maf.randomInRange(lineWidth[0], lineWidth[1]),
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    const vertices = [];
    for (const p of lines[i].points) {
      vertices.push(p.x);
      vertices.push(p.y);
      vertices.push(0);
    }
    var g = new MeshLine();
    g.setPoints(vertices);

    var mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    if (abort.aborted) {
      return;
    }
    group.add(mesh);

    meshes.push({ mesh, offset: 0, speed: 0 });
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

const index = 26;
export { index, start, stop, draw, randomize, params, defaults};
