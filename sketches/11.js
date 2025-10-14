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
import { curl } from "../modules/curl.js";

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

camera.position.set(
  -0.38997204674241887,
  -0.1646326072361011,
  0.3548472598819808
);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;
const resolution = new Vector2(canvas.width, canvas.height);

const N = 100;

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
    near: camera.near,
    far: camera.far,
    repeat: new Vector2(5, 1),
    dashArray: new Vector2(1, 3),
    dashOffset: 0,
    useDash: true,
    opacity: Maf.randomInRange(0.5, 1),
  });

  var mesh = new Mesh(g.geometry, material);
  mesh.geo = geo;
  mesh.g = g;

  return mesh;
}

const up = new Vector3(0, 1, 0);
const LINES = 400;
const points = pointsOnSphere(LINES);
const meshes = [];
for (let j = 0; j < LINES; j++) {
  const mesh = prepareMesh(
    0.01 * Maf.randomInRange(0.01, 1.5),
    Maf.randomInRange(0, 1)
  );
  group.add(mesh);
  const offset = Maf.randomInRange(-1, 1);
  const vertices = new Float32Array(N * 3);
  const r = 0.2;
  let p = new Vector3(
    Maf.randomInRange(-r, r),
    Maf.randomInRange(-r, r),
    Maf.randomInRange(-r, r)
  );
  p.copy(points[j]).multiplyScalar(r);
  const tmp = p.clone();
  for (let i = 0; i < N; i++) {
    const res = curl(tmp.multiplyScalar(1));
    res.multiplyScalar(0.02);
    p.add(res);
    tmp.copy(p);
    vertices[i * 3] = p.x;
    vertices[i * 3 + 1] = p.y;
    vertices[i * 3 + 2] = p.z;
  }
  mesh.material.uniforms.dashArray.value.set(1, Maf.randomInRange(0, 1));
  mesh.material.uniforms.repeat.value.x =
    1 * Math.round(Maf.randomInRange(3, 6));
  mesh.g.setPoints(vertices);
  mesh.scale.setScalar(5);
  const speed = 4 * Math.round(Maf.randomInRange(1, 3));
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
    const tt = Maf.mod(m.speed * time, 1);
    m.mesh.material.uniforms.dashOffset.value = -1 * tt - m.offset;
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
