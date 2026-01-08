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
  brush9: loader.load("PaintBrushStroke05.jpg"),
};
const brushOptions = Object.keys(brushes).map((v, i) => [v, `Brush ${i + 1}`]);

const cameras = [];
const initialFov = 35;

function getWebGLRenderer() {
  const renderer = new WebGLRenderer({
    antialias: false,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  return renderer;
}
const resizeFns = [];

const renderer = getWebGLRenderer();
resize();

function getCamera(fov) {
  const camera = new PerspectiveCamera(
    fov ? fov : initialFov,
    renderer.domElement.width / renderer.domElement.height,
    0.1,
    100
  );
  cameras.push(camera);
  resize();
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
      if (w < h) {
        const initialAspect = 1;
        const horizontalFOV =
          2 *
          Math.atan(Math.tan((initialFov * Math.PI) / 180 / 2) * initialAspect);
        const newVFovRad =
          2 * Math.atan(Math.tan(horizontalFOV / 2) / camera.aspect);
        const newVFovDeg = newVFovRad * (180 / Math.PI);
        camera.fov = newVFovDeg;
      } else {
        camera.fov = initialFov;
      }
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

function wait() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, 1);
  });
}

function addInfo(gui) {
  gui.addSeparator();
  gui.addText(`<p>
            Click and drag to rotate. Right click and drag to pan. Mousewheel to
            zoom. Click <b>Pause</b> of press <b>Space</b> to toggle animation. Click <b>Randomize</b> or
            press <b>R</b> to randomize.<br/><br/>
            In the params panel, click <b>Randomize params</b> or press <b>R</b> to find new shapes.<br/><br/>
            Click <b>Save</b> or press <b>S</b> to download an image. Press
            <b>Tab</b> to toggle the UI.<br/><br/>
            Click <b>Previous</b> or press <b>J</b> to navigate to the previous sketch, and click <b>Next</b> or press <b>K</b> to navigate to the next one. Click <b>Gallery</b> to see a list of all sketches.
          </p>`);
}

export {
  renderer,
  brushes,
  brushOptions,
  getCamera,
  wait,
  getOrthoCamera,
  isRunning,
  onResize,
  waitForRender,
  addInfo,
};
