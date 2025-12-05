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
  BoxGeometry,
  MeshBasicMaterial,
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
import {
  sphericalToCartesian,
  cartesianToSpherical,
} from "../modules/conversions.js";

const painted = new Painted({ minLevel: -0.2 });
// const curl = generateNoiseFunction();

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

// palette.range = ["#57424A", "#FE695A", "#DDAA44"];

palette.range = [
  "#8da0b4",
  "#cdd9e6",
  // "#4a5b6b",
  // "#1e242c",
  // "#3a8beb",
  "#6b9dd8",
  // "#3ab485",
  "#ebb43a",
  //   "#e74c3c",
];

// palette.range = [
//   "#DDAA44",
//   "#B9384C",
//   "#7E9793",
//   "#3D5443",
//   "#2F2D30",
//   "#ebb43a",
// ];
// palette.range = ["#000000", "#b70000", "#ffffff"];

palette.range = ["#FEF2CD", "#E2902D", "#B9384C", "#7E9793", "#3D5443"];

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

camera.position.set(
  -0.38997204674241887,
  -0.1646326072361011,
  0.3548472598819808
);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const strokeTexture = new TextureLoader().load("./assets/brush3.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;

const SCALE = 1;
const WIDTH = 300 / SCALE;
const HEIGHT = 300 / SCALE;

//const func = generateNoiseFunction();
const func = seedFunc(
  67.14916212144274,
  -66.58264922976667,
  26.30802081903076,
  -49.46527967481953,
  -80.13398717797276,
  -59.007133755175765
);

function fbm(x, y, z, scale, octaves, lacunarity, gain) {
  scale = scale || 1;
  octaves = octaves || 1;
  lacunarity = lacunarity || 2;
  gain = gain || 0.5;

  var total = 0;
  var amplitude = 1;
  var frequency = 1;

  for (var i = 0; i < octaves; i++) {
    var v =
      perlin.simplex3(
        (x / scale) * frequency,
        (y / scale) * frequency,
        (z / scale) * frequency
      ) * amplitude;
    total = total + v;
    frequency = frequency * lacunarity;
    amplitude = amplitude * gain;
  }

  return total;
}

function pattern1(x, y, z, scale = 1) {
  return perlin.simplex3(x * scale, y * scale, z * scale);
}

function generate(d = 10) {
  const v = [];
  for (let i = 0; i < 9; i++) {
    v[i] = Maf.randomInRange(-d, d);
  }
  return function (x, y, z, scale = 1) {
    const s = 0.002;
    const octaves = 4;
    const lacunarity = 0.8;
    const gain = 0;

    var q = [
      fbm(
        x * s + v[0],
        y * s + v[1],
        z * s + v[2],
        scale,
        octaves,
        lacunarity,
        gain
      ),
      fbm(
        x * s + v[3],
        y * s + v[4],
        z * s + v[5],
        scale,
        octaves,
        lacunarity,
        gain
      ),
      fbm(
        x * s + v[6],
        y * s + v[7],
        z * s + v[8],
        scale,
        octaves,
        lacunarity,
        gain
      ),
    ];

    return fbm(
      x + 100.0 * q[0],
      y + 100.0 * q[1],
      z + 100.0 * q[2],
      scale,
      octaves,
      lacunarity,
      gain
    );
  };
}

// function pattern2(x, y, z, scale = 1) {
//   const s = 0.002;
//   const octaves = 4;
//   const lacunarity = 0.8;
//   const gain = 0;

//   var q = [
//     fbm(x * s, y * s, z * s, scale, octaves, lacunarity, gain),
//     fbm(
//       x * s + 5.2,
//       y * s + 1.3,
//       z * s + 2.7,
//       scale,
//       octaves,
//       lacunarity,
//       gain
//     ),
//     fbm(
//       x * s + 1.7,
//       y * s + 5.3,
//       z * s + 1.6,
//       scale,
//       octaves,
//       lacunarity,
//       gain
//     ),
//   ];

//   return fbm(
//     x + 100.0 * q[0],
//     y + 100.0 * q[1],
//     z + 100.0 * q[2],
//     scale,
//     octaves,
//     lacunarity,
//     gain
//   );
// }
const pattern2 = generate(1);

const meshes = [];
const latSteps = WIDTH;
const lonSteps = HEIGHT;

const noiseScale = Maf.randomInRange(1.5, 2.5);

async function generateIsoLines() {
  const values = [];

  for (let i = 0; i <= lonSteps; i++) {
    values[i] = [];
    const phi = (i / lonSteps) * Math.PI * 2;

    for (let j = 0; j <= latSteps; j++) {
      const theta = (j / latSteps) * Math.PI;

      const n = sphericalToCartesian(1, theta, phi);

      const noiseVal = pattern1(n.x, n.y, n.z, noiseScale);
      // const noiseVal = pattern2(n.x, n.y, n.z, 0.8);

      values[i][j] = noiseVal;
    }
  }

  const LINES = 10;
  for (let i = 0; i < LINES; i++) {
    const paths = MarchingSquares.generateIsolines(
      values,
      -0.9 + (1.8 * i) / LINES,
      1 / WIDTH,
      1 / HEIGHT
    );

    for (const path of paths) {
      await waitForRender();
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
        map: strokeTexture,
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

      group.add(mesh);

      meshes.push({
        mesh,
        offset: Maf.randomInRange(-1, 1),
        speed: Maf.randomInRange(1, 2),
      });

      const material2 = new MeshLineMaterial({
        map: strokeTexture,
        useMap: true,
        color: gradient.getAt(c),
        sizeAttenuation: true,
        lineWidth: Maf.map(0, LINES - 1, 0.006, 0.002, i),
        opacity: 1,
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
    m.mesh.material.uniforms.uvOffset.value.x = time * 10 * m.speed + m.offset;
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
