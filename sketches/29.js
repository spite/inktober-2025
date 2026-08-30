import {
  Group,
  Mesh,
  Vector2,
  Vector3,
} from "three";
import {
  renderer,
  isRunning,
  brushes,
  brushOptions,
  addInfo,
} from "../modules/three.js";
import {
  camera,
  canvas,
  controls,
  hide,
  painted,
  scene,
  show,
} from "../modules/stage.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import perlin from "../third_party/perlin.js";
import { getPalette, paletteOptions } from "../modules/palettes.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  rollWithin,
  setActiveRandomize,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { createRebuilder } from "../modules/rebuilder.js";
import { random, seed } from "../modules/random.js";

const defaults = {
  width: 40,
  height: 22,
  tile1Weight: 0.75,
  tile2Weight: 0.1,
  tile3Weight: 1,
  noiseScale: 0.04,
  offset: 0,
  repeatFactor: 1,
  lineWidth: [0.5, 0.6], //[0.5, 0.7],
  opacity: [0.5, 1],
  brush: "brush5",
  palette: "mysticBliss",
  seed: 13373,
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI(
  "Truchet tiles II",
  document.querySelector("#gui-container"),
);
gui.addLabel("Lines following a pattern built with triangular Truchet Tiles.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Width", params.width, 1, 80, 1);
gui.addSlider("Height", params.height, 1, 80, 1);
rollWithin(
  gui.addSlider("Tile 1 weight", params.tile1Weight, 0, 1, 0.01),
  0.6, 1, 0.01,
);
rollWithin(
  gui.addSlider("Tile 2 weight", params.tile2Weight, 0, 1, 0.01),
  0, 0.6, 0.01,
);
rollWithin(
  gui.addSlider("Tile 3 weight", params.tile3Weight, 0, 1, 0.01),
  0.6, 1, 0.01,
);
rollWithin(
  gui.addSlider("Noise scale", params.noiseScale, 0.01, 0.5, 0.01),
  0.01, 0.3, 0.01,
);
rollPair(
  gui.addRangeSlider("Line width", params.lineWidth, 0.1, 1, 0.01),
  [0.7, 0.7], [0.7, 1], 0.01,
);
rollWithin(
  gui.addSlider("Repeat factor", params.repeatFactor, 1, 10, 1),
  1, 5, 1,
);
gui.addSection("Ink");
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);
rollPair(
  gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01),
  [0.5, 0.5], [1, 1], 0.01,
);

gui.addSection("Params");
const randomizeParams = addRandomizeParams(gui, "Randomize params", () =>
  serialize(),
);
gui.addButton("Reset params", reset);

addInfo(gui);


// Paused while another sketch is on screen, resumed in start(). The module is cached, so
// without this every sketch ever visited resizes its Painted on every window resize.

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(0, 0, 9.36).multiplyScalar(0.2);


const meshes = [];

function getTriangleVertices(r, startAngle) {
  const vertices = [];
  const angleStep = (2 * Math.PI) / 3;

  for (let i = 0; i < 3; i++) {
    const currentAngle = startAngle + i * angleStep;
    vertices.push({
      x: r * Math.cos(currentAngle),
      y: r * Math.sin(currentAngle),
    });
  }
  return vertices;
}

function getShortestAngleRadMath(a, b) {
  return (((b - a) % Maf.TAU) + Maf.TAU) % Maf.TAU;
}

class Tile {
  constructor(x, y, rot, type, rotation) {
    this.x = x;
    this.y = y;
    this.rot = rot;
    this.type = type;
    this.rotation = rotation;
  }

  render() {
    const [a, b, c] = getTriangleVertices(1 / Math.sqrt(3), this.rot);
    const p0 = { x: Maf.lerp(a.x, b.x, 1 / 3), y: Maf.lerp(a.y, b.y, 1 / 3) };
    const p1 = { x: Maf.lerp(a.x, b.x, 2 / 3), y: Maf.lerp(a.y, b.y, 2 / 3) };

    const p2 = { x: Maf.lerp(b.x, c.x, 1 / 3), y: Maf.lerp(b.y, c.y, 1 / 3) };
    const p3 = { x: Maf.lerp(b.x, c.x, 2 / 3), y: Maf.lerp(b.y, c.y, 2 / 3) };

    const p4 = { x: Maf.lerp(c.x, a.x, 1 / 3), y: Maf.lerp(c.y, a.y, 1 / 3) };
    const p5 = { x: Maf.lerp(c.x, a.x, 2 / 3), y: Maf.lerp(c.y, a.y, 2 / 3) };

    const ab = { x: Maf.lerp(a.x, b.x, 1 / 2), y: Maf.lerp(a.y, b.y, 1 / 2) };
    const bc = { x: Maf.lerp(b.x, c.x, 1 / 2), y: Maf.lerp(b.y, c.y, 1 / 2) };
    const ca = { x: Maf.lerp(c.x, a.x, 1 / 2), y: Maf.lerp(c.y, a.y, 1 / 2) };

    switch (this.type) {
      case 0:
        return [
          // borders,
          this.createCurve(p0, p5, a),
          this.createCurve(p2, p1, b),
          this.createCurve(p4, p3, c),
        ];
      case 1:
        return [
          // borders,
          this.createCurve(p1, p0, ab),
          this.createCurve(p3, p2, bc),
          this.createCurve(p5, p4, ca),
        ];
      case 2:
        return [
          // borders,
          this.createCurve(p0, p5, a),
          this.createCurve(p1, p4, a),
          this.createCurve(p3, p2, bc),
        ];
      case 3:
        return [
          // borders,
          this.createCurve(p0, p5, a),
          this.createCurve(p1, p4, a),
          this.createCurve(p5, p2, c).slice(6),
          this.createCurve(p4, p3, c),
        ];
    }
    return [];
  }

  createCurve(from, to, center) {
    const dFrom = { x: from.x - center.x, y: from.y - center.y };
    const dTo = { x: to.x - center.x, y: to.y - center.y };
    const a1 = Maf.mod(Math.atan2(dFrom.y, dFrom.x), Maf.TAU);
    const a2 = Maf.mod(Math.atan2(dTo.y, dTo.x), Maf.TAU);
    let shortestAngle = getShortestAngleRadMath(a1, a2);
    const d1 = Math.sqrt(dFrom.x ** 2 + dFrom.y ** 2);
    const d2 = Math.sqrt(dTo.x ** 2 + dTo.y ** 2);
    const steps = 10;
    const res = [];
    for (let i = 0; i < steps; i++) {
      const a = Maf.map(0, steps - 1, a1, a1 + shortestAngle, i);
      const d = Maf.map(0, steps - 1, d1, d2, i);
      res.push({
        x: this.x + center.x + d * Math.cos(a),
        y: this.y + center.y + d * Math.sin(a),
      });
    }
    return res;
  }
}

function mergeSegments(segments) {
  if (segments.length === 0) return [];

  const PRECISION = 0;
  const hashVertex = (v) => {
    return `${v.x.toFixed(PRECISION)},${v.y.toFixed(PRECISION)},${v.z.toFixed(
      PRECISION,
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

function getWeightedOption(items, weights) {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  // `remaining`, not `random`: that name is now the imported generator.
  let remaining = random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    if (remaining < weights[i]) {
      return items[i];
    }
    remaining -= weights[i];
  }
}

async function generateLines(abort) {
  seed(params.seed());

  const noiseScale = params.noiseScale();
  const map = brushes[params.brush()];
  const gradient = new gradientLinear(getPalette(params.palette()));
  const lineWidth = params.lineWidth();
  const offset = params.offset();
  const opacity = params.opacity();
  const repeatFactor = params.repeatFactor();
  const weights = [
    params.tile1Weight(),
    params.tile2Weight(),
    params.tile3Weight(),
  ];

  const WIDTH = params.width();
  const HEIGHT = params.height();
  const SIZE = 50;

  const grid = [];

  const side = 1;
  const height = side * (Math.sqrt(3) / 2);
  const r = height / 3;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const v = perlin.simplex2(
        x * noiseScale + offset,
        y * noiseScale + offset,
      );
      const a = Math.round(Maf.map(-1, 1, 0, 4, v)) * 90;
      const t = getWeightedOption([0, 1, 2], weights);

      const isPointingUp = x % 2 === y % 2;
      let cx = x * (side / 2);
      let cy = y * height;
      if (!isPointingUp) {
        cy -= r;
      }

      const tileOffset = (Math.round(Maf.randomInRange(0, 3)) * Maf.TAU) / 3;
      const tile = new Tile(
        cx,
        cy,
        (isPointingUp ? -Math.PI / 2 : Math.PI / 2) + tileOffset,
        t,
        a,
      );
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
          d.x - 0.25 * WIDTH + 0.5,
          d.y - ((0.75 * side) / Math.sqrt(3)) * HEIGHT + 0.5,
          0,
        ).multiplyScalar(SIZE),
      ),
    );
  }

  const mergedSegments = mergeSegments(scaledSegments);

  let i = 0;
  for (const segment of mergedSegments) {
    if (abort.aborted) {
      return;
    }
    const c =
      perlin.simplex2(
        (segment[0].x * noiseScale) / WIDTH + offset,
        (segment[0].y * noiseScale) / HEIGHT + offset,
      ) *
        0.5 +
      0.5;

    let length = 0;
    for (let i = 0; i < segment.length - 1; i++) {
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

const rebuild = createRebuilder(clearScene, generateLines);

function clearScene() {
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
  randomizeSection(gui, shapeSection);
  params.seed.set(performance.now());
  params.offset.set(Maf.randomInRange(-1000, 1000));
}

let lastTime = performance.now();
let time = 0;

function draw(frameStart) {
  controls.update();
  const t = performance.now();

  if (isRunning) {
    time += (t - lastTime) / 20000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = -(time * m.speed + m.offset);
  });

  painted.render(renderer, scene, camera, frameStart);
  lastTime = t;
}

function start() {
  show(group, cameraPose);
  setActiveRandomize(randomizeParams);
  rebuild.start();
  gui.show();
  painted.invalidate();
}

function stop() {
  hide();
  setActiveRandomize(null);
  rebuild.stop();
  gui.hide();
}

const index = 29;
export { index, start, stop, draw, randomize, params, defaults, canvas };
