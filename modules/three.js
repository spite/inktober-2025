import { WebGLRenderer, PerspectiveCamera, OrthographicCamera } from "three";
const cameras = [];

function getWebGLRenderer() {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  return renderer;
}
const resizeFns = [];

const renderer = getWebGLRenderer();
resize();

function getCamera(fov) {
  const camera = new PerspectiveCamera(
    fov ? fov : 35,
    renderer.domElement.width / renderer.domElement.height,
    0.1,
    100
  );
  cameras.push(camera);
  return camera;
}

function getOrthoCamera(w, h) {
  const camera = new OrthographicCamera(-w, w, h, -h, -100, 100);
  cameras.push(camera);
  return camera;
}

window.addEventListener("resize", () => {
  resize();
});

function onResize(fn) {
  resizeFns.push(fn);
  resize();
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);

  for (const fn of resizeFns) {
    fn(w, h);
  }

  for (const camera of cameras) {
    if (camera instanceof PerspectiveCamera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (camera instanceof OrthographicCamera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }
}

let isRunning = true;
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    isRunning = !isRunning;
  }
});

document.getElementById("pauseButton").addEventListener("click", (e) => {
  isRunning = !isRunning;
  e.preventDefault();
});

export { renderer, getCamera, getOrthoCamera, isRunning, onResize };
