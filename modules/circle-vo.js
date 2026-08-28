function getAngleOnCircle(circle, point) {
  const local = point.clone().sub(circle.center);
  const x = local.dot(circle.u);
  const y = local.dot(circle.v);
  return Maf.mod(Math.atan2(y, x), Maf.TAU);
}

function getIntersections(c1, c2) {
  const n1 = c1.normal;
  const n2 = c2.normal;

  // d is the distance from origin to the plane
  // center = d * n, so d = center . n
  const d1 = c1.center.dot(n1);
  const d2 = c2.center.dot(n2);

  const alpha = n1.dot(n2);
  const det = 1 - alpha * alpha;

  if (det < 1e-6) return []; // Parallel planes

  const c_1 = (d1 - d2 * alpha) / det;
  const c_2 = (d2 - d1 * alpha) / det;

  // P0 is the point on the intersection line of the two planes that is closest to the origin
  const p0 = n1.clone().multiplyScalar(c_1).add(n2.clone().multiplyScalar(c_2));

  const h2 = 1 - p0.lengthSq();

  if (h2 < -1e-6) return []; // Intersection line is outside the sphere

  const dir = new Vector3().crossVectors(n1, n2);
  const t = Math.sqrt(Math.max(0, h2) / det);

  const i1 = p0.clone().add(dir.clone().multiplyScalar(t));
  const i2 = p0.clone().sub(dir.clone().multiplyScalar(t));

  // If t is very small, i1 and i2 are the same
  if (t < 1e-6) return [i1];

  return [i1, i2];
}

function modAngle(angle, range) {
  while (angle < 0) {
    angle += range;
  }
  return Maf.mod(angle, range);
}

class Circle {
  constructor(startPoint, normal, center, radius, u, v, generation = 0) {
    this.id = uuid();
    this.active = true;

    this.startPoint = startPoint;
    this.normal = normal;
    this.center = center;
    this.radius = radius;
    this.u = u;
    this.v = v;
    this.generation = generation;

    this.progressFwd = 0;
    this.progressBack = 0;

    this.group = new Group();
    this.circleGroup = new Group();
    this.group.add(this.circleGroup);

    const points = new Array(256).fill(new Vector3(), 0, 256);
    this.geometry = new BufferGeometry().setFromPoints(points);
    this.line = new Line(
      this.geometry,
      new MeshBasicMaterial({ color: this.id % 2 === 0 ? 0xff00ff : 0x00ff00 })
    );
    this.circleGroup.add(this.line);

    this.createHelpers();
  }

  createHelpers() {
    const center = new Mesh(
      new BoxGeometry(0.01, 0.01, 0.01),
      new MeshNormalMaterial()
    );
    center.position.copy(this.center);
    this.group.add(center);
    const uArrow = new ArrowHelper(
      this.u,
      this.center,
      this.radius,
      0xff0000,
      0.01,
      0.01
    );
    this.group.add(uArrow);
    const nArrow = new ArrowHelper(
      this.normal,
      this.center,
      0.1,
      0x00ff00,
      0.01,
      0.01
    );
    this.group.add(nArrow);
    const vArrow = new ArrowHelper(
      this.v,
      this.center,
      this.radius,
      0x0000ff,
      0.01,
      0.01
    );
    this.group.add(vArrow);

    const p1 = new Mesh(
      new BoxGeometry(0.01, 0.01, 0.01),
      new MeshNormalMaterial()
    );
    this.group.add(p1);
    const p2 = new Mesh(
      new BoxGeometry(0.01, 0.01, 0.01),
      new MeshNormalMaterial()
    );
    this.group.add(p2);
    this.points = [p1, p2];

    const arrow1 = new ArrowHelper(
      new Vector3(1, 1, 1),
      this.center,
      this.radius,
      0xb70000,
      0.01,
      0.01
    );
    this.group.add(arrow1);

    const arrow2 = new ArrowHelper(
      new Vector3(1, 1, 1),
      this.center,
      this.radius,
      0x00b700,
      0.01,
      0.01
    );
    this.group.add(arrow2);

    this.arrows = [arrow1, arrow2];
  }

  update() {
    if (!this.active) {
      return;
    }

    const epsilon = 0.01;
    // this.progressFwd = params.progress();
    this.progressFwd += 0.001;
    // if (this.progressFwd > 0.5) {
    //   this.progressFwd = 0.5;
    // }
    if (this.progressFwd > 1) {
      this.active = false;
      return;
    }

    const startAngle = -this.progressFwd;
    const endAngle = this.progressBack;

    for (const circle of circles) {
      if (circle.id === this.id) {
        continue;
      }

      const intersections = getIntersections(this, circle);
      console.log(this.id, circle.id);
      let sin;
      let cos;
      const dir = new Vector3();

      const startAngle = -circle.progressFwd * Maf.TAU;

      sin = Math.sin(startAngle);
      cos = Math.cos(startAngle);
      dir
        .set(0, 0, 0)
        .addScaledVector(this.u, this.radius * cos)
        .addScaledVector(this.v, this.radius * sin);
      this.arrows[1].setDirection(dir.normalize());

      for (let i = 0; i < intersections.length; i++) {
        const point = intersections[i];
        this.points[i].position.copy(point);

        const angleOnOtherCircle =
          modAngle(getAngleOnCircle(circle, point), Maf.TAU) / Maf.PI; // (-PI, PI]
        if (circle.progressFwd >= angleOnOtherCircle) {
          debugger;
          const angle = getAngleOnCircle(this, point); // (-PI, PI]

          sin = Math.sin(angle);
          cos = Math.cos(angle);
          dir
            .set(0, 0, 0)
            .addScaledVector(this.u, this.radius * cos)
            .addScaledVector(this.v, this.radius * sin);
          this.arrows[0].setDirection(dir.normalize());

          const dS = Math.abs(
            modAngle(angle, Maf.TAU) - modAngle(startAngle, Maf.TAU)
          );
          console.log(this.id, circle.id, dS);
          if (dS < epsilon) {
            // debugger;
            this.active = false;
            console.log("STOP", this.id);
          }
        }
      }
    }
  }

  render() {
    const points = [];

    // Starts drawing from c+u (start point)
    const startAngle = -this.progressFwd * Maf.TAU;
    const endAngle = this.progressBack * Maf.TAU;
    const totalAngle = endAngle - startAngle;
    const numSegments = Math.max(2, Math.floor((256 * totalAngle) / Maf.TAU));

    for (let i = 0; i < numSegments; i++) {
      const angle = Maf.lerp(
        startAngle,
        endAngle,
        Maf.map(0, numSegments - 1, 0, 1, i)
      );
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      const pos = new Vector3()
        .copy(this.center)
        .addScaledVector(this.u, this.radius * cos)
        .addScaledVector(this.v, this.radius * sin);
      points.push(pos);
    }
    this.geometry.dispose();
    this.geometry = new BufferGeometry().setFromPoints(points);
    this.line.geometry = this.geometry;
  }
}
