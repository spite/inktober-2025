import { Scene, Mesh, Group, Vector2, Vector3, Color, Matrix4 } from "three";
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
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const defaults = {
  lines: 300,
  spheres: 30,
  scaleRange: [0.2, 0.4],
  tilt: 0.01,
  lineWidth: [0.8, 1],
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "autumnIntoWinter",
  seed: 13373,
};

const params = {
  lines: signal(defaults.lines),
  spheres: signal(defaults.spheres),
  scaleRange: signal(defaults.scaleRange),
  tilt: signal(defaults.tilt),
  lineWidth: signal(defaults.lineWidth),
  opacity: signal(defaults.opacity),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI("Metaballs", document.querySelector("#gui-container"));
gui.addLabel("Lines generated following isolines defined by metaballs.");
gui.addSlider("Lines", params.lines, 10, 500, 1);
gui.addSlider("Spheres", params.spheres, 1, 50, 1);
gui.addRangeSlider("Sphere scale range", params.scaleRange, 0.1, 0.5, 0.01);
gui.addSlider("Tilt", params.tilt, 0, 0.05, 0.01);
gui.addRangeSlider("Line width", params.lineWidth, 0.1, 1, 0.01);
gui.addSeparator();
gui.addSelect("Brush", brushOptions, params.brush);
gui.addSelect("Palette", paletteOptions, params.palette);
gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01);

gui.addSeparator();
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);

addInfo(gui);

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
controls.addEventListener("change", () => {
  painted.invalidate();
});
painted.backgroundColor.set(new Color(0xf6f2e9));

camera.position.set(0, 0, 0.5);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

function blend(v) {
  const k = 9.5;
  const sum = v.reduce((ac, v) => ac + Math.exp(-k * v), 0);
  return -Math.log(sum) / k;
}

function sdSphere(p, r) {
  return p.length() - r;
}

const spheres = [];
const tmp = new Vector3();

function generateSpheres() {
  spheres.length = 0;
  const scaleRange = params.scaleRange();
  for (let i = 0; i < params.spheres(); i++) {
    const s = 0.75;
    const radius = Maf.randomInRange(scaleRange[0], scaleRange[1]);
    const center = new Vector3(
      Maf.randomInRange(-s, s),
      Maf.randomInRange(-s, s),
      Maf.randomInRange(-s, s)
    );
    spheres.push({ center, radius });
  }
}

function generateBlob(p, offset) {
  const res = [];
  for (const sphere of spheres) {
    const c = sphere.center;
    tmp.copy(p).sub(c);
    res.push(sdSphere(tmp, sphere.radius + offset));
  }

  const d = blend(res);
  return d;
}

function blobMap(offset) {
  return (p) => {
    return generateBlob(p, offset);
  };
}

const meshes = [];

const RADIUS = 1.5;
const WIDTH = 200;
const DEPTH = 200;

async function generateLines(abort) {
  Math.seedrandom(params.seed());

  const LAYERS = params.lines();
  const tilt = params.tilt();

  const gradient = new gradientLinear(getPalette(params.palette()));
  const map = brushes[params.brush()];
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();

  generateSpheres();

  const axis = new Vector3(
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1)
  ).normalize();

  const rot = new Matrix4().makeRotationAxis(
    axis,
    Maf.randomInRange(0, 2 * Math.PI)
  );

  const spread = 0.01;

  for (let k = 0; k < LAYERS; k++) {
    if (abort.aborted) {
      return;
    }
    await wait();
    painted.invalidate();

    const fn = blobMap(Maf.randomInRange(-spread, spread));
    const y = Maf.map(0, LAYERS - 1, -RADIUS, RADIUS, k);

    const axis2 = new Vector3(
      Maf.randomInRange(-1, 1),
      Maf.randomInRange(-1, 1),
      Maf.randomInRange(-1, 1)
    ).normalize();

    const rot2 = new Matrix4().makeRotationAxis(
      axis2,
      Maf.randomInRange(-tilt * Math.PI, tilt * Math.PI)
    );

    const p = new Vector3();
    const values = [];
    for (let z = 0; z < DEPTH; z++) {
      values[z] = [];
      for (let x = 0; x < WIDTH; x++) {
        p.set(
          Maf.map(0, WIDTH, -RADIUS, RADIUS, x),
          y,
          Maf.map(0, DEPTH, -RADIUS, RADIUS, z)
        );
        p.applyMatrix4(rot).applyMatrix4(rot2);
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
      if (abort.aborted) {
        return;
      }
      await wait();
      painted.invalidate();

      const repeat = Math.round(
        Maf.randomInRange(1, Math.round(line.length / 20))
      );

      const material = new MeshLineMaterial({
        map,
        useMap: true,
        color: gradient.getAt(
          Maf.map(0, LAYERS - 1, 0, 1, k) + Maf.randomInRange(-0.05, 0.05)
        ),
        lineWidth: Maf.randomInRange(lineWidth[0], lineWidth[1]) * 0.0025,
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
        new Vector3(2 * RADIUS * (p.x - 0.5), y, 2 * RADIUS * (p.y - 0.5))
          .applyMatrix4(rot)
          .applyMatrix4(rot2)
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
  params.lines.set(Maf.intRandomInRange(100, 300));
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
  const o = 0.5;
  params.opacity.set([o, 1]);
  const v = 0.7;
  params.lineWidth.set([v, Maf.randomInRange(v, 1)]);
  const s = Maf.randomInRange(0.1, 0.3);
  params.scaleRange.set([s, Maf.randomInRange(s, 0.5)]);
  params.tilt.set(Maf.randomInRange(0, 0.02));
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
    }
    painted.invalidate();
  }

  group.rotation.x = 0.9 * time * Maf.TAU;
  group.rotation.y = 2 * time * Maf.TAU;
  group.rotation.z = 1.1 * time * Maf.TAU;

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

const index = 30;
export { index, start, stop, draw, randomize, params, defaults, canvas };
