import { Vector3 } from "three";

// Scratch vector — reused every step to avoid allocation.
const _t = new Vector3();

// Hopf vector field in ℝ³, derived from the pushforward of the Hopf S¹ action
// on S³ through stereographic projection (pole at (0,0,0,1)).
//
// The field X(p) = (−py + px·pz,  px + py·pz,  (1−|p_xy|²+pz²)/2) generates
// the Hopf fibers as its integral curves. Every orbit is a closed circle; any
// two distinct orbits are linked exactly once (the Hopf link property).
//
// tilt  — rotation of the fibration around the X axis before field evaluation.
//         Different tilt values show genuinely different visual cross-sections
//         of the same mathematical structure.
// twist — rotation around the Z axis, orthogonal to tilt.
//
// Together tilt + twist let you "orbit" around the fibration's singular axis
// and reveal the nested tori from any angle.

class HopfFibration {
  constructor() {
    this.h     = 0.05;  // integration step size
    this.tilt  = 0;     // X-axis rotation (radians)
    this.twist = 0;     // Z-axis rotation (radians)
  }

  step(p) {
    let qx = p.x, qy = p.y, qz = p.z;

    // Apply tilt (X-axis rotation)
    if (this.tilt !== 0) {
      const ct = Math.cos(this.tilt), st = Math.sin(this.tilt);
      const ny = ct * qy - st * qz;
      const nz = st * qy + ct * qz;
      qy = ny; qz = nz;
    }

    // Apply twist (Z-axis rotation)
    if (this.twist !== 0) {
      const ct = Math.cos(this.twist), st = Math.sin(this.twist);
      const nx = ct * qx - st * qy;
      const ny = st * qx + ct * qy;
      qx = nx; qy = ny;
    }

    // Correct Hopf vector field
    let vx = -qy + qx * qz;
    let vy =  qx + qy * qz;
    let vz = (1 - qx * qx - qy * qy + qz * qz) * 0.5;

    // Apply inverse twist
    if (this.twist !== 0) {
      const ct = Math.cos(-this.twist), st = Math.sin(-this.twist);
      const nx = ct * vx - st * vy;
      const ny = st * vx + ct * vy;
      vx = nx; vy = ny;
    }

    // Apply inverse tilt
    if (this.tilt !== 0) {
      const ct = Math.cos(-this.tilt), st = Math.sin(-this.tilt);
      const ny = ct * vy - st * vz;
      const nz = st * vy + ct * vz;
      vy = ny; vz = nz;
    }

    _t.set(vx, vy, vz).normalize().multiplyScalar(this.h);
    p.add(_t);
  }
}

export { HopfFibration };
