import { Vector3 } from "three";

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

export { march, sdRoundBox, sdRoundedCylinder, sdIcosahedron, sdDodecahedron };
