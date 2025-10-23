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

camera.position.set(
  -0.38997204674241887,
  -0.1646326072361011,
  0.3548472598819808
);
camera.position.set(3, 3, 3);
camera.lookAt(group.position);
renderer.setClearColor(0xf8fcfe, 1);

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

const raycaster = new Raycaster(new Vector3(), new Vector3());

const cylinderGeo = RoundedCylinderGeometry(0.25, 0.06, 0.1, 5);
const tube = new Mesh(
  cylinderGeo,
  new MeshNormalMaterial({
    side: DoubleSide,
  })
);
const m = new Matrix4();
m.makeTranslation(0, 0, -0.5);
tube.geometry.applyMatrix4(m);

const rot = new Vector3(0.1, 0.2, 0.3).normalize();

const EPSILON = 0.001;
const MAXSTEPS = 100;
const MAXDIST = 100;
const tmp = new Vector3();

Vector3.prototype.abs = function () {
  return new Vector3(Math.abs(this.x), Math.abs(this.y), Math.abs(this.z));
};

Vector3.prototype.max = function (v) {
  return new Vector3(
    Math.max(this.x, v.x),
    Math.max(this.y, v.y),
    Math.max(this.z, v.z)
  );
};

const zero = new Vector3(0, 0, 0);

function sdRoundBox(p, b, r) {
  const q = tmp.clone().abs().sub(b);
  const l =
    q.max(zero).length() + Math.min(Math.max(q.x, Math.max(q.y, q.z)), 0.0) - r;

  return l;
}

function sdRoundedCylinder(p, ra, rb, h) {
  //vec2 d = vec2( length(p.xz)-ra+rb, abs(p.y) - h + rb );
  const l = p.x + p.z;
  tmp.set(l - ra + rb, Math.abs(p.y) - h + rb);
  //   return min(max(d.x,d.y),0.0) + length(max(d,0.0)) - rb;
  return Math.min(Math.max(tmp.x, tmp.y), 0.0) + tmp.max(zero).length() - rb;
}

class Util {
  constructor(p, r, e) {
    this.p = p;
    this.d = 0;
    this.r = r;
    this.e = e;

    const PI = Math.PI;
    const PHI = 1.618033988749895;
    const TAU = 2 * Math.PI;
    this.Vector3 = new Vector3(1, 1, 1).normalize();
    this.Vector4 = new Vector3(-1, 1, 1).normalize();
    this.Vector5 = new Vector3(1, -1, 1).normalize();
    this.Vector6 = new Vector3(1, 1, -1).normalize();
    this.Vector7 = new Vector3(0, 1, PHI + 1).normalize();
    this.Vector8 = new Vector3(0, -1, PHI + 1).normalize();
    this.Vector9 = new Vector3(PHI + 1, 0, 1).normalize();
    this.Vector10 = new Vector3(-PHI - 1, 0, 1).normalize();
    this.Vector11 = new Vector3(1, PHI + 1, 0).normalize();
    this.Vector12 = new Vector3(-1, PHI + 1, 0).normalize();
    this.Vector13 = new Vector3(0, PHI, 1).normalize();
    this.Vector14 = new Vector3(0, -PHI, 1).normalize();
    this.Vector15 = new Vector3(1, 0, PHI).normalize();
    this.Vector16 = new Vector3(-1, 0, PHI).normalize();
    this.Vector17 = new Vector3(PHI, 1, 0).normalize();
    this.Vector18 = new Vector3(-PHI, 1, 0).normalize();
  }

  begin() {
    this.d = 0;
  }

  add(v) {
    if (this.e) {
      this.d += Math.pow(Math.abs(this.p.dot(v)), this.e);
    } else {
      this.d = Math.max(this.d, Math.abs(this.p.dot(v)));
    }
  }

  end() {
    if (this.e) {
      return Math.pow(this.d, 1 / this.e) - this.r;
    } else {
      return this.d - this.r;
    }
  }
}

function fIcosahedron(p, r, e) {
  const u = new Util(p, r, e);
  u.begin();
  u.add(u.Vector3);
  u.add(u.Vector4);
  u.add(u.Vector5);
  u.add(u.Vector6);
  u.add(u.Vector7);
  u.add(u.Vector8);
  u.add(u.Vector9);
  u.add(u.Vector10);
  u.add(u.Vector11);
  u.add(u.Vector12);
  return u.end();
}

function fDodecahedron(p, r, e) {
  const u = new Util(p, r, e);
  u.begin();
  u.add(u.Vector13);
  u.add(u.Vector14);
  u.add(u.Vector15);
  u.add(u.Vector16);
  u.add(u.Vector17);
  u.add(u.Vector18);
  return u.end();
}

function map(p) {
  //   let d = sdRoundBox(p, new Vector3(0.5, 0.5, 0.5), 0.1);
  //   let d = sdRoundedCylinder(p, 0.4, 0.1, 0.1);
  //   let d = fIcosahedron(p, 0.5, 50);
  let d = fDodecahedron(p, 0.5, 50);
  return d;
}

function march(ro, rd) {
  let d = EPSILON;
  let t = 0.0;
  for (let i = 0; i < MAXSTEPS; ++i) {
    tmp.copy(rd).multiplyScalar(d).add(ro);
    t = map(tmp);
    if (t < EPSILON || d >= MAXDIST) break;
    d += t;
  }
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

// let sm = new Mesh(sg, new MeshNormalMaterial());
// sm.position.copy(center);
// scene.add(sm);

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
  //   p.z -= 2;
  const tmp = p.clone().multiplyScalar(1);
  //   sm = new Mesh(sg, new MeshNormalMaterial());
  //   sm.position.copy(tmp);
  //   scene.add(sm);
  for (let i = 0; i < N; i++) {
    const res = curl(tmp.multiplyScalar(1.1 * (1 + (0.5 * j) / LINES)), func);
    res.multiplyScalar(0.02);
    p.sub(res);

    const ro = p.clone().normalize().sub(center).normalize().multiplyScalar(1);
    // const sm = new Mesh(sg, new MeshNormalMaterial());
    // sm.position.copy(ro);
    // scene.add(sm);

    const rd = ro.clone().sub(center).normalize().multiplyScalar(-1);

    // const arrowHelper = new ArrowHelper(rd, ro, 0.1, 0xff00ff);
    // scene.add(arrowHelper);

    const d = march(ro, rd);
    const intersects = rd.multiplyScalar(d).add(ro);

    // const sm = new Mesh(sg, new MeshNormalMaterial());
    // sm.position.copy(intersects);
    // scene.add(sm);

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
