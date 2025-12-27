import {
  Scene,
  Mesh,
  Group,
  Vector2,
  Vector3,
  Color,
  MeshNormalMaterial,
} from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  wait,
  brushOptions,
  brushes,
  addInfo,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import { pointsOnSphere } from "../modules/points-sphere.js";
import { curl, generateNoiseFunction } from "../modules/curl.js";
import {
  getClosestPoint,
  opRound,
  sdTorus,
  TrefoilSDF,
} from "../modules/raymarch.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";
import { SphubeSDF } from "../modules/sphube.js";
import { MarchingCubesGeometry } from "../third_party/MarchingCubesGeometry.js";
import { MeshSurfaceSampler } from "../third_party/MeshSurfaceSampler.js";

const defaults = {
  lines: 1000,
  segments: 100,
  sdf: "torus",
  noiseScale: 1.1,
  dashFactor: 1.44,
  lineSpread: 0,
  lineWidth: [0.1, 0.9],
  seed: 14539.200000017881,
  opacity: [0.9, 1],
  brush: "brush4",
  palette: "basic",
};

const params = {
  lines: signal(defaults.lines),
  segments: signal(defaults.segments),
  sdf: signal(defaults.sdf),
  dashFactor: signal(defaults.dashFactor),
  noiseScale: signal(defaults.noiseScale),
  lineSpread: signal(defaults.lineSpread),
  lineWidth: signal(defaults.lineWidth),
  seed: signal(defaults.seed),
  brush: signal(defaults.brush),
  opacity: signal(defaults.opacity),
  palette: signal(defaults.palette),
};

const sdfs = {
  torus: {
    name: "Torus",
    map: (p) => {
      const r2 = 0.1;
      const d = sdTorus(p, new Vector3(0.5 - r2, r2, 0));
      return d;
    },
  },
  trefoil: {
    name: "Trefoil knot",
    map: (p) => trefoil.getDistance(p.clone().multiplyScalar(7.5)) / 7.5,
  },
  sphube: {
    name: "Sphube",
    map: (p) => sphube.evaluate(p, 0.45, 0.9),
  },
  gyroid: {
    name: "Gyroid",
    map: (p) => gyroid(p.clone().multiplyScalar(8), 10, 1, 1) / 8,
  },
  die: {
    name: "Die",
    map: (p) => opRound(sdDie(p.clone().multiplyScalar(3)), 0.1) / 3,
  },
};
const sdfOptions = Object.keys(sdfs).map((k) => [k, sdfs[k].name]);

const gui = new GUI(
  "Curl over SDFs IV",
  document.querySelector("#gui-container")
);
gui.addLabel(
  "Tracing lines folling a curl noise field on the surface of signed distance fields."
);
gui.addSlider("Segments per line", params.segments, 50, 250, 1);
gui.addSlider("Lines", params.lines, 1, 1000, 1);
gui.addSelect("SDF", sdfOptions, params.sdf);
gui.addSlider("Noise scale", params.noiseScale, 0.4, 4, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.01);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);
gui.addSlider("Dash factor", params.dashFactor, 0.1, 2, 0.01);
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
  .multiplyScalar(4);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

function gyroid(p, size, thickness, scale) {
  const surfaceSide =
    scale *
    scale *
    (Math.sin(p.x) * Math.cos(p.y) +
      Math.sin(p.y) * Math.cos(p.z) +
      Math.sin(p.z) * Math.cos(p.x));

  const d = Math.abs(surfaceSide) - thickness;

  const absX = Math.abs(p.x);
  const absY = Math.abs(p.y);
  const absZ = Math.abs(p.z);

  const boxDist = Math.max(absX, Math.max(absY, absZ)) - size;

  return Math.max(d, boxDist);
}

function sdDie(p) {
  const qx = Math.abs(p.x) - 1.0;
  const qy = Math.abs(p.y) - 1.0;
  const qz = Math.abs(p.z) - 1.0;

  const mQx = Math.max(qx, 0);
  const mQy = Math.max(qy, 0);
  const mQz = Math.max(qz, 0);

  const distBox = Math.sqrt(mQx * mQx + mQy * mQy + mQz * mQz);

  const lenP = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);

  const distSphere = lenP - 1.35;

  return Math.max(distBox, distSphere);
}

const trefoil = new TrefoilSDF();
const sphube = new SphubeSDF();

function map(p) {
  // const d =
  //   superShape3D(p.clone().multiplyScalar(2.5), presets[0].a, presets[0].b, 0) /
  //   2.5;
  let d = sdfs[params.sdf()].map(p);
  return d;
}

function generateSampler(map) {
  const size = 80;

  const mc = new MarchingCubesGeometry(size);
  mc.reset();
  for (let z = 0; z < size; z++) {
    const cz = (z - 0.5 * size) / size;
    for (let y = 0; y < size; y++) {
      const cy = (y - 0.5 * size) / size;
      for (let x = 0; x < size; x++) {
        const cx = (x - 0.5 * size) / size;
        const p = new Vector3(cx, cy, cz);
        mc.setCell(x, y, z, -map(p));
      }
    }
  }
  mc.invalidated = true;
  mc.build();
  const samplerMesh = new Mesh(mc, new MeshNormalMaterial());
  samplerMesh.geometry.scale(0.5, 0.5, 0.5);
  samplerMesh.geometry.computeBoundingBox();

  return new MeshSurfaceSampler(samplerMesh).build();
}

for (const sdf in sdfs) {
  sdfs[sdf].sampler = generateSampler(sdfs[sdf].map);
}

const meshes = [];

async function generateShape(abort) {
  Math.seedrandom(params.seed());

  const POINTS = params.segments();
  const center = new Vector3(0, 0, 0);
  const LINES = params.lines();
  const points = pointsOnSphere(LINES).sort((a, b) => Math.random() - 0.5);
  const noiseScale = params.noiseScale();
  const sdf = params.sdf();
  const lineSpread = params.lineSpread() / 10;
  const opacity = params.opacity();
  const lineWidth = params.lineWidth();
  const dashFactor = params.dashFactor();

  const gradient = new gradientLinear(getPalette(params.palette()));
  const func = generateNoiseFunction();

  const sampler = sdfs[sdf].sampler;

  for (let j = 0; j < LINES; j++) {
    if (abort.aborted) {
      return;
    }
    if (j % 10 === 0) {
      await wait();
    }
    painted.invalidate();

    const offset = Maf.randomInRange(-1, 0);
    const vertices = new Float32Array(POINTS * 3);
    let p = new Vector3();
    p.copy(points[j]).multiplyScalar(5);
    const s = 10;
    p.set(
      Maf.randomInRange(-s, s),
      Maf.randomInRange(-s, s),
      Maf.randomInRange(-s, s)
    );
    sampler.sample(p);
    const tmp = p.clone();

    for (let i = 0; i < POINTS; i++) {
      const c = getClosestPoint(
        tmp,
        map,
        Maf.map(0, POINTS - 1, 0, 0.05, i),
        1
      );
      tmp.copy(c);

      vertices[i * 3] = tmp.x;
      vertices[i * 3 + 1] = tmp.y;
      vertices[i * 3 + 2] = tmp.z;

      const res = curl(tmp.clone().multiplyScalar(noiseScale), func);
      res.normalize().multiplyScalar(0.01);
      tmp.add(res);
    }

    let length = 0;
    const a = new Vector3();
    const b = new Vector3();
    for (let i = 0; i < vertices.length - 3; i += 3) {
      a.set(vertices[i], vertices[i + 1], vertices[i + 2]);
      b.set(vertices[i + 3], vertices[i + 4], vertices[i + 5]);
      length += a.distanceTo(b);
    }
    length *= dashFactor;

    var g = new MeshLine();

    const material = new MeshLineMaterial({
      map: brushes[params.brush()],
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth: 0.02 * Maf.randomInRange(lineWidth[0], lineWidth[1]),
      repeat: new Vector2(Math.ceil(Maf.randomInRange(length, length * 10)), 1),
      dashArray: new Vector2(
        1,
        Math.ceil(Maf.randomInRange(1 * length, 2 * length))
      ),
      useDash: true,
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    var mesh = new Mesh(g.geometry, material);
    group.add(mesh);

    const spread = new Vector3(
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread)
    );
    mesh.position.copy(spread);

    mesh.g = g;

    g.setPoints(vertices, (p) => Maf.parabola(p, 0.2));
    const speed = 1 * Math.round(Maf.randomInRange(1, 3));
    meshes.push({ mesh, offset, speed });
  }
}

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
  params.sdf.set(Maf.randomElement(sdfOptions)[0]);
  params.lines.set(Maf.intRandomInRange(200, 1000));
  // params.segments.set(Maf.intRandomInRange(200, 500));
  params.noiseScale.set(Maf.randomInRange(0.5, 1.5));
  params.lineSpread.set(Maf.randomInRange(0, 1));

  params.lineWidth.set([
    Maf.randomInRange(0.1, 0.4),
    Maf.randomInRange(0.6, 1),
  ]);
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

const index = 17;
export { index, start, stop, draw, randomize, deserialize, canvas };
