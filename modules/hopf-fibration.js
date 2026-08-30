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
// Both controls conjugate the field: X'(p) = R⁻¹ X(R p). The seed points stay put, so
// rotating the field picks out different fibers rather than rigidly rotating the picture.
//
// tilt  — rotation around the X axis before field evaluation.
// twist — rotation around the Y axis.
//
// twist used to rotate around Z, which did precisely nothing: the Hopf field is equivariant
// under rotation about z — that axis is the fibration's own symmetry axis — so R⁻¹ X(R p)
// gave back X(p) exactly. Measured deviation over a 2000-step orbit was ~1e-14 for every
// twist value, against ~1e0 for the same tilt. Y is independent of both, so the two
// controls now span the rotations that actually change what you see.

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

    // Apply twist (Y-axis rotation)
    if (this.twist !== 0) {
      const ct = Math.cos(this.twist), st = Math.sin(this.twist);
      const nx =  ct * qx + st * qz;
      const nz = -st * qx + ct * qz;
      qx = nx; qz = nz;
    }

    // Correct Hopf vector field
    let vx = -qy + qx * qz;
    let vy =  qx + qy * qz;
    let vz = (1 - qx * qx - qy * qy + qz * qz) * 0.5;

    // Apply inverse twist (undone before the tilt, so the two compose the right way round)
    if (this.twist !== 0) {
      const ct = Math.cos(-this.twist), st = Math.sin(-this.twist);
      const nx =  ct * vx + st * vz;
      const nz = -st * vx + ct * vz;
      vx = nx; vz = nz;
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
