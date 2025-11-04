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
  DoubleSide,
  ArrowHelper,
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
import { march, sdIcosahedron, sdDodecahedron } from "../modules/raymarch.js";

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

// const func = generateNoiseFunction();
const func = seedFunc(
  66.20243698564775,
  69.0225914220843,
  0.601423916465734,
  28.44243021261002,
  -89.41275690441333,
  24.71859960593177
);

const rot = new Vector3(0.1, 0.2, 0.3).normalize();

function map(p) {
  let d = sdDodecahedron(p, 0.5, 50);
  return d;
}

const N = 100;
const up = new Vector3(0, 1, 0);
const center = new Vector3(0, 0, 0);
const LINES = 1000;
const meshes = [];
const points = pointsOnSphere(LINES);
const sg = new BoxGeometry(0.01, 0.01, 0.01);

const geo = new Float32Array(N * 3);
const radius = 2;
const lineWidth = 1;

function prepareMesh(w, c) {
  var g = new MeshLine();
  g.setPoints(geo, function (p) {
    return p;
  });

  const repeat = Math.round(Maf.randomInRange(1, 10));
  const material = new MeshLineMaterial({
    map: strokeTexture,
    useMap: true,
    color: gradient.getAt(c),
    resolution: resolution,
    sizeAttenuation: true,
    lineWidth: w,
    repeat: new Vector2(repeat, 1),
    dashArray: new Vector2(1, repeat - 1),
    useDash: true,
    // dashOffset: 0,
  });

  var mesh = new Mesh(g.geometry, material);
  mesh.geo = geo;
  mesh.g = g;

  return mesh;
}

for (let j = 0; j < LINES; j++) {
  const mesh = prepareMesh(
    0.01 * Maf.randomInRange(0.01, 1),
    Maf.randomInRange(0, 1)
  );
  group.add(mesh);
  const offset = Maf.randomInRange(-1, 0);
  const vertices = new Float32Array(N * 3);
  const r = 2;
  let p = new Vector3(
    Maf.randomInRange(-r, r),
    Maf.randomInRange(-r, r),
    Maf.randomInRange(-r, r)
  );
  p.copy(points[j]);
  const tmp = p.clone().multiplyScalar(1);
  for (let i = 0; i < N; i++) {
    const res = curl(tmp.multiplyScalar(1.1 * (1 + (0.5 * j) / LINES)), func);
    res.multiplyScalar(0.02);
    p.sub(res);

    const ro = p.clone().normalize().sub(center).normalize().multiplyScalar(1);
    const rd = ro.clone().sub(center).normalize().multiplyScalar(-1);

    const d = march(ro, rd, map);
    const intersects = rd.multiplyScalar(d).add(ro);

    p.copy(intersects).multiplyScalar(1 - (0.2 * j) / LINES);
    tmp.copy(p);
    vertices[i * 3] = p.x;
    vertices[i * 3 + 1] = p.y;
    vertices[i * 3 + 2] = p.z;
  }
  mesh.material.uniforms.dashArray.value.set(
    1,
    Math.round(Maf.randomInRange(1, 2))
  );
  mesh.material.uniforms.repeat.value.x = Math.round(Maf.randomInRange(1, 20));
  mesh.g.setPoints(vertices, (p) => Maf.parabola(p, 0.5));
  mesh.scale.setScalar(5);
  const speed = 1 * Math.round(Maf.randomInRange(1, 3));
  meshes.push({ mesh, offset, speed });
}
group.scale.setScalar(0.08);
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
    m.mesh.material.uniforms.uvOffset.value.x = -(time + m.offset);
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
