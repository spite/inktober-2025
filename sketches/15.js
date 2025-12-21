import { Scene, Mesh, Group, Vector2, Vector3, Color } from "three";
import {
  renderer,
  wait,
  getCamera,
  isRunning,
  onResize,
  brushes,
  brushOptions,
  addInfo,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { pointsOnSphere } from "../modules/points-sphere.js";
import { Painted } from "../modules/painted.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { curl, generateNoiseFunction } from "../modules/curl.js";
import {
  march,
  sdRoundBox,
  sdRoundedCylinder,
  sdSphere,
} from "../modules/raymarch.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const defaults = {
  lines: 1000,
  segments: 100,
  sdf: "rounded_cylinder",
  noiseScale: 0.98,
  lineSpread: 0,
  lineWidth: [0.1, 0.8],
  seed: 14539.200000017881,
  opacity: [0.5, 1],
  brush: "brush5",
  palette: "basic",
};

const params = {
  lines: signal(defaults.lines),
  segments: signal(defaults.segments),
  sdf: signal(defaults.sdf),
  noiseScale: signal(defaults.noiseScale),
  lineSpread: signal(defaults.lineSpread),
  lineWidth: signal(defaults.lineWidth),
  seed: signal(defaults.seed),
  brush: signal(defaults.brush),
  opacity: signal(defaults.opacity),
  palette: signal(defaults.palette),
};

const sdfs = {
  sphere: { name: "Sphere", map: (p) => sdSphere(p, 0.6) },
  rounded_box: {
    name: "Rounded box",
    map: (p) => sdRoundBox(p, new Vector3(0.4, 0.4, 0.4), 0.1),
  },
  rounded_cylinder: {
    name: "Rounded cylinder",
    map: (p) => sdRoundedCylinder(p, 0.6, 0.1, 0.25),
  },
};
const sdfOptions = Object.keys(sdfs).map((k) => [k, sdfs[k].name]);

const gui = new GUI(
  "Curl over SDFs II",
  document.querySelector("#gui-container")
);
gui.addLabel(
  "Tracing lines folling a curl noise field on the surface of basic signed distance fields."
);
gui.addSlider("Segments per line", params.segments, 50, 250, 1);
gui.addSlider("Lines", params.lines, 1, 1000, 1);
gui.addSelect("SDF", sdfOptions, params.sdf);
gui.addSlider("Noise scale", params.noiseScale, 0.5, 1.5, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.01);
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

camera.position
  .set(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808)
  .multiplyScalar(2);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

function map(p) {
  let d = sdfs[params.sdf()].map(p);
  return d;
}
const meshes = [];

async function generateShape(abort) {
  Math.seedrandom(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));
  const func = generateNoiseFunction();

  const center = new Vector3(0, 0, 0);
  const LINES = params.lines();
  const POINTS = params.segments();
  const brush = brushes[params.brush()];
  const lineSpread = params.lineSpread() / 10;
  const opacity = params.opacity();
  const lineWidth = params.lineWidth();
  const noiseScale = params.noiseScale();
  const points = pointsOnSphere(LINES);

  for (let j = 0; j < LINES; j++) {
    if (abort.aborted) {
      return;
    }
    if (j % 10 === 0) {
      await wait();
    }
    painted.invalidate();
    const offset = Maf.randomInRange(-1, 0);
    const vertices = [];
    const r = 2;
    let p = new Vector3(
      Maf.randomInRange(-r, r),
      Maf.randomInRange(-r, r),
      Maf.randomInRange(-r, r)
    );
    p.copy(points[j]);
    const tmp = p.clone().multiplyScalar(1);

    for (let i = 0; i < POINTS; i++) {
      const res = curl(
        tmp.multiplyScalar(noiseScale * (1 + (0.5 * j) / LINES)),
        func
      );
      res.normalize().multiplyScalar(0.02);
      p.sub(res);

      const ro = p
        .clone()
        .normalize()
        .sub(center)
        .normalize()
        .multiplyScalar(1);

      const rd = ro.clone().sub(center).normalize().multiplyScalar(-1);

      const d = march(ro, rd, map);
      const intersects = rd.multiplyScalar(d).add(ro);

      p.copy(intersects).multiplyScalar(1 - (0.2 * j) / LINES);
      tmp.copy(p);
      vertices[i * 3] = p.x;
      vertices[i * 3 + 1] = p.y;
      vertices[i * 3 + 2] = p.z;
    }

    let length = 0;
    const a = new Vector3();
    const b = new Vector3();
    for (let i = 0; i < vertices.length - 3; i += 3) {
      a.set(vertices[i], vertices[i + 1], vertices[i + 2]);
      b.set(vertices[i + 3], vertices[i + 4], vertices[i + 5]);
      length += a.distanceTo(b);
    }
    const repeat = Math.ceil(Maf.randomInRange(length, length * 15));

    var g = new MeshLine();
    g.setPoints(vertices, (p) => Maf.parabola(p, 0.5));

    const material = new MeshLineMaterial({
      map: brush,
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth: Maf.randomInRange(lineWidth[0], lineWidth[1]) / 100,
      repeat: new Vector2(Math.ceil(Maf.randomInRange(length, length * 10)), 1),
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
      dashArray: new Vector2(1, repeat - 1),
      useDash: true,
      dashOffset: 0,
    });

    var mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    const spread = new Vector3(
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread)
    );
    mesh.position.copy(spread);

    group.add(mesh);

    mesh.scale.setScalar(5);
    const speed = 1 * Math.round(Maf.randomInRange(1, 3));
    meshes.push({ mesh, offset, speed });
  }
}
group.scale.setScalar(0.08);
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

const index = 15;
export { index, start, stop, draw, randomize, deserialize, canvas };
