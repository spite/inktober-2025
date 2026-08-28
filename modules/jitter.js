import { PerspectiveCamera, MathUtils } from "three";

// Sub-pixel camera offsets for the accumulation buffer, as an R2 low-discrepancy
// sequence — Roberts' 2D generalisation of the golden ratio.
//
// This was an 8-entry rook pattern while the accumulator runs 121 passes, and
// incPointer() wraps on the table length: a static scene therefore sampled the same 8
// positions fifteen times over. Because the shader keeps a running mean, the average of
// fifteen repeats of eight values is just the average of those eight, so every pass past
// the eighth cost a full scene render and added nothing.
//
// R2 is used rather than a longer fixed pattern because it is progressive: every prefix
// of the sequence is well distributed, so the picture is evenly sampled after a handful
// of frames and keeps improving all the way to the end. A rook pattern is only good at
// exactly its own length.
//
// 128 entries so the sequence never wraps inside one accumulation cycle (121 passes),
// and centred on zero: sampling a whole pixel to one side is still a one-pixel box
// filter, but its centroid sits half a pixel off and biases the accumulated image by
// that much.
const PLASTIC = 1.32471795724474602596;
const A1 = 1 / PLASTIC;
const A2 = 1 / (PLASTIC * PLASTIC);
const jitterTable = Array.from({ length: 128 }, (_, i) => [
  ((0.5 + A1 * (i + 1)) % 1) - 0.5,
  ((0.5 + A2 * (i + 1)) % 1) - 0.5,
]);
let jitterPointer = 0;

function makePerspectiveJitter(
  mat,
  left,
  right,
  top,
  bottom,
  near,
  far,
  offsetX,
  offsetY,
  w,
  h
) {
  if (far === undefined) {
    console.warn(
      "THREE.Matrix4: .makePerspective() has been redefined and has a new signature. Please check the docs."
    );
  }

  const scaleX = (left - right) / w;
  const scaleY = (top - bottom) / h;

  left -= offsetX * scaleX;
  top -= offsetY * scaleY;
  right -= offsetX * scaleX;
  bottom -= offsetY * scaleY;

  var te = mat.elements;
  var x = (2 * near) / (right - left);
  var y = (2 * near) / (top - bottom);

  var a = (right + left) / (right - left);
  var b = (top + bottom) / (top - bottom);
  var c = -(far + near) / (far - near);
  var d = (-2 * far * near) / (far - near);

  te[0] = x;
  te[4] = 0;
  te[8] = a;
  te[12] = 0;
  te[1] = 0;
  te[5] = y;
  te[9] = b;
  te[13] = 0;
  te[2] = 0;
  te[6] = 0;
  te[10] = c;
  te[14] = d;
  te[3] = 0;
  te[7] = 0;
  te[11] = -1;
  te[15] = 0;

  return mat;
}

function updateProjectionMatrixJitter(camera, size) {
  const [offsetX, offsetY] = jitterTable[jitterPointer];

  var near = camera.near,
    top = (near * Math.tan(MathUtils.DEG2RAD * 0.5 * camera.fov)) / camera.zoom,
    height = 2 * top,
    width = camera.aspect * height,
    left = -0.5 * width,
    view = camera.view;

  if (camera.view !== null && camera.view.enabled) {
    var fullWidth = view.fullWidth,
      fullHeight = view.fullHeight;

    left += (view.offsetX * width) / fullWidth;
    top -= (view.offsetY * height) / fullHeight;
    width *= view.width / fullWidth;
    height *= view.height / fullHeight;
  }

  var skew = camera.filmOffset;
  if (skew !== 0 && camera.getFilmWidth)
    left += (near * skew) / camera?.getFilmWidth();

  if (camera instanceof PerspectiveCamera) {
    makePerspectiveJitter(
      camera.projectionMatrix,
      left,
      left + width,
      top,
      top - height,
      near,
      camera.far,
      offsetX,
      offsetY,
      size.x,
      size.y
    );
  } else {
    camera.left -= offsetX / size.x;
    camera.top -= offsetY / size.y;
    camera.right -= offsetX / size.x;
    camera.bottom -= offsetY / size.y;
    camera.updateProjectionMatrix();
  }

  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

function incPointer() {
  jitterPointer = (jitterPointer + 1) % jitterTable.length;
}

function resetPointer() {
  jitterPointer = 0;
}

export { updateProjectionMatrixJitter, incPointer, resetPointer };
