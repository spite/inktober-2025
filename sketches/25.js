import {
  Scene,
  Mesh,
  Group,
  Line,
  Vector2,
  Vector3,
  TextureLoader,
  Color,
  LineBasicMaterial,
  BufferGeometry,
  Matrix4,
  IcosahedronGeometry,
  RepeatWrapping,
  MeshNormalMaterial,
  CatmullRomCurve3,
  BoxGeometry,
  MeshBasicMaterial,
  TorusGeometry,
  Raycaster,
} from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  waitForRender,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Easings } from "../modules/easings.js";
import { Painted } from "../modules/painted.js";
import { pointsOnSphere } from "../modules/points-sphere.js";
import { curl, seedFunc } from "../modules/curl.js";
import { MarchingSquares } from "../modules/marching-squares.js";
import perlin from "../third_party/perlin.js";
const painted = new Painted({ minLevel: -0.2 });
// const curl = generateNoiseFunction();
import { Poisson2D } from "../modules/poisson-2d.js";
import { Grid } from "../modules/grid-3d.js";
import { march } from "../modules/raymarch.js";
import { init } from "../modules/dipoles-3d.js";
import { sphericalToCartesian } from "../modules/conversions.js";
import { superShape3D, presets } from "../modules/supershape.js";

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
// palette.range = ["#ffb7b7", "#b70000", "#800000", "#b70000", "#ffb7b7"];

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

function randomParams(round = true) {
  const res = {
    m: Maf.randomInRange(0, 20),
    n1: Maf.randomInRange(0.5, 50),
    n2: Maf.randomInRange(0.5, 50),
    n3: Maf.randomInRange(0.5, 50),
  };
  if (round) {
    res.m = Math.round(res.m);
    res.n1 = Math.round(res.n1 * 1) / 1;
    res.n2 = Math.round(res.n2 * 1) / 1;
    res.n3 = Math.round(res.n3 * 1) / 1;
  }
  if (res.n1 === 0) res.n1 = 0.25;
  if (res.n2 === 0) res.n2 = 0.25;
  if (res.n3 === 0) res.n3 = 0.25;
  res.n1 *= Math.random() > 0.5 ? 1 : -1;
  res.n2 *= Math.random() > 0.5 ? 1 : -1;
  res.n3 *= Math.random() > 0.5 ? 1 : -1;
  return res;
}

// let params1 = randomParams();
// let params2 = randomParams();
let params1 = presets[3].a;
let params2 = presets[3].b;
// let params1 = randomParams();
// let params2 = randomParams();

function map(offset) {
  return (p) => {
    return superShape3D(p, params1, params2, offset);
  };
}

const maxDistance = 1000;
const references = pointsOnSphere(100, maxDistance);
function computeSDFBoundaries(fn) {
  console.log("------");
  let min = maxDistance;
  for (const p of references) {
    const d = fn(p);
    if (
      d !== 0 &&
      d !== maxDistance &&
      d !== Infinity &&
      d !== -Infinity &&
      !isNaN(d)
    ) {
      min = Math.min(d, min);
    }
  }
  console.log(min);
  return maxDistance - min;
}

const meshes = [];

const LAYERS = 200;
const SIZE = 5;
const WIDTH = 100;
const DEPTH = 100;

const box = new Mesh(
  new BoxGeometry(SIZE, SIZE, SIZE),
  new MeshNormalMaterial({ wireframe: true })
);
group.add(box);

let scale = 1;
let fn;

function generateSuperShape() {
  const spread = 0;
  fn = map(Maf.randomInRange(-spread, spread));
  scale = 1 / (SIZE * computeSDFBoundaries(fn));
}

function generateLines(scale) {
  const axis = new Vector3(
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1),
    Maf.randomInRange(-1, 1)
  ).normalize();

  const rot = new Matrix4().makeRotationAxis(
    axis,
    0 * Maf.randomInRange(0, 2 * Math.PI)
  );

  console.log(scale);

  for (let k = 0; k < LAYERS; k++) {
    const y = Maf.map(0, LAYERS - 1, -0.5 * SIZE, 0.5 * SIZE, k);

    const axis2 = new Vector3(
      Maf.randomInRange(-1, 1),
      Maf.randomInRange(-1, 1),
      Maf.randomInRange(-1, 1)
    ).normalize();

    const rot2 = new Matrix4().makeRotationAxis(
      axis2,
      Maf.randomInRange(-0 * Math.PI, 0 * Math.PI)
    );

    const p = new Vector3();
    const values = [];
    for (let z = 0; z < DEPTH; z++) {
      values[z] = [];
      for (let x = 0; x < WIDTH; x++) {
        p.set(
          Maf.map(0, WIDTH, -0.5 * SIZE, 0.5 * SIZE, x),
          y,
          Maf.map(0, DEPTH, -0.5 * SIZE, 0.5 * SIZE, z)
        );
        p.multiplyScalar(2 * scale)
          .applyMatrix4(rot)
          .applyMatrix4(rot2);
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
      const repeat = Math.round(
        Maf.randomInRange(1, Math.round(line.length / 10))
      );
      const material = new MeshLineMaterial({
        map: strokeTexture,
        useMap: true,
        color: gradient.getAt(Maf.map(0, LAYERS - 1, 0, 1, k)), //Maf.map(0, LAYERS, 0, 1, k)),
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
        new Vector3(SIZE * (p.x - 0.5), y, SIZE * (p.y - 0.5))
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

generateSuperShape();
generateLines(scale);

function clearScene() {
  for (const mesh of meshes) {
    group.remove(mesh.mesh);
  }
}

document.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") {
    clearScene();
    params1 = randomParams();
    params2 = randomParams();
    generateSuperShape();
    generateLines(scale);
    painted.invalidate();
  }
});

window.generateLines = generateLines;
window.clearScene = clearScene;

group.scale.setScalar(0.1);
scene.add(group);

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

  // group.rotation.x = 0.9 * time * Maf.TAU;
  // group.rotation.y = 2 * time * Maf.TAU;
  // group.rotation.z = 1.1 * time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
