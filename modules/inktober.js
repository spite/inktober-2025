import { effectRAF } from "./reactive.js";
import { renderer } from "./three.js";

document.body.appendChild(renderer.domElement);

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
  { id: 31, name: "Lines on a sphere" },
];

// `current` is on screen; `wanted` is what the URL asks for, possibly still loading.
let current = null;
let wanted = null;
let serializeEffect = null;

// replaceState: no history entry per slider frame, and no hashchange.
function serialize() {
  const { index, params } = current;
  if (!params) return;
  const data = Object.keys(params)
    .map((key) => `${key}=${params[key]()}`)
    .join("|");
  const hash = `#sketch=${index}+params=${data}`;
  if (window.location.hash !== hash) history.replaceState(null, "", hash);
}
window.serialize = serialize;

function deserialize(data, params, defaults) {
  const fields = data.split("|");
  for (const field of fields) {
    const eqIdx = field.indexOf("=");
    if (eqIdx === -1) continue;
    const key = field.slice(0, eqIdx);
    const value = field.slice(eqIdx + 1);
    if (!(key in defaults) || !(key in params)) continue;
    switch (typeof defaults[key]) {
      case "number": {
        const n = parseFloat(value);
        if (!isNaN(n)) params[key].set(n);
        break;
      }
      case "object": {
        const arr = value.split(",").map((v) => parseFloat(v));
        if (arr.every((v) => !isNaN(v))) params[key].set(arr);
        break;
      }
      case "boolean":
        if (value === "true" || value === "false") {
          params[key].set(value === "true");
        }
        break;
      case "string":
        params[key].set(value);
        break;
    }
  }
}

function reset() {
  const { params, defaults } = current;
  for (const key of Object.keys(defaults)) {
    params[key].set(defaults[key]);
  }
}
window.reset = reset;

function readHash() {
  const m = /sketch=(\d+)(?:\+params=(.*))?/.exec(window.location.hash);
  const index = m ? parseInt(m[1]) : NaN;
  return { index: index > 0 ? index : null, params: m?.[2] ?? "" };
}

// Swaps in the requested sketch once loaded, unless a later request superseded it.
async function sync() {
  const { index, params } = readHash();
  if (index === null) {
    history.replaceState(null, "", "#sketch=1");
    return sync();
  }
  wanted = index;
  updateButtonState();

  let next;
  try {
    next = await import(`../sketches/${index}.js`);
  } catch (e) {
    console.error(e);
    if (wanted === index && current) wanted = current.index;
    updateButtonState();
    return;
  }
  if (wanted !== index) return;

  if (params && next.params && next.defaults) {
    deserialize(params, next.params, next.defaults);
  }
  // The serialize effect only writes on change.
  if (next === current) {
    serialize();
    return;
  }

  serializeEffect?.stop();
  current?.stop();
  current = next;
  current.start();
  serializeEffect = effectRAF(serialize);
}

window.addEventListener("hashchange", sync);

const galleryDiv = document.querySelector("#gallery");
const galleryContainerDiv = document.querySelector(
  "#gallery .gallery-container",
);
for (const sketch of sketches) {
  const el = document.createElement("a");
  el.textContent = `${sketch.id}. ${sketch.name}`;
  el.href = `#sketch=${sketch.id}`;
  el.addEventListener("click", () => {
    galleryDiv.classList.remove("visible");
  });
  galleryContainerDiv.append(el);
}

function updateButtonState() {
  document
    .getElementById("backButton")
    .classList.toggle("disabled", wanted <= 1);
  document
    .getElementById("nextButton")
    .classList.toggle("disabled", wanted >= sketches.length);
}

// Step from the requested sketch, not the one on screen.
function step(e, delta) {
  e.preventDefault();
  e.stopPropagation();
  const target = wanted + delta;
  if (target < 1 || target > sketches.length) return;
  window.location.hash = `sketch=${target}`;
}

function randomize(e) {
  e.preventDefault();
  e.stopPropagation();
  current?.randomize?.();
}

function home(e) {
  e.preventDefault();
  e.stopPropagation();
  galleryDiv.classList.toggle("visible");
}

document.getElementById("homeButton").addEventListener("click", home);
document
  .getElementById("backButton")
  .addEventListener("click", (e) => step(e, -1));
document
  .getElementById("nextButton")
  .addEventListener("click", (e) => step(e, 1));
document
  .getElementById("randomizeButton")
  .addEventListener("click", randomize);
document.getElementById("downloadButton").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  saveCanvas();
});

// Selects type-ahead on letters; checkboxes keep focus but don't.
function takesLetters(el) {
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return (
    el.tagName === "INPUT" &&
    !["checkbox", "radio", "range", "button", "color"].includes(el.type)
  );
}

window.addEventListener("keydown", (e) => {
  // Alt+R rerolls one panel control; Ctrl/Cmd combos belong to the browser.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (takesLetters(e.target)) return;
  if (e.code === "KeyR") randomize(e);
  if (e.code === "KeyS") saveCanvas();
  if (e.code === "KeyJ") step(e, -1);
  if (e.code === "KeyK") step(e, 1);
});

function saveCanvas() {
  renderer.domElement.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const downloadBtn = document.createElement("a");
    downloadBtn.setAttribute("download", `inktober-2025-${performance.now()}.png`);
    downloadBtn.setAttribute("href", url);
    document.body.appendChild(downloadBtn);
    downloadBtn.click();
    downloadBtn.remove();
    URL.revokeObjectURL(url);
  });
}

const switching = document.querySelector("#switching");

function update(frameStart) {
  requestAnimationFrame(update);
  current?.draw(frameStart);
  switching.classList.toggle("hidden", current?.index === wanted);
}

sync();
requestAnimationFrame(update);
