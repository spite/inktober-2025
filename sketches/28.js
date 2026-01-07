import { Scene, Mesh, Group, Vector3, Vector2, Color } from "three";
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
import perlin from "../third_party/perlin.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { signal, effectRAF } from "../modules/reactive.js";
import GUI from "../modules/gui.js";

const defaults = {
  width: 40,
  height: 20,
  noiseScale: 0.25,
  curveScale: [1, 1],
  curved: true,
  offset: 0,
  repeatFactor: 1,
  lineWidth: [0.5, 0.7],
  opacity: [0.8, 1],
  brush: "brush5",
  palette: "florian",
  seed: 13373,
};

const params = {
  width: signal(defaults.width),
  height: signal(defaults.height),
  noiseScale: signal(defaults.noiseScale),
  curveScale: signal(defaults.curveScale),
  curved: signal(defaults.curved),
  offset: signal(defaults.offset),
  lineWidth: signal(defaults.lineWidth),
  repeatFactor: signal(defaults.repeatFactor),
  opacity: signal(defaults.opacity),
  brush: signal(defaults.brush),
  palette: signal(defaults.palette),
  seed: signal(defaults.seed),
};

const gui = new GUI("Truchet tiles", document.querySelector("#gui-container"));
gui.addLabel("Lines following a pattern built with Truchet Tiles.");
gui.addSlider("Width", params.width, 1, 80, 1);
gui.addSlider("Height", params.height, 1, 80, 1);
gui.addRangeSlider("Curve scale", params.curveScale, 0, 1, 0.01);
gui.addCheckbox("Curved connections", params.curved);
gui.addSlider("Noise scale", params.noiseScale, 0.01, 0.5, 0.01);
gui.addRangeSlider("Line width", params.lineWidth, 0.1, 1, 0.01);
gui.addSlider("Repeat factor", params.repeatFactor, 1, 10, 1);
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

camera.position.set(0, 0, 1.9);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const meshes = [];

// TOP - RIGHT - BOTTOM - LEFT
class Segment {
  constructor(x, y, a, b) {
    this.x = x;
    this.y = y;
    this.a = a;
    this.b = b;
  }

  getCoords(index) {
    const d = 1 / 2;
    switch (index) {
      case 0:
        return { x: 0, y: -d };
      case 1:
        return { x: d, y: 0 };
      case 2:
        return { x: 0, y: d };
      case 3:
        return { x: -d, y: 0 };
    }
  }

  getCenter(a, b) {
    const d = 1 / 2;
    const id = a * 4 + b;
    switch (id) {
      case 1: {
        return { x: d, y: d, a: 180, b: 270 };
      }
      case 3: {
        return { x: -d, y: d, a: 0, b: -90 };
      }
      case 6: {
        return { x: d, y: -d, a: 90, b: 180 };
      }
      case 14: {
        return { x: -d, y: -d, a: 90, b: 0 };
      }
      default:
        debugger;
    }
  }

  renderCurve(c) {
    let a1 = (c.a * Math.PI) / 180;
    let a2 = (c.b * Math.PI) / 180;
    const res = [];
    if (params.curved()) {
      const steps = 10;
      const scale = params.curveScale();
      const s = Maf.randomInRange(scale[0], scale[0]);
      if (s < 1) {
        res.push({ x: 0.5 * Math.cos(a1) + c.x, y: 0.5 * Math.sin(a1) + c.y });
      }
      for (let i = 0; i < steps; i++) {
        const a = Maf.map(0, steps - 1, a1, a2, i);
        const x = (0.5 * Math.cos(a) + c.x) * s;
        const y = (0.5 * Math.sin(a) + c.y) * s;
        res.push({ x, y });
      }
      if (s < 1) {
        res.push({ x: 0.5 * Math.cos(a2) + c.x, y: 0.5 * Math.sin(a2) + c.y });
      }
    } else {
      res.push({ x: 0.5 * Math.cos(a1) + c.x, y: 0.5 * Math.sin(a1) + c.y });
      res.push({ x: 0.5 * Math.cos(a2) + c.x, y: 0.5 * Math.sin(a2) + c.y });
    }
    return res;
  }

  render() {
    const c = this.getCenter(this.a, this.b);
    const res = this.renderCurve(c);
    res.forEach((p) => {
      p.x += this.x;
      p.y += this.y;
    });
    return res;
  }
}

class Tile {
  constructor(x, y, type, rotation) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.rotation = rotation;
  }

  render() {
    switch (this.type) {
      case 1:
        return this.renderType1();
    }
    return [];
  }

  renderType1() {
    const d = 1 / 2;
    const borders = [
      [
        { x: -d, y: -d },
        { x: d, y: -d },
      ],
      [
        { x: d, y: -d },
        { x: d, y: d },
      ],
      [
        { x: d, y: d },
        { x: -d, y: d },
      ],
      [
        { x: -d, y: d },
        { x: -d, y: -d },
      ],
    ];
    borders.forEach((pts) => {
      pts.forEach((p) => {
        p.x += this.x;
        p.y += this.y;
      });
    });

    if (this.rotation === 0 || this.rotation === 180) {
      return [
        // ...borders,
        new Segment(this.x, this.y, 0, 1).render(),
        new Segment(this.x, this.y, 3, 2).render(),
      ];
    } else {
      return [
        // ...borders,
        new Segment(this.x, this.y, 0, 3).render(),
        new Segment(this.x, this.y, 1, 2).render(),
      ];
    }
  }
}

function mergeSegments(segments) {
  if (segments.length === 0) return [];

  const PRECISION = 4;
  const hashVertex = (v) => {
    return `${v.x.toFixed(PRECISION)},${v.y.toFixed(PRECISION)},${v.z.toFixed(
      PRECISION
    )}`;
  };

  const segmentData = segments.map((points, index) => ({
    id: index,
    points,
    visited: false,
  }));

  const endpointMap = new Map();

  const addToMap = (hash, segIndex, isStart) => {
    if (!endpointMap.has(hash)) endpointMap.set(hash, []);
    endpointMap.get(hash).push({ index: segIndex, isStart });
  };

  segmentData.forEach((seg, idx) => {
    if (seg.points.length < 2) return;

    const startHash = hashVertex(seg.points[0]);
    const endHash = hashVertex(seg.points[seg.points.length - 1]);

    addToMap(startHash, idx, true);
    addToMap(endHash, idx, false);
  });

  const resultLines = [];

  for (let i = 0; i < segmentData.length; i++) {
    if (segmentData[i].visited) continue;

    const currentLine = [...segmentData[i].points];
    segmentData[i].visited = true;

    let finding = true;
    while (finding) {
      const tailPoint = currentLine[currentLine.length - 1];
      const tailHash = hashVertex(tailPoint);
      const candidates = endpointMap.get(tailHash) || [];

      const neighbor = candidates.find((c) => !segmentData[c.index].visited);

      if (neighbor) {
        const seg = segmentData[neighbor.index];
        seg.visited = true;

        const pointsToAdd = neighbor.isStart
          ? seg.points
          : [...seg.points].reverse();

        for (let k = 1; k < pointsToAdd.length; k++) {
          currentLine.push(pointsToAdd[k]);
        }
      } else {
        finding = false;
      }
    }

    finding = true;
    while (finding) {
      const headPoint = currentLine[0];
      const headHash = hashVertex(headPoint);
      const candidates = endpointMap.get(headHash) || [];

      const neighbor = candidates.find((c) => !segmentData[c.index].visited);

      if (neighbor) {
        const seg = segmentData[neighbor.index];
        seg.visited = true;

        const pointsToAdd = !neighbor.isStart
          ? seg.points
          : [...seg.points].reverse();

        for (let k = pointsToAdd.length - 2; k >= 0; k--) {
          currentLine.unshift(pointsToAdd[k]);
        }
      } else {
        finding = false;
      }
    }

    resultLines.push(currentLine);
  }

  return resultLines;
}

async function generateLines() {
  Math.seedrandom(params.seed());

  const noiseScale = params.noiseScale();
  const map = brushes[params.brush()];
  const gradient = new gradientLinear(getPalette(params.palette()));
  const lineWidth = params.lineWidth();
  const offset = params.offset();
  const opacity = params.opacity();
  const repeatFactor = params.repeatFactor();

  const WIDTH = params.width();
  const HEIGHT = params.height();
  const SIZE = 50;

  const grid = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const v = perlin.simplex2(
        x * noiseScale + offset,
        y * noiseScale + offset
      );
      const a = Math.round(Maf.map(-1, 1, 0, 4, v)) * 90;
      const tile = new Tile(x, y, 1, a);
      grid.push(tile);
    }
  }

  const segments = [];
  for (const tile of grid) {
    segments.push(...tile.render());
  }

  const scaledSegments = [];
  for (const segment of segments) {
    scaledSegments.push(
      segment.map((d) =>
        new Vector3(
          d.x - 0.5 * WIDTH + 0.5,
          d.y - 0.5 * HEIGHT + 0.5,
          0
        ).multiplyScalar(SIZE)
      )
    );
  }

  const mergedSegments = mergeSegments(scaledSegments);

  let i = 0;
  for (const segment of mergedSegments) {
    const c = i / mergedSegments.length;

    let length = 0;
    for (let i = 0; i < segment.length - 3; i += 3) {
      length += segment[i].distanceTo(segment[i + 1]);
    }

    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(c),
      lineWidth: Maf.randomInRange(lineWidth[0], lineWidth[1]) * 0.025,
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
      repeat: new Vector2(Math.ceil((length * repeatFactor) / 200), 1),
    });
    var g = new MeshLine();
    g.setPoints(segment, (p) => Maf.parabola(p, 1));
    var mesh = new Mesh(g.geometry, material);
    mesh.g = g;
    group.add(mesh);
    meshes.push({
      mesh,
      offset: 0,
      speed: (Maf.randomInRange(1, 2) * 400) / length,
    });
    i++;
  }
  painted.invalidate();
}

group.scale.setScalar(0.001);
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
  params.offset.set(Maf.randomInRange(-1000, 1000));
  console.log(params.seed());
}

function randomizeParams() {
  params.curveScale.set([
    Maf.randomInRange(0.8, 0.9),
    Maf.randomInRange(0.9, 1),
  ]);
  params.noiseScale.set(Maf.randomInRange(0.01, 0.3));
  params.brush.set(Maf.randomElement(brushOptions)[0]);
  params.palette.set(Maf.randomElement(paletteOptions)[0]);
  const o = 0.5;
  params.opacity.set([o, 1]);
  const v = 0.7;
  params.lineWidth.set([v, Maf.randomInRange(v, 1)]);
  params.repeatFactor.set(Maf.intRandomInRange(1, 5));
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

const index = 28;
export { index, start, stop, draw, randomize, deserialize, canvas };
