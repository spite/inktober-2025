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

const params = {
  lines: signal(defaults.lines),
  segments: signal(defaults.segments),
  radius: signal(defaults.radius),
  radiusSpread: signal(defaults.radiusSpread),
  lineRepeat: signal(defaults.lineRepeat),
  lineSpread: signal(defaults.lineSpread),
  lineWidth: signal(defaults.lineWidth),
  twists: signal(defaults.twists),
  seed: signal(defaults.seed),
  brush: signal(defaults.brush),
  opacity: signal(defaults.opacity),
  palette: signal(defaults.palette),
};

const gui = new GUI("Möbius strip", document.querySelector("#gui-container"));
gui.addLabel("Lines generated tracing a twisted Möbius strip.");
gui.addSlider("Segments per line", params.segments, 100, 300, 1);
gui.addSlider("[Half] twists", params.twists, 0, 10, 1);
gui.addSlider("Lines", params.lines, 1, 400, 1);
gui.addSlider("Radius", params.radius, 1, 10, 0.1);
gui.addSlider("Radius spread", params.radiusSpread, 0, 1, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
gui.addRangeSlider("Line repeat range", params.lineRepeat, 1, 20, 1);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);

gui.addSeparator();
gui.addSelect("Brush", brushOptions, params.brush);
gui.addSelect("Palette", paletteOptions, params.palette);
gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01);

gui.addSeparator();
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);

addInfo(gui);

effectRAF(() => {
  serialize();
});

function serialize() {
  const fields = [];
  for (const key of Object.keys(params)) {
    fields.push([key, params[key]()]);
  }
  const data = fields.map((v) => `${v[0]}=${v[1]}`).join("|");
  setHash(data);
}

function deserialize(data) {
  const fields = data.split("|");
  for (const field of fields) {
    const [key, value] = field.split("=");
    switch (typeof defaults[key]) {
      case "number":
        params[key].set(parseFloat(value));
        break;
      case "object":
        params[key].set(value.split(",").map((v) => parseFloat(v)));
        break;
      case "string":
        params[key].set(value);
        break;
    }
  }
}

function reset() {
  for (const key of Object.keys(defaults)) {
    params[key].set(defaults[key]);
  }
}

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

camera.position.set(5, -2.5, -16).multiplyScalar(0.9);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);
painted.backgroundColor.set(new Color(0xf6f2e9));

const meshes = [];

function generateShape() {
  Math.seedrandom(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  const spread = params.lineSpread();
  const LINES = params.lines();

  for (let i = 0; i < LINES; i++) {
    const radiusSpread =
      params.radiusSpread() * Maf.map(0, 1, -1, 1, Math.random());
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
        Math.random()
      )
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
        Math.round(Maf.randomInRange(0.5 * repeat, repeat - 1))
      ),
      useDash: true,
      opacity: Maf.randomInRange(params.opacity()[0], params.opacity()[1]),
    });

    var mesh = new Mesh(g.geometry, material);

    const speed = Maf.randomInRange(1, 10);
    mesh.position.set(
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread)
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
  params.lines.set(Maf.intRandomInRange(100, 400));
  // params.segments.set(Maf.intRandomInRange(200, 500));
  params.radius.set(Maf.randomInRange(4, 6));
  params.radiusSpread.set(Maf.randomInRange(0, 1));
  params.lineSpread.set(Maf.randomInRange(0, 1));
  const r = 1;
  params.lineRepeat.set([r, Maf.randomInRange(r, 10)]);
  const v = 0.1;
  params.lineWidth.set([v, Maf.randomInRange(v, 0.9)]);
  params.twists.set(Maf.intRandomInRange(0, 10));
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
    m.mesh.material.uniforms.uvOffset.value.x = -(
      m.offset +
      0.5 * m.speed * time
    );
  });

  group.rotation.y = (time * Maf.TAU) / 2;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

function start() {
  serialize();
  controls.enabled = true;
  gui.show();
  painted.invalidate();
}

function stop() {
  controls.enabled = false;
  gui.hide();
}

const index = 5;
export { index, start, stop, draw, randomize, deserialize, canvas };
