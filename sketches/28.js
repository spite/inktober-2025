import {
  Scene,
  Mesh,
  Group,
  Line,
  Vector2,
  Vector3,
  TextureLoader,
  Color,
  LineBasicMaterial,
  BufferGeometry,
  RepeatWrapping,
  MeshNormalMaterial,
  CatmullRomCurve3,
  BoxGeometry,
  Raycaster,
} from "three";
import {
  renderer,
  getCamera,
  isRunning,
  onResize,
  waitForRender,
} from "../modules/three.js";
import { MeshLine, MeshLineMaterial } from "../modules/three-meshline.js";
import Maf from "maf";
import { palette2 as palette } from "../modules/floriandelooij.js";
import { gradientLinear } from "../modules/gradient.js";
import { OrbitControls } from "OrbitControls";
import { Easings } from "../modules/easings.js";
import { Painted } from "../modules/painted.js";
import { pointsOnSphere } from "../modules/points-sphere.js";
import { curl, seedFunc } from "../modules/curl.js";
import { MarchingSquares } from "../modules/marching-squares.js";
import perlin from "../third_party/perlin.js";
const painted = new Painted({ minLevel: -0.2 });
// const curl = generateNoiseFunction();
import { Poisson2D } from "../modules/poisson-2d.js";
import { Grid } from "../modules/grid-3d.js";

onResize((w, h) => {
  const dPR = renderer.getPixelRatio();
  painted.setSize(w * dPR, h * dPR);
});

palette.range = [
  "#FE695A",
  "#0F2246",
  "#CE451C",
  "#FEF2CD",
  "#EEC1A6",
  "#57424A",
  "#E2902D",
];

// palette.range = [
//   "#1e242c",
//   "#4a5b6b",
//   "#8da0b4",
//   "#cdd9e6",
//   "#f5f8fb",
//   // "#3a8beb",
//   // "#6b9dd8",
//   // "#3ab485",
//   //   "#ebb43a",
//   //   "#e74c3c",
// ];

// palette.range = [
//   "#DDAA44",
//   "#B9384C",
//   "#7E9793",
//   "#F8F6F2",
//   "#3D5443",
//   "#2F2D30",
//   "#ebb43a",
//   "#ffffff",
// ];
// palette.range = ["#000000", "#ffffff"];

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

camera.position.set(0, 0, 0.5);
camera.lookAt(group.position);
renderer.setClearColor(0, 0);

const strokeTexture = new TextureLoader().load("./assets/brush3.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;

const RADIUS = 8;

//const func = generateNoiseFunction();
const func = seedFunc(
  67.14916212144274,
  -66.58264922976667,
  26.30802081903076,
  -49.46527967481953,
  -80.13398717797276,
  -59.007133755175765
);

const offset = new Vector3(
  Maf.randomInRange(-100, 100),
  Maf.randomInRange(-100, 100),
  Maf.randomInRange(-100, 100)
);

function fbm(x, y, z, scale, octaves, lacunarity, gain) {
  scale = scale || 1;
  octaves = octaves || 1;
  lacunarity = lacunarity || 2;
  gain = gain || 0.5;

  var total = 0;
  var amplitude = 1;
  var frequency = 1;

  for (var i = 0; i < octaves; i++) {
    var v =
      perlin.simplex3(
        (x / scale) * frequency,
        (y / scale) * frequency,
        (z / scale) * frequency
      ) * amplitude;
    total = total + v;
    frequency = frequency * lacunarity;
    amplitude = amplitude * gain;
  }

  return total;
}

function pattern1(x, y, z, scale = 1) {
  return perlin.simplex3(
    x * scale + offset.x,
    y * scale + offset.y,
    z * scale + offset.z
  );
}

function generate(d = 10) {
  const v = [];
  for (let i = 0; i < 9; i++) {
    v[i] = Maf.randomInRange(-d, d);
  }
  return function (x, y, z, scale = 1) {
    const s = 0.002;
    const octaves = 4;
    const lacunarity = 0.8;
    const gain = 0;

    var q = [
      fbm(
        x * s + v[0],
        y * s + v[1],
        z * s + v[2],
        scale,
        octaves,
        lacunarity,
        gain
      ),
      fbm(
        x * s + v[3],
        y * s + v[4],
        z * s + v[5],
        scale,
        octaves,
        lacunarity,
        gain
      ),
      fbm(
        x * s + v[6],
        y * s + v[7],
        z * s + v[8],
        scale,
        octaves,
        lacunarity,
        gain
      ),
    ];

    return fbm(
      x + 100.0 * q[0],
      y + 100.0 * q[1],
      z + 100.0 * q[2],
      scale,
      octaves,
      lacunarity,
      gain
    );
  };
}

// const normalPattern1(x,y,z,scale) {

// }
const pattern2 = generate(0.1);

const meshes = [];

const ITERATIONS = 100;
const LINES = 10;
const WIDTH = LINES;
const HEIGHT = 100;
const SEGMENTS = 200;
const tmp = new Vector3();
const maxDistance = 1;
const up = new Vector3();
const tan = new Vector3();
const dir = new Vector3();

async function generateLines() {
  const lines = [];
  const normals = [];
  for (let i = 0; i < LINES; i++) {
    lines[i] = [];
    normals[i] = [];
    for (let j = 0; j < HEIGHT; j++) {
      // Parallel lines.
      // lines[i].push(
      //   new Vector3(
      //     Maf.map(0, LINES - 1, 0, WIDTH, i) - 0.5 * WIDTH,
      //     0,
      //     j - 0.5 * HEIGHT
      //   )
      // );

      // Rings.
      const r = 0.5 + (i * WIDTH) / LINES;
      const a = (j * 2 * Math.PI) / HEIGHT;
      lines[i].push(new Vector3(r * Math.cos(a), 0, r * Math.sin(a)));

      // Concentric lines.
      // const a = (i * 2 * Math.PI) / LINES;
      // const r = j;
      // lines[i].push(new Vector3(r * Math.cos(a), 0, r * Math.sin(a)));
    }
  }

  for (let i = 0; i < ITERATIONS; i++) {
    console.log(i);
    for (let j = 0; j < lines.length; j++) {
      await waitForRender();
      const line = lines[j];
      for (let k = 0; k < line.length; k++) {
        const p = line[k];
        // const n = normals[j][k];
        tmp.copy(p).multiplyScalar(0.02);
        const dir = curl(tmp).normalize().multiplyScalar(1);
        // const v = pattern1(p.x, p.y, p.z, 0.02);
        // const dir = n.clone().multiplyScalar(v);
        p.add(dir);
      }
      dir
        .copy(line[line.length - 1])
        .sub(line[0])
        .normalize();

      let res = [];
      for (let j = 0; j < line.length - 1; j++) {
        const a = line[j];
        const b = line[j + 1];
        const d = a.distanceTo(b);
        res.push(a);
        if (d > maxDistance) {
          const steps = Math.ceil(d / maxDistance);
          for (let t = 0; t < 1; t += 1 / steps) {
            const c = a.clone().lerp(b, t);
            res.push(c);
          }
        }
      }
      res.push(line[line.length - 1]);

      for (let k = 0; k < res.length - 1; k++) {
        const a = res[k];
        const b = res[k + 1];
        tmp.copy(b).sub(a).normalize();
        tan.crossVectors(dir, tan).normalize();
        normals[j][k] = tan.cross(tmp).normalize();
      }
      lines[j] = res;
    }

    if (i % 10 === 0) {
      let c = 0;
      for (const points of lines) {
        const curve = new CatmullRomCurve3(points);
        const pts = curve.getPoints(curve.getLength() * 2);
        // const pts = points;
        // const length = points.length;

        // for (const p of pts) {
        //   const mesh = new Mesh(
        //     new BoxGeometry(1, 1, 1),
        //     new MeshNormalMaterial()
        //   );
        //   mesh.scale.setScalar(1);
        //   mesh.position.copy(p);
        //   group.add(mesh);
        // }

        const l = (i + 1) * 10; //Math.round(Maf.randomInRange(1, length / 10));
        const material = new MeshLineMaterial({
          map: strokeTexture,
          useMap: true,
          color: gradient.getAt(c / lines.length),
          sizeAttenuation: true,
          lineWidth: 0.00025,
          opacity: 1,
          // repeat: new Vector2(l, 1),
          // dashArray: new Vector2(1, Math.round((i + 1) / 10)),
          // useDash: true,
          // dashOffset: Maf.randomInRange(-l, l),
        });

        var g = new MeshLine();
        g.setPoints(pts);

        var mesh = new Mesh(g.geometry, material);
        mesh.g = g;

        group.add(mesh);

        meshes.push({ mesh, offset: 0, speed: 0 });
        c++;
      }
    }
  }

  // let i = 0;
  // for (const points of lines) {
  //   const curve = new CatmullRomCurve3(points);
  //   const pts = curve.getPoints(curve.getLength() / 2);

  //   const material = new MeshLineMaterial({
  //     map: strokeTexture,
  //     useMap: true,
  //     color: gradient.getAt(i / lines.length),
  //     sizeAttenuation: true,
  //     lineWidth: 0.005,
  //     opacity: 1,
  //     // repeat: new Vector2(l, 1),
  //     // dashArray: new Vector2(1, 2),
  //     // useDash: true,
  //     // dashOffset: Maf.randomInRange(-l, l),
  //   });

  //   var g = new MeshLine();
  //   g.setPoints(pts);

  //   var mesh = new Mesh(g.geometry, material);
  //   mesh.g = g;

  //   group.add(mesh);

  //   meshes.push({ mesh, offset: 0, speed: 0 });

  //   i++;
  //   // for (const p of points) {
  //   //   const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshNormalMaterial());
  //   //   mesh.scale.setScalar(1);
  //   //   mesh.position.copy(p);
  //   //   group.add(mesh);
  //   // }
  //   // const material = new LineBasicMaterial({ color: 0x0000ff });
  //   // const geometry = new BufferGeometry().setFromPoints(pts);
  //   // const line = new Line(geometry, material);
  //   // group.add(line);
  // }
}

generateLines();

group.scale.setScalar(0.001);
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
    m.mesh.material.uniforms.uvOffset.value.x = -(time * m.speed + m.offset);
  });

  // group.rotation.y = time * Maf.TAU;

  painted.render(renderer, scene, camera);
  lastTime = t;
}

export { draw, canvas, renderer, camera };
