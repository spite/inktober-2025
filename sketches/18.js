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
  Matrix4,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
  ArrowHelper,
  LineBasicMaterial,
  Line,
  Raycaster,
} from "three";
import { renderer, getCamera, isRunning, onResize } from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Easings } from "../modules/easings.js";
import { Painted } from "../modules/painted.js";
import { pointsOnSphere } from "../modules/points-sphere.js";
import { curl, seedFunc, generateNoiseFunction } from "../modules/curl.js";
import { RoundedCylinderGeometry } from "../modules/rounded-cylinder-geometry.js";
import { march, sdIcosahedron } from "../modules/raymarch.js";
import { Poisson2D } from "../modules/poisson-2d.js";
import { init } from "../modules/dipoles-2d.js";

const WIDTH = 1000;
const HEIGHT = 1000;
const poisson = new Poisson2D(WIDTH, HEIGHT, 20);
const points = poisson.calculate();
const charges = init(30, WIDTH, HEIGHT, 100);

const painted = new Painted({ minLevel: -0.2 });
// const curl = generateNoiseFunction();

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

palette.range = [
  "#026BFA",
  "#028DFA",
  "#1D43BB",
  "#53C2FB",
  "#FB1A20",
  "#ABD0E3",
  "#7C505F",
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
  "#ebb43a",
  "#e74c3c",
];

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

camera.position
  .set(-0.38997204674241887, -0.1646326072361011, 0.3548472598819808)
  .multiplyScalar(2);
// camera.position.set(3, 3, 3);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;
const resolution = new Vector2(canvas.width, canvas.height);

const meshes = [];

function renderLines() {
  const d = new Vector2();
  for (const pt of points) {
    let tx = pt.x;
    let ty = pt.y;
    let m = 5;

    const colors = [];
    const STEPS = Math.round(Maf.randomInRange(10, 50));
    const geo = new Float32Array(STEPS * 3);
    let ptr = 0;

    for (let j = 0; j < STEPS; j++) {
      const dir = charges.calcDirection(tx, ty);
      d.set(dir.x, dir.y).normalize().multiplyScalar(m);
      tx += d.x;
      ty += d.y;

      const v = dir.v / 10;
      const h = v / Math.abs(Math.exp(Math.abs(v)));

      geo[ptr] = (tx - 0.5 * WIDTH) / WIDTH;
      geo[ptr + 1] = (ty - 0.5 * HEIGHT) / HEIGHT;
      geo[ptr + 2] = h;

      const col = j / 100;
      colors.push(col, col, col);

      ptr += 3;
    }
    const repeat = Math.round(Maf.randomInRange(1, 10));

    const material = new MeshLineMaterial({
      map: strokeTexture,
      useMap: true,
      color: gradient.getAt(Maf.randomInRange(0, 1)),
      resolution,
      sizeAttenuation: true,
      lineWidth: 0.01,
      // repeat: new Vector2(repeat, 1),
      // dashArray: new Vector2(1, repeat - 1),
      // useDash: true,
      // dashOffset: 0,
    });

    var g = new MeshLine();
    g.setPoints(geo, function (p) {
      return p;
    });

    var mesh = new Mesh(g.geometry, material);
    mesh.geo = geo;
    mesh.g = g;

    meshes.push({
      mesh,
      offset: Maf.randomInRange(-100, 100),
      speed: Maf.randomInRange(1, 2),
    });
    group.add(mesh);
    // lineGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    // const line = new Line(lineGeometry, material);
    // group.add(line);
  }
}

renderLines();
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
    m.mesh.material.uniforms.uvOffset.value.x = -(
      time * 10 * m.speed +
      m.offset
    );
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
