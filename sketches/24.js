import { Scene, Mesh, Group, Vector2, Vector3 } from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  brushOptions,
  brushes,
  wait,
  addInfo,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
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
  lines: 100,
  scale: 2,
  lineWidth: [0.8, 1],
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "autumnIntoWinter",
  seed: 13373,
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI("Isolines III", document.querySelector("#gui-container"));
gui.addLabel("Lines generated following isolines on a spherical perlin noise.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
rollWithin(
  gui.addSlider("Lines", params.lines, 10, 150, 1),
  10, 150, 1,
);
rollWithin(
  gui.addSlider("Scale", params.scale, 0.5, 2.5, 0.01),
  0.5, 2, 0.01,
);
rollPair(
  gui.addRangeSlider("Line width", params.lineWidth, 0.1, 1, 0.01),
  [0.7, 0.7], [0.7, 1], 0.01,
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

const painted = new Painted();

// Paused while another sketch is on screen, resumed in start(). The module is cached, so
// without this every sketch ever visited resizes its Painted on every window resize.
const resizeHandler = onResize((w, h) => {
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

camera.position
  .set(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808)
  .multiplyScalar(1.2);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const SCALE = 1;
const WIDTH = 300 / SCALE;
const HEIGHT = 300 / SCALE;

function generate(scale) {
  const offset = new Vector3(
    Maf.randomInRange(-100, 100),
    Maf.randomInRange(-100, 100),
    Maf.randomInRange(-100, 100),
  );

  return (x, y, z) => {
    return perlin.simplex3(
      x * scale + offset.x,
      y * scale + offset.y,
      z * scale + offset.z,
    );
  };
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
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();

  // Drawn here rather than at module scope, where it used to sit. Module scope runs at
  // import time -- before any sketch has seeded anything, so this came off the page-level
  // Math.seedrandom(performance.now()) in index.html. Every mesh is rotated about it, so
  // the same seed produced a differently tilted drawing on every single page load and
  // #sketch=24+params=... never reproduced the image it linked to.
  const rotDir = new Vector3(
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1),
  ).normalize();

  const values = [];

  const pattern = generate(noiseScale);

  for (let i = 0; i <= lonSteps; i++) {
    values[i] = [];
    const phi = (i / lonSteps) * Math.PI * 2;

    for (let j = 0; j <= latSteps; j++) {
      const theta = (j / latSteps) * Math.PI;

      const n = sphericalToCartesian(1, theta, phi);

      const noiseVal = pattern(n.x, n.y, n.z);

      values[i][j] = noiseVal;
    }
  }

  for (let i = Math.round(0.75 * LINES); i > 0; i--) {
    if (abort.aborted) {
      return;
    }
    await wait();
    painted.invalidate();

    const paths = MarchingSquares.generateIsolines(
      values,
      -0.9 + (1.8 * i) / LINES,
      1 / WIDTH,
      1 / HEIGHT,
    );

    for (const path of paths) {
      const z = Maf.map(0, LINES - 1, 3, -1.1, i);
      const points = path.map((p) => {
        const r = sphericalToCartesian(5, p.y * Math.PI, p.x * 2 * Math.PI);
        const pp = new Vector3(r.x, r.y, r.z).normalize().multiplyScalar(z);
        return pp;
      });


      const material = new MeshLineMaterial({
        map,
        useMap: true,
        color: gradient.getAt(i / LINES),
        lineWidth: 0.005 * Maf.randomInRange(lineWidth[0], lineWidth[1]),
        opacity: Maf.randomInRange(opacity[0], opacity[1]),
        uvOffset: new Vector2(Maf.randomInRange(0, 1), 0),
      });

      var g = new MeshLine();
      g.setPoints(points, function (p) {
        return Maf.parabola(p, 1);
      });

      var mesh = new Mesh(g.geometry, material);
      mesh.g = g;

      mesh.rotateOnAxis(rotDir, (i * 0.1) / LINES);
      if (abort.aborted) {
        return;
      }
      group.add(mesh);

      meshes.push({
        mesh,
        offset: Maf.randomInRange(-1, 1),
        speed: Maf.randomInRange(1, 2),
      });
    }
  }
}

group.scale.setScalar(0.06);
scene.add(group);

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
    m.mesh.material.uniforms.uvOffset.value.x = -(time * m.speed + m.offset);
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera, frameStart);
  lastTime = t;
}

function start() {
  setActiveRandomize(randomizeParams);
  resizeHandler.resume();
  rebuild.start();
  controls.enabled = true;
  gui.show();
  painted.invalidate();
}

function stop() {
  setActiveRandomize(null);
  resizeHandler.pause();
  rebuild.stop();
  controls.enabled = false;
  gui.hide();
}

const index = 24;
export { index, start, stop, draw, randomize, params, defaults, canvas };
