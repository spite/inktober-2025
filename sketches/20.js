import {
  Scene,
  Mesh,
  Group,
  Vector3,
  Color,
  MeshBasicMaterial,
  BufferGeometry,
} from "three";
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
import { paletteOptions, getPalette } from "../modules/palettes.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from "../third_party/bvh.js";
import { MeshSurfaceSampler } from "../third_party/MeshSurfaceSampler.js";
import { init } from "../modules/dipoles-3d.js";
import {
  loadSuzanne,
  loadStanfordBunny,
  loadDodecahedron,
  loadIcosahedron,
} from "../modules/models.js";
import GUI from "../modules/gui.js";
import { signal, effectRAF } from "../modules/reactive.js";

// Add the extension functions
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

const geometries = [
  { id: "suzanne", name: "Suzanne", loader: loadSuzanne, scale: 1 },
  { id: "bunny", name: "Stanford Bunny", loader: loadStanfordBunny, scale: 14 },
  {
    id: "icosahedron",
    name: "Icosahedron",
    loader: loadIcosahedron,
    scale: 0.8,
  },
  {
    id: "dodecahedron",
    name: "Dodecahedron",
    loader: loadDodecahedron,
    scale: 1,
  },
];
await Promise.all(
  geometries.map(async (g) => {
    return new Promise(async (resolve, reject) => {
      const geometry = await g.loader();
      geometry.scale(g.scale, g.scale, g.scale);
      geometry.computeBoundsTree();
      const mesh = new Mesh(
        geometry,
        new MeshBasicMaterial({ color: 0xf6f2e9 })
      );
      const sampler = new MeshSurfaceSampler(mesh).build();
      g.geometry = geometry;
      g.sampler = sampler;
      resolve();
    });
  })
);

const geometryOptions = geometries.map((g) => [g.id, g.name]);

const defaults = {
  lines: 2000,
  charges: 20,
  segments: 20,
  geometry: "suzanne",
  chargeRange: 0.01,
  depthRange: 0.1,
  lineWidth: [0.1, 0.9],
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "basic",
  seed: 13373,
};

const params = {
  lines: signal(defaults.lines),
  segments: signal(defaults.segments),
  geometry: signal(defaults.geometry),
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
  "Electric fields III",
  document.querySelector("#gui-container")
);
gui.addLabel(
  "Lines generated following an electric field over the surface of SDFs generated from models."
);
gui.addSlider("Lines", params.lines, 1, 2000, 1);
gui.addSlider("Segments", params.segments, 10, 200, 1);
gui.addSelect("Geometry", geometryOptions, params.geometry);
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

camera.position.set(
  -0.38997204674241887,
  -0.1646326072361011,
  0.3548472598819808
);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const meshes = [];

async function generateShape(abort) {
  Math.seedrandom(params.seed());

  const N = params.segments();
  const LINES = params.lines();

  const position = new Vector3();
  const geometry = geometries.find((g) => g.id === params.geometry());
  const sampler = geometry.sampler;

  const charges = init(params.charges(), 1, 1, 1, 1);
  charges.charges.forEach((p, i) => {
    sampler.sample(position);
    p.x = position.x;
    p.y = position.y;
    p.z = position.z;
    p.charge = Maf.randomInRange(-100, 100);
  });

  const points = [];
  for (let i = 0; i < LINES; i++) {
    sampler.sample(position);
    points.push(position.clone());
  }

  const lineWidth = params.lineWidth();
  const opacity = params.opacity();

  const geo = new Float32Array(N * 3);

  const map = brushes[params.brush()];
  const gradient = new gradientLinear(getPalette(params.palette()));

  for (let j = 0; j < LINES; j++) {
    if (abort.aborted) {
      return;
    }
    if (j % 10 === 0) {
      await wait();
    }
    painted.invalidate();

    var g = new MeshLine();
    g.setPoints(geo);

    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth: (0.02 * Maf.randomInRange(lineWidth[0], lineWidth[1])) / 4,
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    var mesh = new Mesh(g.geometry, material);
    mesh.geo = geo;
    mesh.g = g;

    if (abort.aborted) {
      return;
    }
    group.add(mesh);

    const offset = Maf.randomInRange(-1, 0);
    const vertices = new Float32Array(N * 3);
    const r = 0.1;

    let p = points[j].clone();
    const s = 0.02;
    const t = new Vector3();
    const tmp = p.clone();
    for (let i = 0; i < N; i++) {
      const dir = charges.calcDirection(tmp.x, tmp.y, tmp.z);
      t.set(dir.x, dir.y, dir.z).normalize().multiplyScalar(s);

      p.add(t);

      geometry.geometry.boundsTree.closestPointToPoint(p, tmp);

      p.copy(tmp.point);
      tmp.copy(p);
      vertices[i * 3] = p.x;
      vertices[i * 3 + 1] = p.y;
      vertices[i * 3 + 2] = p.z;
    }
    mesh.material.uniforms.dashArray.value.set(
      1,
      Math.round(Maf.randomInRange(1, 2))
    );
    mesh.g.setPoints(vertices, (p) => Maf.parabola(p, 0.5));
    const speed = 1 * Math.round(Maf.randomInRange(1, 3));
    meshes.push({ mesh, offset, speed });
  }
}

group.scale.set(0.1, 0.1, 0.1);
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
  params.geometry.set(Maf.randomElement(geometryOptions)[0]);
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

const index = 20;
export { index, start, stop, draw, randomize, params, defaults, canvas };
