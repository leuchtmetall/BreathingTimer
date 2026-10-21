import type { SessionSignal } from './engine';
import type { PhaseKind } from './presets';

/**
 * Geometry on the square SVG view scale (see design.md). One breathing
 * radius drives every layer; the wide viewBox keeps the thick backdrop
 * unclipped at full lungs. Layers:
 *   backdrop  decorative dark cue, purely aesthetic (thickest)
 *   track     unfilled slot: matches the filled arc in thickness/position
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
/** Phases shorter than this show no seconds (remaining time = the ring). */
const COUNTDOWN_MIN_SECONDS = 10;

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
};

const DARK_VARIANTS: Record<string, string> = {
  'var(--color-in)': 'var(--color-in-dark)',
  'var(--color-out)': 'var(--color-out-dark)',
  'var(--color-hold-full)': 'var(--color-hold-full-dark)',
  'var(--color-idle)': 'var(--color-idle-dark)',
};

/** Bright color of the filled arc for a phase (with its lung state). */
function arcColor(kind: PhaseKind, fill: number): string {
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
  dot: SVGCircleElement;
  phaseLabel: HTMLElement;
  countdown: HTMLElement;
}

/**
 * Maps the engine signal onto the DOM. Pure per-call rendering; the animation
 * loop in main.ts supplies a fresh signal every rendered frame. DOM writes
 * are skipped when a redraw would be identical (cheap idempotency).
 */
export class Renderer {
  private readonly targets: RenderTargets;
  private ringKey = '';

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

  /** Idle display: neutral colors, all layers at base radius, no dot/countdown. */
  renderIdle(): void {
    this.targets.track.style.stroke = 'var(--color-idle-dim)';
    this.targets.ringBackdrop.style.stroke = 'var(--color-idle-dark)';
    this.targets.ring.style.stroke = 'none';
    this.breathe(RING_RADIUS_BASE);
    this.setRing(0, RING_RADIUS_BASE);
    this.targets.dot.setAttribute('visibility', 'hidden');
    this.targets.phaseLabel.textContent = 'Ready';
    this.targets.countdown.textContent = '';
  }

  /** Paused: one frozen frame of the signal. */
  renderPaused(signal: SessionSignal): void {
    this.render(signal);
    this.setLabel(pausedLabel(signal.kind));
  }

  /** Running: continuous frame-driven updates. */
  renderRunning(signal: SessionSignal): void {
    this.render(signal);
    this.setLabel(runningLabel(signal.kind));
  }

  private render(signal: SessionSignal): void {
    const main = arcColor(signal.kind, signal.fill);
    const duration = signal.phaseElapsed + signal.phaseRemaining;
    const progress = duration > 0 ? clamp01(signal.phaseElapsed / duration) : 0;

    // One circle both breathes and fills:
    //   radius <- lung fill (eased, subtle, decelerating at both ends)
    //   arc    <- phase progress (linear: remaining time must stay readable)
    const easedFill = easeInOutQuadratic(clamp01(signal.fill));
    const radius = RING_RADIUS_BASE + easedFill * (RING_RADIUS_FULL - RING_RADIUS_BASE);
    this.breathe(radius);
    this.setRing(progress, radius);
    this.targets.ring.style.stroke = main;
    // The unfilled track fades (via CSS) straight to the dimmed current-phase
    // color on every start/phase change — no intermediate memory stage.
    this.targets.track.style.stroke = dimmed(main);
    this.targets.ringBackdrop.style.stroke = DARK_VARIANTS[main];

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
    this.targets.dot.setAttribute('visibility', 'visible');
    this.targets.dot.style.fill = main;

    // Seconds only for phases long enough (spec: hidden for short in/out
    // and 4-7-8-style holds; remaining time reads from the ring instead).
    const seconds =
      duration >= COUNTDOWN_MIN_SECONDS ? Math.ceil(signal.phaseRemaining) : 0;
    const text = seconds > 0 ? String(seconds) : '';
    if (this.targets.countdown.textContent !== text) {
      this.targets.countdown.textContent = text;
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

  private setLabel(label: string): void {
    if (this.targets.phaseLabel.textContent !== label) {
      this.targets.phaseLabel.textContent = label;
    }
  }
}

function clamp01(x: number): number {
  return Math.min(Math.max(x, 0), 1);
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
