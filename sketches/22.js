import {
  Scene,
  Mesh,
  Group,
  Vector2,
  Vector3,
  TextureLoader,
  Color,
  RepeatWrapping,
  MeshNormalMaterial,
  DoubleSide,
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

palette.range = [
  "#1e242c",
  "#4a5b6b",
  "#8da0b4",
  "#cdd9e6",
  "#f5f8fb",
  // "#3a8beb",
  // "#6b9dd8",
  // "#3ab485",
  //   "#ebb43a",
  //   "#e74c3c",
];

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
//palette.range = ["#000000", "#555555"];

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

camera.position.set(3, 2.5, 3).multiplyScalar(0.3);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;

const SCALE = 1;
const WIDTH = 200 / SCALE;
const HEIGHT = 200 / SCALE;

//const func = generateNoiseFunction();
const func = seedFunc(
  67.14916212144274,
  -66.58264922976667,
  26.30802081903076,
  -49.46527967481953,
  -80.13398717797276,
  -59.007133755175765
);

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
    gain
  );
}

const meshes = [];

const center = new Vector3(0.5 * WIDTH, 0, 0.5 * HEIGHT);
const p = new Vector3();
async function generateIsoLines() {
  const values = [];
  const s = 150;
  const offset = Maf.randomInRange(-WIDTH, WIDTH);
  for (let y = 0; y < HEIGHT; y++) {
    values[y] = [];
    for (let x = 0; x < WIDTH; x++) {
      values[y][x] = pattern(
        x * SCALE + offset,
        y * SCALE + offset,
        s,
        2,
        0,
        1
      );
    }
  }

  const LINES = 100;
  for (let i = 0; i < LINES; i++) {
    await waitForRender();
    painted.invalidate();

    const paths = MarchingSquares.generateIsolines(
      values,
      -0.9 + (1.8 * i) / LINES,
      WIDTH,
      HEIGHT
    );

    for (const path of paths) {
      const z = (i * 5000) / LINES / SCALE;
      const points = path.map((p) =>
        new Vector3(p.x, z * 2, p.y)
          .multiplyScalar(1 / WIDTH)
          .sub(center)
          .multiplyScalar(0.05)
      );

      const l = Math.round(Maf.randomInRange(1, path.length / 20));

      const material = new MeshLineMaterial({
        map: strokeTexture,
        useMap: true,
        color: gradient.getAt(i / LINES), //Maf.randomInRange(0, 1)),
        sizeAttenuation: true,
        lineWidth: 0.01,
        opacity: 1,
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
      group.add(mesh);

      meshes.push({ mesh, offset: 0, speed: 0 });
    }
  }
}

generateIsoLines();

function clearScene() {
  for (const mesh of meshes) {
    group.remove(mesh.mesh);
  }
}

document.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") {
    clearScene();
    generateIsoLines();
    painted.invalidate();
  }
});

group.scale.setScalar(0.06);
scene.add(group);

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  const t = performance.now();

  if (isRunning) {
    time += (t - lastTime) / 20000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    m.mesh.material.uniforms.uvOffset.value.x = -(time * m.speed + m.offset);
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
