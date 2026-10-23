import type { Phase, PhaseKind, PhaseRole, Preset } from './presets';

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
  /** Breath Retention part, or null for a regular phase. */
  readonly role: PhaseRole | null;
  /** In the hold the user ends: `phaseRemaining` is 0 and means nothing. */
  readonly open: boolean;
  /** Completed cycles, or rounds whose hold has ended (Breath Retention). */
  readonly completed: number;
  /** Breath number (1-based) and breath total in the breathing part, else 0. */
  readonly breath: number;
  readonly breaths: number;
  /** Real seconds between the phase's tick marks, or null without ticks. */
  readonly tickSeconds: number | null;
}

/**
 * A timed sound cue in session time: `phase` at every phase start, `tick` at
 * every whole count inside a phase (only for presets with ticks). Breath
 * Retention replaces the breathing part's phase cues with one `breath` per
 * breath in, and marks every full minute of its hold with `hold-minute`.
 */
export interface Cue {
  readonly atMs: number;
  readonly type: 'phase' | 'tick' | 'breath' | 'hold-minute';
  readonly kind: PhaseKind;
  /** Full minutes since the hold started (`hold-minute` only). */
  readonly minute?: number;
}

/** One phase instance on the session timeline (rounds with a user-ended hold). */
interface PlacedPhase {
  readonly round: number;
  readonly index: number;
  readonly phase: Phase;
  readonly startMs: number;
  /** Infinity for a hold the user has not ended yet. */
  readonly durMs: number;
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
  /** Index of the hold the user ends, or -1 for a fixed-cycle preset. */
  private readonly openIndex: number;
  /** Recorded hold lengths (ms), one per completed round. */
  private readonly holdsMs: number[] = [];
  /** Breath number of each breathing-part phase (0 elsewhere). */
  private readonly breathNumbers: number[];
  private readonly breathTotal: number;

  constructor(preset: Preset, clock: Clock = wallClock) {
    this.preset = preset;
    this.clock = clock;
    this.openIndex = preset.phases.findIndex(({ role }) => role === 'retention');
    let breath = 0;
    this.breathNumbers = preset.phases.map(({ role, kind }) => {
      if (role !== 'breath') return 0;
      if (kind === 'inhale') breath++;
      return breath;
    });
    this.breathTotal = breath;
  }

  get state(): EngineState {
    return this._state;
  }

  /** Total duration of one full preset cycle in ms (without a user-ended hold). */
  get cycleMs(): number {
    return this.preset.phases.reduce((sum, p) => sum + p.seconds * 1000, 0);
  }

  start(): void {
    if (this._state !== 'idle') return;
    this.baseMs = 0;
    this.holdsMs.length = 0;
    this.anchorMs = this.clock.now();
    this._state = 'running';
  }

  /**
   * Debug only: starts a fresh session from any state, already `sessionMs`
   * into it, with `holdsMs` as the recorded holds of its first rounds.
   */
  startAt(sessionMs: number, holdsMs: readonly number[] = []): void {
    this.baseMs = sessionMs;
    this.holdsMs.splice(0, this.holdsMs.length, ...holdsMs);
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
    this.holdsMs.length = 0;
  }

  /** Recorded hold lengths in seconds, one per completed round. */
  get holds(): readonly number[] {
    return this.holdsMs.map((ms) => ms / 1000);
  }

  /**
   * Ends the running hold of a Breath Retention round and returns the session
   * time (ms) at which the recovery begins, exactly as `cuesBetween` places
   * it. Does nothing (null) unless running inside that hold.
   */
  endRetention(): number | null {
    if (this._state !== 'running' || this.openIndex < 0) return null;
    const nowMs = this.sessionElapsedMs();
    for (const placed of this.timeline()) {
      if (nowMs >= placed.startMs + placed.durMs) continue;
      if (placed.durMs !== Infinity) return null;
      this.holdsMs.push(nowMs - placed.startMs);
      // Same expression the timeline uses for the next phase's start.
      return placed.startMs + this.holdsMs[placed.round]!;
    }
    return null;
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
    if (this.openIndex >= 0) {
      for (const placed of this.timeline()) {
        if (sessionElapsedMs < placed.startMs + placed.durMs) {
          const { round, index } = placed;
          const completed = round + (index > this.openIndex ? 1 : 0);
          return this.phaseSignal(placed, sessionElapsedMs - placed.startMs, completed, sessionElapsedMs);
        }
      }
    }
    const phases = this.preset.phases;
    const cycleMs = this.cycleMs;
    const cycles = Math.floor(sessionElapsedMs / cycleMs);
    let t = sessionElapsedMs % cycleMs;
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i]!;
      const durMs = phase.seconds * 1000;
      if (t < durMs) {
        const placed = { round: cycles, index: i, phase, startMs: 0, durMs };
        return this.phaseSignal(placed, t, cycles, sessionElapsedMs);
      }
      t -= durMs;
    }
    // Exactly on a cycle boundary: the boundary belongs to the next cycle,
    // but its first phase starts with elapsed 0 of that cycle.
    const first = { round: cycles + 1, index: 0, phase: phases[0]!, startMs: 0, durMs: phases[0]!.seconds * 1000 };
    return this.phaseSignal(first, 0, cycles + 1, sessionElapsedMs);
  }

  /**
   * Cues in session time over the half-open interval [fromMs, toMs), in
   * order. Pure, like `signalAt`; the sound scheduler queues these ahead.
   */
  cuesBetween(fromMs: number, toMs: number): Cue[] {
    const cues: Cue[] = [];
    if (toMs <= fromMs) return cues;
    if (this.openIndex >= 0) return this.roundCuesBetween(fromMs, toMs);
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

  /**
   * Every phase instance of a preset with a user-ended hold, in order from the
   * session start. Round lengths come from the recorded holds; the walk stops
   * at the hold still running (its duration is Infinity). Walking from the
   * start each time keeps every boundary the same float sum everywhere.
   */
  private *timeline(): Generator<PlacedPhase> {
    const phases = this.preset.phases;
    let startMs = 0;
    for (let round = 0; ; round++) {
      for (let index = 0; index < phases.length; index++) {
        const phase = phases[index]!;
        const durMs = index === this.openIndex ? (this.holdsMs[round] ?? Infinity) : phase.seconds * 1000;
        yield { round, index, phase, startMs, durMs };
        if (durMs === Infinity) return;
        startMs += durMs;
      }
    }
  }

  private roundCuesBetween(fromMs: number, toMs: number): Cue[] {
    const cues: Cue[] = [];
    for (const { index, phase, startMs, durMs } of this.timeline()) {
      if (startMs >= toMs) break;
      const endMs = startMs + durMs;
      if (endMs <= fromMs) continue;
      const push = (atMs: number, type: Cue['type'], minute?: number) => {
        if (atMs >= fromMs && atMs < toMs) {
          cues.push(minute === undefined ? { atMs, type, kind: phase.kind } : { atMs, type, kind: phase.kind, minute });
        }
      };
      if (phase.role === 'breath') {
        if (phase.kind === 'inhale') push(startMs, 'breath');
      } else {
        push(startMs, 'phase');
      }
      if (index === this.openIndex) {
        // Full minutes of the hold, up to its end or the window's end.
        const limit = Math.min(endMs, toMs);
        for (let n = 1; startMs + n * 60_000 < limit; n++) push(startMs + n * 60_000, 'hold-minute', n);
        continue;
      }
      const tickMs = this.tickSecondsOf(phase);
      if (tickMs === null) continue;
      for (let n = 1; n * tickMs * 1000 < durMs - 1e-6; n++) push(startMs + n * tickMs * 1000, 'tick');
    }
    return cues;
  }

  /** Real seconds between ticks in a phase, or null when it shows none. */
  private tickSecondsOf(phase: Phase): number | null {
    if (phase.role === 'retention' || !(phase.ticks ?? this.preset.ticks)) return null;
    return phase.fixed ? 1 : this.preset.countSeconds;
  }

  private phaseSignal(
    placed: PlacedPhase,
    elapsedMs: number,
    completed: number,
    sessionElapsedMs: number,
  ): SessionSignal {
    const { round, index, phase, durMs } = placed;
    const open = durMs === Infinity;
    const frac = open ? 0 : durMs === 0 ? 1 : Math.min(Math.max(elapsedMs / durMs, 0), 1);
    const [from, to] = phase.fill;
    const breath = this.breathNumbers[index]!;
    return {
      phaseIndex: index,
      kind: phase.kind,
      phaseElapsed: elapsedMs / 1000,
      phaseRemaining: open ? 0 : Math.max(durMs / 1000 - elapsedMs / 1000, 0),
      fill: from + (to - from) * frac,
      cycles: round,
      sessionElapsedSeconds: sessionElapsedMs / 1000,
      role: phase.role ?? null,
      open,
      completed,
      breath,
      breaths: breath > 0 ? this.breathTotal : 0,
      tickSeconds: this.tickSecondsOf(phase),
    };
  }
}
