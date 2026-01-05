import { Scene, Mesh, Group, Vector3, Matrix4, Color, Vector2 } from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  wait,
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

const surfaces = [
  {
    id: "enneper",
    name: "Enneper surface",
    fn: (u, v, tmp) =>
      ennerperSurface(u, v, tmp, params.enneperN(), params.enneperRange()),
  },
  {
    id: "klein",
    name: 'Klein bottle ("Figure-8" Immersion)',
    fn: (u, v, tmp) => kleinBottle(u, v, tmp, params.kleinRadius()),
  },
  {
    id: "boys",
    name: "Boy's Surface (Bryant-Kusner Parametrization)",
    fn: (u, v, tmp) => boysSurface(u, v, tmp),
  },
];
const surfaceOptions = surfaces.map((s) => [s.id, s.name]);

const defaults = {
  lines: 100,
  segments: 200,
  surface: "enneper",
  enneperN: 2,
  enneperRange: 1.25,
  kleinRadius: 3,
  lineSpread: 0,
  lineWidth: [0.1, 0.4],
  repeatFactor: 0.1,
  seed: 6340.200000000186,
  opacity: [0.6, 0.9],
  brush: "brush4",
  palette: "florian",
};

const params = {
  lines: signal(defaults.lines),
  segments: signal(defaults.segments),
  surface: signal(defaults.surface),
  enneperN: signal(defaults.enneperN),
  enneperRange: signal(defaults.enneperRange),
  kleinRadius: signal(defaults.kleinRadius),
  lineSpread: signal(defaults.lineSpread),
  lineWidth: signal(defaults.lineWidth),
  repeatFactor: signal(defaults.repeatFactor),
  seed: signal(defaults.seed),
  brush: signal(defaults.brush),
  opacity: signal(defaults.opacity),
  palette: signal(defaults.palette),
};

const gui = new GUI(
  "Minimal and Non-Orientable surfaces",
  document.querySelector("#gui-container")
);
gui.addLabel("Tracing lines over different surfaces.");
gui.addSlider("Segments per line", params.segments, 200, 500, 1);
gui.addSlider("Lines", params.lines, 1, 600, 1);
gui.addSelect("Surface", surfaceOptions, params.surface);
gui.addSlider(
  "Enneper order",
  params.enneperN,
  1,
  4,
  1,
  undefined,
  computed(() => params.surface() !== "enneper")
);
gui.addSlider(
  "Enneper range",
  params.enneperRange,
  0,
  4,
  0.01,
  undefined,
  computed(() => params.surface() !== "enneper")
);
gui.addSlider(
  "Klein bottle radius",
  params.kleinRadius,
  1,
  3,
  0.01,
  undefined,
  computed(() => params.surface() !== "klein")
);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);
gui.addSlider("Repeat factor", params.repeatFactor, 0.1, 2, 0.01);

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
  .multiplyScalar(0.7);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const meshes = [];

function ennerperSurface(u, v, target, n = 2, range = 2) {
  const r = u * range;
  const theta = v * Math.PI * 2;

  const r2n1 = Math.pow(r, 2 * n + 1);
  const rn1 = Math.pow(r, n + 1);

  const x =
    r * Math.cos(theta) - (r2n1 / (2 * n + 1)) * Math.cos((2 * n + 1) * theta);

  const y =
    -r * Math.sin(theta) - (r2n1 / (2 * n + 1)) * Math.sin((2 * n + 1) * theta);

  const z_height = ((2 * rn1) / (n + 1)) * Math.cos((n + 1) * theta);

  target.set(x, z_height, y);
}

function diniSurface(u, v, target) {
  const U = u * 2 * Maf.TAU;
  const V = v * 2 + 0.01;

  const a = 1;
  const b = 0.2;

  const x = a * Math.cos(U) * Math.sin(V);
  const z = a * Math.sin(U) * Math.sin(V);
  const y = a * (Math.cos(V) + Math.log(Math.tan(V / 2))) + b * U;

  target.set(x, y, z).multiplyScalar(0.5);
}

function kleinBottle(u, v, target, r = 3) {
  const U = u * Maf.TAU;
  const V = v * Maf.TAU;

  const x =
    (r + Math.cos(U / 2) * Math.sin(V) - Math.sin(U / 2) * Math.sin(2 * V)) *
    Math.cos(U);
  const z =
    (r + Math.cos(U / 2) * Math.sin(V) - Math.sin(U / 2) * Math.sin(2 * V)) *
    Math.sin(U);
  const y = Math.sin(U / 2) * Math.sin(V) + Math.cos(U / 2) * Math.sin(2 * V);

  target.set(x, (y * (r + 1)) / 2, z).multiplyScalar(1 / r);
}

function helicoid(u, v, target) {
  const U = (u - 0.5) * 2;
  const V = (v - 0.5) * 2 * Maf.TAU;

  const x = U * Math.cos(V);
  const z = U * Math.sin(V);
  const y = V;

  target.set(x, y, z);
}

function boysSurface(u, v, target) {
  const r = u <= 0 ? 0.0001 : u;
  const theta = v * Maf.TAU;

  const pow = (n) => {
    const rn = Math.pow(r, n);
    const ang = n * theta;
    return { re: rn * Math.cos(ang), im: rn * Math.sin(ang) };
  };

  const w1 = pow(1);
  const w3 = pow(3);
  const w4 = pow(4);
  const w5 = pow(5);
  const w6 = pow(6);

  const sqrt5 = Math.sqrt(5);
  const D = {
    re: w6.re + sqrt5 * w3.re - 1,
    im: w6.im + sqrt5 * w3.im,
  };

  const div = (A, B) => {
    const denom = B.re * B.re + B.im * B.im;
    if (denom < 1e-9) return { re: 0, im: 0, isInf: true };
    return {
      re: (A.re * B.re + A.im * B.im) / denom,
      im: (A.im * B.re - A.re * B.im) / denom,
      isInf: false,
    };
  };

  const N1 = { re: w1.re - w5.re, im: w1.im - w5.im };
  const N2 = { re: w1.re + w5.re, im: w1.im + w5.im };
  const N3 = { re: 1 + w6.re, im: w6.im };

  const Q1 = div(N1, D);
  const Q2 = div(N2, D);
  const Q3 = div(N3, D);

  if (Q1.isInf || Q2.isInf || Q3.isInf) {
    target.set(0, 0, 0);
    return;
  }

  const g1 = -1.5 * Q1.im;
  const g2 = -1.5 * Q2.re;
  const g3 = Q3.im - 0.5;

  const mag2 = g1 * g1 + g2 * g2 + g3 * g3;

  target.set(g1, g2, g3).multiplyScalar(1 / mag2);
  target.z += 0.8;
}

async function generateShape(abort) {
  Math.seedrandom(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  const map = brushes[params.brush()];
  const POINTS = params.segments();
  const LINES = params.lines();
  const lineSpread = params.lineSpread() / 10;
  const opacity = params.opacity();
  const lineWidth = params.lineWidth();
  const surface = params.surface();
  const surfaceFn = surfaces.find((s) => s.id === surface).fn;
  const repeatFactor = params.repeatFactor();

  const axis = new Vector3(
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1)
  ).normalize();

  const tmp = new Vector3();

  for (let j = 0; j < LINES; j++) {
    if (abort.aborted) {
      return;
    }
    if (j % 10 === 0) {
      await wait();
    }
    painted.invalidate();

    const u = Maf.map(0, LINES - 1, 0, 1, j);
    const vertices = [];
    const offset = Maf.randomInRange(-1, 0);

    for (let i = 0; i < POINTS; i++) {
      const v = Maf.map(0, POINTS - 1, 0, 1, i);
      surfaceFn(u, v, tmp);
      vertices.push(tmp.x, tmp.y, tmp.z);
    }

    let length = 0;
    const a = new Vector3();
    const b = new Vector3();
    for (let i = 0; i < vertices.length - 3; i += 3) {
      a.set(vertices[i], vertices[i + 1], vertices[i + 2]);
      b.set(vertices[i + 3], vertices[i + 4], vertices[i + 5]);
      length += a.distanceTo(b);
    }
    const repeat = Math.ceil(repeatFactor * length);

    var g = new MeshLine();
    g.setPoints(vertices);

    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(Maf.map(0, LINES - 1, 0, 1, j)),
      lineWidth: Maf.randomInRange(lineWidth[0], lineWidth[1]) / 100,
      repeat: new Vector2(repeat, 1),
      dashArray: new Vector2(1, Maf.intRandomInRange(1, repeat - 1)),
      useDash: true,
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    var mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    const spread = new Vector3(
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread)
    );
    mesh.position.copy(spread);

    if (abort.aborted) {
      return;
    }
    group.add(mesh);

    const speed = Math.round(Maf.randomInRange(1, 3));
    meshes.push({ mesh, offset, speed });
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
  generateShape(abortController.signal);
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
  params.lines.set(Maf.intRandomInRange(50, 500));
  // params.segments.set(Maf.intRandomInRange(200, 500));
  params.enneperN.set(Maf.intRandomInRange(1, 4));
  params.enneperRange.set(Maf.randomInRange(1, 2));
  params.kleinRadius.set(Maf.randomInRange(1, 3));
  params.lineSpread.set(Maf.randomInRange(0, 1));
  const v = 0.1;
  params.lineWidth.set([v, Maf.randomInRange(v, 0.9)]);
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
  const o = 0.5;
  params.opacity.set([o, Maf.randomInRange(o, 1)]);
  params.repeatFactor.set(Maf.randomInRange(0.1, 2));
  params.surface.set(Maf.randomElement(surfaces).id);
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
    m.mesh.material.uniforms.uvOffset.value.x = -(time + m.offset);
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

const index = 21;
export { index, start, stop, draw, randomize, deserialize, canvas };
