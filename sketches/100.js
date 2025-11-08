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
  IcosahedronGeometry,
  MeshBasicMaterial,
  Matrix4,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  DoubleSide,
  ArrowHelper,
  LineBasicMaterial,
  TubeGeometry,
  CatmullRomCurve3,
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
import { init } from "../modules/dipoles-3d.js";
import { CustomTubeGeometry } from "../modules/CustomTubeGeometry.js";
import { GLTFExporter } from "../third_party/GLTFExporter.js";
const group = new Group();

const WIDTH = 1;
const HEIGHT = 1;
const DEPTH = 1;
const points = pointsOnSphere(2000);
const NUMCHARGES = 20;
const chargePoints = pointsOnSphere(NUMCHARGES);
const charges = init(NUMCHARGES, WIDTH, HEIGHT, DEPTH, 0.01);
const tmp = new Vector3();
charges.charges.forEach((p, i) => {
  const pc = chargePoints[i];
  tmp.set(pc.x, pc.y, pc.z);
  // tmp.set(
  //   Maf.randomInRange(-1, 1),
  //   Maf.randomInRange(-1, 1),
  //   Maf.randomInRange(-1, 1)
  // );
  // tmp.set(p.x, p.y, p.z);
  tmp.normalize();
  p.x = tmp.x;
  p.y = tmp.y;
  p.z = tmp.z;

  // const mesh = new Mesh(
  //   new IcosahedronGeometry(0.1, 2),
  //   new MeshNormalMaterial()
  // );
  // mesh.position.copy(tmp);
  // group.add(mesh);
});

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
renderer.setClearColor(0xf8fcfe, 1);

const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;
const resolution = new Vector2(canvas.width, canvas.height);

const meshes = [];

const material = new MeshNormalMaterial(); //MeshBasicMaterial({ wireframe: true, color: 0 });
const sphere = new Mesh(new IcosahedronGeometry(1, 7), material);
group.add(sphere);

function renderLines() {
  const step = 1;
  const v = new Vector3();
  for (const pt of points) {
    v.set(pt.x, pt.y, pt.z).normalize();
    let m = 5;
    let d = { x: 0, y: 0, z: 0 };
    let a;

    const colors = [];
    const POINTS = 200; //Math.round(Maf.randomInRange(50, 100));

    const geo = new Float32Array(POINTS * 3);
    let ptr = 0;
    const s = 0.01;
    const pts = [];
    const t = new Vector3();

    for (let j = 0; j < POINTS; j++) {
      const dir = charges.calcDirection(v.x, v.y, v.z);
      t.set(dir.x, dir.y, dir.z).normalize().multiplyScalar(s);

      v.add(t);
      v.normalize();

      t.copy(v);
      // t.multiplyScalar(1 + (j * 0.1) / POINTS);
      geo[ptr] = t.x;
      geo[ptr + 1] = t.y;
      geo[ptr + 2] = t.z;

      pts.push(t.clone());

      const col = j / 100;
      colors.push(col, col, col);

      ptr += 3;
    }

    const curve = new CatmullRomCurve3(pts);
    const l = curve.getLength();

    const tubeGeometry = new CustomTubeGeometry(
      curve,
      POINTS / 2,
      0.02 * l,
      36,
      false,
      (p) => Maf.parabola(p, 1)
    );
    const tube = new Mesh(tubeGeometry, material);
    group.add(tube);

    // var g = new MeshLine();
    // g.setPoints(geo, (p) => Maf.parabola(p, 0.4));

    // var mesh = new Mesh(g.geometry, material);
    // mesh.geo = geo;
    // mesh.g = g;

    // meshes.push({
    //   mesh,
    //   offset: Maf.randomInRange(-100, 100),
    //   speed: Maf.randomInRange(1, 2),
    // });
    // group.add(mesh);
    // lineGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    // const line = new Line(lineGeometry, material);
    // group.add(line);
  }
}
group.scale.set(0.25, 0.25, 0.25);

const link = document.createElement("a");
link.style.display = "none";
document.body.appendChild(link); // Firefox workaround, see #6594

function save(blob, filename) {
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();

  // URL.revokeObjectURL( url ); breaks Firefox...
}

function saveString(text, filename) {
  save(new Blob([text], { type: "text/plain" }), filename);
}

function saveArrayBuffer(buffer, filename) {
  save(new Blob([buffer], { type: "application/octet-stream" }), filename);
}

function exportGLTF(input) {
  const gltfExporter = new GLTFExporter();

  gltfExporter.parse(
    input,
    function (result) {
      if (result instanceof ArrayBuffer) {
        saveArrayBuffer(result, "scene.glb");
      } else {
        const output = JSON.stringify(result, null, 2);
        console.log(output);
        saveString(output, "scene.gltf");
      }
    },
    function (error) {
      console.log("An error happened during parsing", error);
    },
    {}
  );
}

const button = document.createElement("button");
button.textContent = "Download GLTF";
button.addEventListener("click", (e) => {
  exportGLTF(group);
  e.preventDefault();
});
document.body.querySelector(".recordPanel").append(button);

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

  renderer.render(scene, camera);
  // painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
