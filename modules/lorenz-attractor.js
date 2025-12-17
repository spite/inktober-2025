import Maf from "maf";
import { Vector3 } from "three";

const t = new Vector3();

class LorenzAttractor {
  constructor() {
    this.id = "Lorentz";
    this.a = 10;
    this.b = 28;
    this.c = 8 / 3;
    this.x = 0;
    this.y = 10;
    this.z = 10;
    this.h = 0.5;
    this.spread = 10;
  }

  step(p) {
    const x = p.x;
    const y = p.y;
    const z = p.z;
    t.set(this.a * (y - x), x * (this.b - z) - y, x * y - this.c * z);
    t.normalize().multiplyScalar(this.h);
    p.add(t);
  }

  randomize() {
    this.a = Maf.randomInRange(5, 20);
    this.b = Maf.randomInRange(5, 50);
    this.c = Maf.randomInRange(0.1, 0.5);
    this.x = Maf.randomInRange(-10, 10);
    this.y = Maf.randomInRange(-10, 10);
    this.z = Maf.randomInRange(-10, 10);
  }
}

export { LorenzAttractor };
