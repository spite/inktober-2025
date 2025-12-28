class TrefoilSDF {
  constructor(radius = 0.5, samples = 120) {
    this.radius = radius;
    this.segments = [];

    const kTwoPi = Math.PI * 2;
    for (let i = 0; i < samples; i++) {
      const t1 = (i / samples) * kTwoPi;
      const t2 = ((i + 1) / samples) * kTwoPi;

      this.segments.push({
        a: this.evaluate(t1),
        b: this.evaluate(t2),
      });
    }
  }

  evaluate(t) {
    return {
      x: Math.sin(t) + 2.0 * Math.sin(2.0 * t),
      y: Math.cos(t) - 2.0 * Math.cos(2.0 * t),
      z: -Math.sin(3.0 * t),
    };
  }

  getDistance(p) {
    let minSqDist = Infinity;

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const pa = { x: p.x - seg.a.x, y: p.y - seg.a.y, z: p.z - seg.a.z };
      const ba = {
        x: seg.b.x - seg.a.x,
        y: seg.b.y - seg.a.y,
        z: seg.b.z - seg.a.z,
      };

      const dotPA_BA = pa.x * ba.x + pa.y * ba.y + pa.z * ba.z;
      const dotBA_BA = ba.x * ba.x + ba.y * ba.y + ba.z * ba.z;

      const h = Math.max(0, Math.min(1, dotPA_BA / dotBA_BA));

      const dx = pa.x - ba.x * h;
      const dy = pa.y - ba.y * h;
      const dz = pa.z - ba.z * h;

      const sqDist = dx * dx + dy * dy + dz * dz;

      if (sqDist < minSqDist) minSqDist = sqDist;
    }

    return Math.sqrt(minSqDist) - this.radius;
  }
}

export { TrefoilSDF };
