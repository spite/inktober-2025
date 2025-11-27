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
  BoxGeometry,
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
import { curl, seedFunc } from "../modules/curl.js";
import { MarchingSquares } from "../modules/marching-squares.js";
import perlin from "../third_party/perlin.js";
const painted = new Painted({ minLevel: -0.2 });
// const curl = generateNoiseFunction();
import { Poisson2D } from "../modules/poisson-2d.js";
import { Grid } from "../modules/grid-2d.js";

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

palette.range = [
  "#1e242c",
  "#4a5b6b",
  "#8da0b4",
  "#cdd9e6",
  "#f5f8fb",
  // "#3a8beb",
  // "#6b9dd8",
  // "#3ab485",
  //   "#ebb43a",
  //   "#e74c3c",
];

palette.range = [
  "#DDAA44",
  "#B9384C",
  "#7E9793",
  "#F8F6F2",
  "#3D5443",
  "#2F2D30",
  "#ebb43a",
  "#ffffff",
];
//palette.range = ["#000000", "#555555"];

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

const strokeTexture = new TextureLoader().load("./assets/brush4.jpg");
strokeTexture.wrapS = strokeTexture.wrapT = RepeatWrapping;

const SCALE = 1;
const WIDTH = 20 / SCALE;
const HEIGHT = 20 / SCALE;

//const func = generateNoiseFunction();
const func = seedFunc(
  67.14916212144274,
  -66.58264922976667,
  26.30802081903076,
  -49.46527967481953,
  -80.13398717797276,
  -59.007133755175765
);

function fbm(x, y, scale, octaves, lacunarity, gain) {
  scale = scale || 1;
  octaves = octaves || 1;
  lacunarity = lacunarity || 2;
  gain = gain || 0.5;

  var total = 0;
  var amplitude = 1;
  var frequency = 1;

  for (var i = 0; i < octaves; i++) {
    var v =
      perlin.simplex2((x / scale) * frequency, (y / scale) * frequency) *
      amplitude;
    total = total + v;
    frequency = frequency * lacunarity;
    amplitude = amplitude * gain;
  }

  return total;
}

function pattern(x, y, scale, octaves, lacunarity, gain) {
  var q = [
    fbm(x, y, scale, octaves, lacunarity, gain),
    fbm(x + 5.2, y + 1.3, scale, octaves, lacunarity, gain),
  ];

  return fbm(
    x + 80.0 * q[0],
    y + 80.0 * q[1],
    scale,
    octaves,
    lacunarity,
    gain
  );
}

const meshes = [];
const SEGMENTS = 100;
const grid = new Grid(1);

const minDistance = 0.25;
const minDistanceSquared = minDistance ** 2;

function intersects(p, line) {
  const neighbours = grid.getNeighbours(p, 2 * minDistance);
  if (neighbours.length) {
    for (let neighbour of neighbours) {
      if (neighbour.line !== line) {
        const pp = neighbour.point;
        const dx = pp.x - p.x;
        const dy = pp.y - p.y;
        const d = dx * dx + dy * dy;
        if (d < minDistanceSquared) {
          return true;
        }
      }
    }
  }
  return false;
}

function generateFlowLines() {
  const poisson2d = new Poisson2D(WIDTH, HEIGHT, 0.25);
  const points = poisson2d.calculate();
  const lines = [];
  points.forEach((p) => {
    p.x -= 0.5 * WIDTH;
    p.y -= 0.5 * HEIGHT;
  });
  for (let i = 0; i < points.length; i++) {
    lines[i] = {
      active: true,
      points: [],
      offset: Maf.randomInRange(-Math.PI, Math.PI) / 100,
      delay: Math.round(Maf.randomInRange(0, 100 * SEGMENTS)),
      segment: 0,
    };
  }

  const o = new Vector2();
  const d = new Vector2();
  const offset = new Vector2(
    Maf.randomInRange(-100, 100),
    Maf.randomInRange(-100, 100)
  );
  const scale = 0.1;

  while (lines.some((l) => l.active === true)) {
    for (let i = 0; i < points.length; i++) {
      const segment = lines[i].segment - lines[i].delay;
      lines[i].segment++;

      if (segment === 0) {
        let skip = true;
        for (let k = 0; k < 10; k++) {
          const pp = points[i];
          if (!intersects(pp, i)) {
            lines[i].points[0] = pp;
            grid.add(pp, { point: pp, line: i });
            skip = false;
            continue;
          }
        }
        if (skip) {
          lines[i].active = false;
        }
      }

      if (segment > 0) {
        if (segment > SEGMENTS) {
          lines[i].active = false;
        }

        if (lines[i].active) {
          o.copy(lines[i].points[lines[i].points.length - 1]);
          const p = perlin.simplex2(
            scale * o.x + offset.x,
            scale * o.y + offset.y
          );
          const a = lines[i].offset + p * 3;
          d.set(Math.cos(a), Math.sin(a)).normalize().multiplyScalar(0.2);

          const t = o.clone().add(d);

          if (lines[i].active) {
            if (!intersects(t, i)) {
              grid.add(t, { point: t, line: i });
            } else {
              lines[i].active = false;
            }
          }

          lines[i].points.push(t);
          if (
            t.x < -0.5 * WIDTH ||
            t.x > 0.5 * WIDTH ||
            t.y < -0.5 * HEIGHT ||
            t.y > 0.5 * HEIGHT
          ) {
            lines[i].active = false;
          }
        }
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const material = new MeshLineMaterial({
      map: strokeTexture,
      useMap: true,
      color: gradient.getAt(i / lines.length), //Maf.randomInRange(0, 1)),
      sizeAttenuation: true,
      lineWidth: 0.0025,
      opacity: 1,
      // repeat: new Vector2(l, 1),
      // dashArray: new Vector2(1, 2),
      // useDash: true,
      // dashOffset: Maf.randomInRange(-l, l),
    });

    const vertices = [];
    for (const p of lines[i].points) {
      vertices.push(p.x);
      vertices.push(p.y);
      vertices.push(0);
    }
    var g = new MeshLine();
    g.setPoints(vertices);
    // , function (p) {
    //   return Maf.parabola(p, 1);
    // });

    var mesh = new Mesh(g.geometry, material);
    mesh.g = g;

    group.add(mesh);

    meshes.push({ mesh, offset: 0, speed: 0 });
  }
}

generateFlowLines();

group.scale.setScalar(0.01);
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
