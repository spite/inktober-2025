import Maf from "maf";
import { Vector3 } from "three";

const t = new Vector3();

function I(x) {
  if (x > 0) return 1;
  if (x <= 0) return 0;
}

class AnishchenkoAstakhovAttractor {
  constructor() {
    this.id = "Anishchenko-Astakhov";
    this.mu = 1.2;
    this.eta = 0.5;
    this.x = -1;
    this.y = 0;
    this.z = 0.5;
    this.h = 0.5;
    this.spread = 1;
  }

  step(p) {
    const s = 0.25;
    const x = p.x * s;
    const y = p.y * s;
    const z = p.z * s;
    t.set(
      this.mu * x + y - x * z,
      -x,
      -this.eta * z + this.eta * I(x) * x ** 2
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

export { AnishchenkoAstakhovAttractor };
