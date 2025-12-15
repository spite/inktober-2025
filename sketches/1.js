import { Scene, Mesh, Group, Vector3, Color } from "three";
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
import { palettes, paletteOptions } from "../modules/palettes.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import GUI from "../modules/gui.js";
import { signal, effectRAF } from "../modules/reactive.js";

const defaults = {
  rings: 72,
  ringLength: 1,
  segments: 100,
  tilt: 0.1,
  spread: 0.1,
  lineWidth: [0.3, 0.5],
  brush: "brush1",
  palette: "basic",
  seed: 13373,
};

const params = {
  rings: signal(defaults.rings),
  ringLength: signal(defaults.ringLength),
  segments: signal(defaults.segments),
  tilt: signal(defaults.tilt),
  spread: signal(defaults.spread),
  lineWidth: signal(defaults.lineWidth),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI("Annular sphere", document.querySelector("#gui-container"));
gui.addLabel(
  "Lines generated at different heights on the surface of a sphere."
);
gui.addSlider("Segments", params.segments, 20, 100, 1);
gui.addSlider("Rings", params.rings, 1, 200, 1);
gui.addSlider("Ring length", params.ringLength, 0.1, 2, 0.01);
gui.addSlider("Tilt", params.tilt, 0, 0.2, 0.01);
gui.addSlider("Spread", params.spread, 0, 0.2, 0.01);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);

gui.addSeparator();
gui.addSelect("Brush", brushOptions, params.brush);
gui.addSelect("Palette", paletteOptions, params.palette);

gui.addSeparator();
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);

addInfo(gui);

function reset() {
  for (const key of Object.keys(defaults)) {
    params[key].set(defaults[key]);
  }
}
const painted = new Painted();

onResize((w, h) => {
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

camera.position.set(7.8, 3.6, 7.3).multiplyScalar(0.8);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);
painted.backgroundColor.set(new Color(0xf6f2e9));

const circles = [];
const geometry = [];

function generateRing() {
  geometry.length = 0;
  console.log("Generating ring");
  const circleRadius = 2;
  const l = params.ringLength() * Math.PI;
  for (let j = 0; j <= l; j += l / params.segments()) {
    const v = new Vector3(
      0,
      circleRadius * Math.cos(j),
      circleRadius * Math.sin(j)
    );
    geometry.push(v.x, v.y, v.z);
  }
  geometry.reverse();
}

function generateLines() {
  console.log("Generating lines");
  Math.seedrandom(params.seed());

  const gradient = new gradientLinear(palettes[params.palette()]);

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

generateRing();
generateLines();

effectRAF(() => {
  console.log("effectRAF2");
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
  params.seed.set(performance.now());
}

function randomizeParams() {
  console.log("randomize");
  params.rings.set(Maf.intRandomInRange(1, 200));
  // params.segments.set(Maf.intRandomInRange(20, 100));
  params.tilt.set(Maf.randomInRange(0, 0.2));
  params.spread.set(Maf.randomInRange(0, 0.2));
  params.ringLength.set(Maf.randomInRange(0.1, 2));
  const v = Maf.randomInRange(0.1, 0.9);
  params.lineWidth.set([v, Maf.randomInRange(v, 0.9)]);
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions));
}

let lastTime = performance.now();
let time = 0;

function draw() {
  controls.update();

  const t = performance.now();
  if (isRunning) {
    time += (t - lastTime) / 1000 / 10;
    painted.invalidate();
  }

  circles.forEach((c, id) => {
    c.pivot.rotation.y = -c.speed * time * Maf.TAU + c.a;
  });

  group.rotation.x = Maf.PI / 8;

  painted.render(renderer, scene, camera);

  lastTime = t;
}

function start() {
  controls.enabled = true;
  gui.show();
  painted.invalidate();
}

function stop() {
  controls.enabled = false;
  gui.hide();
}

const index = 1;
export { index, start, stop, draw, randomize, canvas };
