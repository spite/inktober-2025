import { Vector3 } from "three";
import { MarchingCubesGeometry } from "../third_party/MarchingCubes.js";
import Maf from "maf";

function sdSphere(p, r) {
  return p.length() - r;
}
function opSmoothUnion(d1, d2, k) {
  const h = Maf.clamp(0.5 + (0.5 * (d2 - d1)) / k, 0.0, 1.0);
  return Maf.mix(d2, d1, h) - k * h * (1.0 - h);
}
function generateBlobFn() {
  const points = [];
  const radii = [];
  for (let i = 0; i < 5; i++) {
    const r = 0.9 * Maf.randomInRange(0.15, 0.25);
    radii.push(r);
    const d = 0.45 - r;
    points.push(
      new Vector3(
        Maf.randomInRange(-d, d),
        Maf.randomInRange(-d, d),
        Maf.randomInRange(-d, d)
      )
    );
  }
  return (p) => {
    let d;
    for (let i = 0; i < points.length; i++) {
      const v = sdSphere(p.clone().sub(points[i]), radii[i]);
      if (d === undefined) {
        d = v;
      } else {
        d = opSmoothUnion(d, v, 0.1);
      }
    }
    return d;
  };
}

function generate() {
  const size = 50;
  const mc = new MarchingCubesGeometry(size, false, false, 100000);
  const p = new Vector3();

  const blobFn = generateBlobFn();

  const sizeObject = size;
  const mcObject = new MarchingCubesGeometry(sizeObject, false, false, 100000);

  mc.reset();
  let ptr = 0;
  for (let z = 0; z < sizeObject; z++) {
    for (let y = 0; y < sizeObject; y++) {
      for (let x = 0; x < sizeObject; x++) {
        let v = -1;
        p.set(x / sizeObject - 0.5, y / sizeObject - 0.5, z / sizeObject - 0.5);
        const d = blobFn(p);
        mcObject.setCell(x, y, z, -d);
        ptr += 2;
      }
    }
  }

  mcObject.invalidated = true;
  mcObject.build();

  return mcObject;
}

export { generate };
