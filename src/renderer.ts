import type { SessionSignal } from './engine';
import { hasRetention, type PhaseKind, type Preset } from './presets';

/**
 * Geometry on the square SVG view scale (see design.md). One breathing
 * radius drives every layer; the wide viewBox keeps the thick backdrop
 * unclipped at full lungs. Layers:
 *   backdrop  decorative dark cue, purely aesthetic (thickest)
 *   track     unfilled slot: matches the filled arc in thickness/position
 *   ticks     one radial mark per count of the current phase
 *   ring      the breathing circle whose arc fills with elapsed phase time
 *   dot       bright marker riding the boundary between filled and unfilled
 */
const VIEW_SIZE = 116;
const CENTER = VIEW_SIZE / 2;
const RING_RADIUS_BASE = 40; // lungs empty
const RING_RADIUS_FULL = 48; // lungs full (8-unit amplitude, >= 2x previous)
const RING_STROKE = 1.25;
const BACKDROP_STROKE = 16;
const DOT_RADIUS = 3.5; // smaller than before, still > ring stroke
const TICK_LENGTH = 0.6; // centred on the ring stroke
const TICK_STROKE = 0.6;
/** Whole-count tolerance, so float tempo lengths land on their tick. */
const TICK_EPSILON = 1e-6;
/** Phases shorter than this show no seconds (remaining time = the ring). */
const COUNTDOWN_MIN_SECONDS = 10;
/** One slow grow-and-shrink of the Breath Retention hold, unrelated to breathing. */
const RETENTION_PULSE_SECONDS = 20;

/**
 * Colors by phase and lung state (spec: red while breathing in, blue while
 * breathing out; holds are gray — light gray with full lungs, a darker gray
 * with empty lungs). A phase contributes three shades: `main` for the filled
 * arc and dot, `dim` for the unfilled track's settled color, `dark` for the
 * decorative backdrop. Right after a start/phase change the track instead
 * shows the dimmed fill color of the previous phase (see FADE_MS).
 */
const DIM_VARIANTS: Record<string, string> = {
  'var(--color-in)': 'var(--color-in-dim)',
  'var(--color-out)': 'var(--color-out-dim)',
  'var(--color-hold-full)': 'var(--color-hold-full-dim)',
  'var(--color-idle)': 'var(--color-idle-dim)',
  'var(--color-breath)': 'var(--color-breath-dim)',
  'var(--color-retention)': 'var(--color-retention-dim)',
};

const DARK_VARIANTS: Record<string, string> = {
  'var(--color-in)': 'var(--color-in-dark)',
  'var(--color-out)': 'var(--color-out-dark)',
  'var(--color-hold-full)': 'var(--color-hold-full-dark)',
  'var(--color-idle)': 'var(--color-idle-dark)',
  'var(--color-breath)': 'var(--color-breath-dark)',
  'var(--color-retention)': 'var(--color-retention-dark)',
};

/** Bright color of the filled arc for a phase (with its lung state). */
export function arcColor({ kind, fill, role }: SessionSignal): string {
  if (role === 'breath') return 'var(--color-breath)';
  if (role === 'retention') return 'var(--color-retention)';
  switch (kind) {
    case 'inhale':
      return 'var(--color-in)';
    case 'hold':
      return fill >= 0.5 ? 'var(--color-hold-full)' : 'var(--color-idle)';
    case 'exhale':
      return 'var(--color-out)';
  }
}

/** Fast ramp-in, faster than cubic (ease-in-out quadratic). */
function easeInOutQuadratic(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export interface RenderTargets {
  ring: SVGCircleElement;
  track: SVGCircleElement;
  ringBackdrop: SVGCircleElement;
  ticks: SVGGElement;
  dot: SVGCircleElement;
  phaseLabel: HTMLElement;
  countdown: HTMLElement;
  sessionStats: HTMLElement;
  /** Below the circle: the stats after the session ends, and finished rounds. */
  summaryStats: HTMLElement;
  rounds: HTMLOListElement;
}

/**
 * Maps the engine signal onto the DOM. Pure per-call rendering; the animation
 * loop in main.ts supplies a fresh signal every rendered frame. DOM writes
 * are skipped when a redraw would be identical (cheap idempotency).
 */
export class Renderer {
  private readonly targets: RenderTargets;
  private ringKey = '';
  /** Stats noun: Breath Retention counts rounds, the other presets cycles. */
  private statsNoun = 'Cycles';
  private ticksKey = '';
  private roundsKey = '';
  /** Last running frame's phase instance and tick index, for the flash. */
  private tickPhase = '';
  private tickIndex = 0;
  private flashParity = false;

  constructor(targets: RenderTargets) {
    this.targets = targets;
    // Authoritative SVG geometry and static presentation (index.html carries
    // markup defaults; values here win).
    this.targets.ring.setAttribute('stroke-width', RING_STROKE.toFixed(2));
    this.targets.track.setAttribute('stroke-width', RING_STROKE.toFixed(2));
    this.targets.ringBackdrop.setAttribute('stroke-width', BACKDROP_STROKE.toFixed(2));
    this.targets.dot.setAttribute('r', DOT_RADIUS.toFixed(2));
    // Hardcoded-arc zero is at 3 o'clock; rotating -90deg puts it at the
    // 12 o'clock start, matching the dot's trigonometric start.
    this.targets.ring.setAttribute('transform', `rotate(-90 ${CENTER} ${CENTER})`);
    this.breathe(RING_RADIUS_BASE);
    this.setRing(0, RING_RADIUS_BASE);
  }

  /** Sets the preset whose stats the display shows (tick marks follow the signal). */
  usePreset(preset: Preset): void {
    this.statsNoun = hasRetention(preset) ? 'Rounds' : 'Cycles';
  }

  /** Finished rounds below the circle (`Round 1 01:32`), rebuilt only when one is added. */
  renderRounds(holds: readonly number[]): void {
    const key = holds.join('/');
    if (this.roundsKey === key) return;
    this.roundsKey = key;
    this.targets.rounds.replaceChildren(
      ...holds.map((seconds, i) => {
        const item = document.createElement('li');
        item.textContent = `Round ${i + 1} ${formatSessionTime(seconds)}`;
        return item;
      }),
    );
  }

  /** Session ended: the last stats move below the circle (the rounds stay). */
  showSummary(): void {
    this.targets.summaryStats.textContent = this.targets.sessionStats.textContent;
  }

  /** New session: nothing below the circle. */
  clearSummary(): void {
    this.targets.summaryStats.textContent = '';
    this.renderRounds([]);
  }

  /** Idle display: neutral colors, all layers at base radius, no dot/countdown. */
  renderIdle(): void {
    this.targets.track.style.stroke = 'var(--color-idle-dim)';
    this.targets.ringBackdrop.style.stroke = 'var(--color-idle-dark)';
    this.targets.ring.style.stroke = 'none';
    this.breathe(RING_RADIUS_BASE);
    this.setRing(0, RING_RADIUS_BASE);
    this.targets.dot.setAttribute('visibility', 'hidden');
    this.setTicks(0, RING_RADIUS_BASE);
    this.tickPhase = '';
    this.setFlash(false);
    this.targets.phaseLabel.textContent = 'Ready';
    this.targets.countdown.textContent = '';
    this.targets.sessionStats.textContent = '';
  }

  /** Paused: one frozen frame of the signal. */
  renderPaused(signal: SessionSignal): void {
    this.render(signal);
    // Never flashes, and keeps the stored tick so resuming does not repeat it.
    this.setFlash(false);
    this.setLabel(pausedLabel(signal.kind));
  }

  /** Running: continuous frame-driven updates. */
  renderRunning(signal: SessionSignal): void {
    this.render(signal);
    this.detectTick(signal);
    this.setLabel(runningLabel(signal.kind));
  }

  private render(signal: SessionSignal): void {
    const main = arcColor(signal);
    const duration = signal.phaseElapsed + signal.phaseRemaining;
    // Breath Retention's breathing part and hold draw the whole ring: no
    // progress, dot, or ticks.
    const full = signal.role !== null;
    const progress = full ? 1 : duration > 0 ? clamp01(signal.phaseElapsed / duration) : 0;

    // One circle both breathes and fills:
    //   radius <- lung fill (eased, subtle, decelerating at both ends), or
    //             the slow hold pulse (already smooth: a cosine)
    //   arc    <- phase progress (linear: remaining time must stay readable)
    const level =
      signal.role === 'retention'
        ? (1 - Math.cos((2 * Math.PI * signal.phaseElapsed) / RETENTION_PULSE_SECONDS)) / 2
        : easeInOutQuadratic(clamp01(signal.fill));
    const radius = RING_RADIUS_BASE + level * (RING_RADIUS_FULL - RING_RADIUS_BASE);
    this.breathe(radius);
    this.setRing(progress, radius);
    this.targets.ring.style.stroke = main;
    // The unfilled track fades (via CSS) straight to the dimmed current-phase
    // color on every start/phase change — no intermediate memory stage.
    this.targets.track.style.stroke = dimmed(main);
    this.targets.ringBackdrop.style.stroke = DARK_VARIANTS[main];
    this.setTicks(signal.tickSeconds === null ? 0 : Math.round(duration / signal.tickSeconds), radius);
    // Ticks take the arc's color instantly, like the arc and dot.
    this.targets.ticks.style.setProperty('--tick-phase', main);

    // Dot rides the filled/unfilled boundary at the current breathing radius.
    const angle = -Math.PI / 2 + progress * 2 * Math.PI;
    this.targets.dot.setAttribute(
      'cx',
      (CENTER + radius * Math.cos(angle)).toFixed(2),
    );
    this.targets.dot.setAttribute(
      'cy',
      (CENTER + radius * Math.sin(angle)).toFixed(2),
    );
    this.targets.dot.setAttribute('visibility', full ? 'hidden' : 'visible');
    this.targets.dot.style.fill = main;

    const text = countdownText(signal, duration);
    if (this.targets.countdown.textContent !== text) {
      this.targets.countdown.textContent = text;
    }

    const stats = `${this.statsNoun}: ${signal.completed} · Time: ${formatSessionTime(signal.sessionElapsedSeconds)}`;
    if (this.targets.sessionStats.textContent !== stats) {
      this.targets.sessionStats.textContent = stats;
    }
  }

  /** Syncs all circle layers onto the shared breathing radius. */
  private breathe(radius: number): void {
    if (this.breatheKey === radius.toFixed(2)) return;
    this.breatheKey = radius.toFixed(2);
    this.targets.ring.setAttribute('r', this.breatheKey);
    this.targets.track.setAttribute('r', this.breatheKey);
    this.targets.ringBackdrop.setAttribute('r', this.breatheKey);
  }

  private breatheKey = '';

  private setRing(progress: number, radius: number): void {
    const circumference = 2 * Math.PI * radius;
    const filled = (progress * circumference).toFixed(2);
    // Idempotent: skip the write when unchanged (e.g. every paused frame).
    const key = `${filled}/${circumference.toFixed(2)}`;
    if (this.ringKey === key) return;
    this.ringKey = key;
    this.targets.ring.setAttribute('r', radius.toFixed(2));
    this.targets.ring.setAttribute(
      'stroke-dasharray',
      `${filled} ${circumference.toFixed(2)}`,
    );
  }

  /** N radial marks from 12 o'clock clockwise, rebuilt only on change. */
  private setTicks(count: number, radius: number): void {
    const key = `${count}/${radius.toFixed(2)}`;
    if (this.ticksKey === key) return;
    const group = this.targets.ticks;
    if (group.childElementCount !== count) {
      group.replaceChildren(
        ...Array.from({ length: count }, () =>
          document.createElementNS('http://www.w3.org/2000/svg', 'line'),
        ),
      );
    }
    this.ticksKey = key;
    const inner = radius - TICK_LENGTH / 2;
    const outer = radius + TICK_LENGTH / 2;
    Array.from(group.children).forEach((line, i) => {
      const angle = -Math.PI / 2 + (i / count) * 2 * Math.PI;
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      line.setAttribute('x1', (CENTER + inner * cos).toFixed(2));
      line.setAttribute('y1', (CENTER + inner * sin).toFixed(2));
      line.setAttribute('x2', (CENTER + outer * cos).toFixed(2));
      line.setAttribute('y2', (CENTER + outer * sin).toFixed(2));
      line.setAttribute('stroke-width', TICK_STROKE.toFixed(2));
    });
  }

  /**
   * Flashes once when a running frame passes a tick inside the phase it last
   * saw; a new phase instance (including the first frame) only records it.
   */
  private detectTick(signal: SessionSignal): void {
    if (signal.tickSeconds === null) return;
    const phase = `${signal.cycles}/${signal.phaseIndex}`;
    const index = Math.floor(signal.phaseElapsed / signal.tickSeconds + TICK_EPSILON);
    if (phase === this.tickPhase && index > this.tickIndex && index >= 1) this.setFlash(true);
    this.tickPhase = phase;
    this.tickIndex = index;
  }

  /**
   * Two classes with identical keyframes under different names: switching
   * between them restarts the CSS animation without forcing a reflow.
   */
  private setFlash(on: boolean): void {
    const ring = this.targets.ring;
    if (!on) {
      ring.classList.remove('flash-a', 'flash-b');
      return;
    }
    this.flashParity = !this.flashParity;
    ring.classList.toggle('flash-a', this.flashParity);
    ring.classList.toggle('flash-b', !this.flashParity);
  }

  private setLabel(label: string): void {
    if (this.targets.phaseLabel.textContent !== label) {
      this.targets.phaseLabel.textContent = label;
    }
  }
}

function clamp01(x: number): number {
  return Math.min(Math.max(x, 0), 1);
}

function formatSessionTime(totalSeconds: number): string {
  const elapsed = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (elapsed % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * In-circle number: the breath (`17/30`) while breathing, the hold time
 * counting up, or the seconds remaining in phases long enough (spec: hidden
 * for short in/out and 4-7-8-style holds; the ring shows remaining time).
 */
function countdownText(signal: SessionSignal, duration: number): string {
  if (signal.role === 'breath') return `${signal.breath}/${signal.breaths}`;
  if (signal.role === 'retention') return formatSessionTime(signal.phaseElapsed);
  const seconds = duration >= COUNTDOWN_MIN_SECONDS ? Math.ceil(signal.phaseRemaining) : 0;
  return seconds > 0 ? String(seconds) : '';
}

/** Dimmed shade of a bright phase color (for the unfilled track). */
function dimmed(brightColor: string): string {
  return DIM_VARIANTS[brightColor];
}

function runningLabel(kind: PhaseKind): string {
  switch (kind) {
    case 'inhale':
      return 'Breathe in';
    case 'hold':
      return 'Hold';
    case 'exhale':
      return 'Breathe out';
  }
}

function pausedLabel(kind: PhaseKind): string {
  const base = runningLabel(kind);
  return base === 'Hold' ? 'Paused · hold' : `Paused · ${base.toLowerCase()}`;
}
