import Maf from "maf";
import { Vector3 } from "three";

const t = new Vector3();

class BurkeShawAttractor {
  constructor() {
    this.id = "Burke-Shaw";
    this.sigma = 10;
    this.upsilon = 4.272;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.h = 0.5;
    this.spread = 5;
  }

  step(p) {
    const scale = 0.1;
    const x = p.x * scale;
    const y = p.y * scale;
    const z = p.z * scale;
    t.set(
      -this.sigma * (x + y),
      -y - this.upsilon * x * z,
      this.sigma * x * y + this.upsilon
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

export { BurkeShawAttractor };
