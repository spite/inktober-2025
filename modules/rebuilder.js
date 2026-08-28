import { effectRAF } from "./reactive.js";

// The rebuild loop every sketch that draws progressively was hand-rolling: an effect that
// throws away the previous scene and starts a new build, plus an AbortController so the
// build it interrupted stops touching the scene it no longer owns.
//
// It is here because of the one case the hand-rolled version got wrong. `stop()` aborts an
// in-flight build, and `start()` used to call `effect.resume()` — but resume() only re-runs
// when a signal changed while the effect was paused (see ReactiveEffect.resume). Leave a
// sketch while it is still drawing, come back without touching a control, and nothing is
// dirty: the effect stays quiet and the half-built scene is what you get, permanently.
// These sketches yield every ten lines across up to a thousand of them, so that window is
// most of the time you spend looking at one.
//
// So the abandoned build is remembered explicitly rather than inferred from timing. Asking
// "is a build still running?" cannot answer it: stop() aborts, and start() usually arrives
// before the aborted generator has resumed off its setTimeout and returned, so the build
// still looks live at the moment the decision has to be made.
//
//   const rebuild = createRebuilder(clearScene, generateShape);
//   function start() { rebuild.start(); ... }
//   function stop()  { rebuild.stop(); ... }
//
// `build` is handed an AbortSignal and should bail out at its yield points while
// `signal.aborted` — the scene it was drawing into has already been cleared.
export function createRebuilder(clearScene, build) {
  let abortController = new AbortController();
  let complete = false;
  let abandoned = false;
  let runs = 0;

  const effect = effectRAF(() => {
    runs++;
    abortController.abort();
    clearScene();
    abortController = new AbortController();
    complete = false;
    abandoned = false;

    // Called synchronously so the parameters it reads up front land in this effect's
    // dependency set, exactly as they did when the body was written out by hand.
    const { signal } = abortController;
    Promise.resolve(build(signal)).then(
      () => {
        // A build that was superseded still settles; only the current one counts as done.
        if (!signal.aborted) complete = true;
      },
      (error) => {
        console.error(error);
      },
    );
  });

  return {
    start() {
      const before = runs;
      // Handles the ordinary case: a parameter changed while we were away.
      effect.resume();
      // ...and this handles the build that never got to finish. Skipped when resume()
      // already rebuilt, so returning to a sketch never builds it twice.
      if (abandoned && runs === before) effect.run();
    },

    stop() {
      effect.pause();
      // Recorded before the abort, while it is still known whether there was anything to
      // interrupt. A build that had already finished leaves a complete scene behind, and
      // that scene is still there when we come back.
      if (!complete) abandoned = true;
      abortController.abort();
    },
  };
}
