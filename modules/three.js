import { WebGLRenderer, PerspectiveCamera, PCFSoftShadowMap, ColorManagement } from "three";
import { TextureLoader } from "three";

// Colours are used as written: nothing converts linear back to sRGB on output.
ColorManagement.enabled = false;
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
// A plain list. Handlers used to be pausable, because every sketch registered one and
// module caching kept all 31 alive: a window resize then reallocated the render targets of
// every sketch ever visited, so each had to be put to sleep while it was off screen. The
// stage owns the only Painted now, so there is one handler and nothing to pause.
const resizeHandlers = [];

const renderer = getWebGLRenderer();
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;

const camera = new PerspectiveCamera(initialFov, 1, 0.1, 100);
resize();

window.addEventListener("resize", () => {
  resize();
});

function onResize(fn) {
  resizeHandlers.push(fn);
  // Gives the new handler its initial size.
  resize();
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);

  for (const fn of resizeHandlers) fn(w, h);

  camera.aspect = w / h;
  if (w < h) {
    // Portrait keeps the landscape horizontal FOV.
    const horizontalFOV = (initialFov * Math.PI) / 180;
    const newVFovRad = 2 * Math.atan(Math.tan(horizontalFOV / 2) / camera.aspect);
    camera.fov = newVFovRad * (180 / Math.PI);
  } else {
    camera.fov = initialFov;
  }
  camera.updateProjectionMatrix();
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
            press <b>R</b> to find a new shape.<br/><br/>
            In the params panel, click <b>Randomize params</b> to reroll everything, ink included.<br/><br/>
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
  camera,
  wait,
  isRunning,
  onResize,
  waitForRender,
  addInfo,
};
