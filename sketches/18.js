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
  wait,
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
import { paletteOptions, getPalette } from "../modules/palettes.js";
import { gradientLinear } from "../modules/gradient.js";
import { Poisson2D } from "../modules/poisson-2d.js";
import { init } from "../modules/dipoles-2d.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  setActiveRandomize,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { createRebuilder } from "../modules/rebuilder.js";
import { seed } from "../modules/random.js";

const defaults = {
  charges: 30,
  chargeRange: 100,
  lineLength: [20, 50],
  lineWidth: [0.66, 0.9],
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
  "Electric fields I",
  document.querySelector("#gui-container"),
);
gui.addLabel("Lines generated following an electric field.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Charges", params.charges, 2, 50, 1);
gui.addSlider("Charge range", params.chargeRange, 1, 200, 0.1);
gui.addRangeSlider("Line length", params.lineLength, 1, 100, 1);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);

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
const cameraPose = new Vector3(1.8, 0, 2).multiplyScalar(1);


const meshes = [];

async function generateLines(abort) {
  seed(params.seed());

  const WIDTH = 1000;
  const HEIGHT = 1000;
  const poisson = new Poisson2D(WIDTH, HEIGHT, 20);
  const points = poisson.calculate();
  const charges = init(params.charges(), WIDTH, HEIGHT, params.chargeRange());
  const map = brushes[params.brush()];
  const lineWidth = params.lineWidth();
  const lineLength = params.lineLength();
  const opacity = params.opacity();

  const gradient = new gradientLinear(getPalette(params.palette()));

  const d = new Vector2();
  let j = 0;
  for (const pt of points) {
    if (abort.aborted) {
      return;
    }
    if (j % 10 === 0) {
      await wait();
    }
    painted.invalidate();

    j++;

    let tx = pt.x;
    let ty = pt.y;
    let m = 5;

    const colors = [];
    const STEPS = Math.round(Maf.randomInRange(lineLength[0], lineLength[1]));
    const geo = new Float32Array(STEPS * 3);
    let ptr = 0;

    for (let j = 0; j < STEPS; j++) {
      const dir = charges.calcDirection(tx, ty);
      d.set(dir.x, dir.y).normalize().multiplyScalar(m);
      tx += d.x;
      ty += d.y;

      const v = dir.v / 10;
      const h = v / Math.abs(Math.exp(Math.abs(v)));

      geo[ptr] = (tx - 0.5 * WIDTH) / WIDTH;
      geo[ptr + 1] = (ty - 0.5 * HEIGHT) / HEIGHT;
      geo[ptr + 2] = h;

      const col = j / 100;
      colors.push(col, col, col);

      ptr += 3;
    }

    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth: 0.02 * Maf.randomInRange(lineWidth[0], lineWidth[1]),
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    var g = new MeshLine();
    g.setPoints(geo, function (p) {
      return p;
    });

    var mesh = new Mesh(g.geometry, material);
    mesh.geo = geo;
    mesh.g = g;

    meshes.push({
      mesh,
      offset: Maf.randomInRange(-100, 100),
      speed: Maf.randomInRange(1, 2),
    });
    if (abort.aborted) {
      return;
    }
    group.add(mesh);
  }
}


const rebuild = createRebuilder(clearScene, generateLines);

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

const index = 18;
export { index, start, stop, draw, randomize, params, defaults, canvas };
