import {
  Scene,
  Mesh,
  Group,
  Vector2,
  Vector3,
  Color,
  Matrix4,
  MeshNormalMaterial,
  BoxGeometry,
} from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  waitForRender,
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
import { pointsOnSphere } from "../modules/points-sphere.js";
import { MarchingSquares } from "../modules/marching-squares.js";
import { superShape3D, presets } from "../modules/supershape.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const params1 = presets[3].a;
const params2 = presets[3].b;

const defaults = {
  lines: 200,
  aa: params1.a,
  ab: params1.b,
  am: params1.m,
  an1: params1.n1,
  an2: params1.n2,
  an3: params1.n3,
  ba: params2.a,
  bb: params2.b,
  bm: params2.m,
  bn1: params2.n1,
  bn2: params2.n2,
  bn3: params2.n3,
  round: false,
  lineWidth: [0.4, 0.5],
  repeatFactor: 10,
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "autumnIntoWinter",
  seed: 13373,
};

const params = {
  lines: signal(defaults.lines),
  aa: signal(defaults.aa),
  ab: signal(defaults.ab),
  am: signal(defaults.am),
  an1: signal(defaults.an1),
  an2: signal(defaults.an2),
  an3: signal(defaults.an3),
  ba: signal(defaults.ba),
  bb: signal(defaults.bb),
  bm: signal(defaults.bm),
  bn1: signal(defaults.bn1),
  bn2: signal(defaults.bn2),
  bn3: signal(defaults.bn3),
  round: signal(defaults.round),
  lineWidth: signal(defaults.lineWidth),
  repeatFactor: signal(defaults.repeatFactor),
  opacity: signal(defaults.opacity),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI("Isolines IV", document.querySelector("#gui-container"));
gui.addLabel("Lines generated following the surface of a supershape.");
gui.addSlider("Lines", params.lines, 10, 300, 1);
gui.addLabel("Shape 1");
gui.addSlider("A", params.aa, 0.5, 2.5, 0.01);
gui.addSlider("B", params.ab, 0.5, 2.5, 0.01);
gui.addSlider("M", params.am, 0, 20, 0.01);
gui.addSlider("N1", params.an1, -50, 50, 0.01);
gui.addSlider("N2", params.an2, -50, 50, 0.01);
gui.addSlider("N3", params.an3, -50, 50, 0.01);
gui.addLabel("Shape 2");
gui.addSlider("A", params.ba, 0.5, 2.5, 0.01);
gui.addSlider("B", params.bb, 0.5, 2.5, 0.01);
gui.addSlider("M", params.bm, 0, 20, 0.01);
gui.addSlider("N1", params.bn1, -50, 50, 0.01);
gui.addSlider("N2", params.bn2, -50, 50, 0.01);
gui.addSlider("N3", params.bn3, -50, 50, 0.01);
gui.addCheckbox("Round", params.round);

gui.addRangeSlider("Line width", params.lineWidth, 0.1, 1, 0.01);
gui.addSlider("Repeat factor", params.repeatFactor, 10, 40, 1);
gui.addSeparator();
gui.addSelect("Brush", brushOptions, params.brush);
gui.addSelect("Palette", paletteOptions, params.palette);
gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01);

gui.addSeparator();
gui.addLabel(
  "Some random combinations might not produce an output. Keep trying."
);
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

const painted = new Painted();

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const group = new Group();
const controls = new OrbitControls(camera, canvas);
controls.screenSpacePanning = true;
controls.addEventListener("change", () => {
  painted.invalidate();
});
painted.backgroundColor.set(new Color(0xf6f2e9));

camera.position.set(1, 1, 1).multiplyScalar(0.5);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

function randomParams() {
  const p = {
    a: 1,
    b: 1,
    m: Maf.randomInRange(0, 20),
    n1: Maf.randomInRange(0.5, 50),
    n2: Maf.randomInRange(0.5, 50),
    n3: Maf.randomInRange(0.5, 50),
  };

  // if (p.n1 === 0) p.n1 = 0.25;
  // if (p.n2 === 0) p.n2 = 0.25;
  // if (p.n3 === 0) p.n3 = 0.25;

  p.n1 *= Math.random() > 0.5 ? 1 : -1;
  p.n2 *= Math.random() > 0.5 ? 1 : -1;
  p.n3 *= Math.random() > 0.5 ? 1 : -1;
  return p;
}

function roundParams(p) {
  if (params.round()) {
    p.m = Math.round(p.m);
    p.n1 = Math.round(p.n1 * 1) / 1;
    p.n2 = Math.round(p.n2 * 1) / 1;
    p.n3 = Math.round(p.n3 * 1) / 1;
  }
  // if (p.n1 === 0) p.n1 = 0.25;
  // if (p.n2 === 0) p.n2 = 0.25;
  // if (p.n3 === 0) p.n3 = 0.25;

  return p;
}

function map(offset) {
  const params1 = roundParams({
    a: params.aa(),
    b: params.ab(),
    m: params.am(),
    n1: params.an1(),
    n2: params.an2(),
    n3: params.an3(),
  });
  const params2 = roundParams({
    a: params.ba(),
    b: params.bb(),
    m: params.bm(),
    n1: params.bn1(),
    n2: params.bn2(),
    n3: params.bn3(),
  });
  return (p) => {
    return superShape3D(p, params1, params2, offset);
  };
}

const maxDistance = 1000;
const references = pointsOnSphere(100, maxDistance);
function computeSDFBoundaries(fn) {
  console.log("------");
  let min = maxDistance;
  for (const p of references) {
    const d = fn(p);
    if (
      d !== 0 &&
      d !== maxDistance &&
      d !== Infinity &&
      d !== -Infinity &&
      !isNaN(d)
    ) {
      min = Math.min(d, min);
    }
  }
  console.log(min);
  return maxDistance - min;
}

const meshes = [];

const SIZE = 5;
const WIDTH = 200;
const DEPTH = 200;

const box = new Mesh(
  new BoxGeometry(SIZE, SIZE, SIZE),
  new MeshNormalMaterial({ wireframe: true })
);
group.add(box);

let scale = 1;
let fn;

function generateSuperShape() {
  const spread = 0;
  fn = map(Maf.randomInRange(-spread, spread));
  scale = 1 / (SIZE * computeSDFBoundaries(fn));
}

async function generateLines(abort) {
  Math.seedrandom(params.seed());

  const LAYERS = params.lines();

  const gradient = new gradientLinear(getPalette(params.palette()));
  const map = brushes[params.brush()];
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();
  const repeatFactor = params.repeatFactor();

  const axis = new Vector3(
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1)
  ).normalize();

  const rot = new Matrix4().makeRotationAxis(
    axis,
    Maf.randomInRange(0, 2 * Math.PI)
  );

  console.log(scale);

  for (let k = 0; k < LAYERS; k++) {
    if (abort.aborted) {
      return;
    }
    await wait();
    painted.invalidate();

    const y = Maf.map(0, LAYERS - 1, -0.5 * SIZE, 0.5 * SIZE, k);

    const p = new Vector3();
    const values = [];
    for (let z = 0; z < DEPTH; z++) {
      values[z] = [];
      for (let x = 0; x < WIDTH; x++) {
        p.set(
          Maf.map(0, WIDTH, -0.5 * SIZE, 0.5 * SIZE, x),
          y,
          Maf.map(0, DEPTH, -0.5 * SIZE, 0.5 * SIZE, z)
        );
        p.multiplyScalar(2 * scale).applyMatrix4(rot);
        values[z][x] = fn(p);
      }
    }

    const lines = MarchingSquares.generateIsolines(
      values,
      0,
      1 / WIDTH,
      1 / DEPTH
    );

    for (const line of lines) {
      await wait();
      painted.invalidate();
      const repeat = Math.round(
        Maf.randomInRange(1, Math.round(line.length / repeatFactor))
      );
      const material = new MeshLineMaterial({
        map,
        useMap: true,
        color: gradient.getAt(Maf.map(0, LAYERS - 1, 0, 1, k)),
        lineWidth: 0.005 * Maf.randomInRange(lineWidth[0], lineWidth[1]),
        opacity: Maf.randomInRange(opacity[0], opacity[1]),
        repeat: new Vector2(repeat, 1),
        useDash: true,
        dashArray: new Vector2(
          1,
          Math.round(Maf.randomInRange(1, (repeat - 1) / 10))
        ),
        uvOffset: new Vector2(Maf.randomInRange(0, 1), 0),
      });

      const points = line.map((p) =>
        new Vector3(SIZE * (p.x - 0.5), y, SIZE * (p.y - 0.5)).applyMatrix4(rot)
      );
      var g = new MeshLine();
      g.setPoints(points);

      var mesh = new Mesh(g.geometry, material);
      mesh.g = g;

      if (abort.aborted) {
        return;
      }
      group.add(mesh);

      meshes.push({
        mesh,
        offset: Maf.randomInRange(-10, 10),
        speed: Maf.randomInRange(0.7, 1.3),
      });
    }
  }
}

group.scale.setScalar(0.1);
scene.add(group);

let abortController = new AbortController();

effectRAF(() => {
  console.log("effectRAF2");
  abortController.abort();
  clearScene();
  abortController = new AbortController();
  generateSuperShape();
  generateLines(abortController.signal);
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
  const a = randomParams();
  params.aa.set(a.a);
  params.ab.set(a.b);
  params.am.set(a.m);
  params.an1.set(a.n1);
  params.an2.set(a.n2);
  params.an3.set(a.n3);

  const b = randomParams();
  params.ba.set(b.a);
  params.bb.set(b.b);
  params.bm.set(b.m);
  params.bn1.set(b.n1);
  params.bn2.set(b.n2);
  params.bn3.set(b.n3);

  params.lines.set(Maf.intRandomInRange(100, 200));
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
  const o = 0.5;
  params.opacity.set([o, 1]);
  const v = 0.7;
  params.lineWidth.set([v, Maf.randomInRange(v, 1)]);
  params.repeatFactor.set(Maf.intRandomInRange(10, 40));
}

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  controls.update();
  const t = performance.now();

  if (isRunning) {
    time += (t - lastTime) / 20000;
    for (const m of meshes) {
      m.mesh.material.uniforms.uvOffset.value.x = m.offset - time * m.speed;
      // m.mesh.material.uniforms.dashOffset.value = m.offset - time * m.speed;
    }
    painted.invalidate();
  }

  // group.rotation.x = 0.9 * time * Maf.TAU;
  // group.rotation.y = 2 * time * Maf.TAU;
  // group.rotation.z = 1.1 * time * Maf.TAU;

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

const index = 25;
export { index, start, stop, draw, randomize, deserialize, canvas };
