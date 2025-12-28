import { Vector3 } from "three";

class MobiusStrip {
  constructor({ radius = 2, width = 1, thickness = 0.1, twists = 1 } = {}) {
    this.radius = radius;
    this.width = width;
    this.thickness = thickness;
    this.twists = twists;

    this.distortionCorrection = 0.8;
  }

  getSignedDistance(p) {
    const { tCos, tSin, qx, qy } = this._getToroidalBasis(p);

    const rx = tCos * qx - tSin * qy;
    const ry = tSin * qx + tCos * qy;

    const dx = Math.abs(rx) - this.width;
    const dy = Math.abs(ry) - this.thickness;

    const dist =
      Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) +
      Math.min(Math.max(dx, dy), 0);

    return dist * this.distortionCorrection;
  }

  getClosestPoint(p, target = new Vector3()) {
    const { angle, tCos, tSin, qx, qy } = this._getToroidalBasis(p);

    const u = tCos * qx - tSin * qy;
    const v = tSin * qx + tCos * qy;

    let cu = Math.max(-this.width, Math.min(this.width, u));
    let cv = Math.max(-this.thickness, Math.min(this.thickness, v));

    if (Math.abs(u) < this.width && Math.abs(v) < this.thickness) {
      const distToX = this.width - Math.abs(u);
      const distToY = this.thickness - Math.abs(v);
      if (distToX < distToY) cu = u > 0 ? this.width : -this.width;
      else cv = v > 0 ? this.thickness : -this.thickness;
    }

    const nqx = tCos * cu + tSin * cv;
    const nqy = -tSin * cu + tCos * cv;

    const finalRadius = this.radius + nqx;
    target.set(
      Math.cos(angle) * finalRadius,
      Math.sin(angle) * finalRadius,
      nqy
    );

    return target;
  }

  _getToroidalBasis(p) {
    const angle = Math.atan2(p.y, p.x);
    const lenXY = Math.hypot(p.x, p.y);

    const twistAngle = this.twists * 0.5 * angle;

    return {
      angle,
      tCos: Math.cos(twistAngle),
      tSin: Math.sin(twistAngle),
      qx: lenXY - this.radius, // Dist from center ring
      qy: p.z, // Height
    };
  }
}

export { MobiusStrip };
