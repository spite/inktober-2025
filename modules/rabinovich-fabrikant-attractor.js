import Maf from "maf";
import { Vector3 } from "three";

const t = new Vector3();

class RabinovichFabrikantAttractor {
  constructor() {
    this.id = "Rabinovich-Fabrikant";
    this.alpha = 1.1;
    this.gamma = 0.87;
    this.x = -1.05;
    this.y = 0.9;
    this.z = 1.01;
    this.h = 0.5;
    this.spread = 0;
  }

  step(p) {
    const s = 1;
    const x = p.x / s;
    const y = p.y / s;
    const z = p.z / s;
    t.set(
      y * (z - 1 + x * x) + this.gamma * x,
      x * (3 * z + 1 - x * x) + this.gamma * y,
      -2 * z * (this.alpha + x * y)
    );
    t.normalize().multiplyScalar(this.h);
    p.add(t);
  }

  randomize() {
    this.alpha = Maf.randomInRange(0.1, 1);
    this.gamma = Maf.randomInRange(0.1, 1);
    this.x = Maf.randomInRange(-1, 1);
    this.y = Maf.randomInRange(-1, 1);
    this.z = Maf.randomInRange(-1, 1);
  }
}

export { RabinovichFabrikantAttractor };
