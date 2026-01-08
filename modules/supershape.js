function superFormula(phi, a = 1, b = 1, m, n1, n2, n3) {
  const part1 = Math.pow(Math.abs(Math.cos((m * phi) / 4.0) / a), n2);
  const part2 = Math.pow(Math.abs(Math.sin((m * phi) / 4.0) / b), n3);

  return Math.pow(part1 + part2, -(1.0 / n1));
}

function superShape3D(p, params1, params2, offset) {
  let d = p.length() + offset;

  if (d === 0) return 0;

  const sn = p.z / d;
  const phi = Math.atan2(p.y, p.x);
  const rho = Math.asin(sn);

  const r1 = superFormula(
    phi,
    params1.a,
    params1.b,
    params1.m,
    params1.n1,
    params1.n2,
    params1.n3
  );

  const r2 = superFormula(
    rho,
    params2.a,
    params2.b,
    params2.m,
    params2.n1,
    params2.n2,
    params2.n3
  );

  d -= r2 * Math.sqrt(r1 * r1 * (1.0 - sn * sn) + sn * sn);

  return d;
}

const presets = [
  // codevember 2017
  {
    a: { a: 1, b: 1, m: 5.9, n1: 2.7, n2: 4.7, n3: 7.4, a: 1.2, b: 0.8 },
    b: { a: 1, b: 1, m: 17, n1: 35, n2: 14, n3: -15, a: 1.8, b: 2 },
  },
  // sphere
  {
    a: { a: 1, b: 1, m: 0.01, n1: 0.1, n2: 0.01, n3: 5 },
    b: { a: 1, b: 1, m: 0.01, n1: 0.1, n2: 0.01, n3: 5 },
  },
  // rounded cube
  {
    a: { a: 1, b: 1, m: 4, n1: 10, n2: 10, n3: 10 },
    b: { a: 1, b: 1, m: 4, n1: 10, n2: 10, n3: 10 },
  },
  // doughboy sextuplets
  {
    a: { a: 1, b: 1, m: 6, n1: -4.8, n2: 7.54, n3: 6.4 },
    b: { a: 1, b: 1, m: 11.43, n1: 1.5, n2: 0, n3: 5.9 },
  },
];

export { superShape3D, presets };
