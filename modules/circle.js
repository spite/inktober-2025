import { Vector3 } from "three";

export class Circle {
  constructor(options, splitFrequency) {
    this.id = options.id;
    this.center = options.center;
    this.radius = options.radius;
    this.normal = options.normal;
    this.u = options.u;
    this.v = options.v;
    this.color = options.color;
    this.generation = options.generation;
    this.parentId = options.parentId;

    this.progress = 0;
    this.stopped = false;
    // ugh
    this.progressNegative = 0;
    this.stoppedNegative = false;
    this.points = [];

    this.speed = 0.2 + Math.random() * 0.3;
    this.lastSpawnProgress = 0;
    this.lastSpawnProgressNegative = 0;

    this.nextSpawnInterval = this.calculateSpawnInterval(splitFrequency);
    this.nextSpawnIntervalNegative =
      this.calculateSpawnInterval(splitFrequency);
    this.rendered = false;
  }

  calculateSpawnInterval(freq) {
    if (freq <= 0) return Infinity;
    const t = Math.min(1, freq / 100);
    const min = 0.2 * (1 - t) + 0.005 * t;
    const max = 0.5 * (1 - t) + 0.02 * t;
    let val = min + Math.random() * (max - min);
    if (freq > 100) {
      const t2 = (freq - 100) / 100;
      val *= 1 - t2 * 0.5;
    }
    return val;
  }

  getAngleOnCircle(point) {
    const local = point.clone().sub(this.center);
    const x = local.dot(this.u);
    const y = local.dot(this.v);
    return Math.atan2(y, x);
  }

  done() {
    return this.stopped && this.stoppedNegative;
  }

  update(
    delta,
    speedMultiplier,
    splitFrequency,
    branchAngleRange,
    minRadius,
    maxRadius,
    allCircles,
    onSpawn
  ) {
    if (this.done()) return;

    const deltaProgress = this.speed * delta * speedMultiplier;

    if (!this.stopped) {
      const nextProg = Math.min(1, this.progress + deltaProgress);
      if (nextProg - this.progressNegative >= 1) {
        this.progress = 1 + this.progressNegative;
        this.stopped = true;
      } else {
        const currentAng = this.progress * Math.PI * 2;
        const nextAng = nextProg * Math.PI * 2;
        const collisionAngle = this.findCollisionAngle(
          allCircles,
          currentAng,
          nextAng,
          1
        );

        if (collisionAngle !== null) {
          this.progress = collisionAngle / (Math.PI * 2);
          this.stopped = true;
        } else {
          this.progress = nextProg;
          if (this.progress - this.lastSpawnProgress > this.nextSpawnInterval) {
            if (splitFrequency > 0 && this.generation < 6) {
              this.lastSpawnProgress = this.progress;
              this.nextSpawnInterval =
                this.calculateSpawnInterval(splitFrequency);
              this.spawnBranch(
                this.progress,
                splitFrequency,
                branchAngleRange,
                minRadius,
                maxRadius,
                onSpawn
              );
            }
          }
        }
      }
    }

    if (!this.stoppedNegative) {
      const nextProg = Math.max(-1, this.progressNegative - deltaProgress);
      if (this.progress - nextProg >= 1) {
        this.progressNegative = this.progress - 1;
        this.stoppedNegative = true;
      } else {
        const currentAng = this.progressNegative * Math.PI * 2;
        const nextAng = nextProg * Math.PI * 2;
        const collisionAngle = this.findCollisionAngle(
          allCircles,
          nextAng,
          currentAng,
          -1
        );

        if (collisionAngle !== null) {
          this.progressNegative = collisionAngle / (Math.PI * 2);
          this.stoppedNegative = true;
        } else {
          this.progressNegative = nextProg;
          if (
            this.lastSpawnProgressNegative - this.progressNegative >
            this.nextSpawnIntervalNegative
          ) {
            if (splitFrequency > 0 && this.generation < 6) {
              this.lastSpawnProgressNegative = this.progressNegative;
              this.nextSpawnIntervalNegative =
                this.calculateSpawnInterval(splitFrequency);
              this.spawnBranch(
                this.progressNegative,
                splitFrequency,
                branchAngleRange,
                minRadius,
                maxRadius,
                onSpawn
              );
            }
          }
        }
      }
    }
  }

  findCollisionAngle(allCircles, minMe, maxMe, direction) {
    let bestAngle = null;

    for (const other of allCircles) {
      if (other.id === this.id) continue;
      // Ignore parent for the first small growth segment
      if (
        other.id === this.parentId &&
        Math.abs(direction === 1 ? minMe : maxMe) < 0.3
      )
        continue;

      const intersections = this.getIntersections(other);
      for (const point of intersections) {
        const rawAngleOther = other.getAngleOnCircle(point);
        const minOther = other.progressNegative * Math.PI * 2;
        const maxOther = other.progress * Math.PI * 2;

        let onOther = false;
        const candidatesOther = [
          rawAngleOther,
          rawAngleOther + Math.PI * 2,
          rawAngleOther - Math.PI * 2,
        ];
        for (const ang of candidatesOther) {
          if (ang >= minOther - 1e-4 && ang <= maxOther + 1e-4) {
            onOther = true;
            break;
          }
        }

        if (onOther) {
          const rawAngleMe = this.getAngleOnCircle(point);
          const candidatesMe = [
            rawAngleMe,
            rawAngleMe + Math.PI * 2,
            rawAngleMe - Math.PI * 2,
          ];
          for (const ang of candidatesMe) {
            if (direction === 1 && ang > minMe + 1e-4 && ang <= maxMe + 1e-4) {
              if (bestAngle === null || ang < bestAngle) bestAngle = ang;
            } else if (
              direction === -1 &&
              ang < maxMe - 1e-4 &&
              ang >= minMe - 1e-4
            ) {
              if (bestAngle === null || ang > bestAngle) bestAngle = ang;
            }
          }
        }
      }
    }
    return bestAngle;
  }

  getIntersections(other) {
    const n1 = this.normal;
    const n2 = other.normal;
    const d1 = this.center.dot(n1);
    const d2 = other.center.dot(n2);
    const alpha = n1.dot(n2);
    const det = 1 - alpha * alpha;
    if (det < 1e-6) return [];
    const c_1 = (d1 - d2 * alpha) / det;
    const c_2 = (d2 - d1 * alpha) / det;
    const p0 = n1
      .clone()
      .multiplyScalar(c_1)
      .add(n2.clone().multiplyScalar(c_2));
    const h2 = 1 - p0.lengthSq();
    if (h2 < -1e-6) return [];
    const dir = new Vector3().crossVectors(n1, n2);
    const t = Math.sqrt(Math.max(0, h2) / det);
    const i1 = p0.clone().add(dir.clone().multiplyScalar(t));
    const i2 = p0.clone().sub(dir.clone().multiplyScalar(t));
    return t < 1e-6 ? [i1] : [i1, i2];
  }

  generatePoints() {
    this.rendered = true;
    const startAngle = this.progressNegative * Math.PI * 2;
    const endAngle = this.progress * Math.PI * 2;
    const totalAngle = endAngle - startAngle;
    const numSegments = Math.max(
      2,
      Math.floor((256 * totalAngle) / (Math.PI * 2))
    );
    const newPoints = [];
    for (let i = 0; i <= numSegments; i++) {
      const angle = startAngle + (i / numSegments) * totalAngle;
      const point = new Vector3()
        .copy(this.center)
        .addScaledVector(this.u, this.radius * Math.cos(angle))
        .addScaledVector(this.v, this.radius * Math.sin(angle))
        .normalize()
        .multiplyScalar(1.01);
      newPoints.push(point);
    }
    this.points = newPoints;
  }

  spawnBranch(
    atProgress,
    splitFrequency,
    branchAngleRange,
    minRadius,
    maxRadius,
    onSpawn
  ) {
    const angle = atProgress * Math.PI * 2;
    const currentPos = new Vector3()
      .copy(this.center)
      .addScaledVector(this.u, this.radius * Math.cos(angle))
      .addScaledVector(this.v, this.radius * Math.sin(angle));

    const axis = currentPos.clone().normalize();
    const numBranches = Math.random() > 0.7 ? 2 : 1;

    for (let i = 0; i < numBranches; i++) {
      const side = i === 0 ? 1 : -1;
      const baseAngleRad =
        (side * 90 + 0.1 + (Math.random() - 0.5) * 2 * branchAngleRange) *
        (Math.PI / 180);
      const tempNormal = this.normal.clone().applyAxisAngle(axis, baseAngleRad);
      const T = new Vector3().crossVectors(tempNormal, currentPos).normalize();
      const r = minRadius + Math.random() * (maxRadius - minRadius);
      const d = Math.sqrt(Math.max(0, 1 - r * r));
      const B = new Vector3().crossVectors(currentPos, T).normalize();
      const sign = Math.random() > 0.5 ? 1 : -1;
      const newNormal = new Vector3()
        .copy(currentPos)
        .multiplyScalar(d * (Math.random() > 0.5 ? 1 : -1))
        .add(B.clone().multiplyScalar(r * sign))
        .normalize();

      const newCenter = newNormal
        .clone()
        .multiplyScalar(newNormal.dot(currentPos));
      const newRadius = Math.sqrt(Math.max(0, 1 - newCenter.lengthSq()));
      if (newRadius < 0.01) continue;

      const newU = new Vector3().subVectors(currentPos, newCenter).normalize();
      const newV = new Vector3().crossVectors(newNormal, newU).normalize();

      onSpawn(
        {
          center: newCenter,
          radius: newRadius,
          normal: newNormal,
          u: newU,
          v: newV,
          color: this.color,
          generation: this.generation + 1,
          parentId: this.id,
        },
        splitFrequency
      );
    }
  }
}
