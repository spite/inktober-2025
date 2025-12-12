import { signal, effect } from "./reactive.js";
import "./range-slider.js";

function precision(a) {
  if (!isFinite(a)) return 0;
  var e = 1,
    p = 0;
  while (Math.round(a * e) / e !== a) {
    e *= 10;
    p++;
  }
  return p;
}

function formatFloat(v, step) {
  return parseFloat(v).toFixed(precision(step));
}

function composeRangeValue(min, max, step) {
  return `${formatFloat(min, step)}-${formatFloat(max, step)}`;
}

class GUI {
  constructor(title = "Settings", el = document.body) {
    this.container = document.createElement("div");
    this.container.className = "gui";

    const titleEl = document.createElement("div");
    titleEl.className = "title";
    titleEl.textContent = title;
    this.container.append(titleEl);

    const expandEl = document.createElement("span");
    expandEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down-icon lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>`;
    titleEl.append(expandEl);

    this.rows = document.createElement("div");
    this.rows.className = "gui-rows";

    this.container.append(this.rows);
    this.rowsExpanded = signal(true);

    titleEl.addEventListener("click", (e) => {
      this.rowsExpanded.set(!this.rowsExpanded());
    });

    effect(() => {
      this.rows.classList.toggle("visible", this.rowsExpanded());
    });

    el.append(this.container);
  }

  show() {
    this.container.classList.add("visible");
  }

  hide() {
    this.container.classList.remove("visible");
  }

  createRow(label) {
    const row = document.createElement("div");
    row.className = "gui-row";
    if (label) {
      const labelEl = document.createElement("span");
      labelEl.className = "gui-label";
      labelEl.textContent = label;
      row.append(labelEl);
    }
    this.rows.append(row);
    return row;
  }

  addButton(label, callback) {
    const row = this.createRow();
    const btn = document.createElement("button");
    btn.className = "gui-btn";
    btn.textContent = label;
    btn.onclick = callback;
    row.append(btn);
    return this;
  }

  addText(label, initialValue, onChange) {
    const row = this.createRow(label);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "gui-input-text";
    input.value = initialValue;
    input.oninput = (e) => onChange(e.target.value);
    row.append(input);
    return this;
  }

  addSelect(label, options, initialValue, onChange) {
    const row = this.createRow(label);
    const select = document.createElement("select");
    select.className = "gui-select";

    options.forEach((opt) => {
      const el = document.createElement("option");
      el.value = opt;
      el.textContent = opt;
      if (opt === initialValue) el.selected = true;
      select.append(el);
    });

    select.onchange = (e) => onChange(e.target.value);
    row.append(select);
    return this;
  }

  addCheckbox(label, initialValue, onChange) {
    const row = this.createRow(label);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = initialValue;
    input.onchange = (e) => onChange(e.target.checked);
    row.append(input);
    return this;
  }

  addSlider(label, signal, min, max, step, onChange = () => {}) {
    const row = this.createRow(label);

    const wrapper = document.createElement("div");
    wrapper.className = "gui-slider-container";

    const input = document.createElement("range-slider");
    input.type = "range";
    input.className = "gui-slider";
    input.min = min;
    input.max = max;
    input.step = step;

    const valDisplay = document.createElement("span");
    valDisplay.className = "gui-slider-val";
    valDisplay.textContent = signal();

    input.oninput = (e) => {
      const v = parseFloat(e.target.value);
      valDisplay.textContent = formatFloat(v, step);
      signal.set(v);
      onChange(v);
    };

    effect(() => {
      input.value = signal();
      valDisplay.textContent = formatFloat(signal(), step);
    });

    wrapper.append(input);
    wrapper.append(valDisplay);
    row.append(wrapper);
    return this;
  }

  addRangeSlider(label, signal, min, max, step, onChange = () => {}) {
    const row = this.createRow(label);

    const wrapper = document.createElement("div");
    wrapper.className = "gui-slider-container";

    const input = document.createElement("range-slider");
    input.setAttribute("dual", true);
    input.type = "range";
    input.className = "gui-slider";
    input.min = min;
    input.max = max;
    input.step = step;

    const valDisplay = document.createElement("span");
    valDisplay.className = "gui-slider-val";
    const display = composeRangeValue(signal()[0], signal()[1], step);
    valDisplay.textContent = display;

    input.oninput = (e) => {
      const v = e.target.value;
      signal.set([parseFloat(v[0]), parseFloat(v[1])]);
      const display = composeRangeValue(signal()[0], signal()[1], step);
      valDisplay.textContent = display;
      onChange(v);
    };

    effect(() => {
      input.value = [signal()[0], signal()[1]];
      const display = composeRangeValue(signal()[0], signal()[1], step);
      valDisplay.textContent = display;
    });

    wrapper.append(input);
    wrapper.append(valDisplay);
    row.append(wrapper);
    return this;
  }

  addLabel(label) {
    const row = this.createRow(label);
    return this;
  }
}

export default GUI;
