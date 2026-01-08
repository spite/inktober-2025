import { Scene, Mesh, Group, Vector2, Vector3, Color, Matrix4 } from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  brushes,
  brushOptions,
  addInfo,
} from "../modules/three.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import { signal, effectRAF, computed } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const defaults = {
  lines: 200,
  segments: 200,
  loops: 5,
  radius: 5,
  radiusSpread: 0.5,
  lineRepeat: [10, 50],
  lineSpread: 0.2,
  lineWidth: [0.1, 0.9],
  seed: 1337,
  opacity: [0.5, 1],
  brush: "brush4",
  palette: "basic",
};

const params = {
  lines: signal(defaults.lines),
  segments: signal(defaults.segments),
  loops: signal(defaults.loops),
  radius: signal(defaults.radius),
  radiusSpread: signal(defaults.radiusSpread),
  lineRepeat: signal(defaults.lineRepeat),
  lineSpread: signal(defaults.lineSpread),
  lineWidth: signal(defaults.lineWidth),
  seed: signal(defaults.seed),
  brush: signal(defaults.brush),
  opacity: signal(defaults.opacity),
  palette: signal(defaults.palette),
};

const gui = new GUI(
  "Torus at heart I",
  document.querySelector("#gui-container")
);
gui.addLabel("Tracing lines following a general toroidal shape.");
gui.addSlider("Segments per line", params.segments, 100, 300, 1);
gui.addSlider("Loops", params.loops, 1, 10, 1);
gui.addSlider("Lines", params.lines, 1, 400, 1);
gui.addSlider("Radius", params.radius, 1, 10, 0.1);
gui.addSlider("Radius spread", params.radiusSpread, 0, 1, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
gui.addRangeSlider("Line repeat range", params.lineRepeat, 1, 80, 1);
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

camera.position.set(35, 15, -35).multiplyScalar(0.075);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const meshes = [];

function generateShape() {
  Math.seedrandom(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  const LINES = params.lines();
  const POINTS = params.segments();
  const RSEGS = POINTS / params.loops();
  for (let j = 0; j < LINES; j++) {
    const offset = Maf.randomInRange(0, 1);
    const vertices = [];
    const mat = new Matrix4();
    const r1 =
      (Maf.randomInRange(1, 1 + 0.5 * params.radiusSpread()) *
        params.radius()) /
      5;
    const r2 =
      (Maf.randomInRange(0.35, 0.35 + 0.8 * params.radiusSpread()) *
        params.radius()) /
      5;
    const offAngle = Maf.randomInRange(0, 0.1 * Maf.TAU);
    for (let i = 0; i < POINTS; i++) {
      const segment = i / RSEGS;
      const ringAngle = (i * Maf.TAU) / RSEGS;
      const segAngle = (segment * Maf.TAU) / (POINTS / RSEGS);
      const p = new Vector3(
        r1 * Math.cos(segAngle),
        0,
        r1 * Math.sin(segAngle)
      );
      const d = new Vector3(
        r2 * Math.cos(ringAngle),
        r2 * Math.sin(ringAngle),
        0
      );
      mat.makeRotationY(-segAngle + offAngle);
      d.applyMatrix4(mat);
      p.add(d);
      vertices.push(p);
    }
    vertices.push(vertices[0].clone());

    const g = new MeshLine();
    g.setPoints(vertices, function (p) {
      return p;
    });

    const repeat = Math.round(
      Maf.map(
        0,
        1,
        params.lineRepeat()[0],
        params.lineRepeat()[1],
        Math.random()
      )
    );

    const material = new MeshLineMaterial({
      map: brushes[params.brush()],
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth:
        Maf.randomInRange(params.lineWidth()[0], params.lineWidth()[1]) / 10,
      opacity: Maf.randomInRange(params.opacity()[0], params.opacity()[1]),
      repeat: new Vector2(repeat, 1),
    });

    const mesh = new Mesh(g.geometry, material);
    group.add(mesh);
    mesh.g = g;

    const spread = params.lineSpread();
    mesh.position.set(
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread),
      Maf.randomInRange(-spread, spread)
    );

    //   mesh.material.uniforms.dashArray.value.set(Maf.randomInRange(0.5, 0.5), 2);
    mesh.g.setPoints(vertices);
    mesh.scale.setScalar(5);
    const speed = 1; // Math.floor(Maf.randomInRange(1, 4));
    meshes.push({ mesh, offset, speed });
  }
  painted.invalidate();
}

group.scale.setScalar(0.1);
scene.add(group);

effectRAF(() => {
  console.log("effectRAF2");
  clearScene();
  generateShape();
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
  params.lines.set(Maf.intRandomInRange(100, 400));
  params.loops.set(Maf.intRandomInRange(1, 10));
  // params.segments.set(Maf.intRandomInRange(200, 500));
  params.radius.set(Maf.randomInRange(4, 6));
  params.radiusSpread.set(Maf.randomInRange(0, 1));
  params.lineSpread.set(Maf.randomInRange(0, 1));
  const r = Maf.intRandomInRange(10, 30);
  params.lineRepeat.set([r, Maf.randomInRange(30, 50)]);
  const v = 0.1;
  params.lineWidth.set([v, Maf.randomInRange(v, 0.9)]);
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
  const o = Maf.randomInRange(0.1, 1);
  params.opacity.set([o, Maf.randomInRange(o, 1)]);
}

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  const t = performance.now();
  controls.update();

  if (isRunning) {
    time += (t - lastTime) / 10000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.dashOffset.value = -1 * time - m.offset;
    m.mesh.material.uniforms.uvOffset.value.x = m.offset + time * m.speed;
  });

  group.rotation.y = time * Maf.TAU;
  group.rotation.z = (time * Maf.TAU) / 16;

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

const index = 6;
export { index, start, stop, draw, randomize, deserialize, canvas };
