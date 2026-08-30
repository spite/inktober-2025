import {
  Group,
  Mesh,
  Vector3,
} from "three";
import {
  renderer,
  isRunning,
  brushes,
  brushOptions,
  addInfo,
  wait,
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
import { MarchingSquares } from "../modules/marching-squares.js";
import perlin from "../third_party/perlin.js";
import { sphericalToCartesian } from "../modules/conversions.js";
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
import { seed } from "../modules/random.js";

const defaults = {
  lines: 10,
  scale: 2,
  opacity: [0.8, 1],
  brush: "brush3",
  palette: "clayForest",
  seed: 13373,
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI("Isolines II", document.querySelector("#gui-container"));
gui.addLabel("Lines generated following isolines on a spherical perlin noise.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
rollWithin(
  gui.addSlider("Lines", params.lines, 1, 20, 1),
  10, 20, 1,
);
rollWithin(
  gui.addSlider("Scale", params.scale, 0.5, 2.5, 0.01),
  0.5, 2, 0.01,
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
const cameraPose = new Vector3(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808).multiplyScalar(0.8);


const SCALE = 1;
const WIDTH = 300 / SCALE;
const HEIGHT = 300 / SCALE;

function generate() {
  const offset = Maf.randomInRange(-10000, 10000);
  return (x, y, z, scale = 1) =>
    perlin.simplex3(x * scale + offset, y * scale + offset, z * scale + offset);
}

const meshes = [];
const latSteps = WIDTH;
const lonSteps = HEIGHT;

async function generateIsoLines(abort) {
  seed(params.seed());

  const LINES = params.lines();
  const noiseScale = params.scale();

  const gradient = new gradientLinear(getPalette(params.palette()));
  const map = brushes[params.brush()];
  const opacity = params.opacity();

  const values = [];

  const pattern = generate();

  for (let i = 0; i <= lonSteps; i++) {
    values[i] = [];
    const phi = (i / lonSteps) * Math.PI * 2;

    for (let j = 0; j <= latSteps; j++) {
      const theta = (j / latSteps) * Math.PI;

      const n = sphericalToCartesian(1, theta, phi);

      const noiseVal = pattern(n.x, n.y, n.z, noiseScale);

      values[i][j] = noiseVal;
    }
  }

  for (let i = 0; i < LINES; i++) {
    if (abort.aborted) {
      return;
    }

    const paths = MarchingSquares.generateIsolines(
      values,
      -0.9 + (1.8 * i) / LINES,
      1 / WIDTH,
      1 / HEIGHT,
    );

    for (const path of paths) {
      await wait();
      painted.invalidate();
      const z = Maf.map(0, LINES - 1, 1.8, 2, i);
      let avg = 0;
      const points = path.map((p) => {
        const r = sphericalToCartesian(5, p.y * Math.PI, p.x * 2 * Math.PI);
        const pp = new Vector3(r.x, r.y, r.z).normalize().multiplyScalar(z);
        avg += pp.y;
        return pp;
      });
      avg /= points.length;

      const c = Maf.map(-2, 2, 0, 1, avg);

      const material = new MeshLineMaterial({
        map,
        useMap: true,
        color: 0xffffff,
        sizeAttenuation: true,
        lineWidth: 1 * Maf.map(0, LINES - 1, 0.0006, 0.0002, i),
        opacity: 1,
      });

      var g = new MeshLine();
      g.setPoints(points, (p) => Maf.parabola(p, 0.4));

      var mesh = new Mesh(g.geometry, material);
      mesh.g = g;

      if (abort.aborted) {
        return;
      }
      group.add(mesh);

      meshes.push({
        mesh,
        offset: Maf.randomInRange(-1, 1),
        speed: Maf.randomInRange(1, 2),
      });

      const material2 = new MeshLineMaterial({
        map,
        useMap: true,
        color: gradient.getAt(c),
        sizeAttenuation: true,
        lineWidth: Maf.map(0, LINES - 1, 0.006, 0.002, i),
        opacity: Maf.randomInRange(opacity[0], opacity[1]),
      });

      for (const p of points) {
        const l = p.length();
        p.normalize().multiplyScalar(l - 0.05);
      }
      var g2 = new MeshLine();
      g2.setPoints(points, (p) => Maf.parabola(p, 0.4));

      var mesh2 = new Mesh(g2.geometry, material2);

      group.add(mesh2);

      meshes.push({
        mesh: mesh2,
        offset: Maf.randomInRange(-1, 1),
        speed: Maf.randomInRange(1, 2),
      });
    }
  }
}

group.scale.setScalar(0.06);

const rebuild = createRebuilder(clearScene, generateIsoLines);

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
    m.mesh.material.uniforms.uvOffset.value.x = time * 10 * m.speed + m.offset;
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera, frameStart);
  lastTime = t;
}

function start() {
  show(group, cameraPose, { screenSpacePanning: true });
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

const index = 23;
export { index, start, stop, draw, randomize, params, defaults, canvas };
