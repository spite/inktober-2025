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

const painted = new Painted({ minLevel: -0.2 });

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

palette.range = [
  "#F62D62",
  "#FFFFFF",
  "#FDB600",
  "#F42D2D",
  "#544C98",
  "#ECACBC",
];

palette.range = [
  "#1e242c",
  "#4a5b6b",
  "#8da0b4",
  "#cdd9e6",
  "#f5f8fb",
  // "#3a8beb",
  "#6b9dd8",
  // "#3ab485",
  "#ebb43a",
  "#e74c3c",
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

camera.position.set(35, 15, -35).multiplyScalar(0.075);
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
    lineWidth: w / 10,
    opacity: Maf.randomInRange(0.6, 0.8),
    repeat: new Vector2(Math.round(Maf.randomInRange(1, 5)) * 10, 1),
  });

  var mesh = new Mesh(g.geometry, material);
  mesh.geo = geo;
  mesh.g = g;

  return mesh;
}

const LINES = 40;
const meshes = [];
for (let j = 0; j < LINES; j++) {
  const mesh = prepareMesh(
    0.5 * Maf.randomInRange(0.1, 2),
    Maf.randomInRange(0, 1)
  );
  group.add(mesh);
  const offset = Maf.randomInRange(0, 1);
  const vertices = new Float32Array(N * 3);
  const mat = new Matrix4();
  const RSEGS = 40;
  const r1 = 0.5 * Maf.randomInRange(2, 2.5);
  const r2 = 0.75 * Maf.randomInRange(0.5, 1);
  const offAngle = Maf.randomInRange(0, 0.1 * Maf.TAU);
  for (let i = 0; i < N; i++) {
    const segment = i / RSEGS;
    const ringAngle = (i * Maf.TAU) / RSEGS;
    const segAngle = (segment * Maf.TAU) / (N / RSEGS);
    const p = new Vector3(r1 * Math.cos(segAngle), 0, r1 * Math.sin(segAngle));
    const d = new Vector3(
      r2 * Math.cos(ringAngle),
      r2 * Math.sin(ringAngle),
      0
    );
    mat.makeRotationY(-segAngle + offAngle);
    d.applyMatrix4(mat);
    vertices[i * 3] = p.x + d.x;
    vertices[i * 3 + 1] = p.y + d.y;
    vertices[i * 3 + 2] = p.z + d.z;
  }
  vertices[(N - 1) * 3] = vertices[0];
  vertices[(N - 1) * 3 + 1] = vertices[1];
  vertices[(N - 1) * 3 + 2] = vertices[2];
  //   mesh.material.uniforms.dashArray.value.set(Maf.randomInRange(0.5, 0.5), 2);
  mesh.g.setPoints(vertices);
  mesh.scale.setScalar(5);
  const speed = 1; // Math.floor(Maf.randomInRange(1, 4));
  meshes.push({ mesh, offset, speed });
}
group.scale.setScalar(0.1);
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
    //m.mesh.material.uniforms.dashArray.value.set(.5 + .5 * Maf.parabola(tt, 1), 2);
    m.mesh.material.uniforms.dashOffset.value = -1 * tt - m.offset;
    m.mesh.material.uniforms.uvOffset.value.x = m.offset + tt * m.speed;
  });

  group.rotation.y = time * Maf.TAU;
  group.rotation.z = (Easings.InQuad(Maf.parabola(time, 1)) * Maf.TAU) / 16;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas };
