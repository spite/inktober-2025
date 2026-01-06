import {
  Scene,
  Mesh,
  Group,
  Vector2,
  Vector3,
  TextureLoader,
  Color,
  RepeatWrapping,
} from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  brushes,
  brushOptions,
  addInfo,
  wait,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import { MarchingSquares } from "../modules/marching-squares.js";
import perlin from "../third_party/perlin.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { signal, effectRAF } from "../modules/reactive.js";

import GUI from "../modules/gui.js";

const defaults = {
  lines: 100,
  scale: 150,
  octaves: 2,
  lacunarity: 0,
  gain: 1,
  depthRange: 0.1,
  lineWidth: [0.9, 1],
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "autumnIntoWinter",
  seed: 13373,
};

const params = {
  lines: signal(defaults.lines),
  scale: signal(defaults.scale),
  octaves: signal(defaults.octaves),
  lacunarity: signal(defaults.lacunarity),
  gain: signal(defaults.gain),
  depthRange: signal(defaults.depthRange),
  lineWidth: signal(defaults.lineWidth),
  opacity: signal(defaults.opacity),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI("Isolines", document.querySelector("#gui-container"));
gui.addLabel("Lines generated following isolines on a FBM heightmap.");
gui.addSlider("Lines", params.lines, 1, 200, 1);
gui.addSlider("Scale", params.scale, 100, 500, 0.01);
// gui.addSlider("Octaves", params.octaves, 1, 4, 1);
// gui.addSlider("Lacunarity", params.lacunarity, 0, 10, 0.01);
// gui.addSlider("Gain", params.gain, 0, 10, 0.1);
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

camera.position.set(2.5, 3, 2.5).multiplyScalar(0.3);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

function fbm(x, y, scale, octaves, lacunarity, gain) {
  scale = scale || 1;
  octaves = octaves || 1;
  lacunarity = lacunarity || 2;
  gain = gain || 0.5;

  var total = 0;
  var amplitude = 1;
  var frequency = 1;

  for (var i = 0; i < octaves; i++) {
    var v =
      perlin.simplex2((x / scale) * frequency, (y / scale) * frequency) *
      amplitude;
    total = total + v;
    frequency = frequency * lacunarity;
    amplitude = amplitude * gain;
  }

  return total;
}

function pattern(x, y, scale, octaves, lacunarity, gain) {
  var q = [
    fbm(x, y, scale, octaves, lacunarity, gain),
    fbm(x + 5.2, y + 1.3, scale, octaves, lacunarity, gain),
  ];

  return fbm(
    x + 80.0 * q[0],
    y + 80.0 * q[1],
    scale,
    octaves,
    lacunarity,
    gain
  );
}

const meshes = [];

const SCALE = 1;
const WIDTH = 200 / SCALE;
const HEIGHT = 200 / SCALE;
const center = new Vector3(0.5 * WIDTH, 0, 0.5 * HEIGHT);

async function generateIsoLines(abort) {
  Math.seedrandom(params.seed());

  const LINES = params.lines();

  const gradient = new gradientLinear(getPalette(params.palette()));
  const map = brushes[params.brush()];
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();
  const s = params.scale();

  const values = [];
  const offset = Maf.randomInRange(-WIDTH, WIDTH);
  for (let y = 0; y < HEIGHT; y++) {
    values[y] = [];
    for (let x = 0; x < WIDTH; x++) {
      values[y][x] = pattern(
        x * SCALE + offset,
        y * SCALE + offset,
        s,
        params.octaves(),
        params.lacunarity(),
        params.gain()
      );
    }
  }

  for (let i = 0; i < LINES; i++) {
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
      WIDTH,
      HEIGHT
    );

    for (const path of paths) {
      const z = (i * 5000) / LINES / SCALE;
      const points = path.map((p) =>
        new Vector3(p.x, z * 2, p.y)
          .multiplyScalar(1 / WIDTH)
          .sub(center)
          .multiplyScalar(0.05)
      );

      const l = Math.round(Maf.randomInRange(1, path.length / 20));

      const material = new MeshLineMaterial({
        map,
        useMap: true,
        color: gradient.getAt(i / LINES),
        lineWidth: Maf.randomInRange(lineWidth[0], lineWidth[1]) / 100,
        opacity: Maf.randomInRange(opacity[0], opacity[1]),
        repeat: new Vector2(l, 1),
        dashArray: new Vector2(1, 2),
        useDash: true,
        dashOffset: Maf.randomInRange(-l, l),
      });

      var g = new MeshLine();
      g.setPoints(points, function (p) {
        return Maf.parabola(p, 1);
      });

      var mesh = new Mesh(g.geometry, material);
      mesh.g = g;

      mesh.rotation.y = (i * 0.1) / LINES;

      if (abort.aborted) {
        return;
      }
      group.add(mesh);

      meshes.push({ mesh, offset: 0, speed: 0 });
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
  params.lines.set(Maf.intRandomInRange(50, 200));
  params.scale.set(Maf.randomInRange(150, 300));
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

const index = 22;
export { index, start, stop, draw, randomize, deserialize, canvas };
