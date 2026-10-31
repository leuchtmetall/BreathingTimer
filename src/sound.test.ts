import { afterEach, describe, expect, it, vi } from 'vitest';
import { BreathingEngine, type Clock } from './engine';
import { applyTempo, breathRetentionPreset, preset467, tempoNormal } from './presets';
import {
  HORIZON_MS,
  SoundScheduler,
  type AudioContextLike,
  type GainLike,
  type OscillatorLike,
} from './sound';

class FakeClock implements Clock {
  t = 0;
  now(): number {
    return this.t;
  }
}

class FakeOscillator implements OscillatorLike {
  type: OscillatorType = 'sine';
  frequency = { value: 0 };
  onended: ((ev: Event) => unknown) | null = null;
  startAt: number | null = null;
  stops: number[] = [];
  connect(): void {}
  disconnect(): void {}
  start(when: number): void {
    this.startAt = when;
  }
  stop(when: number): void {
    this.stops.push(when);
  }
}

class FakeGain implements GainLike {
  peak = 0;
  end = 0;
  gain = {
    setValueAtTime: () => {},
    linearRampToValueAtTime: (value: number) => {
      this.peak = value;
    },
    exponentialRampToValueAtTime: (_value: number, time: number) => {
      this.end = time;
    },
  };
  connect(): void {}
  disconnect(): void {}
}

class FakeAudioContext implements AudioContextLike {
  currentTime = 100;
  state = 'running';
  destination = {};
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  closes = 0;
  createOscillator(): FakeOscillator {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }
  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closes += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
}

function setup() {
  const ctx = new FakeAudioContext();
  const clock = new FakeClock();
  const engine = new BreathingEngine(applyTempo(preset467, tempoNormal), clock);
  const scheduler = new SoundScheduler(() => ctx);
  scheduler.unlock();
  scheduler.setEnabled(true);
  return { ctx, clock, engine, scheduler };
}

/** Audio start times relative to the context's time at queueing. */
const starts = (ctx: FakeAudioContext, base: number) =>
  ctx.oscillators.map((o) => Math.round((o.startAt! - base) * 1000));

describe('SoundScheduler', () => {
  it('queues cues at their session times for a fresh session', () => {
    const { ctx, engine, scheduler } = setup();
    engine.start();
    scheduler.sync(engine);
    const expected = engine.cuesBetween(0, HORIZON_MS).map((c) => Math.round(c.atMs));
    expect(starts(ctx, 100)).toEqual(expected);
    expect(starts(ctx, 100).slice(0, 5)).toEqual([0, 1_000, 2_000, 3_000, 4_000]);
  });

  it('maps from the current position after time has passed', () => {
    const { ctx, clock, engine, scheduler } = setup();
    engine.start();
    clock.t = 2_500; // 2.5 s into the inhale
    ctx.currentTime = 50;
    scheduler.sync(engine);
    // Next cues: tick at 3 s, hold phase at 4 s -> 0.5 s and 1.5 s from now.
    expect(starts(ctx, 50).slice(0, 2)).toEqual([500, 1_500]);
  });

  it('uses three distinct pitches for phase tones and quieter, shorter ticks', () => {
    const { ctx, engine, scheduler } = setup();
    engine.start();
    scheduler.sync(engine);
    const cues = engine.cuesBetween(0, HORIZON_MS);
    const phase = cues.flatMap((c, i) => (c.type === 'phase' ? [i] : []));
    const tick = cues.findIndex((c) => c.type === 'tick');
    const freq = (i: number) => ctx.oscillators[i]!.frequency.value;
    expect(new Set(phase.slice(0, 3).map(freq)).size).toBe(3);
    const length = (i: number) => ctx.gains[i]!.end - ctx.oscillators[i]!.startAt!;
    for (const i of phase.slice(0, 3)) {
      expect(ctx.gains[tick]!.peak).toBeLessThan(ctx.gains[i]!.peak);
      expect(length(tick)).toBeLessThan(length(i));
    }
  });

  it('never queues a cue twice across top-ups', () => {
    const { ctx, clock, engine, scheduler } = setup();
    engine.start();
    for (let t = 0; t <= 400_000; t += 1_000) {
      clock.t = t;
      ctx.currentTime = 100 + t / 1000;
      scheduler.sync(engine);
    }
    const times = ctx.oscillators.map((o) => o.startAt!.toFixed(3));
    expect(new Set(times).size).toBe(times.length);
    // Covers the whole run plus one horizon, with no gaps.
    expect(times.length).toBe(engine.cuesBetween(0, 400_000 + HORIZON_MS).length);
  });

  it('stop cancels every pending sound and sync queues again from the current position', () => {
    const { ctx, clock, engine, scheduler } = setup();
    engine.start();
    scheduler.sync(engine);
    const queued = [...ctx.oscillators];
    clock.t = 5_000;
    engine.pause();
    scheduler.sync(engine); // paused -> stop
    for (const osc of queued) expect(osc.stops).toContain(0);

    scheduler.unlock(); // the Resume click: pausing released audio
    engine.resume();
    clock.t = 9_000; // wall time while paused does not count
    ctx.currentTime = 200;
    scheduler.sync(engine);
    const fresh = ctx.oscillators.slice(queued.length);
    // Resumed at session 5 s (a hold tick) -> next: 6 s tick 1 s from now.
    expect(fresh.map((o) => Math.round((o.startAt! - 200) * 1000)).slice(0, 2)).toEqual([0, 1_000]);
  });

  it('drops finished sounds from the pending set', () => {
    const { ctx, engine, scheduler } = setup();
    engine.start();
    scheduler.sync(engine);
    const first = ctx.oscillators[0]!;
    first.onended!(new Event('ended'));
    scheduler.setEnabled(false);
    expect(first.stops).not.toContain(0);
    expect(ctx.oscillators[1]!.stops).toContain(0);
  });

  it('stays silent until enabled and stops when disabled', () => {
    const { ctx, engine, scheduler } = setup();
    scheduler.setEnabled(false);
    engine.start();
    scheduler.sync(engine);
    expect(ctx.oscillators).toHaveLength(0);
    scheduler.unlock(); // the sound switch click during a running session
    scheduler.setEnabled(true);
    scheduler.sync(engine);
    expect(ctx.oscillators.length).toBeGreaterThan(0);
    scheduler.setEnabled(false);
    expect(ctx.oscillators.every((o) => o.stops.includes(0))).toBe(true);
  });

  it('re-queues after a suspended context recovers', async () => {
    const { ctx, clock, engine, scheduler } = setup();
    engine.start();
    scheduler.sync(engine);
    const before = ctx.oscillators.length;
    ctx.state = 'suspended';
    clock.t = 30_000;
    scheduler.recover();
    await Promise.resolve();
    expect(ctx.oscillators.slice(0, before).every((o) => o.stops.includes(0))).toBe(true);
    expect(ctx.oscillators.length).toBeGreaterThan(before);
  });

  it('does nothing without Web Audio', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    const scheduler = new SoundScheduler(() => null);
    expect(() => {
      scheduler.unlock();
      scheduler.setEnabled(true);
      engine.start();
      scheduler.sync(engine);
      scheduler.recover();
      scheduler.stop();
    }).not.toThrow();
  });
});

describe('SoundScheduler releasing audio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** A running session with sound on, on a context per unlock, with a fake audio session. */
  const running = () => {
    const session = { type: 'auto' };
    vi.stubGlobal('navigator', { audioSession: session });
    const contexts: FakeAudioContext[] = [];
    const clock = new FakeClock();
    const engine = new BreathingEngine(applyTempo(preset467, tempoNormal), clock);
    const scheduler = new SoundScheduler(() => {
      const ctx = new FakeAudioContext();
      contexts.push(ctx);
      return ctx;
    });
    scheduler.unlock();
    scheduler.setEnabled(true);
    engine.start();
    scheduler.sync(engine);
    return { contexts, session, clock, engine, scheduler };
  };

  it('holds the exclusive audio session while a session runs', () => {
    const { contexts, session, engine, scheduler } = running();
    scheduler.sync(engine);
    expect(contexts[0]!.closes).toBe(0);
    expect(session.type).toBe('playback');
  });

  it.each([
    ['Reset', (engine: BreathingEngine) => engine.reset()],
    ['Pause', (engine: BreathingEngine) => engine.pause()],
    ['sound off', (_: BreathingEngine, scheduler: SoundScheduler) => scheduler.setEnabled(false)],
  ])('releases audio once on %s', (_name, act) => {
    const { contexts, session, engine, scheduler } = running();
    act(engine, scheduler);
    scheduler.sync(engine);
    scheduler.sync(engine);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.closes).toBe(1);
    expect(session.type).toBe('auto');
  });

  it('holds nothing when a session runs with sound off', () => {
    const contexts: FakeAudioContext[] = [];
    const engine = new BreathingEngine(preset467, new FakeClock());
    const scheduler = new SoundScheduler(() => {
      contexts.push(new FakeAudioContext());
      return contexts.at(-1)!;
    });
    engine.start();
    scheduler.sync(engine);
    expect(contexts).toHaveLength(0);
  });

  it('takes no audio back when the page returns to view while idle', async () => {
    const { contexts, session, engine, scheduler } = running();
    engine.reset();
    scheduler.sync(engine);
    const resume = vi.spyOn(contexts[0]!, 'resume');
    scheduler.recover();
    await Promise.resolve();
    expect(resume).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(1);
    expect(session.type).toBe('auto');
  });

  it('queues on a new context, from its own clock, after a release', () => {
    const { contexts, session, clock, engine, scheduler } = running();
    engine.pause();
    scheduler.sync(engine);
    clock.t = 1_000;
    scheduler.unlock();
    engine.resume();
    contexts[1]!.currentTime = 7;
    clock.t = 3_500; // 2.5 s into the inhale
    scheduler.sync(engine);
    expect(contexts).toHaveLength(2);
    expect(session.type).toBe('playback');
    // Next cues: tick at 3 s, hold phase at 4 s -> 0.5 s and 1.5 s from now.
    expect(starts(contexts[1]!, 7).slice(0, 2)).toEqual([500, 1_500]);
  });

  it('holds audio through an idle preview, then releases it', () => {
    vi.useFakeTimers();
    const session = { type: 'auto' };
    vi.stubGlobal('navigator', { audioSession: session });
    const ctx = new FakeAudioContext();
    const engine = new BreathingEngine(preset467, new FakeClock());
    const scheduler = new SoundScheduler(() => ctx);
    scheduler.preview('hold-minute'); // ends 0.58 s after it starts
    scheduler.preview('tick'); // a shorter sound must not cut the melody off
    scheduler.sync(engine);
    vi.advanceTimersByTime(580);
    scheduler.sync(engine);
    expect(ctx.closes).toBe(0);
    expect(ctx.oscillators.every((o) => !o.stops.includes(0))).toBe(true);
    vi.runAllTimers();
    expect(ctx.closes).toBe(1);
    expect(session.type).toBe('auto');
  });

  it('keeps audio after a preview while a session needs it', () => {
    vi.useFakeTimers();
    const { contexts, session, scheduler } = running();
    scheduler.preview('tick');
    vi.runAllTimers();
    expect(contexts[0]!.closes).toBe(0);
    expect(session.type).toBe('playback');
  });

  it('releases after a preview when the session was reset while it played', () => {
    vi.useFakeTimers();
    const { contexts, engine, scheduler } = running();
    scheduler.preview('tick');
    engine.reset();
    scheduler.sync(engine);
    expect(contexts[0]!.closes).toBe(0);
    vi.runAllTimers();
    expect(contexts[0]!.closes).toBe(1);
  });
});

describe('SoundScheduler with Breath Retention', () => {
  // Normal tempo, 20 breaths: breathing 0..70 s, then the hold.
  const BREATHING_MS = 70_000;
  const setup = () => {
    const ctx = new FakeAudioContext();
    const clock = new FakeClock();
    const engine = new BreathingEngine(applyTempo(breathRetentionPreset(20), tempoNormal), clock);
    const scheduler = new SoundScheduler(() => ctx);
    scheduler.unlock();
    scheduler.setEnabled(true);
    engine.start();
    return { ctx, clock, engine, scheduler };
  };
  const MELODY = [440, 550, 660];

  it('plays only the rising melody at each full minute of the hold', () => {
    const { ctx, clock, engine, scheduler } = setup();
    clock.t = BREATHING_MS + 500;
    scheduler.sync(engine);
    // Queued from 70.5 s; the 3-minute horizon covers the first hold minutes.
    const sounds = ctx.oscillators.filter((o) => o.startAt! - 100 < 125).map((o) => o.frequency.value);
    expect(sounds).toEqual([...MELODY, ...MELODY]);
  });

  it('spaces the melody notes rising from the minute mark', () => {
    const { ctx, clock, engine, scheduler } = setup();
    clock.t = BREATHING_MS + 59_000;
    scheduler.sync(engine);
    const melody = ctx.oscillators.slice(0, 3);
    expect(melody.map((o) => o.frequency.value)).toEqual(MELODY);
    expect(melody.map((o) => Math.round((o.startAt! - 100) * 1000))).toEqual([1_000, 1_200, 1_400]);
  });

  it('uses the soft breath voice once per breath in', () => {
    const { ctx, engine, scheduler } = setup();
    scheduler.sync(engine);
    const breathing = ctx.oscillators.filter((o) => o.startAt! - 100 < 70);
    expect(breathing).toHaveLength(20);
    expect(new Set(breathing.map((o) => o.frequency.value))).toEqual(new Set([880]));
    const peak = ctx.gains[0]!.peak;
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(0.21);
  });

  it('cancels queued hold sounds past the hold end and queues the recovery tone at once', () => {
    const { ctx, clock, engine, scheduler } = setup();
    clock.t = BREATHING_MS + 59_500;
    scheduler.sync(engine);
    const queued = [...ctx.oscillators];
    expect(queued[0]!.frequency.value).toBe(440); // the melody at 60 s

    const holdEnd = engine.endRetention()!;
    clock.t += 0.003; // real time moves on between the click and the queueing
    scheduler.restartAt(engine, holdEnd);
    expect(queued.every((o) => o.stops.includes(0))).toBe(true);
    const fresh = ctx.oscillators.slice(queued.length);
    expect(fresh[0]!.frequency.value).toBe(660); // recovery breath in
    expect(fresh[0]!.startAt!).toBeLessThanOrEqual(ctx.currentTime);
    expect(fresh.filter((o) => MELODY.includes(o.frequency.value) && o.startAt! - 100 < 0.5)).toHaveLength(1);
  });
});

describe('preview (debug)', () => {
  const play = (setupOn: boolean, ...args: Parameters<SoundScheduler['preview']>) => {
    const ctx = new FakeAudioContext();
    const scheduler = new SoundScheduler(() => ctx);
    scheduler.setEnabled(setupOn);
    scheduler.preview(...args);
    return { ctx, scheduler };
  };
  const freqs = (ctx: FakeAudioContext) => ctx.oscillators.map((o) => o.frequency.value);

  it('plays each sound at once', () => {
    expect(freqs(play(true, 'phase', 'inhale').ctx)).toEqual([660]);
    expect(freqs(play(true, 'phase', 'hold').ctx)).toEqual([550]);
    expect(freqs(play(true, 'phase', 'exhale').ctx)).toEqual([440]);
    expect(freqs(play(true, 'tick').ctx)).toEqual([1320]);
    expect(freqs(play(true, 'breath').ctx)).toEqual([880]);
    const { ctx } = play(true, 'phase', 'inhale');
    expect(ctx.oscillators[0]!.startAt).toBe(100);
  });

  it('plays the minute melody rising, 0.2 s apart', () => {
    const { ctx } = play(true, 'hold-minute');
    expect(freqs(ctx)).toEqual([440, 550, 660]);
    expect(starts(ctx, 100)).toEqual([0, 200, 400]);
  });

  it('plays with sound off and is not cut off by an idle sync', () => {
    const { ctx, scheduler } = play(false, 'tick');
    expect(ctx.oscillators).toHaveLength(1);
    scheduler.sync(new BreathingEngine(preset467, new FakeClock()));
    expect(ctx.oscillators[0]!.stops).toHaveLength(1); // only its own scheduled end
  });
});
