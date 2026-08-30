import { Scene, Mesh, Group } from "three";
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
import { paletteOptions, getPalette } from "../modules/palettes.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  setActiveRandomize,
} from "../modules/gui.js";
import { effectRAF } from "../modules/reactive.js";
import { createParams } from "guspira";
import { seed } from "../modules/random.js";

const defaults = {
  rings: 72,
  ringLength: 1,
  segments: 100,
  tilt: 0.1,
  spread: 0.1,
  lineWidth: [0.3, 0.5],
  brush: "brush6",
  palette: "basic",
  seed: 13373,
};

// The defaults above are the schema: createParams turns each one into a signal of the right
// kind and hands back an object keyed exactly the same way, so inktober.js's serialize() and
// reset() go on working against it untouched.
//
// No easing here. A value that travels re-runs whatever reads it on every frame of the
// journey, and what reads these is a full rebuild of every ribbon — so a morphing reroll would
// be a stuttering one. Easing belongs in the sketches whose parameters are uniforms.
const params = createParams(defaults);

const gui = new GUI("Annular sphere", document.querySelector("#gui-container"));
gui.addLabel(
  "Lines generated at different heights on the surface of a sphere."
);
// Clicking any label rerolls just that control, within the range declared right here — which
// is where the old randomizeParams() got its numbers from anyway.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Segments", params.segments, 20, 100, 1, { randomizable: false });
gui.addSlider("Rings", params.rings, 1, 200, 1);
gui.addSlider("Ring length", params.ringLength, 0.1, 2, 0.01);
gui.addSlider("Tilt", params.tilt, 0, 0.2, 0.01);
gui.addSlider("Spread", params.spread, 0, 0.2, 0.01);
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

camera.position.set(7.8, 3.6, 7.3).multiplyScalar(0.83);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const circles = [];
const geometry = [];

function generateRing() {
  geometry.length = 0;
  const circleRadius = 2;
  const l = params.ringLength() * Math.PI;
  for (let j = 0; j <= l; j += l / params.segments()) {
    geometry.push(0, circleRadius * Math.cos(j), circleRadius * Math.sin(j));
  }
  geometry.reverse();
}

function generateLines() {
  seed(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  for (let i = 0; i < params.rings(); i++) {
    const line = new MeshLine();
    const material = new MeshLineMaterial({
      map: brushes[params.brush()],
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth: Maf.randomInRange(
        params.lineWidth()[0],
        params.lineWidth()[1]
      ),
      offset: Maf.randomInRange(-100, 100),
      opacity: Maf.randomInRange(0.7, 0.9),
    });
    line.setPoints(geometry, (p) => p);
    const mesh = new Mesh(line.geometry, material);
    // Tilt the ring.
    const pivot = new Group();
    const a = Maf.randomInRange(0, Maf.TAU);
    const x = 3 * Math.sin(a);
    const y = Maf.map(0, params.rings(), -2, 2, i);
    const z = 3 * Math.cos(a);
    pivot.position.set(0, y, 0);
    pivot.rotation.x = Maf.randomInRange(-params.tilt(), params.tilt());
    pivot.rotation.z = Maf.randomInRange(-params.tilt(), params.tilt());
    mesh.rotation.x = Math.PI / 2;
    pivot.add(mesh);
    group.add(pivot);
    // Adjust size to shape as sphere.
    mesh.scale.setScalar(
      Maf.parabola((y + 2) / 4, 0.5) +
        Maf.randomInRange(-params.spread(), params.spread())
    );
    material.lineWidth *= Maf.parabola((y + 2) / 4, 0.5);
    circles.push({
      mesh,
      pivot,
      x,
      speed: 1 + Math.round(Maf.randomInRange(0, 2)),
      z,
      a,
    });
  }
  painted.invalidate();
}

scene.add(group);

// No eager first build: effectRAF runs its body immediately to collect dependencies, so the
// pair below would only be torn down again by the effect's own clearScene().
const sketchEffect = effectRAF(() => {
  clearScene();
  generateRing();
  generateLines();
});

function clearScene() {
  for (const circle of circles) {
    circle.mesh.geometry.dispose();
    circle.mesh.material.dispose();
    group.remove(circle.pivot);
  }
  circles.length = 0;
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
    time += (t - lastTime) / 1000 / 10;
    painted.invalidate();
  }

  circles.forEach((c) => {
    c.pivot.rotation.y = -c.speed * time * Maf.TAU + c.a;
  });

  group.rotation.x = Maf.PI / 8;

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

const index = 1;
export { index, start, stop, draw, randomize, params, defaults, canvas };
