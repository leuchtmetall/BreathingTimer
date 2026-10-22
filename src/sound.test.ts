import { describe, expect, it } from 'vitest';
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
    expect(peak).toBeLessThan(0.08);
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
