// Adaptive accumulation-pass timer.
//
// Uses EXT_disjoint_timer_query_webgl2 to measure actual GPU time per pass,
// then computes how many passes fit inside a millisecond budget. Falls back to
// a CPU wall-clock deadline when the extension is unavailable (Safari, some mobile).
//
// Usage each render frame:
//   timer.beginFrame(renderer, rafTimestamp);   // check last frame's query, update target
//   timer.beginPasses();                        // start recording
//   let n = 0;
//   while (timer.shouldContinue(n) && frames <= maxFrames) {
//     // ... one accumulation pass ...
//     n++;
//   }
//   timer.endPasses(n);                         // hand query to GPU, store for next frame

export class AdaptivePassTimer {
  constructor({ budgetMs = 10, minPasses = 1, maxPasses = 64 } = {}) {
    this._budgetMs = budgetMs;
    this._minPasses = minPasses;
    this._maxPasses = maxPasses;

    this._gl = null;
    this._ext = null;
    this._ready = false;
    this._useCpu = false;

    this._pendingQuery = null;
    this._pendingPassCount = 0;
    this._currentQuery = null;

    this._msPerPass = null;
    this._targetPasses = minPasses;
    this._frameDeadline = 0;
  }

  get targetPasses() { return this._targetPasses; }
  get msPerPass()    { return this._msPerPass; }
  get mode()         { return !this._ready ? 'unknown' : this._useCpu ? 'cpu' : 'gpu'; }

  // Call once at the top of each render frame, before beginPasses().
  // frameStart should be the RAF timestamp — pass it through from draw(t).
  beginFrame(renderer, frameStart = performance.now()) {
    if (!this._ready) {
      this._gl  = renderer.getContext();
      this._ext = this._gl.getExtension('EXT_disjoint_timer_query_webgl2');
      this._useCpu = !this._ext;
      this._ready = true;
    }

    if (this._useCpu) {
      this._frameDeadline = frameStart + this._budgetMs;
      return;
    }

    if (!this._pendingQuery) return;

    const gl = this._gl;
    if (!gl.getQueryParameter(this._pendingQuery, gl.QUERY_RESULT_AVAILABLE)) return;

    // Discard results if the GPU had a context switch (power state change, etc.).
    if (!gl.getParameter(this._ext.GPU_DISJOINT_EXT) && this._pendingPassCount > 0) {
      const gpuNs = gl.getQueryParameter(this._pendingQuery, gl.QUERY_RESULT);
      if (gpuNs > 0) {
        const measured = gpuNs / 1e6 / this._pendingPassCount;
        // EWMA: weight new measurement at 30% to avoid thrashing on transient spikes.
        this._msPerPass = this._msPerPass === null
          ? measured
          : this._msPerPass * 0.7 + measured * 0.3;
        this._targetPasses = Math.max(
          this._minPasses,
          Math.min(this._maxPasses, Math.floor(this._budgetMs / this._msPerPass)),
        );
      }
    }

    gl.deleteQuery(this._pendingQuery);
    this._pendingQuery = null;
  }

  // Call just before the pass loop. Skipped silently if previous query hasn't resolved.
  beginPasses() {
    if (this._useCpu || !this._ext || this._pendingQuery) return;
    this._currentQuery = this._gl.createQuery();
    this._gl.beginQuery(this._ext.TIME_ELAPSED_EXT, this._currentQuery);
  }

  // Loop condition — returns true if another pass should run.
  shouldContinue(passesRun) {
    if (passesRun < this._minPasses) return true;
    if (this._useCpu) return performance.now() < this._frameDeadline;
    return passesRun < this._targetPasses;
  }

  // Call after the pass loop with the actual number of passes completed.
  endPasses(passesRun) {
    if (!this._currentQuery) return;
    this._gl.endQuery(this._ext.TIME_ELAPSED_EXT);
    this._pendingQuery     = this._currentQuery;
    this._pendingPassCount = passesRun;
    this._currentQuery     = null;
  }
}
