import { Scene, Mesh, Group, Vector2, Vector3, Color } from "three";
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
import { signal, effectRAF, computed } from "../modules/reactive.js";
import GUI from "../modules/gui.js";
import { Easings } from "../modules/easings.js";

const defaults = {
  lines: 100,
  segments: 400,
  radius: 5,
  radiusSpread: 0.5,
  lineRepeat: [5, 10],
  lineSpread: 0.2,
  lineWidth: [0.1, 0.9],
  seed: 1337,
  twist: 1,
  opacity: [0.1, 1],
  brush: "brush8",
  palette: "florian",
};

const params = {
  lines: signal(defaults.lines),
  segments: signal(defaults.segments),
  radius: signal(defaults.radius),
  radiusSpread: signal(defaults.radiusSpread),
  lineRepeat: signal(defaults.lineRepeat),
  lineSpread: signal(defaults.lineSpread),
  lineWidth: signal(defaults.lineWidth),
  twist: signal(defaults.twist),
  seed: signal(defaults.seed),
  brush: signal(defaults.brush),
  opacity: signal(defaults.opacity),
  palette: signal(defaults.palette),
};

const gui = new GUI("Winders", document.querySelector("#gui-container"));
gui.addLabel("Lines generated tracing a winder.");
gui.addSlider("Segments per line", params.segments, 200, 600, 1);
gui.addSlider("Twist", params.twist, 0, 1, 0.01);
gui.addSlider("Lines", params.lines, 1, 200, 1);
gui.addSlider("Radius", params.radius, 1, 10, 0.1);
gui.addSlider("Radius spread", params.radiusSpread, 0, 1, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
gui.addRangeSlider("Line repeat range", params.lineRepeat, 1, 50, 1);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);

gui.addSeparator();
gui.addSelect("Brush", brushOptions, params.brush);
gui.addSelect("Palette", paletteOptions, params.palette);
gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01);

gui.addSeparator();
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);

addInfo(gui);

const painted = new Painted({ minLevel: -0.5 });

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

camera.position.set(5, -2.5, -16).multiplyScalar(0.8);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);
painted.backgroundColor.set(new Color(0xf6f2e9));

const meshes = [];

function generateShape() {
  Math.seedrandom(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  const spread = params.lineSpread();
  const LINES = params.lines();
  const POINTS = params.segments();

  for (let i = 0; i < LINES; i++) {
    const vertices = [];
    const t =
      Maf.map(0, LINES, 0, 0.1, i) + Maf.map(0, 1, 0, 0.5, params.twist());
    const radius =
      params.radius() +
      Maf.map(0, LINES, 0, 1, i) +
      Maf.randomInRange(-params.radiusSpread(), params.radiusSpread());
    const lineSpread = new Vector3(
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread)
    );
    const q = Easings.InOutQuad(0.5 + 0.5 * Math.cos(Maf.PI + t * Maf.TAU));
    const r = radius;
    const angleOffset = Maf.randomInRange(0, Maf.TAU);
    for (let i = 0; i < POINTS; i++) {
      const tw = 2.5 * Math.PI * q;
      const th = (i * Maf.TAU) / POINTS;

      const ph = Math.cos(th) * tw;
      const y = r * Math.cos(th);
      const x = r * Math.sin(th) * Math.cos(ph);
      const z = r * Math.sin(th) * Math.sin(ph);

      vertices.push(new Vector3(x, y, z).add(lineSpread));
    }

    vertices.push(vertices[0].clone());

    const sliceOffset = Maf.intRandomInRange(0, vertices.length);
    const points = [
      ...vertices.slice(sliceOffset - 1),
      ...vertices.slice(0, sliceOffset),
    ];

    const repeat = Math.round(
      Maf.map(
        0,
        1,
        params.lineRepeat()[0],
        params.lineRepeat()[1],
        Math.random()
      )
    );
    const offset = Maf.randomInRange(-10, 10);
    const material = new MeshLineMaterial({
      map: brushes[params.brush()],
      useMap: true,
      color: gradient.getAt(i / LINES),
      lineWidth:
        0.5 * Maf.randomInRange(params.lineWidth()[0], params.lineWidth()[1]),
      offset: Maf.randomInRange(-100, 100),
      repeat: new Vector2(repeat, 1),
      dashArray: new Vector2(1, repeat - 1),
      useDash: true,
      opacity: Maf.randomInRange(params.opacity()[0], params.opacity()[1]),
      uvOffset: new Vector2(offset, 0),
      // wireframe: true,
    });

    const line = new MeshLine();
    line.setPoints(points);

    const mesh = new Mesh(line.geometry, material);
    group.add(mesh);

    const speed = Maf.randomInRange(0.5, 1.5) * 3;
    meshes.push({ mesh, t, line, radius, offset, speed });
  }

  painted.invalidate();
}

group.scale.setScalar(0.5);
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
  params.lines.set(Maf.intRandomInRange(1, 200));
  // params.segments.set(Maf.intRandomInRange(200, 500));
  params.radius.set(Maf.randomInRange(4, 6));
  params.radiusSpread.set(Maf.randomInRange(0, 1));
  params.lineSpread.set(Maf.randomInRange(0, 1));
  const r = 1;
  params.lineRepeat.set([r, Maf.randomInRange(r, 10)]);
  const v = 0.1;
  params.lineWidth.set([v, Maf.randomInRange(v, 0.9)]);
  params.twist.set(Maf.randomInRange(0, 1));
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
  const o = Maf.randomInRange(0.1, 1);
  params.opacity.set([o, Maf.randomInRange(o, 1)]);
}

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  controls.update();

  const t = performance.now();
  if (isRunning) {
    time += (t - lastTime) / 1000 / 40;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = -(m.offset + m.speed * time);
  });

  group.rotation.y = (time * Maf.TAU) / 2;

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

const index = 4;
export { index, start, stop, draw, randomize, params, defaults, canvas };
