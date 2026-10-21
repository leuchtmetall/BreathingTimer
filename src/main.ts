import './style.css';
import { BreathingEngine } from './engine';
import { applyTempo, defaultTempo, presetChoices, tempoChoices } from './presets';
import { Renderer, type RenderTargets } from './renderer';
import { SoundScheduler } from './sound';
import { ThemeController } from './theme';

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

const tempoSelector = requireTarget<HTMLSelectElement>('#tempo-select');
for (const tempo of tempoChoices) {
  const option = document.createElement('option');
  option.value = tempo.id;
  option.textContent = tempo.label;
  tempoSelector.append(option);
}
tempoSelector.value = defaultTempo.id;

const targets: RenderTargets = {
  ring: requireTarget<SVGCircleElement>('#ring'),
  track: requireTarget<SVGCircleElement>('.ring-track'),
  ringBackdrop: requireTarget<SVGCircleElement>('#ring-backdrop'),
  ticks: requireTarget<SVGGElement>('#ticks'),
  dot: requireTarget<SVGCircleElement>('#dot'),
  phaseLabel: requireTarget<HTMLElement>('#phase-label'),
  countdown: requireTarget<HTMLElement>('#countdown'),
  sessionStats: requireTarget<HTMLElement>('#session-stats'),
};

const renderer = new Renderer(targets);
const sound = new SoundScheduler();
let selectedPreset = defaultPreset;
let selectedTempo = defaultTempo;
let engine = createEngine();

/** The engine only ever receives a tempo-resolved preset (real seconds). */
function createEngine(): BreathingEngine {
  const preset = applyTempo(selectedPreset.preset, selectedTempo);
  renderer.usePreset(preset);
  return new BreathingEngine(preset);
}

function button(id: string): HTMLButtonElement {
  return requireTarget<HTMLButtonElement>(`#${id}`);
}

presetSelector.addEventListener('change', () => {
  const choice = presetChoices.find(({ id }) => id === presetSelector.value);
  if (engine.state !== 'idle' || !choice) {
    presetSelector.value = selectedPreset.id;
    return;
  }
  selectedPreset = choice;
  engine = createEngine();
  sync();
});

tempoSelector.addEventListener('change', () => {
  const choice = tempoChoices.find(({ id }) => id === tempoSelector.value);
  if (engine.state !== 'idle' || !choice) {
    tempoSelector.value = selectedTempo.id;
    return;
  }
  selectedTempo = choice;
  engine = createEngine();
  sync();
});

button('start').addEventListener('click', () => {
  // Inside the click: browsers only let audio start from a user action.
  if (sound.isEnabled) sound.unlock();
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

// Available in every session state; never touches the engine.
new ThemeController(
  document.documentElement,
  button('theme-toggle'),
  typeof window.matchMedia === 'function' ? (query) => window.matchMedia(query) : undefined,
);

// On at load and never stored, so a reload turns it on again. Audio itself
// starts on the first Start click (a user action). Never touches the engine:
// available in every session state.
const soundToggle = button('sound-toggle');
sound.setEnabled(true);
soundToggle.setAttribute('aria-pressed', 'true');
soundToggle.addEventListener('click', () => {
  const on = !sound.isEnabled;
  if (on) sound.unlock();
  sound.setEnabled(on);
  soundToggle.setAttribute('aria-pressed', String(on));
  sound.sync(engine);
});

// Hidden tabs get no frames and throttled timers; the queued horizon covers
// the gap, and this keeps it topped up whenever a timer does fire.
setInterval(() => sound.sync(engine), 5_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sound.recover();
});

/** Control visibility + a first frame render on every state transition. */
function sync(): void {
  app.dataset.sessionState = engine.state;
  presetSelector.disabled = engine.state !== 'idle';
  tempoSelector.disabled = engine.state !== 'idle';
  // Start/resume queue sounds; pause/reset cancel them.
  sound.sync(engine);
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
  sound.sync(engine);
  requestAnimationFrame(frame);
}

sync();
requestAnimationFrame(frame);
