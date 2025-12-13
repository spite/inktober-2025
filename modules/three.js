import { WebGLRenderer, PerspectiveCamera, OrthographicCamera } from "three";
import { TextureLoader } from "three";
const loader = new TextureLoader();
loader.setPath("./assets/");
const brushes = {
  brush1: loader.load("stroke.jpg"),
  brush2: loader.load("brush2.jpg"),
  brush3: loader.load("brush3.jpg"),
  brush4: loader.load("brush4.jpg"),
  brush5: loader.load("watercolor-brush-stroke.jpg"),
  brush6: loader.load("PaintBrushStroke03.jpg"),
  brush7: loader.load("stroke3.jpg"),
  brush8: loader.load("stroke4.jpg"),
};
const brushOptions = Object.keys(brushes).map((v, i) => [v, `Brush ${i + 1}`]);

const cameras = [];

function getWebGLRenderer() {
  const renderer = new WebGLRenderer({ antialias: false, alpha: true });
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

const header = document.body.querySelector("header");

let isRunning = true;
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    isRunning = !isRunning;
  }
  if (e.code === "Tab") {
    header.classList.toggle("visible");
    e.preventDefault();
  }
});

document.getElementById("pauseButton").addEventListener("click", (e) => {
  isRunning = !isRunning;
  e.preventDefault();
});

const waitForRender = () => {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
};

export {
  renderer,
  brushes,
  brushOptions,
  getCamera,
  getOrthoCamera,
  isRunning,
  onResize,
  waitForRender,
};
