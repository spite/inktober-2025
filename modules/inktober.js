let module;

function getIndex() {
  return parseInt(window.location.hash.replace("#", ""));
}

function prev(e) {
  let index = getIndex();

  // beginning, dont do anything
  if (index === 1) return;
  window.location.hash = `${--index}`;
  e.preventDefault();
}

function next(e) {
  let index = getIndex();
  window.location.hash = ++index;
  e.preventDefault();
}

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
});

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
      document.body.appendChild(downloadBtn); // Append to the document to make click() work
      downloadBtn.click();
      downloadBtn.remove(); // Clean up the temporary element
      URL.revokeObjectURL(url); // Clean up the object URL
    });
  }
}

const cur = getIndex();
if (isNaN(cur) || cur === "" || cur === undefined) {
  window.location.hash = 1;
}

async function loadModule() {
  const num = window.location.hash.substr(1) || 1;
  module = await import(`../sketches/${num}.js`);
  document.body.appendChild(module.canvas);
  if (module.start) {
    module.start();
  }
  return module;
}

async function init() {
  module = await loadModule();

  async function reload() {
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
    if (!skip) module.draw(startTime);
    // capturer.capture(module.canvas);
  }

  update();

  window.addEventListener("hashchange", async (e) => {
    reload();
  });
}

window.skip = false;

window.addEventListener("load", init);
