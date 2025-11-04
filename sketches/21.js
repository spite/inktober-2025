import {
  Scene,
  Mesh,
  Group,
  BufferGeometry,
  Vector2,
  Vector3,
  BufferAttribute,
  TextureLoader,
  Color,
} from "three";
import { renderer, getCamera, isRunning, onResize } from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Painted } from "../modules/painted.js";
import { Easings } from "../modules/easings.js";

const painted = new Painted({ minLevel: -0.5 });

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

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

// palette.range = [
//   "#DDAA44",
//   "#B9384C",
//   "#7E9793",
//   "#F8F6F2",
//   "#3D5443",
//   "#2F2D30",
//   "#AEC2DA",
//   "#8C7F70",
// ];
// palette.range = [
//   "#ceccc2",
//   "#32567b",
//   "#914251",
//   "#fa8f59",
//   "#7b7c76",
//   "#3eb9d6",
//   "#9ca198",
//   "#c77d80",
//   "#aba185",
//   "#d89e9d",
// ];
// palette.range = [
//   "#1f4164",
//   "#4a789c",
//   "#7ab1cc",
//   "#6e8a84",
//   "#e9e4d9",
//   "#aeb9c4",
//   "#4c5b6c",
//   "#e09a56",
//   "#b47b86",
//   "#d6b77b",
// ];
palette.range = [
  "#FD7555",
  "#FE4F2E",
  "#040720",
  "#EB9786",
  "#E02211",
  "#3A0724",
  "#F9C163",
];

const gradient = new gradientLinear(palette.range);

const canvas = renderer.domElement;
const camera = getCamera();
const scene = new Scene();
const group = new Group();
const controls = new OrbitControls(camera, canvas);

controls.addEventListener("change", () => {
  painted.invalidate();
});

camera.position.set(7.8, 3.6, 7.3);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);
painted.backgroundColor.set(new Color(0xf6f2e9));

const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");

const N = 400;
const meshes = [];

const vertices = [];

function generateShape(t, radius, vertices) {
  vertices.length = 0;
  const q = Easings.InOutQuad(0.5 + 0.5 * Math.cos(Maf.PI + t * Maf.TAU));
  const r = radius;
  for (let i = 0; i < N; i++) {
    const tw = 2.5 * Math.PI * q;
    const th = (i * Maf.TAU) / N;

    const ph = Math.cos(th) * tw;
    const y = r * Math.cos(th);
    const x = r * Math.sin(th) * Math.cos(ph);
    const z = r * Math.sin(th) * Math.sin(ph);

    vertices.push(new Vector3(x, y, z));
  }

  vertices.push(vertices[0].clone());

  return vertices;
}

const LINES = 15;
for (let i = 0; i < LINES; i++) {
  const t = Maf.map(0, LINES, 0, 0.1, i);
  const radius = Maf.map(0, LINES, 2, 3, i);
  generateShape(t, radius, vertices);
  const repeat = Math.round(Maf.randomInRange(5, 10));
  const start = Math.round(Maf.randomInRange(1, 0.5 * repeat));
  const line = new MeshLine();
  const offset = Maf.randomInRange(-10, 10);
  const material = new MeshLineMaterial({
    map: strokeTexture,
    useMap: true,
    color: gradient.getAt(Maf.randomInRange(0, 1)),
    lineWidth: Maf.randomInRange(0.1, 0.3),
    offset: Maf.randomInRange(-100, 100),
    repeat: new Vector2(repeat, 1),
    dashArray: new Vector2(start, repeat - start),
    useDash: true,
    uvOffset: new Vector2(offset, 0),
  });
  line.setPoints(vertices, (p) => p);
  const mesh = new Mesh(line.geometry, material);
  group.add(mesh);

  const speed = Maf.randomInRange(0.5, 1);
  meshes.push({ mesh, t, line, radius, offset, speed });
}

scene.add(group);

let lastTime = performance.now();
let time = 0;

function draw(startTime) {
  const t = performance.now();
  if (isRunning) {
    time += (t - lastTime) / 1000 / 10;
    painted.invalidate();
  }

  meshes.forEach((m) => {
    generateShape(m.t + time, m.radius, vertices);
    m.line.setPoints(vertices);
    m.mesh.material.uniforms.uvOffset.value.x = m.offset - time * m.speed;
  });

  group.rotation.x = Maf.PI / 8;

  painted.render(renderer, scene, camera);

  lastTime = t;
}

export { draw, canvas };
