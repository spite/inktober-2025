import {
  Scene,
  Mesh,
  Group,
  Vector2,
  Vector3,
  TextureLoader,
  Color,
  Matrix4,
  IcosahedronGeometry,
  RepeatWrapping,
  MeshBasicMaterial,
} from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  onRandomize,
  waitForRender,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import { MarchingSquares } from "../modules/marching-squares.js";
const painted = new Painted({ minLevel: -0.2 });

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

palette.range = [
  "#FE695A",
  "#0F2246",
  "#CE451C",
  "#FEF2CD",
  "#EEC1A6",
  "#57424A",
  "#E2902D",
];

// palette.range = [
//   "#1e242c",
//   "#4a5b6b",
//   "#8da0b4",
//   "#cdd9e6",
//   "#f5f8fb",
//   // "#3a8beb",
//   // "#6b9dd8",
//   // "#3ab485",
//   //   "#ebb43a",
//   //   "#e74c3c",
// ];

palette.range = [
  "#DDAA44",
  "#B9384C",
  "#7E9793",
  "#F8F6F2",
  "#3D5443",
  "#2F2D30",
  "#ebb43a",
  "#ffffff",
];
// palette.range = ["#800000", "#b70000", "#ffb7b7"];

function rotateHue() {
  const hsl = new Vector3();
  const random = Maf.randomInRange(-1, 1);
  palette.range = palette.range.map((v) => {
    const c = new Color(v);
    c.getHSL(hsl);
    c.setHSL(hsl.h + random, hsl.s, hsl.l);
    return c;
  });
}
// rotateHue();

const gradient = new gradientLinear(palette.range);

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

const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;

function blend(v) {
  const k = 9.5;
  const sum = v.reduce((ac, v) => ac + Math.exp(-k * v), 0);
  return -Math.log(sum) / k;
}

function sdSphere(p, r) {
  return p.length() - r;
}

const spheresGroup = new Group();
const spheres = [];
const tmp = new Vector3();

function generateSpheres() {
  for (let i = 0; i < 30; i++) {
    const s = 0.75;
    const radius = Maf.randomInRange(0.2, 0.4);
    const center = new Vector3(
      Maf.randomInRange(-s, s),
      Maf.randomInRange(-s, s),
      Maf.randomInRange(-s, s)
    );
    const m = new Mesh(
      new IcosahedronGeometry(0.9 * radius, 5),
      new MeshBasicMaterial({ color: 0xf6f2e9 })
    );
    m.position.copy(center);
    m.position.x *= -1;
    // m.position.z *= -1;
    // spheresGroup.add(m);
    spheres.push({ center, radius });
  }
  spheresGroup.rotation.y = Math.PI / 2;
  group.add(spheresGroup);
}

function generateBlob(p, offset) {
  const res = [];
  for (const sphere of spheres) {
    const c = sphere.center;
    tmp.copy(p).sub(c);
    res.push(sdSphere(tmp, sphere.radius + offset));
  }

  const d = blend(res);
  return d;
}

function map(offset) {
  return (p) => {
    return generateBlob(p, offset);
  };
}

const meshes = [];

const LAYERS = 300;
const RADIUS = 1.5;
const WIDTH = 200;
const DEPTH = 200;

async function generateLines() {
  const axis = new Vector3(
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1)
  ).normalize();

  const rot = new Matrix4().makeRotationAxis(
    axis,
    Maf.randomInRange(0, 2 * Math.PI)
  );
  // spheresGroup.matrixAutoUpdate = false;
  // spheresGroup.applyMatrix4(rot);

  const spread = 0.01;

  for (let k = 0; k < LAYERS; k++) {
    await waitForRender();
    painted.invalidate();
    const fn = map(Maf.randomInRange(-spread, spread));
    const y = Maf.map(0, LAYERS - 1, -RADIUS, RADIUS, k);

    const axis2 = new Vector3(
      Maf.randomInRange(-1, 1),
      Maf.randomInRange(-1, 1),
      Maf.randomInRange(-1, 1)
    ).normalize();

    const rot2 = new Matrix4().makeRotationAxis(
      axis2,
      Maf.randomInRange(-0.01 * Math.PI, 0.01 * Math.PI)
    );

    const p = new Vector3();
    const values = [];
    for (let z = 0; z < DEPTH; z++) {
      values[z] = [];
      for (let x = 0; x < WIDTH; x++) {
        p.set(
          Maf.map(0, WIDTH, -RADIUS, RADIUS, x),
          y,
          Maf.map(0, DEPTH, -RADIUS, RADIUS, z)
        );
        p.applyMatrix4(rot).applyMatrix4(rot2);
        values[z][x] = fn(p);
      }
    }

    const lines = MarchingSquares.generateIsolines(
      values,
      0,
      1 / WIDTH,
      1 / DEPTH
    );

    for (const line of lines) {
      await waitForRender();
      painted.invalidate();

      const repeat = Math.round(
        Maf.randomInRange(1, Math.round(line.length / 20))
      );

      const material = new MeshLineMaterial({
        map: strokeTexture,
        useMap: true,
        color: gradient.getAt(
          Maf.map(0, LAYERS - 1, 0, 1, k) + Maf.randomInRange(-0.05, 0.05)
        ), //Maf.map(0, LAYERS, 0, 1, k)),
        sizeAttenuation: true,
        lineWidth: 0.0025,
        opacity: 1,
        repeat: new Vector2(repeat, 1),
        useDash: true,
        dashArray: new Vector2(
          1,
          Math.round(Maf.randomInRange(1, (repeat - 1) / 10))
        ),
        // dashOffset: Maf.randomInRange(-10, 10),
        uvOffset: new Vector2(Maf.randomInRange(0, 1), 0),
      });

      const points = line.map((p) =>
        new Vector3(2 * RADIUS * (p.x - 0.5), y, 2 * RADIUS * (p.y - 0.5))
          .applyMatrix4(rot)
          .applyMatrix4(rot2)
      );
      var g = new MeshLine();
      g.setPoints(points);

      var mesh = new Mesh(g.geometry, material);
      mesh.g = g;

      group.add(mesh);

      meshes.push({
        mesh,
        offset: Maf.randomInRange(-10, 10),
        speed: Maf.randomInRange(0.7, 1.3),
      });
    }
  }
}

async function generate() {
  clearScene();
  generateSpheres();
  await generateLines();
  painted.invalidate();
}

group.scale.setScalar(0.1);
scene.add(group);

function clearScene() {
  spheres.length = 0;
  for (const mesh of meshes) {
    group.remove(mesh.mesh);
  }
}

generate();

onRandomize(() => {
  generate();
});

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  const t = performance.now();

  if (isRunning) {
    time += (t - lastTime) / 20000;
    for (const m of meshes) {
      m.mesh.material.uniforms.uvOffset.value.x = m.offset - time * m.speed;
      // m.mesh.material.uniforms.dashOffset.value = m.offset - time * m.speed;
    }
    painted.invalidate();
  }

  group.rotation.x = 0.9 * time * Maf.TAU;
  group.rotation.y = 2 * time * Maf.TAU;
  group.rotation.z = 1.1 * time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
