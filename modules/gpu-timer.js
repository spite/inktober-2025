// Adaptive accumulation-pass timer.
//
// Uses EXT_disjoint_timer_query_webgl2 to measure actual GPU time per pass,
// then computes how many passes fit inside a millisecond budget.
// Without the extension (Firefox, Safari), passes are steered by the frame interval.
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

    this._lastFrameStart = null;
    this._lastPassCount = 0;
    this._windowFrames = 0;
    this._windowLate = 0;
  }

  get targetPasses() { return this._targetPasses; }
  get msPerPass()    { return this._msPerPass; }
  get mode()         { return !this._ready ? 'unknown' : this._useCpu ? 'cpu' : 'gpu'; }

  // Forgets what it learned about cost per pass. Call when the thing being drawn changes
  // enough that the old measurement is not a guide to the new one.
  //
  // There is one timer now — the stage owns a single Painted — where there used to be one per
  // sketch, each calibrated to its own drawing. Without this, the budget carried over: leave a
  // cheap sketch, where targetPasses has climbed towards its cap of 64, switch to an expensive
  // one, and the first frames each run 64 passes of a far heavier scene. The EWMA weights a new
  // measurement at 30%, so it takes several such frames to come back down.
  //
  // A pending query is disowned rather than waited for: its result describes the previous
  // drawing. beginFrame still collects and deletes it, and skips the update because the pass
  // count is zero.
  reset() {
    this._msPerPass = null;
    this._targetPasses = this._minPasses;
    this._pendingPassCount = 0;
    this._lastPassCount = 0;
    this._windowFrames = 0;
    this._windowLate = 0;
  }

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
      this._steerByFrameInterval(frameStart);
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

  // Cut passes when a quarter of a window's frames are late, grow when at most one is.
  _steerByFrameInterval(frameStart) {
    const LATE_MS = 20;
    const WINDOW = 15;
    const IGNORE_MS = 250;

    const last = this._lastFrameStart;
    this._lastFrameStart = frameStart;
    if (last === null || this._lastPassCount === 0) return;
    const interval = frameStart - last;
    if (interval > IGNORE_MS) return;

    this._windowFrames++;
    if (interval > LATE_MS) this._windowLate++;
    if (this._windowFrames < WINDOW) return;

    const target = this._targetPasses;
    if (this._windowLate * 4 >= WINDOW) {
      this._targetPasses = Math.max(this._minPasses, Math.floor(target * 0.75));
    } else if (this._windowLate <= 1) {
      this._targetPasses = Math.min(this._maxPasses, target + Math.max(1, Math.floor(target / 4)));
    }
    this._windowFrames = 0;
    this._windowLate = 0;
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
    if (passesRun >= this._targetPasses) return false;
    return !this._useCpu || performance.now() < this._frameDeadline;
  }

  // Call after the pass loop with the actual number of passes completed.
  endPasses(passesRun) {
    this._lastPassCount = passesRun;
    if (!this._currentQuery) return;
    this._gl.endQuery(this._ext.TIME_ELAPSED_EXT);
    this._pendingQuery     = this._currentQuery;
    this._pendingPassCount = passesRun;
    this._currentQuery     = null;
  }
}
