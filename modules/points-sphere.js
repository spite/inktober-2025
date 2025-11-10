import { Vector3 } from "three";

function pointsOnSphere(n, r = 1) {
  const pts = [];
  const inc = Math.PI * (3 - Math.sqrt(5));
  const off = 2.0 / n;
  let rr;
  var phi;
  let dmin = 10000;
  const prev = new Vector3();
  const cur = new Vector3();

  for (var k = 0; k < n; k++) {
    cur.y = k * off - 1 + off / 2;
    rr = Math.sqrt(1 - cur.y * cur.y);
    phi = k * inc;
    cur.x = Math.cos(phi) * rr;
    cur.z = Math.sin(phi) * rr;

    const dist = cur.distanceTo(prev);
    if (dist < dmin) dmin = dist;

    pts.push(cur.clone().normalize().multiplyScalar(r));
    prev.copy(cur);
  }

  return pts;
}

export { pointsOnSphere };
