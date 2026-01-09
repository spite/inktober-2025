let module;
let index;
let params = "";

const sketches = [
  { id: 1, name: "Annular sphere" },
  { id: 2, name: "Knot curve" },
  { id: 3, name: "Trefoil and torus knot curves" },
  { id: 4, name: "Winders" },
  { id: 5, name: "Möbius strip" },
  { id: 6, name: "Torus at heart I" },
  { id: 7, name: "Torus at heart II" },
  { id: 8, name: "Out of phase torus" },
  { id: 9, name: "Attractor-like torus" },
  { id: 10, name: "Strange attractors" },
  { id: 11, name: "Curl noise field" },
  { id: 12, name: "Curl noise shells" },
  { id: 13, name: "Sphube (3D squircle)" },
  { id: 14, name: "Curl over SDFs I" },
  { id: 15, name: "Curl over SDFs II" },
  { id: 16, name: "Curl over SDFs III" },
  { id: 17, name: "Curl over SDFs IV" },
  { id: 18, name: "Electric fields I" },
  { id: 19, name: "Electric fields II" },
  { id: 20, name: "Electric fields III" },
  { id: 21, name: "Minimal and Non-Orientable surfaces" },
  { id: 22, name: "Isolines I" },
  { id: 23, name: "Isolines II" },
  { id: 24, name: "Isolines III" },
  { id: 25, name: "Isolines IV" },
  { id: 26, name: "Flow field lines I" },
  { id: 27, name: "Flow field lines II" },
  { id: 28, name: "Truchet tiles I" },
  { id: 29, name: "Truchet tiles II" },
  { id: 30, name: "Metaballs" },
];

const galleryDiv = document.querySelector("#gallery");
const galleryContainerDiv = document.querySelector(
  "#gallery .gallery-container"
);
for (const sketch of sketches) {
  const el = document.createElement("a");
  el.textContent = `${sketch.id}. ${sketch.name}`;
  el.href = `#sketch=${sketch.id}`;
  el.addEventListener("click", (e) => {
    galleryDiv.classList.remove("visible");
  });
  galleryContainerDiv.append(el);
}

function readHash() {
  const hash = window.location.hash.replace("#", "");
  const regex = /sketch=(\d*)(\+params=(.*))?/gm;
  const m = regex.exec(hash);
  if (m) {
    index = parseInt(m[1] ?? 1);
    params = m[3] ?? "";
  }
}

function prev(e) {
  e.preventDefault();
  e.stopPropagation();

  readHash();

  // beginning, dont do anything
  if (index === 1) return;
  window.location.hash = `sketch=${--index}`;
}

function next(e) {
  e.preventDefault();
  e.stopPropagation();

  readHash();

  // end, dont do anything
  if (index === 31) return;
  window.location.hash = `sketch=${++index}`;
}

function home(e) {
  galleryDiv.classList.toggle("visible");

  e.preventDefault();
  e.stopPropagation();
}

document.getElementById("homeButton").addEventListener("click", (e) => home(e));
document.getElementById("backButton").addEventListener("click", (e) => prev(e));
document.getElementById("nextButton").addEventListener("click", (e) => next(e));
document.getElementById("randomizeButton").addEventListener("click", (e) => {
  if (module?.randomize) {
    module.randomize();
  }
  e.preventDefault();
  e.stopPropagation();
});

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") {
    if (module?.randomize) {
      module.randomize();
    }
  }
  if (e.code === "KeyS") {
    saveCanvas();
  }
  if (e.code === "KeyJ") {
    prev(e);
  }
  if (e.code === "KeyK") {
    next(e);
  }
});

window.setHash = (data) => {
  window.location.hash = `sketch=${index}+params=${data}`;
};

document.getElementById("downloadButton").addEventListener("click", (e) => {
  saveCanvas();
  e.preventDefault();
  e.stopPropagation();
});

function saveCanvas() {
  if (module.canvas) {
    module.canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);

      const downloadBtn = document.createElement("a");
      downloadBtn.setAttribute(
        "download",
        `inktober-2025-${performance.now()}.png`
      );
      downloadBtn.setAttribute("href", url);
      document.body.appendChild(downloadBtn);
      downloadBtn.click();
      downloadBtn.remove();
      URL.revokeObjectURL(url);
    });
  }
}

readHash();
if (isNaN(index) || index === "" || index === undefined) {
  window.location.hash = `sketch=1`;
  index = 1;
}

async function loadModule() {
  module = await import(`../sketches/${index}.js`);
  document.body.appendChild(module.canvas);
  if (module.start) {
    module.start();
  }
  return module;
}

async function init() {
  module = await loadModule();

  async function reload() {
    if (index === module.index) {
      return;
    }
    if (module && module.canvas) {
      try {
        document.body.removeChild(module.canvas);
      } catch (e) {}
    }
    if (module && module.stop) {
      module.stop();
    }
    try {
      module = await loadModule();
    } catch (e) {
      console.log(e);
    }
  }

  // const capturer = new CCapture({
  //   verbose: false,
  //   display: true,
  //   framerate: 60,
  //   motionBlurFrames: 0 * (960 / 60),
  //   quality: 99,
  //   format: 'gif',
  //   timeLimit: module.loopDuration,
  //   frameLimit: 0,
  //   autoSaveTime: 0,
  //   workersPath: 'js/'
  // });

  let startTime = 0;

  // function capture() {
  //   capturer.start();
  //   startTime = performance.now();
  // }

  // document.getElementById("start").addEventListener("click", (e) => {
  //   capture();
  //   e.preventDefault();
  // });

  function update() {
    requestAnimationFrame(update);
    module.draw(startTime);
    // capturer.capture(module.canvas);
  }

  update();

  window.addEventListener("hashchange", async (e) => {
    readHash();
    reload();
    if (module.deserialize) {
      module.deserialize(params);
    }
  });
}

window.addEventListener("load", init);
