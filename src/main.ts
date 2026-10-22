import './style.css';
import { DEBUG } from './debug';
import { BreathingEngine } from './engine';
import {
  applyTempo,
  BREATH_RETENTION_ID,
  breathCountChoices,
  breathRetentionPreset,
  defaultBreathCount,
  defaultTempo,
  presetChoices,
  tempoChoices,
  tempoLabel,
} from './presets';
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

const breathsSelector = requireTarget<HTMLSelectElement>('#breaths-select');
for (const breaths of breathCountChoices) {
  const option = document.createElement('option');
  option.value = String(breaths);
  option.textContent = String(breaths);
  breathsSelector.append(option);
}
breathsSelector.value = String(defaultBreathCount);

const targets: RenderTargets = {
  ring: requireTarget<SVGCircleElement>('#ring'),
  track: requireTarget<SVGCircleElement>('.ring-track'),
  ringBackdrop: requireTarget<SVGCircleElement>('#ring-backdrop'),
  ticks: requireTarget<SVGGElement>('#ticks'),
  dot: requireTarget<SVGCircleElement>('#dot'),
  phaseLabel: requireTarget<HTMLElement>('#phase-label'),
  countdown: requireTarget<HTMLElement>('#countdown'),
  sessionStats: requireTarget<HTMLElement>('#session-stats'),
  summaryStats: requireTarget<HTMLElement>('#summary-stats'),
  rounds: requireTarget<HTMLOListElement>('#rounds'),
};

const renderer = new Renderer(targets);
const sound = new SoundScheduler();
let selectedPreset = defaultPreset;
let selectedTempo = defaultTempo;
let selectedBreaths = defaultBreathCount;
let engine = createEngine();

/** The engine only ever receives a tempo-resolved preset (real seconds). */
function createEngine(): BreathingEngine {
  const base =
    selectedPreset.id === BREATH_RETENTION_ID ? breathRetentionPreset(selectedBreaths) : selectedPreset.preset;
  const preset = applyTempo(base, selectedTempo);
  renderer.usePreset(preset);
  // Breath Retention-only controls show by CSS; tempo labels follow the preset.
  app.dataset.preset = selectedPreset.id;
  Array.from(tempoSelector.options).forEach((option, i) => {
    option.textContent = tempoLabel(tempoChoices[i]!, preset);
  });
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

breathsSelector.addEventListener('change', () => {
  const breaths = Number(breathsSelector.value);
  if (engine.state !== 'idle' || !breathCountChoices.includes(breaths)) {
    breathsSelector.value = String(selectedBreaths);
    return;
  }
  selectedBreaths = breaths;
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

const resetButton = button('reset');

button('start').addEventListener('click', () => {
  // Inside the click: browsers only let audio start from a user action.
  if (sound.isEnabled) sound.unlock();
  renderer.clearSummary();
  engine.start();
  sync();
});
// Pause and resume exist only in debug mode; otherwise they leave the page,
// so neither the keyboard nor a script can reach them.
if (DEBUG) {
  app.dataset.debug = '';
  button('pause').addEventListener('click', () => {
    engine.pause();
    sync();
  });
  button('resume').addEventListener('click', () => {
    engine.resume();
    sync();
  });
} else {
  button('pause').remove();
  button('resume').remove();
}
// Reset and Done: the last stats move below the circle, the rounds stay.
resetButton.addEventListener('click', () => {
  update();
  renderer.showSummary();
  engine.reset();
  sync();
});
// Ends the hold; queued hold sounds go, and the recovery tone plays at once.
button('breathe-in').addEventListener('click', () => {
  const holdEndMs = engine.endRetention();
  if (holdEndMs === null) return;
  sound.restartAt(engine, holdEndMs);
  update();
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
  breathsSelector.disabled = engine.state !== 'idle';
  // Start/resume queue sounds; pause/reset cancel them.
  sound.sync(engine);
  update();
}

function update(): void {
  if (engine.state === 'idle') {
    renderer.renderIdle();
    setRole('');
    setResetLabel('Reset');
    return;
  }
  const signal = engine.signal();
  if (!signal) return;
  if (engine.state === 'paused') renderer.renderPaused(signal);
  else renderer.renderRunning(signal);
  renderer.renderRounds(engine.holds);
  // The Breathe in button shows by CSS while running in the hold.
  setRole(signal.role ?? '');
  setResetLabel(signal.completed > 0 ? 'Done' : 'Reset');
}

function setRole(role: string): void {
  if (app.dataset.role !== role) app.dataset.role = role;
}

function setResetLabel(label: string): void {
  if (resetButton.textContent !== label) resetButton.textContent = label;
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
