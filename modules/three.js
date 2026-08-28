import { WebGLRenderer, PerspectiveCamera, OrthographicCamera, PCFSoftShadowMap } from "three";
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
  // Capped at 2. Painted keeps four full-resolution targets and runs up to 121
  // accumulation passes over them, so an uncapped 3x phone renders nine times the pixels
  // of a 1x pass — for a difference that display cannot really show.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  return renderer;
}
// Resize handlers, one per sketch, registered at sketch module scope.
//
// A sketch module is cached, so its handler outlives every visit: after touring the
// gallery, resize() was calling painted.setSize() — and so a reallocation of four
// full-resolution render targets plus an invalidate() — on all thirty-one Painted
// instances, on every sketch load and every window resize. Only one of them is on screen.
//
// So a handler is paused while its sketch is not the visible one, and remembers the size
// it last ran with. resume() replays the resize it slept through, once, if the window
// changed in the meantime — which is also what keeps three-meshline's _activePainted
// pointing at the sketch you are actually looking at, since only the active handler now
// calls invalidate().
const resizeHandlers = [];
let lastWidth = -1;
let lastHeight = -1;

const renderer = getWebGLRenderer();
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
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

function runResizeHandler(handler, w, h) {
  handler.width = w;
  handler.height = h;
  handler.fn(w, h);
}

// Returns a handle; sketches pause it in stop() and resume it in start().
function onResize(fn) {
  const handler = {
    fn,
    active: true,
    // Deliberately unreachable values: a handler that has never run must run on its
    // first resume() even if the window has not moved since.
    width: -1,
    height: -1,
    pause() {
      handler.active = false;
    },
    resume() {
      handler.active = true;
      if (handler.width !== lastWidth || handler.height !== lastHeight) {
        runResizeHandler(handler, lastWidth, lastHeight);
      }
    },
  };
  resizeHandlers.push(handler);
  // The handler is registered active and has never run, so this first call is what gives
  // it its initial size.
  resize();
  return handler;
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  lastWidth = w;
  lastHeight = h;
  renderer.setSize(w, h);

  for (const handler of resizeHandlers) {
    if (handler.active) runResizeHandler(handler, w, h);
  }

  // Cameras are updated whether or not their sketch is visible. It is a handful of
  // arithmetic each, not a buffer reallocation, and it means a sketch resumed after a
  // resize already has the right aspect rather than waiting a frame for one.
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
            <b>Tab</b> to toggle the UI, and <b>A</b> to show the advanced rendering
            controls.<br/><br/>
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
