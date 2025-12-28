import { Scene, Mesh, Group, Vector2, Color } from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  brushes,
  wait,
  brushOptions,
  addInfo,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { paletteOptions, getPalette } from "../modules/palettes.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import { Poisson2D } from "../modules/poisson-2d.js";
import { init } from "../modules/dipoles-2d.js";
import GUI from "../modules/gui.js";
import { signal, effectRAF } from "../modules/reactive.js";

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

const params = {
  charges: signal(defaults.charges),
  chargeRange: signal(defaults.chargeRange),
  lineLength: signal(defaults.lineLength),
  lineWidth: signal(defaults.lineWidth),
  opacity: signal(defaults.opacity),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI(
  "Electric fields I",
  document.querySelector("#gui-container")
);
gui.addLabel("Lines generated following an electric field.");
gui.addSlider("Charges", params.charges, 2, 50, 1);
gui.addSlider("Charge range", params.chargeRange, 1, 200, 0.1);
gui.addRangeSlider("Line length", params.lineLength, 1, 100, 1);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);

gui.addSeparator();
gui.addSelect("Brush", brushOptions, params.brush);
gui.addSelect("Palette", paletteOptions, params.palette);
gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01);

gui.addSeparator();
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);

addInfo(gui);

function reset() {
  for (const key of Object.keys(defaults)) {
    params[key].set(defaults[key]);
  }
}

const painted = new Painted({ minLevel: -0.2 });

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const group = new Group();
const controls = new OrbitControls(camera, canvas);
controls.addEventListener("change", () => {
  painted.invalidate();
});
painted.backgroundColor.set(new Color(0xf6f2e9));

camera.position.set(1.8, 0, 2).multiplyScalar(0.8);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const meshes = [];

async function generateLines(abort) {
  Math.seedrandom(params.seed());

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
    group.add(mesh);
  }
}

scene.add(group);

let abortController = new AbortController();

effectRAF(() => {
  console.log("effectRAF2");
  abortController.abort();
  clearScene();
  abortController = new AbortController();
  generateLines(abortController.signal);
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

function randomizeParams() {
  console.log("randomize");
  params.charges.set(Maf.intRandomInRange(2, 50));
  params.chargeRange.set(Maf.randomInRange(1, 200));
  const l = Maf.randomInRange(0.1, 0.9);
  params.lineWidth.set(Maf.randomInRange(l, 1));
  const v = Maf.randomInRange(0.1, 0.9);
  params.lineWidth.set([v, Maf.randomInRange(v, 0.9)]);
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
  const o = 0.5;
  params.opacity.set([o, Maf.randomInRange(o, 1)]);
}

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
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

const index = 18;
export { index, start, stop, draw, randomize, canvas };
