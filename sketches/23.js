import {
  Scene,
  Mesh,
  Group,
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
import { sphericalToCartesian } from "../modules/conversions.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const defaults = {
  lines: 10,
  scale: 2,
  depthRange: 0.1,
  opacity: [0.8, 1],
  brush: "brush3",
  palette: "clayForest",
  seed: 13373,
};

const params = {
  lines: signal(defaults.lines),
  scale: signal(defaults.scale),
  depthRange: signal(defaults.depthRange),
  opacity: signal(defaults.opacity),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI("Isolines II", document.querySelector("#gui-container"));
gui.addLabel("Lines generated following isolines an a spherical perlin noise.");
gui.addSlider("Lines", params.lines, 1, 20, 1);
gui.addSlider("Scale", params.scale, 0.5, 2.5, 0.01);

gui.addSeparator();
gui.addSelect("Brush", brushOptions, params.brush);
gui.addSelect("Palette", paletteOptions, params.palette);
gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01);

gui.addSeparator();
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);

addInfo(gui);

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
controls.screenSpacePanning = true;
controls.addEventListener("change", () => {
  painted.invalidate();
});
painted.backgroundColor.set(new Color(0xf6f2e9));

camera.position.set(
  -0.38997204674241887,
  -0.1646326072361011,
  0.3548472598819808
);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const SCALE = 1;
const WIDTH = 300 / SCALE;
const HEIGHT = 300 / SCALE;

function generate() {
  const offset = Maf.randomInRange(-10000, 10000);
  return (x, y, z, scale = 1) =>
    perlin.simplex3(x * scale + offset, y * scale + offset, z * scale + offset);
}

const meshes = [];
const latSteps = WIDTH;
const lonSteps = HEIGHT;

async function generateIsoLines(abort) {
  Math.seedrandom(params.seed());

  const LINES = params.lines();
  const noiseScale = params.scale();

  const gradient = new gradientLinear(getPalette(params.palette()));
  const map = brushes[params.brush()];
  const opacity = params.opacity();

  const values = [];

  const pattern = generate();

  for (let i = 0; i <= lonSteps; i++) {
    values[i] = [];
    const phi = (i / lonSteps) * Math.PI * 2;

    for (let j = 0; j <= latSteps; j++) {
      const theta = (j / latSteps) * Math.PI;

      const n = sphericalToCartesian(1, theta, phi);

      const noiseVal = pattern(n.x, n.y, n.z, noiseScale);

      values[i][j] = noiseVal;
    }
  }

  for (let i = 0; i < LINES; i++) {
    if (abort.aborted) {
      return;
    }

    const paths = MarchingSquares.generateIsolines(
      values,
      -0.9 + (1.8 * i) / LINES,
      1 / WIDTH,
      1 / HEIGHT
    );

    for (const path of paths) {
      await wait();
      painted.invalidate();
      const z = Maf.map(0, LINES - 1, 1.8, 2, i);
      let avg = 0;
      const points = path.map((p) => {
        const r = sphericalToCartesian(5, p.y * Math.PI, p.x * 2 * Math.PI);
        const pp = new Vector3(r.x, r.y, r.z).normalize().multiplyScalar(z);
        avg += pp.y;
        return pp;
      });
      avg /= points.length;

      const c = Maf.map(-2, 2, 0, 1, avg);

      const material = new MeshLineMaterial({
        map,
        useMap: true,
        color: 0xffffff,
        sizeAttenuation: true,
        lineWidth: 1 * Maf.map(0, LINES - 1, 0.0006, 0.0002, i),
        opacity: 1,
      });

      var g = new MeshLine();
      g.setPoints(points, (p) => Maf.parabola(p, 0.4));

      var mesh = new Mesh(g.geometry, material);
      mesh.g = g;

      if (abort.aborted) {
        return;
      }
      group.add(mesh);

      meshes.push({
        mesh,
        offset: Maf.randomInRange(-1, 1),
        speed: Maf.randomInRange(1, 2),
      });

      const material2 = new MeshLineMaterial({
        map,
        useMap: true,
        color: gradient.getAt(c),
        sizeAttenuation: true,
        lineWidth: Maf.map(0, LINES - 1, 0.006, 0.002, i),
        opacity: Maf.randomInRange(opacity[0], opacity[1]),
      });

      for (const p of points) {
        const l = p.length();
        p.normalize().multiplyScalar(l - 0.05);
      }
      var g2 = new MeshLine();
      g2.setPoints(points, (p) => Maf.parabola(p, 0.4));

      var mesh2 = new Mesh(g2.geometry, material2);

      group.add(mesh2);

      meshes.push({
        mesh: mesh2,
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
  params.lines.set(Maf.intRandomInRange(10, 20));
  params.scale.set(Maf.randomInRange(0.5, 2));
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
  const o = 0.5;
  params.opacity.set([o, 1]);
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
    m.mesh.material.uniforms.uvOffset.value.x = time * 10 * m.speed + m.offset;
  });

  group.rotation.y = time * Maf.TAU;

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

const index = 23;
export { index, start, stop, draw, randomize, params, defaults, canvas };
