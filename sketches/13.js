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
import { signal, effectRAF } from "../modules/reactive.js";
import { sphericalToCartesian } from "../modules/conversions.js";
import { march } from "../modules/raymarch.js";

import GUI from "../modules/gui.js";

const defaults = {
  lines: 400,
  segments: 200,
  sphubeFactor: 0.85,
  lineSpread: 0,
  lineWidth: [0.1, 0.4],
  seed: 6340.200000000186,
  opacity: [0.6, 0.9],
  brush: "brush4",
  palette: "florian",
};

const params = {
  lines: signal(defaults.lines),
  segments: signal(defaults.segments),
  sphubeFactor: signal(defaults.sphubeFactor),
  lineSpread: signal(defaults.lineSpread),
  lineWidth: signal(defaults.lineWidth),
  seed: signal(defaults.seed),
  brush: signal(defaults.brush),
  opacity: signal(defaults.opacity),
  palette: signal(defaults.palette),
};

const gui = new GUI(
  "Sphube (3d squircle)",
  document.querySelector("#gui-container")
);
gui.addLabel("Tracing lines over a sphube.");
gui.addSlider("Segments per line", params.segments, 50, 500, 1);
gui.addSlider("Lines", params.lines, 1, 600, 1);
gui.addSlider("Sphube factor", params.sphubeFactor, 0, 1, 0.01);
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
controls.enableDamping = true;
controls.addEventListener("change", () => {
  painted.invalidate();
});
painted.backgroundColor.set(new Color(0xf6f2e9));

camera.position
  .set(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808)
  .multiplyScalar(0.5);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const meshes = [];

function calculateSphubeR(x, y, z, p) {
  if (p <= 0.0001) {
    return Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  }

  const exponent = 2 / p;
  const sum =
    Math.pow(Math.abs(x), exponent) +
    Math.pow(Math.abs(y), exponent) +
    Math.pow(Math.abs(z), exponent);

  return Math.pow(sum, p / 2);
}

// theta: 0-tau - phi: 0-pi
function getSphubePoint(R, theta, phi, s) {
  const p = 1 - s;

  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const tx = cosTheta * sinPhi;
  const ty = sinTheta * sinPhi;
  const tz = cosPhi;

  const x = R * Math.sign(tx) * Math.pow(Math.abs(tx), p);
  const y = R * Math.sign(ty) * Math.pow(Math.abs(ty), p);
  const z = R * Math.sign(tz) * Math.pow(Math.abs(tz), p);

  return { x, y, z };
}

function getEvenPhi(i, N, p) {
  const u = i / (N - 1);
  const zTarget = 1 - 2 * u;
  const cosPhi = Math.sign(zTarget) * Math.pow(Math.abs(zTarget), 1 / p);
  return Math.acos(cosPhi);
}

// https://arxiv.org/pdf/1604.02174v2/1000

class SphubeSDF {
  constructor() {
    this._v1 = new Vector3();
    this._v2 = new Vector3();
    this._grad = new Vector3();
  }

  sdBox(p, size) {
    const qx = Math.abs(p.x) - size;
    const qy = Math.abs(p.y) - size;
    const qz = Math.abs(p.z) - size;

    const outerX = Math.max(qx, 0);
    const outerY = Math.max(qy, 0);
    const outerZ = Math.max(qz, 0);
    const outerDist = Math.sqrt(
      outerX * outerX + outerY * outerY + outerZ * outerZ
    );

    const innerDist = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
    return outerDist + innerDist;
  }

  evaluate(p, r, s) {
    const bounds = this.sdBox(p, r);
    if (bounds > 0.2) return bounds;

    const r2 = r * r;
    const r4 = r2 * r2;
    const s2 = s * s;
    const s4 = s2 * s2;

    const x2 = p.x * p.x;
    const y2 = p.y * p.y;
    const z2 = p.z * p.z;

    const potential =
      x2 +
      y2 +
      z2 -
      (s2 / r2) * (x2 * y2 + y2 * z2 + z2 * x2) +
      (s4 / r4) * (x2 * y2 * z2) -
      r2;

    this._grad.set(
      2 * p.x * (1 - (s2 / r2) * (y2 + z2) + (s4 / r4) * (y2 * z2)),
      2 * p.y * (1 - (s2 / r2) * (x2 + z2) + (s4 / r4) * (x2 * z2)),
      2 * p.z * (1 - (s2 / r2) * (x2 + y2) + (s4 / r4) * (x2 * y2))
    );

    const eps = 1;
    const gLen = Math.sqrt(this._grad.lengthSq() + eps);

    const dist = potential / gLen;

    return Math.max(dist, bounds);
  }
}

const sphube = new SphubeSDF();
const up = new Vector3(0, 1, 0);

async function generateShape(abort) {
  Math.seedrandom(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  const map = brushes[params.brush()];
  const POINTS = params.segments();
  const LINES = params.lines();
  const lineSpread = params.lineSpread() / 10;
  const opacity = params.opacity();
  const lineWidth = params.lineWidth();
  const sphubeFactor = params.sphubeFactor();

  const axis = new Vector3(
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1)
  ).normalize();

  const rot = new Matrix4().makeRotationAxis(
    axis,
    Maf.randomInRange(0, 2 * Math.PI)
  );

  for (let j = 0; j < LINES; j++) {
    if (abort.aborted) {
      return;
    }
    if (j % 10 === 0) {
      await wait();
    }
    painted.invalidate();

    const slice = Maf.map(0, LINES - 1, -1, 1, j);
    // const phi = getEvenPhi(j, LINES - 1, 0.9 - sphubeFactor);
    const phi = Maf.map(0, LINES - 1, 0, Math.PI, j);
    const vertices = [];
    const offset = Maf.randomInRange(-1, 0);
    const ro = new Vector3();
    const rd = new Vector3();

    const spread = new Vector3(
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread),
      0
    ).applyMatrix4(rot);

    for (let i = 0; i < POINTS; i++) {
      const theta = Maf.map(0, POINTS - 1, 0, Maf.TAU, i);
      const { x, y, z } = sphericalToCartesian(1, phi, theta);

      ro.set(x, y, z).multiplyScalar(100).applyMatrix4(rot);
      rd.set(0, 0, 0).sub(ro).normalize();
      const d = march(ro, rd, (p) => sphube.evaluate(p, 1, sphubeFactor));
      rd.multiplyScalar(d).add(ro).add(spread);

      vertices.push(rd.x, rd.y, rd.z);
    }

    let length = 0;
    const a = new Vector3();
    const b = new Vector3();
    for (let i = 0; i < vertices.length - 3; i += 3) {
      a.set(vertices[i], vertices[i + 1], vertices[i + 2]);
      b.set(vertices[i + 3], vertices[i + 4], vertices[i + 5]);
      length += a.distanceTo(b);
    }
    const repeat = Math.round(length * 1.1);

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
  params.sphubeFactor.set(Maf.randomInRange(0.01, 0.99));
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

const index = 13;
export { index, start, stop, draw, randomize, deserialize, canvas };
