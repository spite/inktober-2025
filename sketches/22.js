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
  wait,
} from "../modules/three.js";
import {
  camera,
  clearGroup,
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
import { getPalette, paletteOptions } from "../modules/palettes.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
  rollPair,
  rollWithin,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { createRebuilder } from "../modules/rebuilder.js";
import { seed } from "../modules/random.js";

const defaults = {
  lines: 100,
  scale: 150,
  octaves: 2,
  lacunarity: 0,
  gain: 1,
  lineWidth: [0.9, 1],
  opacity: [0.8, 1],
  brush: "brush4",
  palette: "autumnIntoWinter",
  seed: 13373,
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI("Isolines I", document.querySelector("#gui-container"));
gui.addLabel("Lines generated following isolines on a FBM heightmap.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
rollWithin(
  gui.addSlider("Lines", params.lines, 1, 200, 1),
  50, 200, 1,
);
rollWithin(
  gui.addSlider("Scale", params.scale, 100, 500, 0.01),
  150, 300, 0.01,
);
// gui.addSlider("Octaves", params.octaves, 1, 4, 1);
// gui.addSlider("Lacunarity", params.lacunarity, 0, 10, 0.01);
// gui.addSlider("Gain", params.gain, 0, 10, 0.1);
rollPair(
  gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01),
  [0.1, 0.1], [0.1, 0.9], 0.01,
);

gui.addSection("Ink");
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);
rollPair(
  gui.addRangeSlider("Opacity", params.opacity, 0.1, 1, 0.01),
  [0.5, 0.5], [0.5, 1], 0.01,
);

gui.addSection("Params");
const randomizeParams = addRandomizeParams(gui, "Randomize params", () =>
  serialize(),
);
gui.addButton("Reset params", reset);

addInfo(gui);

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(2.5, 3, 2.5).multiplyScalar(0.3);


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
    gain,
  );
}

const meshes = [];

const SCALE = 1;
const WIDTH = 200 / SCALE;
const HEIGHT = 200 / SCALE;
const center = new Vector3(0.5 * WIDTH, 0, 0.5 * HEIGHT);

async function generateIsoLines(abort) {
  seed(params.seed());

  const LINES = params.lines();

  const gradient = new gradientLinear(getPalette(params.palette()));
  const map = brushes[params.brush()];
  const lineWidth = params.lineWidth();
  const opacity = params.opacity();
  const s = params.scale();

  const values = [];
  const offset = Maf.randomInRange(-WIDTH, WIDTH);
  for (let y = 0; y < HEIGHT; y++) {
    values[y] = [];
    for (let x = 0; x < WIDTH; x++) {
      values[y][x] = pattern(
        x * SCALE + offset,
        y * SCALE + offset,
        s,
        params.octaves(),
        params.lacunarity(),
        params.gain(),
      );
    }
  }

  for (let i = 0; i < LINES; i++) {
    if (abort.aborted) {
      return;
    }
    await wait();
    painted.invalidate();

    const paths = MarchingSquares.generateIsolines(
      values,
      -0.9 + (1.8 * i) / LINES,
      WIDTH,
      HEIGHT,
    );

    for (const path of paths) {
      const z = (i * 5000) / LINES / SCALE;
      const points = path.map((p) =>
        new Vector3(p.x, z * 2, p.y)
          .multiplyScalar(1 / WIDTH)
          .sub(center)
          .multiplyScalar(0.05),
      );

      const l = Math.round(Maf.randomInRange(1, path.length / 20));

      const material = new MeshLineMaterial({
        map,
        useMap: true,
        color: gradient.getAt(i / LINES),
        lineWidth: Maf.randomInRange(lineWidth[0], lineWidth[1]) / 100,
        opacity: Maf.randomInRange(opacity[0], opacity[1]),
        repeat: new Vector2(l, 1),
        dashArray: new Vector2(1, 2),
        useDash: true,
        dashOffset: Maf.randomInRange(-l, l),
      });

      var g = new MeshLine();
      g.setPoints(points, function (p) {
        return Maf.parabola(p, 1);
      });

      var mesh = new Mesh(g.geometry, material);
      mesh.g = g;

      mesh.rotation.y = (i * 0.1) / LINES;

      if (abort.aborted) {
        return;
      }
      group.add(mesh);

      meshes.push({ mesh, offset: 0, speed: 0 });
    }
  }
}

group.scale.setScalar(0.06);

const rebuild = createRebuilder(clearScene, generateIsoLines);

function clearScene() {
  clearGroup(group, meshes);
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
  show(group, cameraPose);
  rebuild.start();
  gui.show();
  painted.invalidate();
}

function stop() {
  hide();
  rebuild.stop();
  gui.hide();
}

const index = 22;
export { index, start, stop, draw, randomize, params, defaults};
