import Maf from "maf";
import { Vector3 } from "three";

const t = new Vector3();

class AizawaAttractor {
  constructor() {
    this.id = "Aizawa";
    this.alpha = 0.95;
    this.beta = 0.7;
    this.gamma = 0.6;
    this.delta = 3.5;
    this.epsilon = 0.25;
    this.sigma = 0.1;
    this.x = -1;
    this.y = 0;
    this.z = 0.5;
    this.h = 0.5;
    this.spread = 10;
  }

  step(p) {
    const s = 20;
    const x = p.x / s;
    const y = p.y / s;
    const z = p.z / s;
    t.set(
      (z - this.beta) * x - this.delta * y,
      this.delta * x + (z - this.beta) * y,
      this.gamma +
        this.alpha * z -
        z ** 3 / 3 -
        (x ** 2 + y ** 2) * (1 + this.epsilon * z) +
        this.sigma * z * x ** 3
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

export { AizawaAttractor };
