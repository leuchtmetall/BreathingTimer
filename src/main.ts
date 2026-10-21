import './style.css';
import { BreathingEngine } from './engine';
import { presetChoices } from './presets';
import { Renderer, type RenderTargets } from './renderer';

function requireTarget<T extends Element>(selector: string): T {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing render target: ${selector}`);
  return el as T;
}

const app = requireTarget<HTMLElement>('#app');
const presetSelector = requireTarget<HTMLSelectElement>('#preset-select');
for (const choice of presetChoices) {
  const option = document.createElement('option');
  option.value = choice.id;
  option.textContent = choice.label;
  presetSelector.append(option);
}
const defaultPreset = presetChoices[0]!;
presetSelector.value = defaultPreset.id;

const targets: RenderTargets = {
  ring: requireTarget<SVGCircleElement>('#ring'),
  track: requireTarget<SVGCircleElement>('.ring-track'),
  ringBackdrop: requireTarget<SVGCircleElement>('#ring-backdrop'),
  dot: requireTarget<SVGCircleElement>('#dot'),
  phaseLabel: requireTarget<HTMLElement>('#phase-label'),
  countdown: requireTarget<HTMLElement>('#countdown'),
  sessionStats: requireTarget<HTMLElement>('#session-stats'),
};

const renderer = new Renderer(targets);
let selectedPreset = defaultPreset;
let engine = new BreathingEngine(selectedPreset.preset);

function button(id: string): HTMLButtonElement {
  return requireTarget<HTMLButtonElement>(`#${id}`);
}

presetSelector.addEventListener('change', () => {
  if (engine.state !== 'idle') {
    presetSelector.value = selectedPreset.id;
    return;
  }
  const choice = presetChoices.find(({ id }) => id === presetSelector.value);
  if (!choice) {
    presetSelector.value = selectedPreset.id;
    return;
  }
  selectedPreset = choice;
  engine = new BreathingEngine(selectedPreset.preset);
  sync();
});

button('start').addEventListener('click', () => {
  engine.start();
  sync();
});
button('pause').addEventListener('click', () => {
  engine.pause();
  sync();
});
button('resume').addEventListener('click', () => {
  engine.resume();
  sync();
});
button('reset').addEventListener('click', () => {
  engine.reset();
  sync();
});

/** Control visibility + a first frame render on every state transition. */
function sync(): void {
  app.dataset.sessionState = engine.state;
  presetSelector.disabled = engine.state !== 'idle';
  update();
}

function update(): void {
  if (engine.state === 'idle') {
    renderer.renderIdle();
    return;
  }
  const signal = engine.signal();
  if (!signal) return;
  if (engine.state === 'paused') renderer.renderPaused(signal);
  else renderer.renderRunning(signal);
}

// One frame loop for the whole app: the engine derives every state change
// from the wall clock, so seeing or not seeing frames cannot desynchronize
// the session.
function frame(): void {
  update();
  requestAnimationFrame(frame);
}

sync();
requestAnimationFrame(frame);
