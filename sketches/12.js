import {
  Scene,
  Mesh,
  Group,
  Vector2,
  Vector3,
  TextureLoader,
  Color,
  RepeatWrapping,
  Matrix4,
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
import { curl, generateNoiseFunction, seedFunc } from "../modules/curl.js";

const painted = new Painted({ minLevel: -0.2 });
// const curl = generateNoiseFunction();

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});
palette.range = [
  "#DD5E0F",
  "#2B1BA8",
  "#F02620",
  "#E98965",
  "#F65C48",
  "#24134D",
  "#FDD2D4",
];
palette.range = [
  "#E15626",
  "#B94720",
  "#100C18",
  "#A72417",
  "#C8371E",
  "#5D2F25",
  "#EDC09E",
];
palette.range = ["#000", "#111", "#ddd", "#fff"];

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
  .multiplyScalar(1.1);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;
const resolution = new Vector2(canvas.width, canvas.height);

const N = 200;

const geo = new Float32Array(N * 3);
const radius = 2;
const lineWidth = 1;

function prepareMesh(w, c) {
  var g = new MeshLine();
  g.setPoints(geo, function (p) {
    return p;
  });

  const material = new MeshLineMaterial({
    map: strokeTexture,
    useMap: true,
    color: gradient.getAt(c),
    resolution: resolution,
    sizeAttenuation: true,
    lineWidth: w,
    repeat: new Vector2(1, 1),
    dashArray: new Vector2(1, 0),
    dashOffset: 0,
    useDash: !true,
  });

  var mesh = new Mesh(g.geometry, material);
  mesh.geo = geo;
  mesh.g = g;

  return mesh;
}

const func = generateNoiseFunction();
// const func = seedFunc(
//   18.544783278875173,
//   28.42511319136372,
//   -90.6111180920508,
//   74.47577632946141,
//   -89.16647745747825,
//   -55.989028992098966
// );

const up = new Vector3(0, 1, 0);
const LINES = 100;
const points = pointsOnSphere(LINES);
const meshes = [];
for (let j = 0; j < LINES; j++) {
  const mesh = prepareMesh(
    0.01 * Maf.randomInRange(0.5, 1),
    Maf.randomInRange(0, 1)
  );
  group.add(mesh);
  const offset = Maf.randomInRange(-1, 0);
  const vertices = new Float32Array(N * 3);
  const r = 0.2;
  let p = new Vector3(
    Maf.randomInRange(-r, r),
    Maf.randomInRange(-r, r),
    Maf.randomInRange(-r, r)
  );
  p.copy(points[j]).multiplyScalar(r);
  p.x += Maf.randomInRange(-0.01, 0.01);
  p.y += Maf.randomInRange(-0.01, 0.01);
  p.z += Maf.randomInRange(-0.01, 0.01);
  const tmp = p.clone();
  for (let i = 0; i < N; i++) {
    const res = curl(tmp.multiplyScalar(0.75), func);
    res.normalize().multiplyScalar(0.03);
    p.add(res);
    p.normalize().multiplyScalar(0.5);
    tmp.copy(p);
    p.multiplyScalar(1 + (0.1 * j) / LINES);
    vertices[i * 3] = p.x;
    vertices[i * 3 + 1] = p.y;
    vertices[i * 3 + 2] = p.z;
  }
  mesh.material.uniforms.dashArray.value.set(1, 1);
  mesh.material.uniforms.repeat.value.x = 10;
  mesh.g.setPoints(vertices, (p) => 2 * Maf.parabola(p, 0.5));
  mesh.scale.setScalar(5);
  const speed = Math.round(Maf.randomInRange(1, 3));
  meshes.push({ mesh, offset, speed });
}
group.scale.setScalar(0.06);
scene.add(group);

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  const t = performance.now();

  if (isRunning) {
    time += (t - lastTime) / 10000;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    // m.mesh.material.uniforms.dashOffset.value = -(time + m.offset);
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
