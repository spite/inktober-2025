import Maf from "maf";
import { Vector3 } from "three";

const t = new Vector3();

class ThomasAttractor {
  constructor() {
    this.id = "Thomas";
    this.b = 0.208186; //0.19;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.h = 0.5;
    this.spread = 15;
  }

  step(p) {
    const scale = 0.15;
    const x = p.x * scale;
    const y = p.y * scale;
    const z = p.z * scale;
    t.set(
      Math.sin(y) - this.b * x,
      Math.sin(z) - this.b * y,
      Math.sin(x) - this.b * z
    );
    t.normalize().multiplyScalar(this.h);
    p.add(t);
  }

  randomize() {
    this.alpha = randomInRange(0.1, 1);
    this.gamma = randomInRange(0.1, 1);
    this.x = randomInRange(-1, 1);
    this.y = randomInRange(-1, 1);
    this.z = randomInRange(-1, 1);
  }
}

export { ThomasAttractor };
