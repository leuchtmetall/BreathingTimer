import { describe, expect, it } from 'vitest';
import { BreathingEngine, type Clock } from './engine';
import {
  applyTempo,
  defaultTempo,
  preset467,
  presetBox4,
  presetBox7,
  presetChoices,
  tempoChoices,
  tempoFast,
  tempoNormal,
  tempoSlow,
  type Preset,
} from './presets';

/** Clock hand-settable by tests, simulating wall time. */
class FakeClock implements Clock {
  t = 0;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

function boxPreset(): Preset {
  return {
    name: 'box-4',
    phases: [
      { kind: 'inhale', seconds: 4, fill: [0, 1] },
      { kind: 'hold', seconds: 4, fill: [1, 1] },
      { kind: 'exhale', seconds: 4, fill: [1, 0] },
      { kind: 'hold', seconds: 4, fill: [0, 0] },
    ],
  };
}

describe('BreathingEngine', () => {
  it('is idle with no signal before start', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    expect(engine.state).toBe('idle');
    expect(engine.signal()).toBeNull();
  });

  it('begins with the inhale phase at zero elapsed time', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const s = engine.signal();
    expect(engine.state).toBe('running');
    expect(s).not.toBeNull();
    expect(s!.kind).toBe('inhale');
    expect(s!.phaseIndex).toBe(0);
    expect(s!.phaseElapsed).toBeCloseTo(0);
    expect(s!.cycles).toBe(0);
    expect(s!.sessionElapsedSeconds).toBeCloseTo(0);
  });

  it('advances inhale 4s -> hold 6s -> exhale 7s in order', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();

    const at = (ms: number) => engine.signalAt(ms);

    // inhale: 0..4000
    expect(at(0)!.kind).toBe('inhale');
    expect(at(3999.9)!.kind).toBe('inhale');
    // hold follows (4..10 s)
    expect(at(4000)!.kind).toBe('hold');
    expect(at(9999)!.kind).toBe('hold');
    // exhale follows (10..17 s)
    expect(at(10000)!.kind).toBe('exhale');
    expect(at(16999)!.kind).toBe('exhale');
  });

  it('loops back to inhale after one full cycle until stopped', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const cycleMs = engine.cycleMs;
    expect(cycleMs).toBe(17_000);

    const s = engine.signalAt(cycleMs + 1234);
    expect(s!.kind).toBe('inhale');
    expect(s!.cycles).toBe(1);
    expect(s!.phaseElapsed).toBeCloseTo(1.234);
  });

  it('rises fill during inhale, holds it at max, falls it during exhale', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();

    const inhaleHalf = engine.signalAt(2000)!;
    expect(inhaleHalf.kind).toBe('inhale');
    expect(inhaleHalf.fill).toBeCloseTo(0.5);

    const holdStart = engine.signalAt(4000)!;
    expect(holdStart.kind).toBe('hold');
    expect(holdStart.fill).toBeCloseTo(1);
    const holdEnd = engine.signalAt(9999)!;
    expect(holdEnd.fill).toBeCloseTo(1);

    const exhaleHalf = engine.signalAt(13_500)!;
    expect(exhaleHalf.kind).toBe('exhale');
    expect(exhaleHalf.fill).toBeCloseTo(0.5);

    const exhaleEnd = engine.signalAt(16_999)!;
    // 1 ms before the phase ends: fill has fallen to 0.000143
    expect(exhaleEnd.fill).toBeCloseTo(0, 3);
  });

  it('keeps fill constant on an empty-lung hold after exhale', () => {
    const engine = new BreathingEngine(boxPreset(), new FakeClock());
    engine.start();
    // box-4: exhale ends at 12s; hold [12s, 16s] keeps fill at 0
    expect(engine.signalAt(13_000)!.kind).toBe('hold');
    expect(engine.signalAt(13_000)!.fill).toBeCloseTo(0);
    expect(engine.signalAt(15_999)!.fill).toBeCloseTo(0);
  });

  it('clamps fill within 0 and 1 everywhere in the cycle', () => {
    const engine = new BreathingEngine(boxPreset(), new FakeClock());
    engine.start();
    for (let ms = 0; ms < engine.cycleMs * 3; ms += 37) {
      const s = engine.signalAt(ms)!;
      expect(s.fill).toBeGreaterThanOrEqual(0);
      expect(s.fill).toBeLessThanOrEqual(1);
    }
  });

  it('reports seconds remaining in the phase', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    // 2s into the 6s hold (hold spans 4s..10s) -> 4s remaining
    expect(engine.signalAt(6000)!.kind).toBe('hold');
    expect(engine.signalAt(6000)!.phaseRemaining).toBeCloseTo(4);
  });

  it('keeps the session position monotonic under a coarsely stepped clock', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const offsets: number[] = [];
    let acc = 0;
    for (const p of preset467.phases) {
      offsets.push(acc);
      acc += p.seconds * 1000;
    }
    let prevPosition = -1;
    for (let ms = 0; ms < engine.cycleMs; ms += 113) {
      const s = engine.signalAt(ms)!;
      const position =
        s.cycles * engine.cycleMs + offsets[s.phaseIndex] + s.phaseElapsed * 1000;
      expect(position).toBeGreaterThan(prevPosition);
      prevPosition = position;
    }
  });

  it('pause freezes the signal in place', () => {
    const clock = new FakeClock();
    const engine = new BreathingEngine(preset467, clock);
    engine.start();
    clock.advance(6_000); // 2s into hold
    engine.pause();
    const frozen = engine.signal();
    expect(engine.state).toBe('paused');
    expect(frozen!.kind).toBe('hold');
    expect(frozen!.phaseElapsed).toBeCloseTo(2);

    clock.advance(60_000); // wall time passes while paused
    const still = engine.signal();
    expect(still!.phaseElapsed).toBeCloseTo(2);
    expect(still!.phaseRemaining).toBeCloseTo(4);
    expect(still!.fill).toBeCloseTo(1);
  });

  it('resume continues from the paused position', () => {
    const clock = new FakeClock();
    const engine = new BreathingEngine(preset467, clock);
    engine.start();
    clock.advance(6_000);
    engine.pause();
    clock.advance(60_000);
    engine.resume();
    clock.advance(1_000); // 1s of real running after resume
    const s = engine.signal();
    expect(engine.state).toBe('running');
    expect(s!.phaseElapsed).toBeCloseTo(3); // 2s pre-pause + 1s
    expect(s!.phaseRemaining).toBeCloseTo(3);
  });

  it('reports active elapsed time, excluding pauses and resetting to zero', () => {
    const clock = new FakeClock();
    const engine = new BreathingEngine(preset467, clock);
    engine.start();
    expect(engine.signal()!.sessionElapsedSeconds).toBeCloseTo(0);

    clock.advance(1_500);
    expect(engine.signal()!.sessionElapsedSeconds).toBeCloseTo(1.5);
    engine.pause();
    clock.advance(60_000);
    expect(engine.signal()!.sessionElapsedSeconds).toBeCloseTo(1.5);

    engine.resume();
    clock.advance(500);
    expect(engine.signal()!.sessionElapsedSeconds).toBeCloseTo(2);

    engine.reset();
    expect(engine.signal()).toBeNull();
    engine.start();
    expect(engine.signal()!.sessionElapsedSeconds).toBeCloseTo(0);
  });

  it('pause across a phase boundary resumes in the correct later phase', () => {
    const clock = new FakeClock();
    const engine = new BreathingEngine(preset467, clock);
    engine.start();
    clock.advance(11_000); // 1s into exhale
    engine.pause();
    clock.advance(5_000);
    engine.resume();
    clock.advance(2_000);
    const s = engine.signal();
    expect(s!.kind).toBe('exhale');
    expect(s!.phaseElapsed).toBeCloseTo(3);
  });

  it('reset returns to idle with no signal and a fresh start thereafter', () => {
    const clock = new FakeClock();
    const engine = new BreathingEngine(preset467, clock);
    engine.start();
    clock.advance(9_000);
    engine.reset();
    expect(engine.state).toBe('idle');
    expect(engine.signal()).toBeNull();

    clock.advance(2_000);
    engine.start();
    expect(engine.signal()!.phaseElapsed).toBeCloseTo(0);
  });

  it('ignores pause/resume/start in the wrong state', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.pause(); // idle: no-op
    engine.resume();
    expect(engine.state).toBe('idle');
    engine.start();
    engine.start(); // running: repeated start is a no-op, position preserved
    expect(engine.state).toBe('running');
    engine.reset();
    engine.resume(); // idle again after reset: resume must not start a session
    expect(engine.state).toBe('idle');
  });
});

describe('Box Breathing presets', () => {
  const boxChoices = presetChoices.slice(1);

  it.each(boxChoices)('$label defines four equal-duration phases with correct fill', ({ preset }) => {
    expect(preset.phases.map(({ kind }) => kind)).toEqual([
      'inhale',
      'hold',
      'exhale',
      'hold',
    ]);
    const seconds = preset.phases[0]!.seconds;
    expect(preset.phases.map(({ seconds: duration }) => duration)).toEqual([
      seconds,
      seconds,
      seconds,
      seconds,
    ]);
    expect(preset.phases.map(({ fill }) => fill)).toEqual([
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ]);
  });

  it.each(boxChoices)('$label advances all phases and repeats on its cycle boundary', ({ preset }) => {
    const engine = new BreathingEngine(preset, new FakeClock());
    const seconds = preset.phases[0]!.seconds;

    for (let index = 0; index < preset.phases.length; index++) {
      const signal = engine.signalAt(index * seconds * 1000);
      expect(signal.phaseIndex).toBe(index);
      expect(signal.kind).toBe(preset.phases[index]!.kind);
      expect(signal.phaseElapsed).toBeCloseTo(0);
    }

    expect(engine.cycleMs).toBe(seconds * 4 * 1000);
    const nextCycle = engine.signalAt(engine.cycleMs);
    expect(nextCycle.kind).toBe('inhale');
    expect(nextCycle.phaseIndex).toBe(0);
    expect(nextCycle.cycles).toBe(1);
  });

  it('labels Box Breathing durations as counts per phase', () => {
    expect(presetChoices.map(({ label }) => label)).toEqual([
      '4-6-7',
      'Box Breathing (4 counts per phase)',
      'Box Breathing (5 counts per phase)',
      'Box Breathing (7 counts per phase)',
    ]);
  });
});

describe('Tempo', () => {
  const durations = (preset: Preset) => preset.phases.map(({ seconds }) => seconds);

  it('offers Slow, Normal, and Fast with Normal as the one-second default', () => {
    expect(tempoChoices.map(({ label, secondLength }) => [label, secondLength])).toEqual([
      ['Slow (1.25 s per count)', 1.25],
      ['Normal (1 s per count)', 1],
      ['Fast (0.8 s per count)', 0.8],
    ]);
    expect(defaultTempo).toBe(tempoNormal);
    expect(defaultTempo.secondLength).toBe(1);
  });

  it('scales 4-6-7 to real seconds at Fast and Slow', () => {
    const fast = durations(applyTempo(preset467, tempoFast));
    [3.2, 4.8, 5.6].forEach((expected, i) => expect(fast[i]).toBeCloseTo(expected, 10));
    expect(durations(applyTempo(preset467, tempoSlow))).toEqual([5, 7.5, 8.75]);
  });

  it('applies to every preset and leaves kind, fill, and proportions untouched', () => {
    expect(durations(applyTempo(presetBox4, tempoSlow))).toEqual([5, 5, 5, 5]);
    for (const { preset } of presetChoices) {
      for (const tempo of tempoChoices) {
        const scaled = applyTempo(preset, tempo);
        expect(scaled.phases.map(({ kind, fill }) => [kind, fill])).toEqual(
          preset.phases.map(({ kind, fill }) => [kind, fill]),
        );
        const ratio = scaled.phases[0]!.seconds / preset.phases[0]!.seconds;
        scaled.phases.forEach((phase, i) =>
          expect(phase.seconds / preset.phases[i]!.seconds).toBeCloseTo(ratio, 10),
        );
      }
    }
  });

  it('does not mutate the counts-authored catalog preset', () => {
    applyTempo(preset467, tempoSlow);
    expect(durations(preset467)).toEqual([4, 6, 7]);
  });

  it('reproduces the current durations exactly at Normal tempo', () => {
    for (const { preset } of presetChoices) {
      const normal = applyTempo(preset, tempoNormal);
      expect(durations(normal)).toEqual(durations(preset));
      expect(new BreathingEngine(normal).cycleMs).toBe(new BreathingEngine(preset).cycleMs);
    }
    expect(new BreathingEngine(applyTempo(preset467, tempoNormal)).cycleMs).toBe(17_000);
  });

  it('lands phase boundaries and cycle counts at Fast tempo', () => {
    // 4-6-7 at Fast: inhale 0..3.2 s, hold ..8.0 s, exhale ..13.6 s
    const engine = new BreathingEngine(applyTempo(preset467, tempoFast), new FakeClock());
    expect(engine.cycleMs).toBeCloseTo(13_600, 6);
    expect(engine.signalAt(3_199).kind).toBe('inhale');
    expect(engine.signalAt(3_201).kind).toBe('hold');
    expect(engine.signalAt(7_999).kind).toBe('hold');
    expect(engine.signalAt(8_001).kind).toBe('exhale');
    expect(engine.signalAt(13_599).kind).toBe('exhale');
    const next = engine.signalAt(13_601);
    expect(next.kind).toBe('inhale');
    expect(next.cycles).toBe(1);
    expect(engine.signalAt(13_600 * 3 + 1).cycles).toBe(3);
  });

  it('lands boundaries, fractional phases, and cycle counts at Slow tempo', () => {
    // 4-6-7 at Slow: inhale 0..5 s, hold ..12.5 s, exhale (8.75 s) ..21.25 s
    const engine = new BreathingEngine(applyTempo(preset467, tempoSlow), new FakeClock());
    expect(engine.cycleMs).toBe(21_250);
    expect(engine.signalAt(4_999).kind).toBe('inhale');
    expect(engine.signalAt(5_000).kind).toBe('hold');
    expect(engine.signalAt(12_500).kind).toBe('exhale');

    const midExhale = engine.signalAt(12_500 + 4_375); // halfway through 8.75 s
    expect(midExhale.fill).toBeCloseTo(0.5, 10);
    expect(midExhale.phaseRemaining).toBeCloseTo(4.375, 10);

    const wrapped = engine.signalAt(21_250);
    expect(wrapped.kind).toBe('inhale');
    expect(wrapped.cycles).toBe(1);
    expect(wrapped.phaseElapsed).toBeCloseTo(0, 10);
  });

  it('keeps session time in real seconds regardless of tempo', () => {
    for (const tempo of [tempoSlow, tempoFast]) {
      const clock = new FakeClock();
      const engine = new BreathingEngine(applyTempo(presetBox7, tempo), clock);
      engine.start();
      clock.advance(60_000);
      expect(engine.signal()!.sessionElapsedSeconds).toBeCloseTo(60, 10);
    }
  });
});
