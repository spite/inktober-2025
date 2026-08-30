import {
  Group,
  Mesh,
  Vector2,
  Vector3,
} from "three";
import {
  renderer,
  wait,
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
import { getPalette, paletteOptions } from "../modules/palettes.js";
import { curl, generateNoiseFunction } from "../modules/curl.js";
import {
  march,
  sdRoundBox,
  sdRoundedCylinder,
  sdSphere,
} from "../modules/raymarch.js";
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
  lines: 500,
  segments: 100,
  sdf: "rounded_box",
  noiseScale: 0.98,
  lineSpread: 0,
  lineWidth: [0.1, 0.39],
  seed: 117697.89999999106,
  opacity: [0.5, 1],
  brush: "brush4",
  palette: "earth",
};

// The defaults above are the schema: createParams turns each one into a signal of the
// right kind, keyed exactly the same way, so inktober.js's serialize() and reset() go on
// working against it untouched.
const params = createParams(defaults);

const sdfs = {
  sphere: { name: "Sphere", map: (p) => sdSphere(p, 0.8) },
  rounded_box: {
    name: "Rounded box",
    map: (p) => sdRoundBox(p, new Vector3(0.5, 0.5, 0.5), 0.1),
  },
  rounded_cylinder: {
    name: "Rounded cylinder",
    map: (p) => sdRoundedCylinder(p, 0.4, 0.2, 0.8),
  },
};
const sdfOptions = Object.keys(sdfs).map((k) => [k, sdfs[k].name]);

const gui = new GUI(
  "Curl over SDFs I",
  document.querySelector("#gui-container"),
);
gui.addLabel(
  "Tracing lines following a curl noise field on the surface of basic signed distance fields.",
);
// Clicking any label rerolls just that control, over the range declared right here —
// which is where the old randomizeParams() got its numbers from.
const shapeSection = gui.addSection("Shape");
gui.addSlider("Segments per line", params.segments, 50, 250, 1, {
  randomizable: false,
});
rollWithin(
  gui.addSlider("Lines", params.lines, 1, 1000, 1),
  200, 1000, 1,
);
gui.addSelect("SDF", params.sdf, sdfOptions);
gui.addSlider("Noise scale", params.noiseScale, 0.5, 1.5, 0.01);
gui.addSlider("Line spread", params.lineSpread, 0, 1, 0.01);
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
const cameraPose = new Vector3(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808).multiplyScalar(1);


const meshes = [];

async function generateShape(abort) {
  seed(params.seed());

  const gradient = new gradientLinear(getPalette(params.palette()));
  const func = generateNoiseFunction();

  // Captured, not re-read per sample: this is also the read that subscribes the
  // rebuild to the SDF dropdown, so it has to happen before the first await.
  const sdf = params.sdf();
  const sdfMap = sdfs[sdf].map;

  const LINES = params.lines();
  const POINTS = params.segments();
  const brush = brushes[params.brush()];
  const lineSpread = params.lineSpread() / 10;
  const opacity = params.opacity();
  const lineWidth = params.lineWidth();
  const noiseScale = params.noiseScale();

  for (let j = 0; j < LINES; j++) {
    if (abort.aborted) {
      return;
    }
    if (j % 10 === 0) {
      await wait();
    }
    painted.invalidate();
    const offset = Maf.randomInRange(-1, 0);
    const vertices = [];
    const r = 0.1;
    let p = new Vector3(
      Maf.randomInRange(-r, r),
      Maf.randomInRange(-r, r),
      Maf.randomInRange(-r, r),
    );
    const tmp = p.clone();
    for (let i = 0; i < POINTS; i++) {
      const res = curl(
        tmp.multiplyScalar(noiseScale * (1 + (0.5 * j) / LINES)),
        func,
      );
      res.normalize().multiplyScalar(0.01);
      p.add(res);

      const ro = p.clone().normalize();
      const rd = ro.clone().negate();

      const d = march(ro, rd, sdfMap);
      const intersects = rd.multiplyScalar(d).add(ro);

      p.copy(intersects).multiplyScalar(0.5 - (0.1 * j) / LINES);
      tmp.copy(p);
      vertices[i * 3] = p.x;
      vertices[i * 3 + 1] = p.y;
      vertices[i * 3 + 2] = p.z;
    }

    let length = 0;
    const a = new Vector3();
    const b = new Vector3();
    for (let i = 0; i < vertices.length - 3; i += 3) {
      a.set(vertices[i], vertices[i + 1], vertices[i + 2]);
      b.set(vertices[i + 3], vertices[i + 4], vertices[i + 5]);
      length += a.distanceTo(b);
    }
    const repeat = Math.ceil(Maf.randomInRange(1, length * 10));

    var g = new MeshLine();
    g.setPoints(vertices, (p) => Maf.parabola(p, 0.5));

    const material = new MeshLineMaterial({
      map: brush,
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      lineWidth: Maf.randomInRange(lineWidth[0], lineWidth[1]) / 100,
      repeat: new Vector2(repeat, 1),
      opacity: Maf.randomInRange(opacity[0], opacity[1]),
    });

    var mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    const spread = new Vector3(
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread),
      Maf.randomInRange(-lineSpread, lineSpread),
    );
    mesh.position.copy(spread);

    if (abort.aborted) {
      return;
    }
    group.add(mesh);

    mesh.material.uniforms.dashArray.value.x = repeat - 1;
    mesh.scale.setScalar(5);
    const speed = 1 * Math.round(Maf.randomInRange(1, 3));
    meshes.push({ mesh, offset, speed });
  }
}
group.scale.setScalar(0.06);

const rebuild = createRebuilder(clearScene, generateShape);

function clearScene() {
  for (const mesh of meshes) {
    mesh.mesh.geometry.dispose();
    mesh.mesh.material.dispose();
    group.remove(mesh.mesh);
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

const index = 14;
export { index, start, stop, draw, randomize, params, defaults, canvas };
