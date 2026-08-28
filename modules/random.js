// The sketches' random number generator, deliberately separate from Math.random.
//
// It used to be Math.random itself: every sketch opened its build with
// Math.seedrandom(params.seed()), which replaces the global. That made the seed in the URL
// share one stream with everything else on the page — and three.js draws four numbers from
// Math.random for every object's UUID, so each `new Mesh`, `new Material` and
// `new BufferGeometry` a build creates ate into the same sequence the drawing was made of.
//
// Two consequences, both of which we hit. Reordering object creation silently redistributes
// values across the drawing even when the geometry is untouched. And creation that happens
// at render time rather than build time — MeshLineMaterial's lazy customDepthMaterial, a
// shadow map allocated on first use — lands in the stream at a point that depends on frame
// timing, so the same seed need not produce the same image twice.
//
// Keeping our own generator fixes both at the root: three.js can create as many objects as
// it likes, whenever it likes, and the drawing does not notice.
//
// seedrandom is loaded as a classic script in index.html, so Math.seedrandom is a global by
// the time any module runs. Passing global:false is what makes it hand back a standalone
// generator instead of overwriting Math.random — the distinction this whole module exists for.

let _rng = Math.random;

// Reseeds the sketch generator. Call it at the top of a build, where
// Math.seedrandom(seed) used to be.
export function seed(value) {
  _rng = Math.seedrandom(value, { global: false });
}

// A float in [0, 1), from the seeded generator once seed() has been called and from
// Math.random before that — which is what module-scope code (which runs at import, before
// any sketch can seed) should get, since a fixed value there would be a lie about
// reproducibility rather than a guarantee of it.
export function random() {
  return _rng();
}
