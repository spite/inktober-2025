import Maf from "maf";

function calcDirection(charges, x, y) {
  const dir = { x: 0, y: 0, v: 0 };
  for (let i = 0; i < charges.length; i++) {
    for (let j = i + 1; j < charges.length; j++) {
      const d = getPair(x, y, charges[i], charges[j]);
      dir.x += d.x;
      dir.y += d.y;
      dir.v += d.v;
    }
  }
  const l = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
  return { x: dir.x / l, y: dir.y / l, v: dir.v / charges.length };
}

function init(num, width, height, range) {
  const charges = [];
  for (let i = 0; i < num; i++) {
    charges.push({
      x: Maf.randomInRange(0, width),
      y: Maf.randomInRange(0, height),
      charge: Maf.randomInRange(-range, range),
    });
  }

  return { charges, calcDirection: (x, y) => calcDirection(charges, x, y) };
}

function getPair(x, y, q1, q2) {
  const m = 100; //10e3; //6e3;

  let v = 0;
  let rSq = (x - q1.x) ** 2 + (y - q1.y) ** 2;
  let Ex = (m * q1.charge * (x - q1.x)) / rSq;
  let Ey = (m * q1.charge * (q1.y - y)) / rSq;
  v += q1.charge / Math.sqrt(rSq);

  rSq = (x - q2.x) ** 2 + (y - q2.y) ** 2;
  Ex = Ex - (m * q2.charge * (q2.x - x)) / rSq;
  Ey = Ey - (m * q2.charge * (y - q2.y)) / rSq;
  v += q2.charge / Math.sqrt(rSq);

  return { x: Ey, y: Ex, v };
}

export { init };
