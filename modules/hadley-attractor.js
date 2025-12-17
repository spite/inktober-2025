import Maf from "maf";
import { Vector3 } from "three";

const t = new Vector3();

class HadleyAttractor {
  constructor() {
    this.id = "Hadley";
    this.alpha = 0.2;
    this.beta = 4;
    this.sigma = 8;
    this.delta = 1;
    this.x = -1;
    this.y = 0;
    this.z = 0.5;
    this.h = 0.5;
    this.spread = 5;
  }

  step(p) {
    const s = 12;
    const x = p.x / s;
    const y = p.y / s;
    const z = p.z / s;
    t.set(
      -y * y - z * z - this.alpha * x + this.alpha * this.sigma,
      x * y - this.beta * x * z - y + this.delta,
      this.beta * x * y + x * z - z
    );
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

export { HadleyAttractor };
