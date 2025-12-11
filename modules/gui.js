import { effect } from "./reactive.js";
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

class GUI {
  constructor(title = "Settings") {
    this.container = document.createElement("div");
    this.container.className = "gui";

    const titleEl = document.createElement("div");
    titleEl.className = "title";
    titleEl.textContent = title;
    this.container.appendChild(titleEl);

    document.body.appendChild(this.container);
  }

  createRow(label) {
    const row = document.createElement("div");
    row.className = "gui-row";
    if (label) {
      const labelEl = document.createElement("span");
      labelEl.className = "gui-label";
      labelEl.textContent = label;
      row.appendChild(labelEl);
    }
    this.container.appendChild(row);
    return row;
  }

  addButton(label, callback) {
    const row = this.createRow();
    const btn = document.createElement("button");
    btn.className = "gui-btn";
    btn.textContent = label;
    btn.onclick = callback;
    row.appendChild(btn);
    return this;
  }

  addText(label, initialValue, onChange) {
    const row = this.createRow(label);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "gui-input-text";
    input.value = initialValue;
    input.oninput = (e) => onChange(e.target.value);
    row.appendChild(input);
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
      select.appendChild(el);
    });

    select.onchange = (e) => onChange(e.target.value);
    row.appendChild(select);
    return this;
  }

  addCheckbox(label, initialValue, onChange) {
    const row = this.createRow(label);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = initialValue;
    input.onchange = (e) => onChange(e.target.checked);
    row.appendChild(input);
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

    wrapper.appendChild(input);
    wrapper.appendChild(valDisplay);
    row.appendChild(wrapper);
    return this;
  }

  composeRangeValue(min, max) {
    return `${parseFloat(min)},${parseFloat(max)}`;
  }

  addRangeSlider(
    label,
    signalMin,
    signalMax,
    min,
    max,
    step,
    onChange = () => {}
  ) {
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
    valDisplay.textContent = signalMin();

    input.oninput = (e) => {
      const v = e.target.value;
      signalMin.set(parseFloat(v[0]));
      signalMax.set(parseFloat(v[1]));
      const display = this.composeRangeValue(signalMin(), signalMax());
      valDisplay.textContent = display;
      onChange(v);
    };

    effect(() => {
      const v = this.composeRangeValue(signalMin(), signalMax());
      input.value = [signalMin(), signalMax()];
      valDisplay.textContent = formatFloat(v, step);
    });

    wrapper.appendChild(input);
    wrapper.appendChild(valDisplay);
    row.appendChild(wrapper);
    return this;
  }

  addLabel(label) {
    const row = this.createRow(label);
    return this;
  }
}

export default GUI;
