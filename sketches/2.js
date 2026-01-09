import { Scene, Mesh, Group, Vector2, TextureLoader, Color } from "three";
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
import { KnotCurve } from "../third_party/CurveExtras.js";
import { Painted } from "../modules/painted.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const defaults = {
  lines: 72,
  segments: 200,
  radiusSpread: 0.5,
  lineRepeat: [1, 10],
  lineSpread: 0.5,
  lineWidth: [0.4, 0.6],
  brush: "brush1",
  palette: "basic",
  seed: 1337,
};

const params = {
  lines: signal(defaults.lines),
  segments: signal(defaults.segments),
  radiusSpread: signal(defaults.radiusSpread),
  lineRepeat: signal(defaults.lineRepeat),
  lineSpread: signal(defaults.lineSpread),
  lineWidth: signal(defaults.lineWidth),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI("Knot curve", document.querySelector("#gui-container"));
gui.addLabel("Lines generated tracing a Knot curve.");
gui.addSlider("Segments per line", params.segments, 100, 500, 1);
gui.addSlider("Lines", params.lines, 1, 200, 1);
gui.addSlider("Radius spread", params.radiusSpread, 0, 1, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
gui.addRangeSlider("Line repeat range", params.lineRepeat, 1, 10, 1);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);

gui.addSeparator();
gui.addSelect("Brush", brushOptions, params.brush);
gui.addSelect("Palette", paletteOptions, params.palette);

gui.addSeparator();
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);

addInfo(gui);

const painted = new Painted();

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

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

const resolution = new Vector2(canvas.width, canvas.height);

const meshes = [];

function generateShape() {
  Math.seedrandom(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  const lineSpread = 2 * params.lineSpread();
  const LINES = params.lines();
  const POINTS = params.segments();
  for (let i = 0; i < LINES; i++) {
    const w = Maf.randomInRange(params.lineWidth()[0], params.lineWidth()[1]);
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
      Maf.map(
        0,
        1,
        params.lineRepeat()[0],
        params.lineRepeat()[1],
        Math.random()
      )
    );

    const material = new MeshLineMaterial({
      map: brushes[params.brush()],
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
  // params.segments.set(Maf.intRandomInRange(100, 500));
  params.radiusSpread.set(Maf.randomInRange(0, 1));
  params.lineSpread.set(Maf.randomInRange(0, 1));
  const r = Maf.randomInRange(1, 10);
  params.lineRepeat.set([r, Maf.randomInRange(r, 10)]);
  const v = Maf.randomInRange(0.1, 0.9);
  params.lineWidth.set([v, Maf.randomInRange(v, 0.9)]);
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
}

let lastTime = performance.now();
let time = 0;

function draw() {
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

const index = 2;
export { index, start, stop, draw, randomize, params, defaults, canvas };
