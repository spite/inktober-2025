import { Scene, Mesh, Group, Vector2, Vector3, Box3, Color } from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  brushes,
  brushOptions,
  addInfo,
} from "../modules/three.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import { LorenzAttractor } from "../modules/lorenz-attractor.js";
import { AizawaAttractor } from "../modules/aizawa-attractor.js";
import { AnishchenkoAstakhovAttractor } from "../modules/anishchenko-astakhov-attractor.js";
import { BurkeShawAttractor } from "../modules/burke-shaw-attractor.js";
import { HadleyAttractor } from "../modules/hadley-attractor.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const attractors = [
  LorenzAttractor,
  HadleyAttractor,
  AizawaAttractor,
  AnishchenkoAstakhovAttractor,
  BurkeShawAttractor,
].map((a) => new a());
const attractorOptions = attractors.map((a) => [a.id, a.id]);

const defaults = {
  lines: 190,
  segments: 480,
  radiusSpread: 1.0,
  lineSpread: 0,
  lineWidth: [0.1, 0.9],
  seed: 1337,
  opacity: [0.6, 0.9],
  brush: "brush9",
  palette: "mysticBliss",
  attractor: "Lorentz",
};

const params = {
  lines: signal(defaults.lines),
  segments: signal(defaults.segments),
  radiusSpread: signal(defaults.radiusSpread),
  lineSpread: signal(defaults.lineSpread),
  lineWidth: signal(defaults.lineWidth),
  seed: signal(defaults.seed),
  brush: signal(defaults.brush),
  opacity: signal(defaults.opacity),
  palette: signal(defaults.palette),
  attractor: signal(defaults.attractor),
};

const gui = new GUI(
  "Strange attractors",
  document.querySelector("#gui-container")
);
gui.addLabel("Tracing lines based on strange attractors.");
gui.addSlider("Segments per line", params.segments, 100, 500, 1);
gui.addSlider("Lines", params.lines, 1, 400, 1);
gui.addSelect("Attractor", attractorOptions, params.attractor);
gui.addSlider("Radius spread", params.radiusSpread, 0, 2, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);

gui.addSeparator();
gui.addSelect("Brush", brushOptions, params.brush);
gui.addSelect("Palette", paletteOptions, params.palette);
gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01);

gui.addSeparator();
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);

addInfo(gui);

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
controls.enableDamping = true;
controls.addEventListener("change", () => {
  painted.invalidate();
});
painted.backgroundColor.set(new Color(0xf6f2e9));

camera.position.set(35, 15, -35).multiplyScalar(0.2);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const meshes = [];

function generateShape() {
  Math.seedrandom(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));
  const attractor = attractors.find((a) => a.id === params.attractor());

  const POINTS = params.segments();
  const LINES = params.lines();
  const bounds = new Box3();
  for (let j = 0; j < LINES; j++) {
    const offset = Maf.randomInRange(0, 1);
    const vertices = [];
    const r = attractor.spread * params.radiusSpread();
    const p = new Vector3(
      Maf.randomInRange(-r, r) + attractor.x,
      Maf.randomInRange(-r, r) + attractor.y,
      Maf.randomInRange(-r, r) + attractor.z
    );
    for (let i = 0; i < POINTS; i++) {
      const t = p.clone();
      vertices.push(t);
      bounds.expandByPoint(t);
      attractor.step(p);
    }

    const g = new MeshLine();
    const repeat = Math.floor(Maf.randomInRange(3, POINTS / 10));

    const material = new MeshLineMaterial({
      map: brushes[params.brush()],
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth:
        Maf.randomInRange(params.lineWidth()[0], params.lineWidth()[1]) / 5,
      repeat: new Vector2(repeat, 1),
      dashArray: new Vector2(1, 4),
      dashOffset: 0,
      useDash: true,
      opacity: Maf.randomInRange(params.opacity()[0], params.opacity()[1]),
    });

    const mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    const spread = params.lineSpread();
    mesh.position.set(
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread)
    );

    group.add(mesh);

    mesh.material.uniforms.dashArray.value.set(
      Maf.randomInRange(1, 2),
      Maf.randomInRange(4, 8)
    );
    mesh.g.setPoints(vertices, (p) => Maf.parabola(p, 0.4));
    mesh.rotation.y = Maf.randomInRange(-0.1, 0.1);
    const start = 1;
    const end = Math.round(Maf.randomInRange(start, repeat - 1));
    mesh.material.uniforms.dashArray.value.set(start, end);
    const speed = Math.floor(Maf.randomInRange(1, 2));
    meshes.push({ mesh, offset, speed });
  }

  const center = new Vector3();
  bounds.getCenter(center);
  group.position.copy(center.multiplyScalar(-1));

  painted.invalidate();
}

scene.scale.setScalar(0.09);
scene.add(group);

effectRAF(() => {
  console.log("effectRAF2");
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

function randomizeParams() {
  console.log("randomize");
  params.attractor.set(Maf.randomElement(attractorOptions)[0]);
  params.lines.set(Maf.intRandomInRange(100, 400));
  // params.segments.set(Maf.intRandomInRange(200, 500));
  params.radiusSpread.set(Maf.randomInRange(0.1, 2));
  params.lineSpread.set(Maf.randomInRange(0, 1));
  const v = 0.1;
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
    time += (t - lastTime) / 10000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = -1 * time * m.speed - m.offset;
  });

  // group.rotation.y = time * Maf.TAU;

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

const index = 10;
export { index, start, stop, draw, randomize, params, defaults, canvas };
