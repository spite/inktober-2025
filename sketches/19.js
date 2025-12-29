import { Scene, Mesh, Group, Vector3, Color } from "three";
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
import { paletteOptions, getPalette } from "../modules/palettes.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import { pointsOnSphere } from "../modules/points-sphere.js";
import { init } from "../modules/dipoles-3d.js";
import GUI from "../modules/gui.js";
import { signal, effectRAF } from "../modules/reactive.js";

const defaults = {
  lines: 2000,
  charges: 50,
  segments: 100,
  chargeRange: 0.01,
  depthRange: 0.1,
  lineWidth: [0.66, 0.9],
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "basic",
  seed: 13373,
};

const params = {
  lines: signal(defaults.lines),
  segments: signal(defaults.segments),
  charges: signal(defaults.charges),
  chargeRange: signal(defaults.chargeRange),
  depthRange: signal(defaults.depthRange),
  lineWidth: signal(defaults.lineWidth),
  opacity: signal(defaults.opacity),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI(
  "Electric fields II",
  document.querySelector("#gui-container")
);
gui.addLabel(
  "Lines generated following an electric field over the surface of a sphere."
);
gui.addSlider("Lines", params.lines, 1, 2000, 1);
gui.addSlider("Segments", params.segments, 10, 200, 1);
gui.addSlider("Charges", params.charges, 2, 50, 1);
gui.addSlider("Depth range", params.depthRange, 0, 0.2, 0.01);
// gui.addSlider("Charge range", params.chargeRange, 0.01, 10, 0.01);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);

gui.addSeparator();
gui.addSelect("Brush", brushOptions, params.brush);
gui.addSelect("Palette", paletteOptions, params.palette);
gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01);

gui.addSeparator();
gui.addButton("Randomize params", randomizeParams);
gui.addButton("Reset params", reset);

addInfo(gui);

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
  .multiplyScalar(2);
// camera.position.set(3, 3, 3);
camera.lookAt(group.position);
renderer.setClearColor(0xf8fcfe, 1);

const meshes = [];

async function generateLines(abort) {
  Math.seedrandom(params.seed());

  const LINES = params.lines();
  const POINTS = params.segments(); // 100; //Math.round(Maf.randomInRange(50, 100));

  const WIDTH = 1;
  const HEIGHT = 1;
  const DEPTH = 1;
  const points = pointsOnSphere(LINES);
  const chargePoints = pointsOnSphere(params.charges());
  const charges = init(
    params.charges(),
    WIDTH,
    HEIGHT,
    DEPTH,
    params.chargeRange()
  );
  const tmp = new Vector3();
  charges.charges.forEach((p, i) => {
    const pc = chargePoints[i];
    tmp.set(pc.x, pc.y, pc.z);
    tmp.normalize();
    p.x = tmp.x;
    p.y = tmp.y;
    p.z = tmp.z;
  });
  const depthRange = params.depthRange();

  const lineWidth = params.lineWidth();
  const opacity = params.opacity();

  const map = brushes[params.brush()];
  const gradient = new gradientLinear(getPalette(params.palette()));

  const v = new Vector3();
  for (let i = 0; i < points.length; i++) {
    if (abort.aborted) {
      return;
    }
    if (i % 10 === 0) {
      await wait();
    }
    painted.invalidate();

    const pt = points[i];
    v.set(pt.x, pt.y, pt.z).normalize();
    const y = v.y;

    const geo = new Float32Array(POINTS * 3);
    let ptr = 0;
    const s = 0.01;

    for (let j = 0; j < POINTS; j++) {
      const dir = charges.calcDirection(v.x, v.y, v.z);
      tmp.set(dir.x, dir.y, dir.z).multiplyScalar(s);
      v.add(tmp);
      v.normalize();

      v.multiplyScalar(1 + (j * depthRange) / POINTS);
      geo[ptr] = v.x;
      geo[ptr + 1] = v.y;
      geo[ptr + 2] = v.z;

      ptr += 3;
    }

    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(Maf.map(-1, 1, 0, 1, y)),
      lineWidth: (0.05 / 4) * Maf.randomInRange(lineWidth[0], lineWidth[1]),
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
      // wireframe: true,
    });

    var g = new MeshLine();
    g.setPoints(geo, (p) => Maf.parabola(p, 0.4));

    var mesh = new Mesh(g.geometry, material);
    mesh.geo = geo;
    mesh.g = g;

    meshes.push({
      mesh,
      offset: Maf.randomInRange(-100, 100),
      speed: Maf.randomInRange(1, 2),
    });

    if (abort.aborted) {
      return;
    }
    group.add(mesh);
  }
}
group.scale.set(0.25, 0.25, 0.25);
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
  meshes.length = 0;
}

function randomize() {
  params.seed.set(performance.now());
}

function randomizeParams() {
  console.log("randomize");
  params.charges.set(Maf.intRandomInRange(2, 50));
  params.chargeRange.set(Maf.randomInRange(0.01, 10));
  const l = Maf.randomInRange(0.1, 0.9);
  params.lineWidth.set(Maf.randomInRange(l, 1));
  const v = Maf.randomInRange(0.5, 0.9);
  params.lineWidth.set([v, Maf.randomInRange(v, 1)]);
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
  const o = Maf.randomInRange(0.5, 0.9);
  params.opacity.set([o, Maf.randomInRange(0.9, 1)]);
  params.depthRange.set(Maf.randomInRange(0.1, 0.2));
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
    m.mesh.material.uniforms.uvOffset.value.x = -(
      time * 10 * m.speed +
      m.offset
    );
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

const index = 19;
export { index, start, stop, draw, randomize, canvas };
