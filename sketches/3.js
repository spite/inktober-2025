import { Scene, Mesh, Group, Vector2 } from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  brushes,
  brushOptions,
  addInfo,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { TorusKnot, TrefoilKnot } from "../third_party/CurveExtras.js";
import { Painted } from "../modules/painted.js";
import { effectRAF, computed } from "../modules/reactive.js";
import GUI, {
  addRandomizeParams,
  rollWithin,
  setActiveRandomize,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { random, seed } from "../modules/random.js";

const defaults = {
  lines: 200,
  segments: 200,
  radiusSpread: 0.5,
  lineRepeat: [1, 8],
  lineSpread: 1,
  lineWidth: [0.1, 0.9],
  seed: 1337,
  type: "trefoil",
  knotP: 2,
  knotQ: 3,
  brush: "brush1",
  palette: "basic",
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI(
  "Trefoil and torus knot curves",
  document.querySelector("#gui-container"),
);
gui.addLabel("Lines generated tracing Trefoil and Torus Knot curves.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
gui.addSection("Shape");
gui.addSlider("Segments per line", params.segments, 200, 500, 1, {
  randomizable: false,
});
gui.addSelect("Curve type", params.type, [
  ["trefoil", "Trefoil knot"],
  ["torusknot", "Torus knot"],
]);
gui.addSlider(
  "Coprime integer P",
  params.knotP,
  1,
  6,
  1,
  { disabledWhen: computed(() => params.type() !== "torusknot") },
);
gui.addSlider(
  "Coprime integer Q",
  params.knotQ,
  1,
  6,
  1,
  { disabledWhen: computed(() => params.type() !== "torusknot") },
);
gui.addSlider("Lines", params.lines, 1, 200, 1);
gui.addSlider("Radius spread", params.radiusSpread, 0, 1, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
rollWithin(
  gui.addRangeSlider("Line repeat range", params.lineRepeat, 1, 20, 1),
  1, 10, 1,
);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);

gui.addSection("Ink");
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);

gui.addSection("Params");
const randomizeParams = addRandomizeParams(gui, "Randomize params", () =>
  serialize(),
);
gui.addButton("Reset params", reset);

addInfo(gui);

const painted = new Painted();

// Paused while another sketch is on screen, resumed in start(). The module is cached, so
// without this every sketch ever visited resizes its Painted on every window resize.
const resizeHandler = onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const group = new Group();

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

controls.addEventListener("change", () => {
  painted.invalidate();
});

camera.position.set(5, -2.5, -16).multiplyScalar(1);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const meshes = [];

function generateShape() {
  seed(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  let curve;
  if (params.type() === "trefoil") {
    curve = new TrefoilKnot();
  } else {
    curve = new TorusKnot(10, params.knotP(), params.knotQ());
  }
  const spread = params.lineSpread();
  const LINES = params.lines();
  const POINTS = params.segments();
  for (let i = 0; i < LINES; i++) {
    const w = Maf.randomInRange(params.lineWidth()[0], params.lineWidth()[1]);
    const radius =
      0.25 + params.radiusSpread() * Maf.map(0, 1, -0.05, 0.05, random());
    const color = i / LINES;
    const offset = Maf.randomInRange(0, Maf.TAU);
    const range = Maf.randomInRange(0.125 * Maf.TAU, 0.25 * Maf.TAU);

    var geo = new Float32Array(POINTS * 3);
    let ptr = 0;
    for (var j = 0; j < geo.length; j += 3) {
      let i = ptr / (POINTS - 1);
      if (i === 1) {
        i = 0;
      }
      const p = curve.getPoint(i);
      geo[j] = radius * p.x;
      geo[j + 1] = radius * p.y;
      geo[j + 2] = radius * p.z;
      ptr++;
    }

    var g = new MeshLine();
    g.setPoints(geo);

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
      color: gradient.getAt(color),
      lineWidth: w,
      offset: Maf.randomInRange(-100, 100),
      repeat: new Vector2(repeat, 1),
      dashArray: new Vector2(
        1,
        Math.round(Maf.randomInRange(0.5 * repeat, repeat - 1)),
      ),
      useDash: true,
      opacity: 0.8,
    });

    var mesh = new Mesh(g.geometry, material);

    const speed = Maf.randomInRange(1, 10);
    mesh.position.set(
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
    );
    group.add(mesh);
    meshes.push({
      mesh,
      radius,
      offset,
      speed,
      range,
    });
  }
  painted.invalidate();
}

group.scale.setScalar(0.5);
scene.add(group);

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
    m.mesh.material.uniforms.uvOffset.value.x = -(
      m.offset +
      0.5 * m.speed * time
    );
  });

  group.rotation.y = (time * Maf.TAU) / 2;

  painted.render(renderer, scene, camera, frameStart);
  lastTime = t;
}

function start() {
  setActiveRandomize(randomizeParams);
  resizeHandler.resume();
  sketchEffect.resume();
  controls.enabled = true;
  gui.show();
  painted.invalidate();
}

function stop() {
  setActiveRandomize(null);
  resizeHandler.pause();
  sketchEffect.pause();
  controls.enabled = false;
  gui.hide();
}

const index = 3;
export { index, start, stop, draw, randomize, params, defaults, canvas };
