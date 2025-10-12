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

const circleRadius = 2;
const geometry = new BufferGeometry();
const vertices = [];
for (let j = 0; j <= 1 * Math.PI; j += Math.PI / 72) {
  const v = new Vector3(
    0,
    circleRadius * Math.cos(j),
    circleRadius * Math.sin(j)
  );
  vertices.push(v.x, v.y, v.z);
}
vertices.reverse();
geometry.setAttribute(
  "position",
  new BufferAttribute(new Float32Array(vertices), 3)
);

const resolution = new Vector2(canvas.width, canvas.height);
const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");
const normalMapTexture = new TextureLoader().load("./assets/NormalMap.png");

const circles = [];
const SIDES = 72;
for (let i = 0; i < SIDES; i++) {
  const line = new MeshLine();
  const material = new MeshLineMaterial({
    map: strokeTexture,
    useMap: true,
    normalMap: normalMapTexture,
    useNormalMap: true,
    color: new Color().setHSL(i / SIDES, 1, 0.5),
    lineWidth: 0.3,
    resolution: resolution,
    offset: Maf.randomInRange(-100, 100),
    opacity: 0.8,
  });
  line.setGeometry(geometry, (p) => p);
  const mesh = new Mesh(line.geometry, material);
  const pivot = new Group();
  const a = Maf.randomInRange(0, Maf.TAU);
  const x = 3 * Math.sin(a);
  const y = (4 * (-0.5 * SIDES + i)) / SIDES;
  const z = 3 * Math.cos(a);
  pivot.position.set(0, y, 0);
  const tilt = 0.15;
  pivot.rotation.x = Maf.randomInRange(-tilt, tilt);
  pivot.rotation.z = Maf.randomInRange(-tilt, tilt);
  mesh.rotation.x = Math.PI / 2;
  pivot.add(mesh);
  group.add(pivot);
  mesh.scale.setScalar(
    Maf.parabola(i / SIDES, 0.5) + Maf.randomInRange(-0.1, 0.1)
  );
  circles.push({
    mesh,
    pivot,
    x,
    c: Maf.randomInRange(0, 1),
    speed: 1 + Math.round(Maf.randomInRange(0, 2)),
    z,
    a,
  });
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

  circles.forEach((c, id) => {
    c.pivot.rotation.y = -c.speed * time * Maf.TAU + c.a;
    c.mesh.material.uniforms.color.value.copy(gradient.getAt(c.c));
  });

  group.rotation.x = Maf.PI / 8;

  painted.render(renderer, scene, camera);

  lastTime = t;
}

export { draw, canvas };
