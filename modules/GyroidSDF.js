function sdGyroid(p, size, thickness, scale) {
  const surfaceSide =
    scale *
    scale *
    (Math.sin(p.x) * Math.cos(p.y) +
      Math.sin(p.y) * Math.cos(p.z) +
      Math.sin(p.z) * Math.cos(p.x));

  const d = Math.abs(surfaceSide) - thickness;

  const absX = Math.abs(p.x);
  const absY = Math.abs(p.y);
  const absZ = Math.abs(p.z);

  const boxDist = Math.max(absX, Math.max(absY, absZ)) - size;

  return Math.max(d, boxDist);
}

export { sdGyroid };
