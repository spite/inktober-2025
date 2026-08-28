// The panel comes from guspira, vendored as the single built bundle ./guspira.js and
// reached through the "guspira" import-map entry in index.html — the same way three, maf
// and OrbitControls are wired. This file stays so that the sketches importing
// "../modules/gui.js" keep working unchanged, and so there is one place to look when the
// version needs bumping.
//
// Updating: copy guspira/dist/guspira.js over ./guspira.js, and guspira/css/gui.css over
// ../../css/gui.css as well — the panel's whole appearance is in that one file, so a
// script-only copy drifts out of step without anything looking wrong.
//
// It has to be one bundle, not several. dist/ also ships guspira-reactive.js with just the
// signals layer, and pulling that in beside this one would give the project two unrelated
// copies of the signal system: a signal written through one would never notify an effect
// created by the other. ./reactive.js therefore re-exports from here too.
export { GUI as default, Controller, Section, Tab } from "guspira";

import { randomInRange, bindKey } from "guspira";

// R rerolls the panel — but only the panel you are looking at.
//
// guspira's addRandomizeButton binds the key on `window` and unbinds it in gui.destroy().
// These panels are never destroyed: a sketch module is cached, so the panel it built on
// your first visit outlives every later one, and stop() only hides it. Visiting five
// sketches therefore left five live R handlers, and one press rerolled all five — the four
// you weren't looking at went dirty and rebuilt with parameters you never chose the next
// time you opened them.
//
// One handler lives here instead, and the active sketch says who it belongs to. Sketches
// build their button with addRandomizeParams() below (which binds no key of its own) and
// hand the same action to setActiveRandomize() from start(), clearing it in stop().
let activeRandomize = null;
bindKey("KeyR", () => activeRandomize?.());

export function setActiveRandomize(fn = null) {
  activeRandomize = fn;
}

// addRandomizeButton without the window-wide key binding. Returns the action so start()
// can register it as the active one.
export function addRandomizeParams(gui, label, onDone = () => {}) {
  const run = () => {
    gui.randomizeAll();
    onDone();
  };
  gui.addButton(label, run);
  return run;
}

// A slider's range is what you can reach by hand; it is not always the range worth landing on
// when a value is rolled. Opacity below 0.5 washes the ink out, a radius of 1 collapses the
// shape and 10 overflows the frame — so most sketches here kept two ranges, a wide one on the
// control and a narrow one inside randomizeParams(). Guspira rolls across the declared range,
// which is the right default, so the narrow band goes on the controller instead:
//
//   rollWithin(gui.addSlider("Radius", params.radius, 1, 10, 0.1), 4, 6);
//
// Replacing `controller.randomize` covers the label click, Alt+R and the panel's Randomize
// button alike — they all dispatch through it.
//
// A range slider's signal holds a pair, so it gets a pair back, ordered low to high — the same
// shape guspira's own roll produces, only over a narrower band. `step` snaps the result for the
// controls that count in whole things (lines, repeats, loops).
export function rollWithin(controller, min, max, step = 0) {
  const snap = (v) => (step ? Math.round(v / step) * step : v);
  const sig = controller.signal;

  controller.randomize = () => {
    if (Array.isArray(sig.peek())) {
      const a = randomInRange(min, max);
      const b = randomInRange(a, max);
      sig.set([snap(a), snap(b)]);
    } else {
      sig.set(snap(randomInRange(min, max)));
    }
  };

  return controller;
}

// The third shape these sketches used: a low end drawn from its own band, then a high end
// drawn from wherever the low one landed up to a ceiling. Unlike rollPair the two are not
// independent — the pair always comes out ordered, and the gap between the ends varies with
// where the low one fell, which is what gives these a range that is sometimes tight and
// sometimes wide rather than uniformly one or the other.
export function rollAscending(controller, [loMin, loMax], hiMax, step = 0) {
  const snap = (v) => (step ? Math.round(v / step) * step : v);
  const sig = controller.signal;

  controller.randomize = () => {
    const lo = randomInRange(loMin, loMax);
    sig.set([snap(lo), snap(randomInRange(lo, hiMax))]);
  };

  return controller;
}

// For the range sliders whose two ends were never drawn from the same band: a line width that
// rolls a thin end in 0.1–0.4 and a thick one in 0.6–1 is asking for contrast, which a sorted
// pair over 0.1–1 would only sometimes give. A band of zero width pins that end to a constant,
// which is how most of these sketches held opacity's floor at 0.5.
export function rollPair(controller, [aMin, aMax], [bMin, bMax], step = 0) {
  const snap = (v) => (step ? Math.round(v / step) * step : v);
  const sig = controller.signal;

  controller.randomize = () => {
    sig.set([snap(randomInRange(aMin, aMax)), snap(randomInRange(bMin, bMax))]);
  };

  return controller;
}
