import './style.css';
import { DEBUG } from './debug';
import { DebugMenu } from './debug-menu';
import { BreathingEngine } from './engine';
import { FaviconController } from './favicon';
import { breathCountChoices, defaultBreathCount, presetChoices, type PresetChoice, type TempoChoice } from './presets';
import { arcColor, Renderer, type RenderTargets } from './renderer';
import { SoundScheduler } from './sound';
import { NIGHT_QUERY, ThemeController } from './theme';
import { formatSettings, parseSettings } from './url-settings';

function requireTarget<T extends Element>(selector: string): T {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing render target: ${selector}`);
  return el as T;
}

const app = requireTarget<HTMLElement>('#app');
// The starting settings; each one the URL leaves out or gets wrong keeps its default.
const urlSettings = parseSettings(location.search);
const presetSelector = requireTarget<HTMLSelectElement>('#preset-select');
for (const choice of presetChoices) {
  const option = document.createElement('option');
  option.value = choice.id;
  option.textContent = choice.label;
  presetSelector.append(option);
}
const defaultPreset = presetChoices[0]!;
const startPreset = presetChoices.find(({ id }) => id === urlSettings.presetId) ?? defaultPreset;
presetSelector.value = startPreset.id;

const tempoSelector = requireTarget<HTMLSelectElement>('#tempo-select');

const breathsSelector = requireTarget<HTMLSelectElement>('#breaths-select');
for (const breaths of breathCountChoices) {
  const option = document.createElement('option');
  option.value = String(breaths);
  option.textContent = String(breaths);
  breathsSelector.append(option);
}
const startBreaths = urlSettings.breaths ?? defaultBreathCount;
breathsSelector.value = String(startBreaths);

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
let selectedPreset = startPreset;
/** Each pattern's last tempo choice while the page is open. */
const selectedTempoIds = new Map<string, string>();
if (urlSettings.tempoId) selectedTempoIds.set(startPreset.id, urlSettings.tempoId);
let selectedTempo = showTempos(startPreset);
let selectedBreaths = startBreaths;
// Debug only: jumps start a fresh session at a point of the selected pattern.
const debugMenu = DEBUG
  ? new DebugMenu(requireTarget<HTMLElement>('.display'), {
      jump({ sessionMs, holdsMs }) {
        if (sound.isEnabled) sound.unlock();
        renderer.clearSummary();
        engine.startAt(sessionMs, holdsMs);
        // From the landing point itself, so its phase tone still plays.
        sound.restartAt(engine, sessionMs);
        sync();
      },
      preview: ({ type, kind }) => sound.preview(type, kind),
    })
  : null;
let engine = createEngine();

/** Fills the tempo control with the pattern's choices and selects its remembered one. */
function showTempos(choice: PresetChoice): TempoChoice {
  const id = selectedTempoIds.get(choice.id) ?? choice.defaultTempoId;
  const tempo = choice.tempos.find((t) => t.id === id)!;
  tempoSelector.replaceChildren(
    ...choice.tempos.map(({ id, label }) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = label;
      return option;
    }),
  );
  tempoSelector.value = tempo.id;
  return tempo;
}

/** The engine only ever receives a tempo-resolved preset (real seconds). */
function createEngine(): BreathingEngine {
  const preset = selectedTempo.build(selectedBreaths);
  renderer.usePreset(preset);
  debugMenu?.rebuild(preset);
  // Breath Retention-only controls show by CSS.
  app.dataset.preset = selectedPreset.id;
  return new BreathingEngine(preset);
}

/** Selecting from the list and stepping with the buttons both land here. */
function selectPreset(id: string): void {
  const choice = presetChoices.find((c) => c.id === id);
  if (engine.state !== 'idle' || !choice) {
    presetSelector.value = selectedPreset.id;
    return;
  }
  selectedPreset = choice;
  presetSelector.value = choice.id;
  selectedTempo = showTempos(choice);
  engine = createEngine();
  sync();
  writeUrl();
}

/** Over http(s) the query follows the settings, so the address bar is always a bookmark. */
function writeUrl(): void {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  const search = formatSettings(
    {
      presetId: selectedPreset.id,
      tempoId: selectedTempo.id,
      breaths: selectedBreaths,
      sound: sound.isEnabled,
      theme: theme.override,
    },
    location.search,
  );
  if (search === location.search) return;
  // Replaced, not pushed: Back leaves the app rather than stepping through settings.
  try {
    history.replaceState(history.state, '', search + location.hash);
  } catch {
    // A sandboxed page may refuse; the settings still apply to the open page.
  }
}

/** index.html ships a static idle icon; create one where the head is absent (tests). */
function faviconLink(): HTMLLinkElement {
  const existing = document.querySelector<HTMLLinkElement>('link#favicon');
  if (existing) return existing;
  const link = document.createElement('link');
  link.id = 'favicon';
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  document.head.append(link);
  return link;
}

function button(id: string): HTMLButtonElement {
  return requireTarget<HTMLButtonElement>(`#${id}`);
}

presetSelector.addEventListener('change', () => selectPreset(presetSelector.value));

/** Selects the pattern `offset` places away in the list, wrapping around. */
function stepPreset(offset: number): void {
  const n = presetChoices.length;
  const index = presetChoices.indexOf(selectedPreset);
  selectPreset(presetChoices[(index + offset + n) % n]!.id);
}

const presetPrev = button('preset-prev');
const presetNext = button('preset-next');
presetPrev.addEventListener('click', () => stepPreset(-1));
presetNext.addEventListener('click', () => stepPreset(1));

// Left/Right Arrow work exactly when the stepping buttons do. Modified keys
// stay with the browser, and form fields keep their own arrow keys.
document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.matches('input, select, textarea') || target.isContentEditable)) return;
  const step = event.key === 'ArrowLeft' ? presetPrev : event.key === 'ArrowRight' ? presetNext : null;
  if (!step || step.disabled) return;
  event.preventDefault();
  stepPreset(step === presetPrev ? -1 : 1);
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
  writeUrl();
});

tempoSelector.addEventListener('change', () => {
  const choice = selectedPreset.tempos.find(({ id }) => id === tempoSelector.value);
  if (engine.state !== 'idle' || !choice) {
    tempoSelector.value = selectedTempo.id;
    return;
  }
  selectedTempo = choice;
  selectedTempoIds.set(selectedPreset.id, choice.id);
  engine = createEngine();
  sync();
  writeUrl();
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
const matchMedia = typeof window.matchMedia === 'function' ? (query: string) => window.matchMedia(query) : undefined;
const themeToggle = button('theme-toggle');
const theme = new ThemeController(document.documentElement, themeToggle, matchMedia, urlSettings.theme ?? null);

// The tab icon follows the arc color; the palette itself changes with the theme.
const favicon = new FaviconController(document.documentElement, faviconLink());
// Runs after the controller's own click listener, so the override is current.
themeToggle.addEventListener('click', () => {
  favicon.refresh();
  writeUrl();
});
matchMedia?.(NIGHT_QUERY).addEventListener?.('change', () => favicon.refresh());

// On at load unless the URL turns it off, and never stored, so a reload turns
// it on again. Audio itself starts on the first Start click (a user action).
// Never touches the engine: available in every session state.
const soundToggle = button('sound-toggle');
const soundOn = urlSettings.sound ?? true;
sound.setEnabled(soundOn);
soundToggle.setAttribute('aria-pressed', String(soundOn));
soundToggle.addEventListener('click', () => {
  const on = !sound.isEnabled;
  if (on) sound.unlock();
  sound.setEnabled(on);
  soundToggle.setAttribute('aria-pressed', String(on));
  sound.sync(engine);
  writeUrl();
});

// Hidden tabs get no frames and throttled timers; the queued horizon covers
// the gap, and this keeps it topped up whenever a timer does fire.
setInterval(() => sound.sync(engine), 5_000);
// Hidden tabs get no frames either, and that is when the tab icon matters:
// keep its color in step on a timer (throttled, but at least ~1/s at first).
setInterval(update, 500);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sound.recover();
});

/** Control visibility + a first frame render on every state transition. */
function sync(): void {
  app.dataset.sessionState = engine.state;
  presetSelector.disabled = engine.state !== 'idle';
  presetPrev.disabled = engine.state !== 'idle';
  presetNext.disabled = engine.state !== 'idle';
  tempoSelector.disabled = engine.state !== 'idle';
  breathsSelector.disabled = engine.state !== 'idle';
  // Start/resume queue sounds; pause/reset cancel them.
  sound.sync(engine);
  update();
}

function update(): void {
  if (engine.state === 'idle') {
    renderer.renderIdle();
    favicon.show('var(--color-idle)');
    setRole('');
    setResetLabel('Reset');
    return;
  }
  const signal = engine.signal();
  if (!signal) return;
  if (engine.state === 'paused') renderer.renderPaused(signal);
  else renderer.renderRunning(signal);
  favicon.show(arcColor(signal));
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
