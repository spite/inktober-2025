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
  "#E15626",
  "#B94720",
  "#100C18",
  "#A72417",
  "#C8371E",
  "#5D2F25",
  "#EDC09E",
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

camera.position.set(35, 15, -35).multiplyScalar(0.08);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const strokeTexture = new TextureLoader().load("./assets/brush2.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;
const resolution = new Vector2(canvas.width, canvas.height);

const N = 80 * 6;

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
    repeat: new Vector2(5, 1),
    dashArray: new Vector2(1, 1),
    dashOffset: 0,
    useDash: true,
  });

  var mesh = new Mesh(g.geometry, material);
  mesh.geo = geo;
  mesh.g = g;

  return mesh;
}

const LINES = 80;
const meshes = [];
for (let j = 0; j < LINES; j++) {
  const mesh = prepareMesh(
    0.05 * Maf.randomInRange(0.1, 2),
    Maf.randomInRange(0, 1)
  );
  group.add(mesh);
  const offset = Maf.randomInRange(0, 1);
  const vertices = new Float32Array(N * 3);
  const mat = new Matrix4();
  const RSEGS = 80;
  const r1 = 1 + 0.005 * j;
  const r2 = 0.5 + 0.01 * j;
  for (let i = 0; i < N - 1; i++) {
    const segment = i / RSEGS;
    const ringAngle = (i * Maf.TAU) / RSEGS;
    const segAngle = (segment * 4 * Maf.TAU) / ((N - 1) / RSEGS);
    const p = new Vector3(r1 * Math.cos(segAngle), 0, r1 * Math.sin(segAngle));
    const d = new Vector3(
      r2 * Math.cos(ringAngle),
      r2 * Math.sin(ringAngle),
      0
    );
    mat.makeRotationY(-segAngle);
    d.applyMatrix4(mat);
    vertices[i * 3] = p.x + d.x;
    vertices[i * 3 + 1] = p.y + d.y;
    vertices[i * 3 + 2] = p.z + d.z;
  }
  vertices[(N - 1) * 3] = vertices[0];
  vertices[(N - 1) * 3 + 1] = vertices[1];
  vertices[(N - 1) * 3 + 2] = vertices[2];
  mesh.material.uniforms.dashArray.value.set(
    Maf.randomInRange(1, 2),
    Maf.randomInRange(4, 8)
  );
  mesh.g.setPoints(vertices);
  mesh.scale.setScalar(5);
  mesh.rotation.y = Maf.randomInRange(-0.1, 0.1);
  mesh.material.uniforms.repeat.value.x =
    2 * Math.floor(Maf.randomInRange(3, 5));
  const speed = Math.floor(Maf.randomInRange(1, 2));
  meshes.push({ mesh, offset, speed });
}
group.scale.setScalar(0.09);
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
    m.mesh.material.uniforms.dashOffset.value = -1 * time - m.offset;
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
