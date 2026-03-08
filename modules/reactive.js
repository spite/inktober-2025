let activeEffect = null;

class ReactiveEffect {
  constructor(fn, scheduler) {
    this.fn = fn;
    this.scheduler = scheduler;
    this.deps = new Set();
  }

  run() {
    this.cleanup();
    activeEffect = this;
    try {
      this.fn();
    } finally {
      activeEffect = null;
    }
  }

  cleanup() {
    this.deps.forEach((depSet) => {
      depSet.delete(this);
    });
    this.deps.clear();
  }
}

function track(subscribers) {
  if (activeEffect) {
    subscribers.add(activeEffect);
    activeEffect.deps.add(subscribers);
  }
}

function trigger(subscribers) {
  const effectsToRun = new Set(subscribers);
  effectsToRun.forEach((effect) => {
    if (effect.scheduler) {
      effect.scheduler(effect);
    } else {
      effect.run();
    }
  });
}

export function signal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();

  const sig = () => {
    track(subscribers);
    return value;
  };

  sig.set = (newValue) => {
    if (Object.is(value, newValue)) return;
    value = newValue;
    trigger(subscribers);
  };

  sig.update = (updater) => {
    sig.set(updater(value));
  };

  return sig;
}

export function effect(fn) {
  const effect = new ReactiveEffect(fn);
  effect.run();
}

export function effectRAF(fn) {
  let queued = false;
  let paused = false;
  let dirty = false;
  let rafId = null;

  const effect = new ReactiveEffect(fn, scheduler);

  function scheduler(job) {
    if (paused) {
      dirty = true;
      return;
    }
    if (queued) return;
    queued = true;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      queued = false;
      if (!paused) {
        dirty = false;
        job.run();
      } else {
        dirty = true;
      }
    });
  }

  effect.run();

  return {
    pause() {
      paused = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
        queued = false;
        dirty = true;
      }
    },
    resume() {
      paused = false;
      if (dirty && !queued) {
        dirty = false;
        queued = true;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          queued = false;
          effect.run();
        });
      }
    },
  };
}

export function computed(fn) {
  let value;
  const subscribers = new Set();

  const computationEffect = new ReactiveEffect(() => {
    const newValue = fn();
    if (Object.is(value, newValue)) return;
    value = newValue;
    trigger(subscribers);
  });

  computationEffect.run();

  const computedSignal = () => {
    track(subscribers);
    return value;
  };

  return computedSignal;
}
