import {
  Group,
  Matrix4,
  Mesh,
  Vector2,
  Vector3,
} from "three";
import {
  renderer,
  isRunning,
  wait,
  brushes,
  brushOptions,
  addInfo,
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
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { gradientLinear } from "../modules/gradient.js";
import { sphericalToCartesian } from "../modules/conversions.js";
import { march } from "../modules/raymarch.js";
import { SphubeSDF } from "../modules/sphube.js";

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
  lines: 400,
  segments: 200,
  sphubeFactor: 0.85,
  lineSpread: 0,
  lineWidth: [0.1, 0.4],
  seed: 6340.200000000186,
  opacity: [0.6, 0.9],
  brush: "brush4",
  palette: "florian",
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const gui = new GUI(
  "Sphube (3D squircle)",
  document.querySelector("#gui-container"),
);
gui.addLabel("Tracing lines over a sphube.");
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Segments per line", params.segments, 50, 500, 1, {
  randomizable: false,
});
rollWithin(
  gui.addSlider("Lines", params.lines, 1, 600, 1),
  50, 500, 1,
);
rollWithin(
  gui.addSlider("Sphube factor", params.sphubeFactor, 0, 1, 0.01),
  0.01, 0.99, 0.01,
);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
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


// Paused while another sketch is on screen, resumed in start(). The module is cached, so
// without this every sketch ever visited resizes its Painted on every window resize.

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808).multiplyScalar(0.5);


const meshes = [];

// theta: 0-tau - phi: 0-pi
const sphube = new SphubeSDF();

async function generateShape(abort) {
  seed(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  const map = brushes[params.brush()];
  const POINTS = params.segments();
  const LINES = params.lines();
  const lineSpread = params.lineSpread() / 10;
  const opacity = params.opacity();
  const lineWidth = params.lineWidth();
  const sphubeFactor = params.sphubeFactor();

  const axis = new Vector3(
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1),
  ).normalize();

  const rot = new Matrix4().makeRotationAxis(
    axis,
    Maf.randomInRange(0, 2 * Math.PI),
  );

  for (let j = 0; j < LINES; j++) {
    if (abort.aborted) {
      return;
    }
    if (j % 10 === 0) {
      await wait();
    }
    painted.invalidate();

    // const phi = getEvenPhi(j, LINES - 1, 0.9 - sphubeFactor);
    const phi = Maf.map(0, LINES - 1, 0, Math.PI, j);
    const vertices = [];
    const offset = Maf.randomInRange(-1, 0);
    const ro = new Vector3();
    const rd = new Vector3();

    const spread = new Vector3(
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread),
      0,
    ).applyMatrix4(rot);

    for (let i = 0; i < POINTS; i++) {
      const theta = Maf.map(0, POINTS - 1, 0, Maf.TAU, i);
      const { x, y, z } = sphericalToCartesian(1, phi, theta);

      ro.set(x, y, z).multiplyScalar(100).applyMatrix4(rot);
      rd.set(0, 0, 0).sub(ro).normalize();
      const d = march(ro, rd, (p) => sphube.evaluate(p, 1, sphubeFactor));
      rd.multiplyScalar(d).add(ro).add(spread);

      vertices.push(rd.x, rd.y, rd.z);
    }

    let length = 0;
    const a = new Vector3();
    const b = new Vector3();
    for (let i = 0; i < vertices.length - 3; i += 3) {
      a.set(vertices[i], vertices[i + 1], vertices[i + 2]);
      b.set(vertices[i + 3], vertices[i + 4], vertices[i + 5]);
      length += a.distanceTo(b);
    }
    const repeat = Math.round(length * 1.1);

    var g = new MeshLine();
    g.setPoints(vertices);

    const material = new MeshLineMaterial({
      map,
      useMap: true,
      color: gradient.getAt(Maf.map(0, LINES - 1, 0, 1, j)),
      lineWidth: Maf.randomInRange(lineWidth[0], lineWidth[1]) / 100,
      repeat: new Vector2(repeat, 1),
      dashArray: new Vector2(1, Maf.intRandomInRange(1, repeat - 1)),
      useDash: true,
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    var mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    if (abort.aborted) {
      return;
    }
    group.add(mesh);

    const speed = Math.round(Maf.randomInRange(1, 3));
    meshes.push({ mesh, offset, speed });
  }
}

group.scale.setScalar(0.06);

const rebuild = createRebuilder(clearScene, generateShape);

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
    time += (t - lastTime) / 10000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = -(time + m.offset);
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

const index = 13;
export { index, start, stop, draw, randomize, params, defaults};
