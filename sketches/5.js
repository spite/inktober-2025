import { Scene, Mesh, Group, Vector2, Vector3 } from "three";
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
import { Painted } from "../modules/painted.js";
import { effectRAF } from "../modules/reactive.js";
import GUI, {
  addRandomizeParams,
  rollPair,
  rollWithin,
  setActiveRandomize,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { random, seed } from "../modules/random.js";

const defaults = {
  lines: 200,
  segments: 200,
  radius: 5,
  radiusSpread: 0.5,
  lineRepeat: [1, 8],
  lineSpread: 0.2,
  lineWidth: [0.1, 0.9],
  seed: 1337,
  twists: 1,
  opacity: [0.1, 1],
  brush: "brush8",
  palette: "florian",
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI("Möbius strip", document.querySelector("#gui-container"));
gui.addLabel("Lines generated tracing a twisted Möbius strip.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
gui.addSection("Shape");
gui.addSlider("Segments per line", params.segments, 100, 300, 1, {
  randomizable: false,
});
gui.addSlider("[Half] twists", params.twists, 0, 10, 1);
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
  gui.addRangeSlider("Line repeat range", params.lineRepeat, 1, 20, 1),
  [1, 1], [1, 10], 1,
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

  const spread = params.lineSpread();
  const LINES = params.lines();

  for (let i = 0; i < LINES; i++) {
    const radiusSpread =
      params.radiusSpread() * Maf.map(0, 1, -1, 1, random());
    const radius = params.radius();
    const offset = Maf.randomInRange(0, Maf.TAU);
    const range = Maf.randomInRange(0.125 * Maf.TAU, 0.25 * Maf.TAU);

    const vertices = [];
    const TWIST = 1 * Maf.TAU;
    const uStep = TWIST / params.segments();
    const v = Maf.map(0, LINES, -1, 1, i);
    const uOffset = Maf.randomInRange(0, 2 * Math.PI);
    const k = params.twists();

    for (let u = 0; u < TWIST; u += uStep) {
      const angle = u + uOffset;

      const twistAngle = k * (angle / 2);

      const x = (1 + (v / 2) * Math.cos(twistAngle)) * Math.cos(angle);
      const y = (1 + (v / 2) * Math.cos(twistAngle)) * Math.sin(angle);
      const z = (v / 2) * Math.sin(twistAngle);

      vertices.push(new Vector3(x, y, z).multiplyScalar(radius + radiusSpread));
    }

    var g = new MeshLine();
    g.setPoints(vertices, (p) => Maf.parabola(p, 0.4));

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
      color: gradient.getAt(i / LINES),
      lineWidth:
        0.5 * Maf.randomInRange(params.lineWidth()[0], params.lineWidth()[1]),
      offset: Maf.randomInRange(-100, 100),
      repeat: new Vector2(repeat, 1),
      dashArray: new Vector2(
        1,
        Math.round(Maf.randomInRange(0.5 * repeat, repeat - 1)),
      ),
      useDash: true,
      opacity: Maf.randomInRange(params.opacity()[0], params.opacity()[1]),
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

const index = 5;
export { index, start, stop, draw, randomize, params, defaults, canvas };
