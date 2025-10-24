import { Vector3, Vector2 } from "three";

const EPSILON = 0.001;
const MAXSTEPS = 100;
const MAXDIST = 100;
const tmp = new Vector3();
const tmp2 = new Vector2();

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
  const l = tmp2.set(p.x, p.z).length();
  tmp2.set(l - ra + rb, Math.abs(p.y) - h + rb);

  return (
    Math.min(Math.max(tmp2.x, tmp2.y), 0.0) +
    new Vector2(Math.max(tmp2.x, 0.0), Math.max(tmp2.y, 0.0)).length() -
    rb
  );
}

function sdCappedCylinder(p, r, h) {
  const l = Math.sqrt(p.x * p.x + p.z * p.z);
  tmp.set(Math.abs(l) - r, Math.abs(p.y) - h);
  return Math.min(Math.max(tmp.x, tmp.y), 0.0) + tmp.max(zero).length();
}

function sdTorus(p, t) {
  const q = new Vector2(new Vector2(p.x, p.z).length() - t.x, p.y);
  return q.length() - t.y;
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

function clamp(v, minVal, maxVal) {
  return Math.min(maxVal, Math.max(minVal, v));
}

function sdOctahedron(p, s) {
  p = p.abs();
  const m = p.x + p.y + p.z - s;
  const q = new Vector3();
  if (3.0 * p.x < m) q.set(p.x, p.y, p.z);
  else if (3.0 * p.y < m) q.set(p.y, p.z, p.x);
  else if (3.0 * p.z < m) q.set(p.z, p.x, p.y);
  else return m * 0.57735027;

  const k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
  return new Vector3(q.x, q.y - s + k, q.z - k).length();
}

function sdIcosahedron(p, r, e) {
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

function sdDodecahedron(p, r, e) {
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

function march(ro, rd, map) {
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

function scene(p) {
  // early skip if outside
  if (p.length() > 3.0) {
    return p.length() - 2.8;
  }

  const sinVec4 = (v) =>
    new THREE.Vector4(
      Math.sin(v.x),
      Math.sin(v.y),
      Math.sin(v.z),
      Math.sin(v.w)
    );

  // f0
  let f0_0 = new THREE.Vector4(0.0, 0.0, 0.0, 0.01)
    .multiplyScalar(p.y)
    .add(new THREE.Vector4(1.2, -0.11, -0.05, -3.66).multiplyScalar(p.z))
    .add(new THREE.Vector4(-2.55, 0.14, -4.41, -0.07).multiplyScalar(p.x))
    .add(new THREE.Vector4(-3.04, -3.15, -1.75, -4.0));
  f0_0 = sinVec4(f0_0);

  let f0_1 = new THREE.Vector4(-0.0, -0.0, -2.96, -0.0)
    .multiplyScalar(p.y)
    .add(new THREE.Vector4(2.84, -0.3, -1.07, -2.13).multiplyScalar(p.z))
    .add(new THREE.Vector4(0.1, -0.38, -0.75, -0.36).multiplyScalar(p.x))
    .add(new THREE.Vector4(-0.49, 3.12, 1.5, 3.14));
  f0_1 = sinVec4(f0_1);

  let f0_2 = new THREE.Vector4(2.96, 0.0, -0.0, 0.0)
    .multiplyScalar(p.y)
    .add(new THREE.Vector4(-1.08, 0.0, -1.1, -0.47).multiplyScalar(p.z))
    .add(new THREE.Vector4(-0.76, 0.0, 1.15, -0.15).multiplyScalar(p.x))
    .add(new THREE.Vector4(-4.79, -1.57, -2.81, -3.25));
  f0_2 = sinVec4(f0_2);

  let f0_3 = new THREE.Vector4(-0.0, -0.01, 0.0, 0.0)
    .multiplyScalar(p.y)
    .add(new THREE.Vector4(2.89, 3.26, 2.06, 0.47).multiplyScalar(p.z))
    .add(new THREE.Vector4(2.78, 3.55, -2.21, -3.8).multiplyScalar(p.x))
    .add(new THREE.Vector4(4.83, 2.15, 1.87, -2.77));
  f0_3 = sinVec4(f0_3);

  // f1
  const m1_0_0 = new THREE.Matrix4().set(
    0.1,
    0.19,
    -0.26,
    -0.21,
    3.36,
    1.62,
    0.84,
    -0.13,
    -1.58,
    -0.59,
    -0.26,
    0.07,
    0.75,
    0.23,
    -0.33,
    -0.32
  );
  const m1_0_1 = new THREE.Matrix4().set(
    -0.46,
    -1.29,
    -0.62,
    -0.21,
    -2.33,
    -1.43,
    -0.91,
    1.57,
    0.84,
    0.93,
    -0.46,
    1.21,
    -0.2,
    -1.44,
    -1.05,
    0.6
  );
  const m1_0_2 = new THREE.Matrix4().set(
    -0.62,
    0.03,
    0.08,
    -0.22,
    -0.92,
    0.19,
    -0.27,
    0.86,
    -0.45,
    0.1,
    -0.26,
    -0.4,
    -1.06,
    -0.54,
    -0.05,
    -0.02
  );
  const m1_0_3 = new THREE.Matrix4().set(
    -0.22,
    0.56,
    0.46,
    -0.82,
    0.02,
    0.05,
    0.51,
    -1.18,
    0.2,
    -0.24,
    1.51,
    0.37,
    0.08,
    0.7,
    0.98,
    -0.84
  );
  let f1_0 = f0_0
    .clone()
    .applyMatrix4(m1_0_0)
    .add(f0_1.clone().applyMatrix4(m1_0_1))
    .add(f0_2.clone().applyMatrix4(m1_0_2))
    .add(f0_3.clone().applyMatrix4(m1_0_3))
    .add(new THREE.Vector4(0.72, 0.15, -1.14, 2.07));
  f1_0 = sinVec4(f1_0).add(f0_0);

  const m1_1_0 = new THREE.Matrix4().set(
    -0.64,
    0.85,
    -1.07,
    -0.44,
    1.09,
    0.28,
    -0.4,
    -0.54,
    -0.42,
    -0.17,
    -0.0,
    -0.36,
    0.08,
    -0.14,
    0.02,
    0.03
  );
  const m1_1_1 = new THREE.Matrix4().set(
    1.26,
    -1.7,
    0.45,
    -0.74,
    0.21,
    -2.36,
    0.33,
    0.09,
    -0.4,
    0.13,
    0.33,
    -0.65,
    0.05,
    -0.0,
    1.92,
    -0.11
  );
  const m1_1_2 = new THREE.Matrix4().set(
    0.46,
    -0.25,
    0.68,
    0.91,
    0.32,
    -0.29,
    0.2,
    0.19,
    0.32,
    0.51,
    -1.91,
    -0.16,
    -1.91,
    0.31,
    0.07,
    0.17
  );
  const m1_1_3 = new THREE.Matrix4().set(
    -1.12,
    -0.59,
    0.07,
    1.29,
    0.16,
    0.43,
    -0.2,
    -0.03,
    1.3,
    1.29,
    -0.06,
    -0.25,
    -0.02,
    0.0,
    0.01,
    -0.05
  );
  let f1_1 = f0_0
    .clone()
    .applyMatrix4(m1_1_0)
    .add(f0_1.clone().applyMatrix4(m1_1_1))
    .add(f0_2.clone().applyMatrix4(m1_1_2))
    .add(f0_3.clone().applyMatrix4(m1_1_3))
    .add(new THREE.Vector4(-0.84, -0.53, 2.27, -1.3));
  f1_1 = sinVec4(f1_1).add(f0_1);

  const m1_2_0 = new THREE.Matrix4().set(
    0.26,
    0.04,
    0.05,
    -0.2,
    0.07,
    0.38,
    0.64,
    0.26,
    -0.4,
    0.43,
    0.33,
    -0.1,
    0.47,
    0.5,
    0.13,
    0.7
  );
  const m1_2_1 = new THREE.Matrix4().set(
    1.03,
    -0.39,
    -0.88,
    -0.16,
    0.15,
    -0.69,
    -0.27,
    -0.16,
    0.12,
    -1.47,
    1.67,
    0.49,
    -0.31,
    -1.35,
    1.13,
    -1.24
  );
  const m1_2_2 = new THREE.Matrix4().set(
    -0.88,
    -0.58,
    -1.43,
    -0.54,
    -0.3,
    -0.57,
    0.23,
    0.18,
    1.66,
    -0.15,
    -0.05,
    0.16,
    1.14,
    0.38,
    -0.47,
    0.43
  );
  const m1_2_3 = new THREE.Matrix4().set(
    -0.78,
    -0.74,
    1.08,
    0.64,
    0.92,
    0.53,
    -0.74,
    -0.39,
    0.32,
    0.43,
    -0.26,
    0.15,
    -0.52,
    -0.35,
    -1.09,
    0.62
  );
  let f1_2 = f0_0
    .clone()
    .applyMatrix4(m1_2_0)
    .add(f0_1.clone().applyMatrix4(m1_2_1))
    .add(f0_2.clone().applyMatrix4(m1_2_2))
    .add(f0_3.clone().applyMatrix4(m1_2_3))
    .add(new THREE.Vector4(2.06, 2.87, 0.46, -1.97));
  f1_2 = sinVec4(f1_2).add(f0_2);

  const m1_3_0 = new THREE.Matrix4().set(
    -0.32,
    -0.19,
    -0.44,
    -0.02,
    -1.03,
    -0.88,
    -0.43,
    0.17,
    0.15,
    0.04,
    1.02,
    -0.07,
    0.2,
    -0.05,
    0.1,
    -0.33
  );
  const m1_3_1 = new THREE.Matrix4().set(
    0.06,
    -0.01,
    0.28,
    0.6,
    2.45,
    -0.53,
    0.87,
    -2.04,
    -0.25,
    -0.12,
    -0.06,
    -0.66,
    -0.22,
    -0.22,
    0.5,
    0.09
  );
  const m1_3_2 = new THREE.Matrix4().set(
    0.29,
    0.07,
    -0.84,
    -0.06,
    0.85,
    -0.59,
    -0.81,
    -0.17,
    -0.06,
    -0.61,
    -0.56,
    0.42,
    0.5,
    -0.33,
    0.47,
    -0.32
  );
  const m1_3_3 = new THREE.Matrix4().set(
    -0.77,
    -0.69,
    -0.01,
    1.1,
    1.29,
    0.91,
    -0.41,
    -0.05,
    0.42,
    -0.05,
    -1.55,
    -0.21,
    -0.11,
    0.14,
    0.52,
    0.27
  );
  let f1_3 = f0_0
    .clone()
    .applyMatrix4(m1_3_0)
    .add(f0_1.clone().applyMatrix4(m1_3_1))
    .add(f0_2.clone().applyMatrix4(m1_3_2))
    .add(f0_3.clone().applyMatrix4(m1_3_3))
    .add(new THREE.Vector4(1.25, 2.26, 3.59, 1.23));
  f1_3 = sinVec4(f1_3).add(f0_3);

  // f2
  const m2_0_0 = new THREE.Matrix4().set(
    -0.37,
    -0.75,
    1.51,
    -0.83,
    1.93,
    -0.24,
    -1.23,
    0.14,
    1.64,
    -0.37,
    1.02,
    0.57,
    -0.27,
    -0.18,
    0.27,
    0.2
  );
  const m2_0_1 = new THREE.Matrix4().set(
    1.66,
    0.37,
    -0.07,
    -0.21,
    0.53,
    -3.52,
    -0.29,
    1.43,
    0.54,
    1.62,
    0.15,
    -0.13,
    0.55,
    1.72,
    0.23,
    0.21
  );
  const m2_0_2 = new THREE.Matrix4().set(
    -0.02,
    -0.59,
    -0.58,
    -0.58,
    -0.52,
    1.12,
    -0.34,
    1.11,
    0.14,
    -0.75,
    -0.62,
    0.92,
    0.25,
    -0.14,
    0.31,
    -0.04
  );
  const m2_0_3 = new THREE.Matrix4().set(
    -0.17,
    -0.96,
    0.38,
    -0.47,
    -1.1,
    0.35,
    -1.48,
    1.09,
    0.31,
    -0.06,
    1.04,
    -1.76,
    -0.94,
    -0.12,
    0.27,
    1.23
  );
  let f2_0 = f1_0
    .clone()
    .applyMatrix4(m2_0_0)
    .add(f1_1.clone().applyMatrix4(m2_0_1))
    .add(f1_2.clone().applyMatrix4(m2_0_2))
    .add(f1_3.clone().applyMatrix4(m2_0_3))
    .add(new THREE.Vector4(0.78, -1.51, -1.7, -0.3));
  f2_0 = sinVec4(f2_0.divideScalar(1.4)).add(f1_0);

  const m2_1_0 = new THREE.Matrix4().set(
    1.92,
    0.56,
    0.89,
    0.47,
    -1.36,
    0.98,
    -0.41,
    0.09,
    0.28,
    -0.21,
    0.31,
    -0.72,
    1.21,
    -0.71,
    1.48,
    -0.13
  );
  const m2_1_1 = new THREE.Matrix4().set(
    -0.4,
    -0.88,
    -0.09,
    0.47,
    -0.59,
    0.45,
    -0.26,
    -0.2,
    0.5,
    0.23,
    -0.04,
    0.02,
    1.09,
    -0.72,
    0.54,
    -0.45
  );
  const m2_1_2 = new THREE.Matrix4().set(
    -0.21,
    2.09,
    -0.26,
    0.42,
    -0.27,
    1.19,
    0.02,
    -0.43,
    -0.06,
    0.96,
    0.38,
    -0.72,
    0.52,
    0.36,
    -0.69,
    0.01
  );
  const m2_1_3 = new THREE.Matrix4().set(
    2.63,
    0.53,
    -0.55,
    0.07,
    0.06,
    0.47,
    -0.86,
    1.05,
    -0.27,
    0.07,
    0.1,
    0.5,
    1.52,
    0.11,
    0.0,
    -0.32
  );
  let f2_1 = f1_0
    .clone()
    .applyMatrix4(m2_1_0)
    .add(f1_1.clone().applyMatrix4(m2_1_1))
    .add(f1_2.clone().applyMatrix4(m2_1_2))
    .add(f1_3.clone().applyMatrix4(m2_1_3))
    .add(new THREE.Vector4(-2.37, 5.12, -1.09, -2.25));
  f2_1 = sinVec4(f2_1.divideScalar(1.4)).add(f1_1);

  const m2_2_0 = new THREE.Matrix4().set(
    0.81,
    0.12,
    0.81,
    0.18,
    -0.14,
    -0.24,
    -0.35,
    -0.27,
    1.1,
    0.31,
    -0.47,
    -0.46,
    0.17,
    -0.08,
    0.16,
    0.32
  );
  const m2_2_1 = new THREE.Matrix4().set(
    0.27,
    0.74,
    0.11,
    0.32,
    0.19,
    -0.93,
    0.15,
    -0.02,
    -0.66,
    -2.85,
    0.26,
    0.07,
    0.24,
    0.28,
    0.86,
    0.01
  );
  const m2_2_2 = new THREE.Matrix4().set(
    0.08,
    0.69,
    0.01,
    -0.62,
    0.15,
    0.03,
    -0.31,
    0.3,
    0.21,
    0.11,
    -0.8,
    0.73,
    0.86,
    0.35,
    -1.88,
    1.16
  );
  const m2_2_3 = new THREE.Matrix4().set(
    0.76,
    0.13,
    -0.33,
    1.23,
    -0.16,
    0.27,
    -0.12,
    0.06,
    1.54,
    1.36,
    -0.83,
    0.11,
    1.22,
    0.66,
    -0.93,
    -1.64
  );
  let f2_2 = f1_0
    .clone()
    .applyMatrix4(m2_2_0)
    .add(f1_1.clone().applyMatrix4(m2_2_1))
    .add(f1_2.clone().applyMatrix4(m2_2_2))
    .add(f1_3.clone().applyMatrix4(m2_2_3))
    .add(new THREE.Vector4(-2.71, -1.53, 0.42, -0.07));
  f2_2 = sinVec4(f2_2.divideScalar(1.4)).add(f1_2);

  const m2_3_0 = new THREE.Matrix4().set(
    -0.16,
    -0.11,
    1.37,
    -0.41,
    -1.51,
    -0.62,
    -0.79,
    -0.16,
    -0.23,
    -0.74,
    0.58,
    0.0,
    -0.9,
    0.63,
    -0.96,
    0.56
  );
  const m2_3_1 = new THREE.Matrix4().set(
    -0.18,
    0.07,
    0.18,
    0.61,
    0.35,
    1.33,
    0.63,
    0.39,
    0.01,
    1.03,
    0.29,
    -0.66,
    -1.15,
    1.26,
    -0.81,
    0.7
  );
  const m2_3_2 = new THREE.Matrix4().set(
    0.12,
    0.21,
    -0.03,
    -1.34,
    0.6,
    -0.86,
    0.47,
    0.21,
    0.35,
    0.17,
    -0.53,
    1.09,
    -0.86,
    -0.52,
    0.57,
    -0.35
  );
  const m2_3_3 = new THREE.Matrix4().set(
    0.56,
    0.56,
    -0.34,
    -0.32,
    -2.6,
    -1.01,
    0.71,
    1.49,
    0.27,
    -0.05,
    -0.07,
    -1.82,
    -0.68,
    0.31,
    -0.36,
    1.04
  );
  let f2_3 = f1_0
    .clone()
    .applyMatrix4(m2_3_0)
    .add(f1_1.clone().applyMatrix4(m2_3_1))
    .add(f1_2.clone().applyMatrix4(m2_3_2))
    .add(f1_3.clone().applyMatrix4(m2_3_3))
    .add(new THREE.Vector4(-0.41, 0.7, -0.56, -1.46));
  f2_3 = sinVec4(f2_3.divideScalar(1.4)).add(f1_3);

  const d =
    f2_0.dot(new THREE.Vector4(0.02, -0.01, -0.02, -0.06)) +
    f2_1.dot(new THREE.Vector4(-0.02, -0.04, -0.07, -0.03)) +
    f2_2.dot(new THREE.Vector4(-0.06, -0.16, 0.03, 0.02)) +
    f2_3.dot(new THREE.Vector4(0.06, -0.03, -0.04, 0.03)) +
    0.04;

  // limit to inside unit sphere as neural sdf is not really defined
  return Math.max(d, p.length() - 1.0);
}
export {
  march,
  sdRoundBox,
  sdTorus,
  sdRoundedCylinder,
  sdOctahedron,
  sdIcosahedron,
  sdDodecahedron,
  sdCappedCylinder,
};
