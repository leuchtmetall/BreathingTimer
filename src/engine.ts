import type { Phase, PhaseKind, Preset } from './presets';

export type EngineState = 'idle' | 'running' | 'paused';

/** Injectable wall-clock source; defaults to performance.now for real use. */
export interface Clock {
  now(): number;
}

export const wallClock: Clock = {
  now: () => performance.now(),
};

/** The continuously updated session signal the renderer consumes. */
export interface SessionSignal {
  readonly phaseIndex: number;
  readonly kind: PhaseKind;
  readonly phaseElapsed: number;
  readonly phaseRemaining: number;
  /** Lung-fill level, 0 (empty) .. 1 (full), linear within the phase. */
  readonly fill: number;
  /** Number of complete cycles finished before the current phase. */
  readonly cycles: number;
  /** Active session time in seconds; excludes time spent paused. */
  readonly sessionElapsedSeconds: number;
}

/**
 * A timed sound cue in session time: `phase` at every phase start, `tick` at
 * every whole count inside a phase (only for presets with ticks).
 */
export interface Cue {
  readonly atMs: number;
  readonly type: 'phase' | 'tick';
  readonly kind: PhaseKind;
}

/**
 * Breathing session control state machine.
 *
 * The engine owns no timers: a single external animation loop calls
 * `signal()` per frame and all phase transitions are derived from the wall
 * clock, so pause/resume and background-tab throttling cannot desynchronize
 * session time (see design.md). Idle has no signal; paused freezes it.
 */
export class BreathingEngine {
  readonly preset: Preset;

  private clock: Clock;
  private _state: EngineState = 'idle';
  /** Session time (ms) accumulated before the current running period. */
  private baseMs = 0;
  /** Wall-clock time (ms) at which the current running period began. */
  private anchorMs = 0;

  constructor(preset: Preset, clock: Clock = wallClock) {
    this.preset = preset;
    this.clock = clock;
  }

  get state(): EngineState {
    return this._state;
  }

  /** Total duration of one full preset cycle in ms. */
  get cycleMs(): number {
    return this.preset.phases.reduce((sum, p) => sum + p.seconds * 1000, 0);
  }

  start(): void {
    if (this._state !== 'idle') return;
    this.baseMs = 0;
    this.anchorMs = this.clock.now();
    this._state = 'running';
  }

  pause(): void {
    if (this._state !== 'running') return;
    this.baseMs += this.clock.now() - this.anchorMs;
    this._state = 'paused';
  }

  resume(): void {
    if (this._state !== 'paused') return;
    this.anchorMs = this.clock.now();
    this._state = 'running';
  }

  reset(): void {
    this._state = 'idle';
    this.baseMs = 0;
  }

  /** Elapsed session time in ms; frozen while paused or idle. */
  sessionElapsedMs(): number {
    if (this._state !== 'running') return this.baseMs;
    return this.baseMs + this.clock.now() - this.anchorMs;
  }

  /**
   * Current session signal, or null when idle. Monotonic within a phase;
   * repeated calls in the same wall-clock instant return identical values.
   */
  signal(): SessionSignal | null {
    if (this._state === 'idle') return null;
    return this.signalAt(this.sessionElapsedMs());
  }

  /** Pure computation; also the seam used by simulated-clock tests. */
  signalAt(sessionElapsedMs: number): SessionSignal {
    const phases = this.preset.phases;
    const cycleMs = this.cycleMs;
    const cycles = Math.floor(sessionElapsedMs / cycleMs);
    let t = sessionElapsedMs % cycleMs;
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i]!;
      const durMs = phase.seconds * 1000;
      if (t < durMs) return phaseSignal(i, phase, t, cycles, sessionElapsedMs);
      t -= durMs;
    }
    // Exactly on a cycle boundary: the boundary belongs to the next cycle,
    // but its first phase starts with elapsed 0 of that cycle.
    return phaseSignal(0, phases[0]!, 0, cycles + 1, sessionElapsedMs);
  }

  /**
   * Cues in session time over the half-open interval [fromMs, toMs), in
   * order. Pure, like `signalAt`; the sound scheduler queues these ahead.
   */
  cuesBetween(fromMs: number, toMs: number): Cue[] {
    const cues: Cue[] = [];
    if (toMs <= fromMs) return cues;
    const cycleMs = this.cycleMs;
    const countMs = this.preset.countSeconds * 1000;
    const firstCycle = Math.floor(fromMs / cycleMs) * cycleMs;
    for (let cycleStart = firstCycle; cycleStart < toMs; cycleStart += cycleMs) {
      let phaseStart = cycleStart;
      for (const phase of this.preset.phases) {
        const durMs = phase.seconds * 1000;
        const push = (atMs: number, type: Cue['type']) => {
          if (atMs >= fromMs && atMs < toMs) cues.push({ atMs, type, kind: phase.kind });
        };
        push(phaseStart, 'phase');
        if (this.preset.ticks) {
          // Whole counts strictly inside the phase; the epsilon keeps float
          // rounding from emitting a tick on the next phase's start.
          for (let n = 1; n * countMs < durMs - 1e-6; n++) push(phaseStart + n * countMs, 'tick');
        }
        phaseStart += durMs;
      }
    }
    return cues;
  }
}

function phaseSignal(
  index: number,
  phase: Phase,
  elapsedMs: number,
  cycles: number,
  sessionElapsedMs: number,
): SessionSignal {
  const durMs = phase.seconds * 1000;
  const frac = durMs === 0 ? 1 : Math.min(Math.max(elapsedMs / durMs, 0), 1);
  const [from, to] = phase.fill;
  return {
    phaseIndex: index,
    kind: phase.kind,
    phaseElapsed: elapsedMs / 1000,
    phaseRemaining: Math.max(phase.seconds - elapsedMs / 1000, 0),
    fill: from + (to - from) * frac,
    cycles,
    sessionElapsedSeconds: sessionElapsedMs / 1000,
  };
}
