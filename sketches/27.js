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
  wait,
  brushes,
  brushOptions,
  addInfo,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import { pointsOnSphere } from "../modules/points-sphere.js";
import perlin from "../third_party/perlin.js";
import { Grid } from "../modules/grid-3d.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const defaults = {
  segments: 100,
  scale: 0.075,
  density: 1,
  twistiness: 3,
  delay: 1,
  lineWidth: [0.8, 1],
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "autumnIntoWinter",
  seed: 13373,
};

const params = {
  segments: signal(defaults.segments),
  scale: signal(defaults.scale),
  density: signal(defaults.density),
  twistiness: signal(defaults.twistiness),
  delay: signal(defaults.delay),
  lineWidth: signal(defaults.lineWidth),
  opacity: signal(defaults.opacity),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI(
  "Flow field lines II",
  document.querySelector("#gui-container")
);
gui.addLabel(
  "Lines following a flow field of perlin noise on the surface of a sphere."
);
gui.addSlider("Max segments", params.segments, 10, 500, 1);
gui.addSlider("Noise scale", params.scale, 0.01, 0.5, 0.01);
gui.addSlider("Line density", params.density, 0.2, 1, 0.01);
gui.addSlider("Line twistiness", params.twistiness, 0.01, 5, 0.01);
gui.addSlider("Growth delay", params.delay, 0, 1, 0.01);
gui.addRangeSlider("Line width", params.lineWidth, 0.1, 1, 0.01);
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
controls.screenSpacePanning = true;
controls.addEventListener("change", () => {
  painted.invalidate();
});
painted.backgroundColor.set(new Color(0xf6f2e9));

camera.position.set(0, 0, 0.5);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const RADIUS = 8;

const offset = new Vector3(
  Maf.randomInRange(-100, 100),
  Maf.randomInRange(-100, 100),
  Maf.randomInRange(-100, 100)
);

function pattern1(x, y, z, scale = 1) {
  return perlin.simplex3(
    x * scale + offset.x,
    y * scale + offset.y,
    z * scale + offset.z
  );
}

const meshes = [];
const grid = new Grid(1);

const minDistance = 0.1;
const minDistanceSquared = minDistance ** 2;

function intersects(p, line) {
  const neighbours = grid.getNeighbours(p, 1);
  if (neighbours.length) {
    for (let neighbour of neighbours) {
      if (neighbour.line !== line) {
        const pp = neighbour.point;
        const dx = pp.x - p.x;
        const dy = pp.y - p.y;
        const dz = pp.z - p.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < minDistanceSquared) {
          return true;
        }
      }
    }
  }
  return false;
}

async function generateFlowLines(abort) {
  Math.seedrandom(params.seed());

  grid.reset();

  const SEGMENTS = params.segments();
  const delay = params.delay() * 100;
  const twistiness = params.twistiness();
  const map = brushes[params.brush()];
  const gradient = new gradientLinear(getPalette(params.palette()));
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();

  const points = pointsOnSphere(params.density() * 3000, RADIUS);
  const lines = [];

  points.sort((a, b) => Math.random() > 0.5);
  for (let i = 0; i < points.length; i++) {
    if (i % 1000 === 0) {
      await wait();
      painted.invalidate();
    }
    lines[i] = {
      active: true,
      points: [],
      offset: Maf.randomInRange(-Math.PI, Math.PI) / 100,
      delay: Math.round(Maf.randomInRange(0, delay)),
      segment: 0,
    };
  }

  await wait();
  painted.invalidate();

  const o = new Vector3();
  const n = new Vector3();
  const tan = new Vector3();
  const up = new Vector3(0, 1, 0);
  const offset = new Vector3(
    Maf.randomInRange(-100, 100),
    Maf.randomInRange(-100, 100),
    Maf.randomInRange(-100, 100)
  );
  const scale = params.scale();

  let p = 0;
  while (lines.some((l) => l.active === true)) {
    if (abort.aborted) {
      return;
    }

    for (let i = 0; i < points.length; i++) {
      p++;

      if (p % 1000 === 0) {
        await wait();
        painted.invalidate();
      }
      if (abort.aborted) {
        return;
      }

      const segment = lines[i].segment - lines[i].delay;
      lines[i].segment++;

      if (segment === 0) {
        let skip = true;
        const pp = points[i];
        if (!intersects(pp, i)) {
          lines[i].points[0] = pp;
          grid.add(pp, { point: pp, line: i });
          skip = false;

          continue;
        }
        if (skip) {
          lines[i].active = false;
        }
      }

      if (segment > 0) {
        if (segment > SEGMENTS) {
          lines[i].active = false;
        }

        if (lines[i].active) {
          o.copy(lines[i].points[lines[i].points.length - 1]);
          const p = pattern1(
            scale * o.x + offset.x,
            scale * o.y + offset.y,
            scale * o.z + offset.z,
            1
          );
          const a = lines[i].offset + p * twistiness;
          n.copy(o).normalize();
          tan.crossVectors(up, n);
          tan.applyAxisAngle(n, a);
          tan.normalize().multiplyScalar(0.2);

          const t = o.clone().add(tan).normalize().multiplyScalar(RADIUS);

          if (lines[i].active) {
            if (!intersects(t, i)) {
              grid.add(t, { point: t, line: i });
            } else {
              lines[i].active = false;
            }
          }

          lines[i].points.push(t);
        }
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (i % 40 === 0) {
      await wait();
      painted.invalidate();
    }
    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(i / lines.length),
      lineWidth: 0.00125 * Maf.randomInRange(lineWidth[0], lineWidth[1]),
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    const vertices = [];
    for (const p of lines[i].points) {
      vertices.push(p.x);
      vertices.push(p.y);
      vertices.push(p.z);
    }
    var g = new MeshLine();
    g.setPoints(vertices);

    var mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    if (abort.aborted) {
      return;
    }
    group.add(mesh);

    meshes.push({ mesh, offset: 0, speed: 0 });
  }
}

group.scale.setScalar(0.01);
scene.add(group);

let abortController = new AbortController();

effectRAF(() => {
  console.log("effectRAF2");
  abortController.abort();
  clearScene();
  abortController = new AbortController();
  generateFlowLines(abortController.signal);
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
  params.scale.set(Maf.randomInRange(0.01, 0.3));
  params.density.set(Maf.randomInRange(0.2, 1));
  params.twistiness.set(Maf.randomInRange(0.1, 5));
  params.delay.set(Maf.randomInRange(0.1, 1));
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
  const o = 0.5;
  params.opacity.set([o, 1]);
  const v = 0.7;
  params.lineWidth.set([v, Maf.randomInRange(v, 1)]);
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

const index = 27;
export { index, start, stop, draw, randomize, deserialize, canvas };
