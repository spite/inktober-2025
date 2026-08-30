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
import { KnotCurve } from "../third_party/CurveExtras.js";
import { effectRAF } from "../modules/reactive.js";
import GUI, {
  addRandomizeParams,
  randomizeSection,
} from "../modules/gui.js";
import { createParams } from "guspira";
import { random, seed } from "../modules/random.js";

const defaults = {
  lines: 72,
  segments: 200,
  radiusSpread: 0.5,
  lineRepeat: [1, 10],
  lineSpread: 0.5,
  lineWidth: [0.4, 0.6],
  brush: "brush1",
  palette: "basic",
  seed: 1337,
};

// The defaults above are the schema: createParams turns each one into a signal of the right
// kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on working
// against it untouched.
const params = createParams(defaults);

const gui = new GUI("Knot curve", document.querySelector("#gui-container"));
gui.addLabel("Lines generated tracing a Knot curve.");
// Clicking any label rerolls just that control, over the range declared right here — which is
// where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Segments per line", params.segments, 100, 500, 1, {
  randomizable: false,
});
gui.addSlider("Lines", params.lines, 1, 200, 1);
gui.addSlider("Radius spread", params.radiusSpread, 0, 1, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.1);
gui.addRangeSlider("Line repeat range", params.lineRepeat, 1, 10, 1);
gui.addRangeSlider("Line width range", params.lineWidth, 0.1, 0.9, 0.01);

gui.addSection("Ink");
gui.addSelect("Brush", params.brush, brushOptions);
gui.addSelect("Palette", params.palette, paletteOptions);

gui.addSection("Params");
const randomizeParams = addRandomizeParams(gui, "Randomize params", () =>
  serialize(),
);
gui.addButton("Reset params", reset);

addInfo(gui);


// Paused while another sketch is on screen, resumed in start(). The module is cached, so
// without this every sketch ever visited resizes its Painted on every window resize.

const curve = new KnotCurve();

const group = new Group();

// The pose this sketch is composed to be seen from; stage.show() frames it on every visit.
const cameraPose = new Vector3(5, -2.5, -26).multiplyScalar(1);




const resolution = new Vector2(canvas.width, canvas.height);

const meshes = [];

function generateShape() {
  seed(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));

  const lineSpread = 2 * params.lineSpread();
  const LINES = params.lines();
  const POINTS = params.segments();
  for (let i = 0; i < LINES; i++) {
    const w = Maf.randomInRange(params.lineWidth()[0], params.lineWidth()[1]);
    const radius =
      0.25 + params.radiusSpread() * Maf.map(0, 1, -0.05, 0.05, random());
    const color = i / LINES;
    const offset = Maf.randomInRange(0, Maf.TAU);

    var geo = new Float32Array(POINTS * 3);
    let ptr = 0;
    for (var j = 0; j < geo.length; j += 3) {
      let i = ptr / (POINTS - 1);
      if (i === 1) {
        i = 0;
      }
      const p = curve.getPoint(i);
      geo[j] = radius * p.x;
      geo[j + 1] = radius * p.y;
      geo[j + 2] = radius * p.z;
      ptr++;
    }

    var g = new MeshLine();
    g.setPoints(geo);

    const repeat = Math.round(
      Maf.map(
        0,
        1,
        params.lineRepeat()[0],
        params.lineRepeat()[1],
        random(),
      ),
    );

    const material = new MeshLineMaterial({
      map: brushes[params.brush()],
      useMap: true,
      color: gradient.getAt(color),
      resolution: resolution,
      lineWidth: w,
      offset: Maf.randomInRange(-100, 100),
      repeat: new Vector2(repeat, 1),
      dashArray: new Vector2(1, repeat - 1),
      useDash: true,
      opacity: 0.8,
    });

    const mesh = new Mesh(g.geometry, material);

    const speed = Maf.randomInRange(1, 10);
    mesh.position.set(
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread),
    );
    group.add(mesh);
    meshes.push({
      mesh,
      radius,
      offset,
      speed,
    });
  }
  painted.invalidate();
}

group.scale.setScalar(0.5);
group.position.y = -4;

const sketchEffect = effectRAF(() => {
  clearScene();
  generateShape();
});

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
    time += (t - lastTime) / 1000 / 20;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = -(
      m.offset +
      0.7 * m.speed * time
    );
  });

  group.rotation.y = (time * Maf.TAU) / 4;

  painted.render(renderer, scene, camera, frameStart);
  lastTime = t;
}

function start() {
  show(group, cameraPose);
  sketchEffect.resume();
  gui.show();
  painted.invalidate();
}

function stop() {
  hide();
  sketchEffect.pause();
  gui.hide();
}

const index = 2;
export { index, start, stop, draw, randomize, params, defaults};
