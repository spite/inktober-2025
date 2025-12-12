import { Scene, Mesh, Group, Vector2, TextureLoader, Color } from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  onRandomize,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { KnotCurve } from "../third_party/CurveExtras.js";
import { Painted } from "../modules/painted.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const defaults = {
  lines: 72,
  repeatMin: 4,
  repeatMax: 10,
  segments: 200,
  radiusSpread: 0.5,
  lineSpread: 0.5,
  lineWidthMin: 0.4,
  lineWidthMax: 0.6,
};

const params = {
  lines: signal(defaults.lines),
  repeatMin: signal(defaults.repeatMin),
  repeatMax: signal(defaults.repeatMax),
  segments: signal(defaults.segments),
  radiusSpread: signal(defaults.radiusSpread),
  lineSpread: signal(defaults.lineSpread),
  lineWidthMin: signal(defaults.lineWidthMin),
  lineWidthMax: signal(defaults.lineWidthMax),
  seed: signal(performance.now()),
};

const gui = new GUI("Knot curve", document.querySelector("#gui-container"));
gui.addLabel("Lines generated tracing a Knot curve.");
gui.addSlider("Segments per line", params.segments, 100, 500, 1);
gui.addSlider("Radius spread", params.radiusSpread, 0, 1, 0.01);
gui.addSlider("Lines", params.lines, 1, 200, 1);
gui.addRangeSlider(
  "Line repeat range",
  params.repeatMin,
  params.repeatMax,
  1,
  10,
  1
);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
gui.addRangeSlider(
  "Line width range",
  params.lineWidthMin,
  params.lineWidthMax,
  0.1,
  0.9,
  0.01
);
// gui.addSelect("Palette", ["Red", "Blue"]);
gui.addButton("Randomize params", randomize);

const painted = new Painted({ minLevel: -0.5 });

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

palette.range = [
  "#1e242c",
  "#4a5b6b",
  "#8da0b4",
  "#cdd9e6",
  "#f5f8fb",
  // "#3a8beb",
  // "#6b9dd8",
  // "#3ab485",
  "#ebb43a",
  "#e74c3c",
];

// palette.range = [
//   "#DDAA44",
//   "#B9384C",
//   "#7E9793",
//   "#F8F6F2",
//   "#3D5443",
//   "#2F2D30",
//   "#AEC2DA",
//   "#8C7F70",
// ];
//palette.range = ["#000000", "#555555"];

const gradient = new gradientLinear(palette.range);
const curve = new KnotCurve();

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const group = new Group();

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

controls.addEventListener("change", () => {
  painted.invalidate();
});

camera.position.set(5, -2.5, -26);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);
painted.backgroundColor.set(new Color(0xf6f2e9));

const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");
const resolution = new Vector2(canvas.width, canvas.height);

const meshes = [];

function generateShape() {
  Math.seedrandom(params.seed());

  const lineSpread = 2 * params.lineSpread();
  const LINES = params.lines();
  const POINTS = params.segments();
  for (let i = 0; i < LINES; i++) {
    const w = Maf.randomInRange(params.lineWidthMin(), params.lineWidthMax());
    const radius =
      0.25 + params.radiusSpread() * Maf.map(0, 1, -0.05, 0.05, Math.random());
    const color = i / LINES;
    const offset = Maf.randomInRange(0, Maf.TAU);

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
      Maf.map(0, 1, params.repeatMin(), params.repeatMax(), Math.random())
    );

    const material = new MeshLineMaterial({
      map: strokeTexture,
      useMap: true,
      color: gradient.getAt(color),
      resolution: resolution,
      lineWidth: w,
      offset: Maf.randomInRange(-100, 100),
      repeat: new Vector2(repeat, 1),
      dashArray: new Vector2(1, repeat - 1),
      useDash: true,
      opacity: 0.8,
    });

    const mesh = new Mesh(g.geometry, material);

    const speed = Maf.randomInRange(1, 10);
    mesh.position.set(
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread)
    );
    group.add(mesh);
    meshes.push({
      mesh,
      radius,
      offset,
      speed,
    });
  }
  painted.invalidate();
}

group.scale.setScalar(0.5);
group.position.y = -4;
scene.add(group);

effectRAF(() => {
  console.log("effectRAF2");
  clearScene();
  generateShape();
});

function clearScene() {
  for (const mesh of meshes) {
    group.remove(mesh.mesh);
  }
  meshes.length = 0;
}

onRandomize(() => {
  params.seed.set(performance.now());
});

function randomize() {
  console.log("randomize");
  params.lines.set(Maf.intRandomInRange(1, 200));
  params.segments.set(Maf.intRandomInRange(100, 500));
  params.radiusSpread.set(Maf.randomInRange(0, 1));
  params.lineSpread.set(Maf.randomInRange(0, 1));
  params.repeatMin.set(Maf.randomInRange(0, 10));
  params.repeatMax.set(Maf.randomInRange(params.repeatMin(), 10));
  params.lineWidthMin.set(Maf.randomInRange(0.1, 0.9));
  params.lineWidthMax.set(Maf.randomInRange(params.lineWidthMin(), 0.9));
}

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  controls.update();

  const t = performance.now();
  if (isRunning) {
    time += (t - lastTime) / 1000 / 20;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = -(
      m.offset +
      0.7 * m.speed * time
    );
  });

  group.rotation.y = (time * Maf.TAU) / 4;

  // renderer.render(scene, camera);
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

export { start, stop, draw, canvas };
