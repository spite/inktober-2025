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
import { KnotCurve } from "../third_party/CurveExtras.js";
import { Painted } from "../modules/painted.js";

const painted = new Painted({ minLevel: -0.2 });

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

palette.range = [
  "#F5CEB4",
  "#FEE8DD",
  "#FE9A75",
  "#261738",
  "#BAACDB",
  "#D05A34",
  "#2D2EA2",
  "#E69B46",
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

camera.position.set(35, 15, -35).multiplyScalar(0.085);
camera.lookAt(group.position);
group.position.y -= 0.3;
renderer.setClearColor(0, 0);

const strokeTexture = new TextureLoader().load(
  "./assets/watercolor-brush-stroke.jpg"
);
const resolution = new Vector2(canvas.width, canvas.height);

const N = 80 * 6;
const curve = new KnotCurve();

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
    lineWidth: Maf.map(0, 1, 0.01, 0.2, w),
    useDash: true,
    opacity: Maf.map(0, 1, 0.5, 1, 1 - w),
  });

  var mesh = new Mesh(g.geometry, material);
  mesh.geo = geo;
  mesh.g = g;

  return mesh;
}

const up = new Vector3(0, 1, 0);
const LINES = 100;
const meshes = [];
for (let j = 0; j < LINES; j++) {
  const mesh = prepareMesh(Maf.randomInRange(0, 1), Maf.randomInRange(0, 1));
  group.add(mesh);
  const offset = Maf.randomInRange(0, 1);
  const vertices = new Float32Array(N * 3);
  const mat = new Matrix4();
  const RSEGS = 80;
  const r2 = Maf.randomInRange(0.5, 1.5);
  for (let i = 0; i < N - 1; i++) {
    const segment = i / (N - 1);
    const ringAngle = (1 * i * Maf.TAU) / RSEGS;
    const p = curve.getPoint(segment);
    const p2 = curve.getPoint(segment + 0.001);
    const d = new Vector3(
      r2 * Math.cos(ringAngle),
      r2 * Math.sin(ringAngle),
      0
    );
    mat.lookAt(p, p2, up);
    d.applyMatrix4(mat);
    p.multiplyScalar(0.025);
    vertices[i * 3] = p.x + d.x;
    vertices[i * 3 + 1] = p.y + d.y;
    vertices[i * 3 + 2] = p.z + d.z;
  }
  vertices[(N - 1) * 3] = vertices[0];
  vertices[(N - 1) * 3 + 1] = vertices[1];
  vertices[(N - 1) * 3 + 2] = vertices[2];
  const repeat = Math.round(Maf.randomInRange(10, 20));
  mesh.material.uniforms.repeat.value.x = repeat;
  mesh.material.uniforms.dashArray.value.set(
    1,
    Math.floor(Maf.randomInRange(0.5 * repeat, repeat - 1))
  );
  mesh.material.uniforms.uvOffset.value.x = Maf.randomInRange(-10, 10);
  mesh.g.setPoints(vertices, (p) => Maf.parabola(p, 0.5));
  mesh.scale.setScalar(5);
  mesh.rotation.x = Maf.randomInRange(-0.1, 0.1);
  const speed = Math.floor(Maf.randomInRange(1, 4));
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
    const tt = Maf.mod(m.speed * time, 1);
    m.mesh.material.uniforms.uvOffset.value.x = -1 * tt - m.offset;
  });

  group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
