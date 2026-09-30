import {
  BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
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
import { paletteOptions, getPalette } from "../modules/palettes.js";
import { gradientLinear } from "../modules/gradient.js";
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from "../third_party/bvh.js";
import { MeshSurfaceSampler } from "../third_party/MeshSurfaceSampler.js";
import { init } from "../modules/dipoles-3d.js";
import {
  loadSuzanne,
  loadStanfordBunny,
  loadDodecahedron,
  loadIcosahedron,
} from "../modules/models.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollAscending,
  rollPair,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { createRebuilder } from "../modules/rebuilder.js";
import { random, seed } from "../modules/random.js";

// Add the extension functions
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

const geometries = [
  { id: "suzanne", name: "Suzanne", loader: loadSuzanne, scale: 1 },
  { id: "bunny", name: "Stanford Bunny", loader: loadStanfordBunny, scale: 14 },
  {
    id: "icosahedron",
    name: "Icosahedron",
    loader: loadIcosahedron,
    scale: 0.8,
  },
  {
    id: "dodecahedron",
    name: "Dodecahedron",
    loader: loadDodecahedron,
    scale: 1,
  },
];
const geometryOptions = geometries.map((g) => [g.id, g.name]);

// Fetched, parsed, given a BVH and a surface sampler on demand — and only the model the
// sketch is actually drawing. All four used to be built at module scope behind a
// top-level await, so opening this sketch paid for Suzanne, the bunny and two polyhedra
// (one a 1.4MB OBJ) before the import resolved, to then use one of them.
//
// The promise is cached rather than the result, so two rebuilds racing on the same model
// share a single load. That wrapper was also where the old code went wrong: its executor
// was `async`, which meant a throw inside it — a 404, a malformed OBJ — settled nothing
// and rejected nothing. The module simply never finished evaluating and the sketch hung
// on "Switching…" with an empty console. An async function's own promise rejects properly,
// so the failure now reaches loadModule()'s catch in inktober.js.
function loadModel(entry) {
  if (!entry.pending) {
    entry.pending = (async () => {
      const geometry = await entry.loader();
      geometry.scale(entry.scale, entry.scale, entry.scale);
      geometry.computeBoundsTree();
      const mesh = new Mesh(geometry, new MeshBasicMaterial({ color: 0xf6f2e9 }));
      entry.geometry = geometry;
      // Sampled points come off the sketches' generator, not Math.random, so they are
      // part of the seed. See modules/random.js.
      entry.sampler = new MeshSurfaceSampler(mesh)
        .setRandomGenerator(random)
        .build();
    })();
    // A failure is not cached as a permanent one: clear it so selecting the model again
    // retries. This also marks the promise handled, so the rejection the caller re-throws
    // is the only one reported.
    entry.pending.catch(() => {
      entry.pending = null;
    });
  }
  return entry.pending;
}

const defaults = {
  lines: 2000,
  charges: 20,
  segments: 20,
  geometry: "suzanne",
  lineWidth: [0.1, 0.9],
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "basic",
  seed: 13373,
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI(
  "Electric fields III",
  document.querySelector("#gui-container"),
);
gui.addLabel(
  "Lines generated following an electric field over the surface of SDFs generated from models.",
);
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Lines", params.lines, 1, 2000, 1);
gui.addSlider("Segments", params.segments, 10, 200, 1);
gui.addSelect("Geometry", params.geometry, geometryOptions);
gui.addSlider("Charges", params.charges, 2, 50, 1);
rollAscending(
  gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01),
  [0.5, 0.9], 1, 0.01,
);

gui.addSection("Ink");
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);
rollPair(
  gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01),
  [0.5, 0.9], [0.9, 1], 0.01,
);

gui.addSection("Params");
const randomizeParams = addRandomizeParams(gui, "Randomize params", () =>
  serialize(),
);
gui.addButton("Reset params", reset);

addInfo(gui);

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808).multiplyScalar(1);


const meshes = [];

async function generateShape(abort) {
  seed(params.seed());

  // Every parameter is read here, in one block, because of the await further down: past
  // that point we are outside the effect and a read would no longer subscribe the rebuild
  // to its control. lineWidth, opacity, brush and palette used to be read below the
  // sampling, which is fine only while nothing above them yields.
  const N = params.segments();
  const LINES = params.lines();
  const chargeCount = params.charges();
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();
  const map = brushes[params.brush()];
  const gradient = new gradientLinear(getPalette(params.palette()));
  const model = geometries.find((g) => g.id === params.geometry());

  await loadModel(model);
  if (abort.aborted) {
    return;
  }

  const position = new Vector3();
  const sampler = model.sampler;

  const charges = init(chargeCount, 1, 1, 1, 1);
  charges.charges.forEach((p, i) => {
    sampler.sample(position);
    p.x = position.x;
    p.y = position.y;
    p.z = position.z;
    p.charge = Maf.randomInRange(-100, 100);
  });

  const points = [];
  for (let i = 0; i < LINES; i++) {
    sampler.sample(position);
    points.push(position.clone());
  }

  for (let j = 0; j < LINES; j++) {
    if (abort.aborted) {
      return;
    }
    if (j % 10 === 0) {
      await wait();
    }
    painted.invalidate();

    // The material is built before the vertices purely to keep the order of the random
    // draws — colour, width, opacity, then offset, then speed — exactly as it was, so a
    // given seed still produces the same drawing.
    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth: (0.02 * Maf.randomInRange(lineWidth[0], lineWidth[1])) / 4,
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    const offset = Maf.randomInRange(-1, 0);
    const vertices = new Float32Array(N * 3);

    let p = points[j].clone();
    const s = 0.02;
    const t = new Vector3();
    const tmp = p.clone();
    for (let i = 0; i < N; i++) {
      const dir = charges.calcDirection(tmp.x, tmp.y, tmp.z);
      t.set(dir.x, dir.y, dir.z).normalize().multiplyScalar(s);

      p.add(t);

      model.geometry.boundsTree.closestPointToPoint(p, tmp);

      p.copy(tmp.point);
      tmp.copy(p);
      vertices[i * 3] = p.x;
      vertices[i * 3 + 1] = p.y;
      vertices[i * 3 + 2] = p.z;
    }
    // Built once, from the finished vertices. This used to create the MeshLine up front
    // and fill it with a shared zero-filled buffer first, so every line paid for two full
    // geometry rebuilds — 2000 of them wasted per generation.
    const g = new MeshLine();
    g.setPoints(vertices, (p) => Maf.parabola(p, 0.5));

    const mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    if (abort.aborted) {
      return;
    }
    group.add(mesh);

    const speed = 1 * Math.round(Maf.randomInRange(1, 3));
    meshes.push({ mesh, offset, speed });
  }
}

group.scale.set(0.1, 0.1, 0.1);

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
    time += (t - lastTime) / 20000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = -(
      time * 10 * m.speed +
      m.offset
    );
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

const index = 20;
export { index, start, stop, draw, randomize, params, defaults};
