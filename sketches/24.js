import { Scene, Mesh, Group, Vector2, Vector3, Color } from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  brushOptions,
  brushes,
  wait,
  addInfo,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import { MarchingSquares } from "../modules/marching-squares.js";
import perlin from "../third_party/perlin.js";
import { sphericalToCartesian } from "../modules/conversions.js";

import { getPalette, paletteOptions } from "../modules/palettes.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const defaults = {
  lines: 100,
  scale: 2,
  lineWidth: [0.8, 1],
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "autumnIntoWinter",
  seed: 13373,
};

const params = {
  lines: signal(defaults.lines),
  scale: signal(defaults.scale),
  lineWidth: signal(defaults.lineWidth),
  opacity: signal(defaults.opacity),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI("Isolines III", document.querySelector("#gui-container"));
gui.addLabel("Lines generated following isolines an a spherical perlin noise.");
gui.addSlider("Lines", params.lines, 10, 150, 1);
gui.addSlider("Scale", params.scale, 0.5, 2.5, 0.01);
gui.addRangeSlider("Line width", params.lineWidth, 0.1, 1, 0.01);
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

camera.position
  .set(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808)
  .multiplyScalar(1.1);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const SCALE = 1;
const WIDTH = 300 / SCALE;
const HEIGHT = 300 / SCALE;

function generate(scale) {
  const offset = new Vector3(
    Maf.randomInRange(-100, 100),
    Maf.randomInRange(-100, 100),
    Maf.randomInRange(-100, 100)
  );

  return (x, y, z) => {
    return perlin.simplex3(
      x * scale + offset.x,
      y * scale + offset.y,
      z * scale + offset.z
    );
  };
}

const meshes = [];
const latSteps = WIDTH;
const lonSteps = HEIGHT;

const rotDir = new Vector3(
  Maf.randomInRange(-1, 1),
  Maf.randomInRange(-1, 1),
  Maf.randomInRange(-1, 1)
).normalize();

async function generateIsoLines(abort) {
  Math.seedrandom(params.seed());

  const LINES = params.lines();
  const noiseScale = params.scale();

  const gradient = new gradientLinear(getPalette(params.palette()));
  const map = brushes[params.brush()];
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();

  const values = [];

  const pattern = generate(noiseScale);

  for (let i = 0; i <= lonSteps; i++) {
    values[i] = [];
    const phi = (i / lonSteps) * Math.PI * 2;

    for (let j = 0; j <= latSteps; j++) {
      const theta = (j / latSteps) * Math.PI;

      const n = sphericalToCartesian(1, theta, phi);

      const noiseVal = pattern(n.x, n.y, n.z);

      values[i][j] = noiseVal;
    }
  }

  for (let i = Math.round(0.75 * LINES); i > 0; i--) {
    if (abort.aborted) {
      return;
    }
    if (i % 1 === 0) {
      await wait();
    }
    painted.invalidate();

    const paths = MarchingSquares.generateIsolines(
      values,
      -0.9 + (1.8 * i) / LINES,
      1 / WIDTH,
      1 / HEIGHT
    );

    for (const path of paths) {
      const z = Maf.map(0, LINES - 1, 3, -1.1, i);
      const points = path.map((p) => {
        const r = sphericalToCartesian(5, p.y * Math.PI, p.x * 2 * Math.PI);
        const pp = new Vector3(r.x, r.y, r.z).normalize().multiplyScalar(z);
        return pp;
      });

      const l = path.length / 50;

      const material = new MeshLineMaterial({
        map,
        useMap: true,
        color: gradient.getAt(i / LINES),
        lineWidth: 0.005 * Maf.randomInRange(lineWidth[0], lineWidth[1]),
        opacity: Maf.randomInRange(opacity[0], opacity[1]),
        uvOffset: new Vector2(Maf.randomInRange(0, 1), 0),
      });

      var g = new MeshLine();
      g.setPoints(points, function (p) {
        return Maf.parabola(p, 1);
      });

      var mesh = new Mesh(g.geometry, material);
      mesh.g = g;

      mesh.rotateOnAxis(rotDir, (i * 0.1) / LINES);
      if (abort.aborted) {
        return;
      }
      group.add(mesh);

      meshes.push({
        mesh,
        offset: Maf.randomInRange(-1, 1),
        speed: Maf.randomInRange(1, 2),
      });
    }
  }
}

group.scale.setScalar(0.06);
scene.add(group);

let abortController = new AbortController();

effectRAF(() => {
  console.log("effectRAF2");
  abortController.abort();
  clearScene();
  abortController = new AbortController();
  generateIsoLines(abortController.signal);
});

function clearScene() {
  for (const mesh of meshes) {
    mesh.mesh.geometry.dispose();
    mesh.mesh.material.dispose();
    group.remove(mesh.mesh);
  }
  for (const el of group.children) {
    group.remove(el);
  }
  meshes.length = 0;
}

function randomize() {
  params.seed.set(performance.now());
  console.log(params.seed());
}

function randomizeParams() {
  params.lines.set(Maf.intRandomInRange(10, 200));
  params.scale.set(Maf.randomInRange(0.5, 2));
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
  const o = 0.5;
  params.opacity.set([o, 1]);
  const v = 0.7;
  params.lineWidth.set([v, Maf.randomInRange(v, 1)]);
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
    m.mesh.material.uniforms.uvOffset.value.x = -(time * m.speed + m.offset);
  });

  group.rotation.y = time * Maf.TAU;

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

const index = 24;
export { index, start, stop, draw, randomize, deserialize, canvas };
