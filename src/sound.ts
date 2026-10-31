import type { BreathingEngine, Cue } from './engine';
import type { PhaseKind } from './presets';

/**
 * The slice of Web Audio the scheduler uses, so tests can inject a fake
 * context. A real `AudioContext` satisfies it.
 */
export interface AudioParamLike {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

export interface OscillatorLike {
  type: OscillatorType;
  frequency: { value: number };
  onended: ((ev: Event) => unknown) | null;
  connect(node: GainLike): unknown;
  disconnect(): void;
  start(when: number): void;
  stop(when: number): void;
}

export interface GainLike {
  gain: AudioParamLike;
  connect(destination: unknown): unknown;
  disconnect(): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}

/** A synthesized sound: a short enveloped oscillator, no audio files. */
interface Voice {
  type: OscillatorType;
  frequency: number;
  peak: number;
  attack: number;
  duration: number;
}

/** Phase-change tones, pitched per phase: inhale highest, exhale lowest. */
const PHASE_VOICES: Record<PhaseKind, Voice> = {
  inhale: { type: 'sine', frequency: 660, peak: 0.25, attack: 0.015, duration: 0.18 },
  hold: { type: 'sine', frequency: 550, peak: 0.25, attack: 0.015, duration: 0.18 },
  exhale: { type: 'sine', frequency: 440, peak: 0.25, attack: 0.015, duration: 0.18 },
};

/** In-phase tick: quieter, shorter, and higher than any phase tone. */
const TICK_VOICE: Voice = {
  type: 'triangle',
  frequency: 1320,
  peak: 0.08,
  attack: 0.003,
  duration: 0.03,
};

/** Breath Retention: one soft tick per breath in, quieter and lower than the tick. */
const BREATH_VOICE: Voice = {
  type: 'triangle',
  frequency: 880,
  peak: 0.2,
  attack: 0.004,
  duration: 0.05,
};

/** Full minute of a hold: the three phase tones rising, about 0.2 s apart. */
const MINUTE_MELODY: readonly Voice[] = [PHASE_VOICES.exhale, PHASE_VOICES.hold, PHASE_VOICES.inhale];
const MELODY_STEP_S = 0.2;

/** How far ahead (session ms) sounds are queued; outlasts hidden-tab timers. */
export const HORIZON_MS = 180_000;
/** Top up once the queued window has shrunk by this much. */
const TOP_UP_MS = 10_000;
/** Debug previews hold audio this long past their end: a new context starts late. */
const PREVIEW_MARGIN_MS = 300;

/** Real Web Audio, or null where the API does not exist (jsdom, old browsers). */
export function browserAudioContext(): AudioContextLike | null {
  const Ctor = globalThis.AudioContext;
  // Overloaded Web Audio signatures (connect, onended) do not match the
  // narrow interface structurally; the methods used here are the real ones.
  return typeof Ctor === 'function' ? (new Ctor() as unknown as AudioContextLike) : null;
}

function setAudioSessionType(type: 'auto' | 'playback'): void {
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = type;
}

/**
 * Queues the engine's cues ahead on the audio clock, so sounds keep their
 * timing when frames stop (hidden tab, locked screen). Session time maps to
 * audio time at each top-up; only new cues are mapped, so clock drift cannot
 * build up beyond one window. Audio is held only while a running session has
 * sound on: a page holding it stops other apps' audio on iOS.
 */
export class SoundScheduler {
  private readonly createContext: () => AudioContextLike | null;
  private ctx: AudioContextLike | null = null;
  private enabled = false;
  private engine: BreathingEngine | null = null;
  /** Session ms up to which cues are queued, or null when nothing is. */
  private scheduledUntilMs: number | null = null;
  /** Just-passed session ms the next queueing starts from (see `restartAt`). */
  private restartFromMs: number | null = null;
  private readonly pending = new Set<{ osc: OscillatorLike; gain: GainLike }>();
  /** Debug previews still playing; audio is kept until they end. */
  private previews = 0;

  constructor(createContext: () => AudioContextLike | null = browserAudioContext) {
    this.createContext = createContext;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Creates and resumes the context. Call inside a user action: browsers
   * only allow audio to start from one.
   */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = this.createContext();
      // Newer iOS Safari: play through the silent switch and keep playing
      // while the screen is locked where the platform allows it.
      if (this.ctx) setAudioSessionType('playback');
    }
    // Rejects if audio is released first, and then there is nothing left to do.
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stop();
  }

  /**
   * Queues again from `fromMs`, a session time that may have just passed
   * (the end of a hold), so a cue there still plays instead of being dropped.
   */
  restartAt(engine: BreathingEngine, fromMs: number): void {
    this.stop();
    this.restartFromMs = fromMs;
    this.sync(engine);
    this.restartFromMs = null;
  }

  /**
   * Keeps the queue matching the engine: tops up while running and enabled,
   * otherwise stops every pending sound and releases audio. Cheap when nothing
   * is due, so it runs every frame and from a background-tolerant timer.
   */
  sync(engine: BreathingEngine): void {
    if (engine !== this.engine) {
      this.stop();
      this.engine = engine;
    }
    if (!this.ctx || !this.sessionNeedsAudio) {
      this.stop();
      this.release();
      return;
    }
    const nowMs = engine.sessionElapsedMs();
    const untilMs = nowMs + HORIZON_MS;
    // Cues that passed while nothing ran are dropped, never played in a burst.
    const startMs = Math.min(this.restartFromMs ?? nowMs, nowMs);
    const fromMs = Math.max(this.scheduledUntilMs ?? startMs, startMs);
    if (this.scheduledUntilMs !== null && this.scheduledUntilMs - nowMs > HORIZON_MS - TOP_UP_MS) {
      return;
    }
    const audioNow = this.ctx.currentTime;
    for (const cue of engine.cuesBetween(fromMs, untilMs)) {
      this.play(cue, audioNow + (cue.atMs - nowMs) / 1000);
    }
    this.scheduledUntilMs = untilMs;
  }

  /** Cancels every sound that has not finished and clears the queue. */
  stop(): void {
    for (const { osc, gain } of this.pending) {
      osc.onended = null;
      osc.stop(0);
      osc.disconnect();
      gain.disconnect();
    }
    this.pending.clear();
    this.scheduledUntilMs = null;
  }

  /**
   * After the page returns to view: a context the platform suspended lost
   * its timing, so resume it and queue again from the current position.
   */
  recover(): void {
    const { ctx, engine } = this;
    if (!ctx || !engine || !this.sessionNeedsAudio || ctx.state === 'running') return;
    ctx.resume().then(
      () => {
        this.stop();
        this.sync(engine);
      },
      () => {}, // Released meanwhile: the next unlock starts afresh.
    );
  }

  /**
   * Debug only: plays one sound at once, whatever the session state or the
   * sound setting. Kept out of the queue, so `sync` and `stop` leave it be,
   * and audio is released afterward unless a session needs it. Timed, because
   * `onended` never fires in an interrupted context.
   */
  preview(type: Cue['type'], kind: PhaseKind = 'hold'): void {
    this.unlock();
    if (!this.ctx) return;
    const cue: Cue = { atMs: 0, type, kind };
    this.play(cue, this.ctx.currentTime, false);
    const voices = this.voicesFor(cue);
    const lengthS = (voices.length - 1) * MELODY_STEP_S + voices.at(-1)!.duration;
    this.previews += 1;
    setTimeout(() => {
      this.previews -= 1;
      if (!this.sessionNeedsAudio) this.release();
    }, lengthS * 1000 + PREVIEW_MARGIN_MS);
  }

  private get sessionNeedsAudio(): boolean {
    return this.enabled && this.engine?.state === 'running';
  }

  /** Lets other apps' audio play again; the next `unlock` starts a new context. */
  private release(): void {
    if (!this.ctx || this.previews > 0) return;
    void this.ctx.close();
    this.ctx = null;
    setAudioSessionType('auto');
  }

  private play(cue: Cue, at: number, queued = true): void {
    // A start time just past plays at once (Web Audio clamps it to now).
    this.voicesFor(cue).forEach((voice, i) => this.playVoice(voice, at + i * MELODY_STEP_S, queued));
  }

  /** The voices a cue plays, in order (several only for the minute melody). */
  private voicesFor(cue: Cue): readonly Voice[] {
    switch (cue.type) {
      case 'phase':
        return [PHASE_VOICES[cue.kind]];
      case 'tick':
        return [TICK_VOICE];
      case 'breath':
        return [BREATH_VOICE];
      case 'hold-minute':
        return MINUTE_MELODY;
    }
  }

  private playVoice(voice: Voice, at: number, queued: boolean): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = voice.type;
    osc.frequency.value = voice.frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(voice.peak, at + voice.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + voice.duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    const handle = { osc, gain };
    if (queued) this.pending.add(handle);
    osc.onended = () => {
      this.pending.delete(handle);
      gain.disconnect();
    };
    osc.start(at);
    osc.stop(at + voice.duration);
  }
}
