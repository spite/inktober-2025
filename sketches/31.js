import {
  Scene,
  Mesh,
  Group,
  Vector2,
  Vector3,
  Color,
  Matrix4,
  BoxGeometry,
  BufferGeometry,
  Line,
  MeshBasicMaterial,
  LineBasicMaterial,
  MeshNormalMaterial,
  ArrowHelper,
} from "three";
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
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";
import { Circle } from "../modules/circle.js";

const defaults = {
  lines: 100,
  radius: [0.5, 1],
  branchFrequency: 80,
  branchAngle: 180,
  lineWidth: [0.8, 1],
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "florian",
  seed: 13373,
};

const params = {
  lines: signal(defaults.lines),
  radius: signal(defaults.radius),
  branchFrequency: signal(defaults.branchFrequency),
  branchAngle: signal(defaults.branchAngle),
  lineWidth: signal(defaults.lineWidth),
  opacity: signal(defaults.opacity),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI(
  "Lines on a sphere",
  document.querySelector("#gui-container")
);
gui.addLabel(
  "Lines generated following circles on a sphere, stopping at interesctions."
);
gui.addSlider("Initial lines", params.lines, 10, 500, 1);
gui.addRangeSlider("Radius range", params.radius, 0.1, 1, 0.01);
gui.addSlider("Branching", params.branchFrequency, 0, 90, 1);
gui.addSlider("Angle", params.branchAngle, 0, 180, 1);
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

camera.position.set(0, 0, 0.4);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const meshes = [];

let id = 0;
function uuid() {
  id++;
  return id;
}

const getRandomPointOnSphere = () => {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);

  const x = Math.sin(phi) * Math.cos(theta);
  const y = Math.sin(phi) * Math.sin(theta);
  const z = Math.cos(phi);

  return new Vector3(x, y, z);
};

const generateCircleAtPoint = (point) => {
  const minRadius = params.radius()[0];
  const maxRadius = params.radius()[0];

  const r = minRadius + Math.random() * (maxRadius - minRadius);
  const d = Math.sqrt(Math.max(0, 1 - r * r));

  const temp = getRandomPointOnSphere();
  const T = new Vector3().crossVectors(temp, point).normalize();
  const B = new Vector3().crossVectors(point, T).normalize();

  const signD = Math.random() > 0.5 ? 1 : -1;
  const signR = Math.random() > 0.5 ? 1 : -1;

  const normal = new Vector3()
    .copy(point)
    .multiplyScalar(d * signD)
    .add(B.multiplyScalar(r * signR))
    .normalize();

  const center = normal.clone().multiplyScalar(normal.dot(point));
  const radius = Math.sqrt(Math.max(0, 1 - center.lengthSq()));

  return { normal, center, radius };
};

const circles = [];

async function generateLines(abort) {
  Math.seedrandom(params.seed());

  const LAYERS = params.lines();

  const gradient = new gradientLinear(getPalette(params.palette()));
  const map = brushes[params.brush()];
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();

  const radius = params.radius();
  const branchFrequency = params.branchFrequency();
  const branchAngle = params.branchAngle();

  circles.length = 0;

  for (let k = 0; k < LAYERS; k++) {
    if (abort.aborted) {
      return;
    }
    if (k % 100 === 0) {
      await wait();
      painted.invalidate();
    }

    const point = getRandomPointOnSphere();

    const { normal, center, radius } = generateCircleAtPoint(point);

    const u = new Vector3().subVectors(point, center).normalize();
    const v = new Vector3().crossVectors(normal, u).normalize();

    const colors = [
      "#ef4444",
      "#f97316",
      "#f59e0b",
      "#84cc16",
      "#10b981",
      "#06b6d4",
      "#3b82f6",
      "#8b5cf6",
      "#d946ef",
      "#f43f5e",
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const newCircle = new Circle(
      {
        id: uuid(),
        center,
        radius,
        normal,
        u,
        v,
        color: new Color(0xff00ff),
        generation: 0,
        parentId: null,
      },
      params.branchFrequency()
    );

    circles.push(newCircle);
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
  circles.length = 0;
  for (const mesh of meshes) {
    mesh.mesh.geometry.dispose();
    mesh.mesh.material.dispose();
    group.remove(mesh.mesh);
  }
  while (group.children.length) {
    group.remove(group.children[0]);
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
  params.lines.set(Maf.intRandomInRange(10, 300));
  params.radius.set([Maf.randomInRange(0.1, 0.5), Maf.randomInRange(0.5, 1)]);
  params.branchFrequency.set(Maf.randomInRange(10, 70));
  params.branchAngle.set(Maf.randomInRange(10, 180));
}

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  controls.update();
  const t = performance.now();

  const radius = params.radius();
  const branchAngle = params.branchAngle();

  for (let circle of circles) {
    if (!circle.done()) {
      painted.invalidate();
    }
    circle.update(
      0.01,
      1,
      params.branchFrequency(),
      branchAngle,
      radius[0],
      radius[1],
      circles,
      (p, f) => {
        const circle = new Circle({ id: uuid(), ...p }, f);
        circles.push(circle);
      }
    );
    if (circle.done() && !circle.rendered) {
      const gradient = new gradientLinear(getPalette(params.palette()));
      const map = brushes[params.brush()];
      const lineWidth = params.lineWidth();
      const opacity = params.opacity();
      circle.generatePoints();
      const points = circle.points;

      const material = new MeshLineMaterial({
        map,
        useMap: true,
        color: gradient.getAt(Maf.randomInRange(0, 1)),
        lineWidth: Maf.randomInRange(lineWidth[0], lineWidth[1]) * 0.0025,
        opacity: Maf.randomInRange(opacity[0], opacity[1]),
      });

      const g = new MeshLine();
      g.setPoints(points);

      var mesh = new Mesh(g.geometry, material);
      mesh.g = g;

      // if (abort.aborted) {
      //   return;
      // }
      group.add(mesh);

      meshes.push({
        mesh,
        offset: Maf.randomInRange(-1, 0, 10),
        speed: Maf.randomInRange(0.7, 1.3),
      });
    }
    // circle.render();
  }

  if (isRunning) {
    time += (t - lastTime) / 20000;
    for (const m of meshes) {
      // m.mesh.material.uniforms.uvOffset.value.x = m.offset - time * m.speed;
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
  controls.enabled = true;
  gui.show();
  painted.invalidate();
}

function stop() {
  controls.enabled = false;
  gui.hide();
}

const index = 31;
export { index, start, stop, draw, randomize, params, defaults, canvas };
