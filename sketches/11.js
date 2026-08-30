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
import { pointsOnSphere } from "../modules/points-sphere.js";
import { curl, generateNoiseFunction } from "../modules/curl.js";
import perlin from "../third_party/perlin.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  rollWithin,
  setActiveRandomize,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { createRebuilder } from "../modules/rebuilder.js";
import { seed } from "../modules/random.js";

const defaults = {
  lines: 400,
  segments: 100,
  noiseScale: 1,
  radius: 0.8,
  lineSpread: 0,
  lineWidth: [0.1, 0.9],
  seed: 1337,
  opacity: [0.6, 0.9],
  brush: "brush4",
  palette: "basic",
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI(
  "Curl noise field",
  document.querySelector("#gui-container"),
);
gui.addLabel("Tracing lines following a curl noise field.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Segments per line", params.segments, 50, 250, 1, {
  randomizable: false,
});
rollWithin(
  gui.addSlider("Lines", params.lines, 1, 400, 1),
  50, 250, 1,
);
gui.addSlider("Noise scale", params.noiseScale, 0.5, 1.5, 0.01);
gui.addSlider("Radius", params.radius, 0.1, 1, 0.01);
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
const cameraPose = new Vector3(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808).multiplyScalar(4);


const meshes = [];

async function generateShape(abort) {
  seed(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));
  const noiseFunc = generateNoiseFunction();

  const LINES = params.lines();
  const POINTS = params.segments();
  const points = pointsOnSphere(LINES);
  const r = params.radius();
  const tmp = new Vector3();

  const lineWidth = params.lineWidth();
  const opacity = params.opacity();
  const map = brushes[params.brush()];
  const spread = params.lineSpread();
  const noiseScale = params.noiseScale();

  for (let j = 0; j < LINES; j++) {
    if (abort.aborted) {
      return;
    }
    if (j % 10 === 0) {
      await wait();
    }

    painted.invalidate();

    const offset = Maf.randomInRange(-1, 1);
    const vertices = [];
    let p = new Vector3(
      Maf.randomInRange(-r, r),
      Maf.randomInRange(-r, r),
      Maf.randomInRange(-r, r),
    );
    const ns = 0.1 / r;
    const cp = 0.5 + 0.5 * perlin.simplex3(p.x * ns, p.y * ns, p.z * ns);
    const color = gradient.getAt(cp, noiseFunc);
    p.copy(points[j]).multiplyScalar(r);
    for (let i = 0; i < POINTS; i++) {
      tmp.copy(p);
      const res = curl(tmp.multiplyScalar(noiseScale), noiseFunc);
      res.multiplyScalar(0.02);
      p.add(res);
      vertices.push(p.clone());
    }

    const repeat = Math.floor(Maf.randomInRange(POINTS / 40, POINTS / 20));

    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color,
      lineWidth: Maf.randomInRange(lineWidth[0], lineWidth[1]) / 40,
      repeat: new Vector2(repeat, 1),
      dashArray: new Vector2(1, Math.round(Maf.randomInRange(0, 2))),
      dashOffset: 0,
      useDash: true,
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    var g = new MeshLine();
    g.setPoints(vertices, (p) => Maf.parabola(p, 0.4));
    const mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    mesh.position.set(
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
    );

    if (abort.aborted) {
      return;
    }
    group.add(mesh);

    mesh.scale.setScalar(5);
    const speed = 4 * Math.round(Maf.randomInRange(1, 3));
    meshes.push({ mesh, offset, speed });
  }
}

group.scale.setScalar(0.06);

const rebuild = createRebuilder(clearScene, generateShape);

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
    time += (t - lastTime) / 10000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x =
      -0.5 * time * m.speed - m.offset;
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera, frameStart);
  lastTime = t;
}

function start() {
  show(group, cameraPose);
  setActiveRandomize(randomizeParams);
  rebuild.start();
  gui.show();
  painted.invalidate();
}

function stop() {
  hide();
  setActiveRandomize(null);
  rebuild.stop();
  gui.hide();
}

const index = 11;
export { index, start, stop, draw, randomize, params, defaults, canvas };
