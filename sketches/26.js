import { Scene, Mesh, Group, Vector2, Color } from "three";
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
import perlin from "../third_party/perlin.js";
import { Poisson2D } from "../modules/poisson-2d.js";
import { Grid } from "../modules/grid-2d.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const defaults = {
  segments: 100,
  scale: 0.1,
  density: 0.25,
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
  "Flow field lines I",
  document.querySelector("#gui-container")
);
gui.addLabel("Lines following a flow field of perlin noise.");
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

const SCALE = 1;
const WIDTH = 20 / SCALE;
const HEIGHT = 20 / SCALE;

function fbm(x, y, scale, octaves, lacunarity, gain) {
  scale = scale || 1;
  octaves = octaves || 1;
  lacunarity = lacunarity || 2;
  gain = gain || 0.5;

  var total = 0;
  var amplitude = 1;
  var frequency = 1;

  for (var i = 0; i < octaves; i++) {
    var v =
      perlin.simplex2((x / scale) * frequency, (y / scale) * frequency) *
      amplitude;
    total = total + v;
    frequency = frequency * lacunarity;
    amplitude = amplitude * gain;
  }

  return total;
}

function pattern(x, y, scale, octaves, lacunarity, gain) {
  var q = [
    fbm(x, y, scale, octaves, lacunarity, gain),
    fbm(x + 5.2, y + 1.3, scale, octaves, lacunarity, gain),
  ];

  return fbm(
    x + 80.0 * q[0],
    y + 80.0 * q[1],
    scale,
    octaves,
    lacunarity,
    gain
  );
}

const meshes = [];
const grid = new Grid(1);

const minDistance = 0.25;
const minDistanceSquared = minDistance ** 2;

function intersects(p, line) {
  const neighbours = grid.getNeighbours(p, 2 * minDistance);
  if (neighbours.length) {
    for (let neighbour of neighbours) {
      if (neighbour.line !== line) {
        const pp = neighbour.point;
        const dx = pp.x - p.x;
        const dy = pp.y - p.y;
        const d = dx * dx + dy * dy;
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

  const SEGMENTS = params.segments();
  const delay = params.delay() * 5;
  const twistiness = params.twistiness();

  const poisson2d = new Poisson2D(WIDTH, HEIGHT, params.density());
  const points = poisson2d.calculate();
  points.forEach((p) => {
    p.x -= 0.5 * WIDTH;
    p.y -= 0.5 * HEIGHT;
  });

  grid.reset();

  const map = brushes[params.brush()];
  const gradient = new gradientLinear(getPalette(params.palette()));
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();

  const lines = [];

  for (let i = 0; i < points.length; i++) {
    lines[i] = {
      active: true,
      points: [],
      offset: Maf.randomInRange(-Math.PI, Math.PI) / 100,
      delay: Math.round(Maf.randomInRange(0, delay * SEGMENTS)),
      segment: 0,
    };
  }

  const o = new Vector2();
  const d = new Vector2();
  const offset = new Vector2(
    Maf.randomInRange(-100, 100),
    Maf.randomInRange(-100, 100)
  );
  const scale = params.scale();

  while (lines.some((l) => l.active === true)) {
    if (abort.aborted) {
      return;
    }

    for (let i = 0; i < points.length; i++) {
      if (abort.aborted) {
        return;
      }

      const segment = lines[i].segment - lines[i].delay;
      lines[i].segment++;

      if (segment === 0) {
        let skip = true;
        for (let k = 0; k < 10; k++) {
          const pp = points[i];
          if (!intersects(pp, i)) {
            lines[i].points[0] = pp;
            grid.add(pp, { point: pp, line: i });
            skip = false;
            continue;
          }
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
          const p = perlin.simplex2(
            scale * o.x + offset.x,
            scale * o.y + offset.y
          );
          const a = lines[i].offset + p * twistiness;
          d.set(Math.cos(a), Math.sin(a)).normalize().multiplyScalar(0.2);

          const t = o.clone().add(d);

          if (lines[i].active) {
            if (!intersects(t, i)) {
              grid.add(t, { point: t, line: i });
            } else {
              lines[i].active = false;
            }
          }

          lines[i].points.push(t);
          if (
            t.x < -0.5 * WIDTH ||
            t.x > 0.5 * WIDTH ||
            t.y < -0.5 * HEIGHT ||
            t.y > 0.5 * HEIGHT
          ) {
            lines[i].active = false;
          }
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
      sizeAttenuation: true,
      lineWidth: 0.0025 * Maf.randomInRange(lineWidth[0], lineWidth[1]),
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    const vertices = [];
    for (const p of lines[i].points) {
      vertices.push(p.x);
      vertices.push(p.y);
      vertices.push(0);
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

const index = 26;
export { index, start, stop, draw, randomize, deserialize, canvas };
