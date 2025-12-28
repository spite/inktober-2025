import { Vector3 } from "three";

class GoursatSurface {
  constructor({ a = 0, b = -2.0, c = 1.5 } = {}) {
    this.params = { a, b, c };
    this.EPSILON = 1e-6;
  }

  setParams(newParams) {
    Object.assign(this.params, newParams);
  }

  _eval(x, y, z) {
    const { a, b, c } = this.params;
    const x2 = x * x,
      y2 = y * y,
      z2 = z * z;
    const r2 = x2 + y2 + z2;

    const term4 = x2 * x2 + y2 * y2 + z2 * z2;
    const val = term4 + a * r2 * r2 + b * r2 + c;

    const common = 4.0 * a * r2 + 2.0 * b;
    const gx = x * (4.0 * x2 + common);
    const gy = y * (4.0 * y2 + common);
    const gz = z * (4.0 * z2 + common);

    const g2 = gx * gx + gy * gy + gz * gz;

    return { val, gx, gy, gz, g2 };
  }

  getClosestPoint(p, offset = 0, iterations = 8, target = new Vector3()) {
    let { x, y, z } = p;

    if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9 && Math.abs(z) < 1e-9) {
      x = 0.1;
    }

    for (let i = 0; i < iterations; i++) {
      let { val, gx, gy, gz, g2 } = this._eval(x, y, z);
      val += offset;

      if (Math.abs(val) < this.EPSILON) break;

      if (g2 < 1e-9) {
        x += 0.01;
        continue;
      }

      const stepScale = (val / g2) * 0.8;

      x -= gx * stepScale;
      y -= gy * stepScale;
      z -= gz * stepScale;
    }

    target.set(x, y, z);
    return target;
  }

  getSignedDistance(p) {
    const initialEval = this._eval(p.x, p.y, p.z);

    const closest = this.getClosestPoint(p);

    const dx = p.x - closest.x;
    const dy = p.y - closest.y;
    const dz = p.z - closest.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return initialEval.val < 0 ? -dist : dist;
  }

  getApproximateDistance(p) {
    const { val, g2 } = this._eval(p.x, p.y, p.z);
    const gradLen = Math.sqrt(g2);
    if (gradLen < 1e-9) return 0.0;
    return (val / gradLen) * 0.5;
  }
}

export { GoursatSurface };
