import { Vector3 } from "three";

// https://arxiv.org/pdf/1604.02174v2/1000

class SphubeSDF {
  constructor() {
    this._v1 = new Vector3();
    this._v2 = new Vector3();
    this._grad = new Vector3();
  }

  sdBox(p, size) {
    const qx = Math.abs(p.x) - size;
    const qy = Math.abs(p.y) - size;
    const qz = Math.abs(p.z) - size;

    const outerX = Math.max(qx, 0);
    const outerY = Math.max(qy, 0);
    const outerZ = Math.max(qz, 0);
    const outerDist = Math.sqrt(
      outerX * outerX + outerY * outerY + outerZ * outerZ
    );

    const innerDist = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
    return outerDist + innerDist;
  }

  evaluate(p, r, s) {
    const bounds = this.sdBox(p, r);
    if (bounds > 0.2) return bounds;

    const r2 = r * r;
    const r4 = r2 * r2;
    const s2 = s * s;
    const s4 = s2 * s2;

    const x2 = p.x * p.x;
    const y2 = p.y * p.y;
    const z2 = p.z * p.z;

    const potential =
      x2 +
      y2 +
      z2 -
      (s2 / r2) * (x2 * y2 + y2 * z2 + z2 * x2) +
      (s4 / r4) * (x2 * y2 * z2) -
      r2;

    this._grad.set(
      2 * p.x * (1 - (s2 / r2) * (y2 + z2) + (s4 / r4) * (y2 * z2)),
      2 * p.y * (1 - (s2 / r2) * (x2 + z2) + (s4 / r4) * (x2 * z2)),
      2 * p.z * (1 - (s2 / r2) * (x2 + y2) + (s4 / r4) * (x2 * y2))
    );

    const eps = 1;
    const gLen = Math.sqrt(this._grad.lengthSq() + eps);

    const dist = potential / gLen;

    return Math.max(dist, bounds);
  }
}

export { SphubeSDF };
