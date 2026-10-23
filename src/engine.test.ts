import { describe, expect, it } from 'vitest';
import { BreathingEngine, type Clock } from './engine';
import {
  applyTempo,
  balancedPhaseChoices,
  balancedPreset,
  boxPhaseChoices,
  boxPreset,
  breathCountChoices,
  breathRetentionPreset,
  defaultBalancedPhase,
  defaultBreathCount,
  defaultBoxPhase,
  defaultTempo,
  hasRetention,
  preset467,
  presetChoices,
  tempoChoices,
  tempoFast,
  tempoNormal,
  tempoSlow,
  type Preset,
} from './presets';

/** The fixed-cycle presets, authored in counts; Breath Retention has its own tests. */
const cyclicPresets: readonly Preset[] = [preset467, ...boxPhaseChoices.map(boxPreset)];

/** A pattern's tempo choices by id, as the tempo control offers them. */
const choice = (presetId: string) => presetChoices.find(({ id }) => id === presetId)!;

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
    const engine = new BreathingEngine(boxPreset(4), new FakeClock());
    engine.start();
    // box-4: exhale ends at 12s; hold [12s, 16s] keeps fill at 0
    expect(engine.signalAt(13_000)!.kind).toBe('hold');
    expect(engine.signalAt(13_000)!.fill).toBeCloseTo(0);
    expect(engine.signalAt(15_999)!.fill).toBeCloseTo(0);
  });

  it('clamps fill within 0 and 1 everywhere in the cycle', () => {
    const engine = new BreathingEngine(boxPreset(4), new FakeClock());
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
  const boxChoices = choice('box').tempos.map(({ label, build }) => ({ label, preset: build(defaultBreathCount) }));

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

  it('lists the patterns by simplicity, Box Breathing once', () => {
    expect(presetChoices.map(({ id, label }) => [id, label])).toEqual([
      ['balanced', 'Balanced Breathing'],
      ['box', 'Box Breathing'],
      ['467', '4-6-7 Breathing'],
      ['breath-retention', 'Breath Retention'],
    ]);
  });

  it('offers 3 to 8 seconds per phase as its tempo, defaulting to 5', () => {
    const box = choice('box');
    expect(box.tempos.map(({ id, label }) => [id, label])).toEqual([
      ['3', '3 s per phase'],
      ['4', '4 s per phase'],
      ['5', '5 s per phase'],
      ['7', '7 s per phase'],
      ['8', '8 s per phase'],
    ]);
    expect(boxPhaseChoices).toEqual([3, 4, 5, 7, 8]);
    expect(box.defaultTempoId).toBe(String(defaultBoxPhase));
    expect(defaultBoxPhase).toBe(5);
  });

  it.each(boxPhaseChoices)('runs %i s phases of as many counts, one count per real second, with ticks', (n) => {
    const preset = choice('box').tempos.find(({ id }) => id === String(n))!.build(defaultBreathCount);
    expect(preset.name).toBe('Box Breathing');
    expect(preset.phases.map(({ seconds }) => seconds)).toEqual([n, n, n, n]);
    expect(preset.countSeconds).toBe(1);
    expect(preset.ticks).toBe(true);
    expect(new BreathingEngine(preset).cycleMs).toBe(n * 4 * 1000);
  });
});

describe('Balanced Breathing presets', () => {
  it('offers 4 to 7 seconds per phase as its tempo, defaulting to 5.5', () => {
    const balanced = choice('balanced');
    expect(balanced.tempos.map(({ id, label }) => [id, label])).toEqual([
      ['4', '4 s per phase'],
      ['5', '5 s per phase'],
      ['5.5', '5.5 s per phase'],
      ['6', '6 s per phase'],
      ['7', '7 s per phase'],
    ]);
    expect(balancedPhaseChoices).toEqual([4, 5, 5.5, 6, 7]);
    expect(balanced.defaultTempoId).toBe(String(defaultBalancedPhase));
    expect(defaultBalancedPhase).toBe(5.5);
  });

  it.each(balancedPhaseChoices)('runs %s s in and out with no holds', (n) => {
    const preset = choice('balanced').tempos.find(({ id }) => id === String(n))!.build(defaultBreathCount);
    expect(preset.name).toBe('Balanced Breathing');
    expect(preset.phases.map(({ kind, seconds, fill }) => [kind, seconds, fill])).toEqual([
      ['inhale', n, [0, 1]],
      ['exhale', n, [1, 0]],
    ]);
    expect(preset.ticks).toBe(true);
    expect(new BreathingEngine(preset).cycleMs).toBe(n * 2 * 1000);
  });

  it('ticks once per second at whole lengths and evenly every 1.1 s at 5.5 s', () => {
    expect(balancedPreset(6).countSeconds).toBe(1);
    expect(balancedPreset(5.5).countSeconds).toBeCloseTo(1.1, 10);
    const engine = new BreathingEngine(balancedPreset(5.5));
    const ticks = engine.cuesBetween(0, 5_500).filter(({ type }) => type === 'tick');
    expect(ticks.map(({ atMs }) => atMs)).toEqual([1_100, 2_200, 3_300, 4_400].map((ms) => expect.closeTo(ms, 6)));
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

  it('offers Slow, Normal, and Fast for 4-6-7 and Breath Retention, defaulting to Normal', () => {
    for (const id of ['467', 'breath-retention']) {
      expect(choice(id).tempos.map(({ id }) => id)).toEqual(['slow', 'normal', 'fast']);
      expect(choice(id).defaultTempoId).toBe('normal');
    }
    expect(choice('467').tempos.map(({ label }) => label)).toEqual(tempoChoices.map(({ label }) => label));
    const fast = choice('467').tempos.find(({ id }) => id === 'fast')!.build(defaultBreathCount);
    expect(fast.countSeconds).toBeCloseTo(0.8, 10);
  });

  it('leaves kind, fill, and proportions untouched', () => {
    for (const preset of cyclicPresets) {
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

  it('records the count length and keeps the ticks flag', () => {
    for (const preset of cyclicPresets) {
      expect(preset.countSeconds).toBe(1);
      expect(preset.ticks).toBe(true);
    }
    const slow = applyTempo(preset467, tempoSlow);
    expect(slow.countSeconds).toBe(1.25);
    expect(slow.ticks).toBe(true);
    expect(applyTempo({ ...preset467, ticks: false }, tempoFast).ticks).toBe(false);
    expect(applyTempo(preset467, tempoFast).countSeconds).toBeCloseTo(0.8, 10);
  });

  it('does not mutate the counts-authored catalog preset', () => {
    applyTempo(preset467, tempoSlow);
    expect(durations(preset467)).toEqual([4, 6, 7]);
  });

  it('reproduces the current durations exactly at Normal tempo', () => {
    for (const preset of [...cyclicPresets, breathRetentionPreset(defaultBreathCount)]) {
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
      const engine = new BreathingEngine(applyTempo(preset467, tempo), clock);
      engine.start();
      clock.advance(60_000);
      expect(engine.signal()!.sessionElapsedSeconds).toBeCloseTo(60, 10);
    }
  });
});

describe('cuesBetween', () => {
  const summary = (engine: BreathingEngine, from: number, to: number) =>
    engine.cuesBetween(from, to).map(({ atMs, type, kind }) => [Math.round(atMs), type, kind]);

  it('lists phase and tick cues for one 4-6-7 cycle at Normal tempo', () => {
    const engine = new BreathingEngine(applyTempo(preset467, tempoNormal));
    const cues = engine.cuesBetween(0, 17_000);
    expect(cues.filter((c) => c.type === 'phase').map((c) => [c.atMs, c.kind])).toEqual([
      [0, 'inhale'],
      [4_000, 'hold'],
      [10_000, 'exhale'],
    ]);
    expect(cues.filter((c) => c.type === 'tick').map((c) => c.atMs / 1000)).toEqual([
      1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16,
    ]);
    expect(cues.map((c) => c.atMs)).toEqual([...cues.map((c) => c.atMs)].sort((a, b) => a - b));
  });

  it('crosses several cycle boundaries', () => {
    const engine = new BreathingEngine(boxPreset(4));
    const phases = engine.cuesBetween(15_500, 48_500).filter((c) => c.type === 'phase');
    expect(phases.map((c) => c.atMs / 1000)).toEqual([16, 20, 24, 28, 32, 36, 40, 44, 48]);
    expect(phases[0]!.kind).toBe('inhale');
  });

  it('spaces ticks by the tempo count length', () => {
    const engine = new BreathingEngine(applyTempo(preset467, tempoSlow));
    expect(summary(engine, 0, 5_000)).toEqual([
      [0, 'phase', 'inhale'],
      [1_250, 'tick', 'inhale'],
      [2_500, 'tick', 'inhale'],
      [3_750, 'tick', 'inhale'],
    ]);
    // Fast: float count lengths must not leak a tick onto the next phase start.
    const fast = new BreathingEngine(applyTempo(preset467, tempoFast));
    const ticks = fast.cuesBetween(0, 13_600).filter((c) => c.type === 'tick');
    expect(ticks).toHaveLength(14);
  });

  it('includes a cue at fromMs, excludes one at toMs, and handles empty intervals', () => {
    const engine = new BreathingEngine(applyTempo(preset467, tempoNormal));
    expect(summary(engine, 4_000, 5_000)).toEqual([[4_000, 'phase', 'hold']]);
    expect(summary(engine, 3_500, 4_000)).toEqual([]);
    expect(engine.cuesBetween(2_000, 2_000)).toEqual([]);
    expect(engine.cuesBetween(3_000, 1_000)).toEqual([]);
  });

  it('emits only phase cues when the preset has ticks disabled', () => {
    const engine = new BreathingEngine({ ...preset467, ticks: false });
    expect(engine.cuesBetween(0, 17_000).map((c) => c.type)).toEqual(['phase', 'phase', 'phase']);
  });
});

describe('Breath Retention preset', () => {
  const fullBreath = (preset: Preset) => preset.phases[0]!.seconds + preset.phases[1]!.seconds;

  it('keeps fixed phases and the open hold unscaled by the tempo', () => {
    for (const tempo of [tempoSlow, tempoFast]) {
      const scaled = applyTempo(presetBreathRetention(), tempo);
      const hold = scaled.phases.find(({ fixed }) => fixed)!;
      const retention = scaled.phases.find(({ role }) => role === 'retention')!;
      expect(hold.seconds).toBe(15);
      expect(retention.seconds).toBe(0);
    }
  });

  it('builds N breaths in and out, the hold, and the recovery breath', () => {
    const preset = breathRetentionPreset(30);
    const breathing = preset.phases.filter(({ role }) => role === 'breath');
    expect(breathing).toHaveLength(60);
    expect(breathing.slice(0, 2).map(({ kind }) => kind)).toEqual(['inhale', 'exhale']);
    expect(preset.phases.slice(60).map(({ kind, role, seconds }) => [kind, role, seconds])).toEqual([
      ['hold', 'retention', 0],
      ['inhale', undefined, 1.75],
      ['hold', undefined, 15],
      ['exhale', undefined, 1.75],
    ]);
    expect(preset.ticks).toBe(false);
    expect(preset.phases[62]!.ticks).toBe(true);
    expect(hasRetention(preset)).toBe(true);
    expect(hasRetention(preset467)).toBe(false);
  });

  it('offers 20 to 40 breaths in steps of 5, defaulting to 30', () => {
    expect(breathCountChoices).toEqual([20, 25, 30, 35, 40]);
    expect(defaultBreathCount).toBe(30);
    const normal = choice('breath-retention').tempos.find(({ id }) => id === 'normal')!;
    expect(normal.build(defaultBreathCount).phases.filter(({ role }) => role === 'breath')).toHaveLength(60);
    expect(normal.build(20).phases.filter(({ role }) => role === 'breath')).toHaveLength(40);
  });

  it('scales a full breath to 4.375 / 3.5 / 2.8 s with the existing tempo multipliers', () => {
    const preset = breathRetentionPreset(30);
    expect(fullBreath(applyTempo(preset, tempoSlow))).toBeCloseTo(4.375, 10);
    expect(fullBreath(applyTempo(preset, tempoNormal))).toBeCloseTo(3.5, 10);
    expect(fullBreath(applyTempo(preset, tempoFast))).toBeCloseTo(2.8, 10);
  });

  it('labels tempos without the count length for Breath Retention only', () => {
    expect(choice('breath-retention').tempos.map(({ label }) => label)).toEqual(['Slow', 'Normal', 'Fast']);
    expect(choice('467').tempos[0]!.label).toBe('Slow (1.25 s per count)');
    const slow = choice('breath-retention').tempos[0]!.build(30);
    expect(fullBreath(slow)).toBeCloseTo(4.375, 10);
  });
});

function presetBreathRetention(): Preset {
  return breathRetentionPreset(defaultBreathCount);
}

describe('Breath Retention rounds', () => {
  // Normal tempo, 20 breaths: breathing 0..70 s, then the hold.
  const BREATHING_MS = 20 * 3_500;
  const setup = () => {
    const clock = new FakeClock();
    const engine = new BreathingEngine(applyTempo(breathRetentionPreset(20), tempoNormal), clock);
    engine.start();
    return { clock, engine };
  };

  it('counts breaths and roles through the breathing part', () => {
    const { engine } = setup();
    const first = engine.signalAt(0);
    expect([first.role, first.kind, first.breath, first.breaths]).toEqual(['breath', 'inhale', 1, 20]);
    const out = engine.signalAt(2_000);
    expect([out.kind, out.breath]).toEqual(['exhale', 1]);
    expect(engine.signalAt(16 * 3_500 + 100).breath).toBe(17);
    expect(engine.signalAt(BREATHING_MS - 1).breath).toBe(20);
  });

  it('counts the open hold up past 10 minutes', () => {
    const { engine } = setup();
    const hold = engine.signalAt(BREATHING_MS + 11 * 60_000);
    expect([hold.role, hold.kind, hold.open, hold.breath]).toEqual(['retention', 'hold', true, 0]);
    expect(hold.phaseElapsed).toBeCloseTo(660, 6);
    expect(hold.phaseRemaining).toBe(0);
    expect(hold.fill).toBe(0);
    expect(hold.completed).toBe(0);
  });

  it('reports completed equal to cycles for fixed-cycle presets', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    for (const ms of [0, 17_000, 40_000]) {
      const s = engine.signalAt(ms);
      expect(s.completed).toBe(s.cycles);
      expect([s.role, s.open, s.breath]).toEqual([null, false, 0]);
    }
  });

  it('starts the recovery when the hold ends and repeats the round', () => {
    const { clock, engine } = setup();
    clock.advance(BREATHING_MS + 92_000);
    expect(engine.endRetention()).toBe(BREATHING_MS + 92_000);
    expect(engine.holds).toEqual([92]);

    const recovery = engine.signal()!;
    expect([recovery.kind, recovery.role, recovery.completed, recovery.cycles]).toEqual(['inhale', null, 1, 0]);
    expect(recovery.phaseElapsed).toBeCloseTo(0, 10);

    clock.advance(1_750 + 5_000); // 5 s into the 15 s recovery hold
    const hold = engine.signal()!;
    expect([hold.kind, hold.open, hold.tickSeconds]).toEqual(['hold', false, 1]);
    expect(hold.phaseRemaining).toBeCloseTo(10, 6);

    clock.advance(10_000 + 1_750); // recovery breath out ends
    const next = engine.signal()!;
    expect([next.role, next.kind, next.breath, next.cycles, next.completed]).toEqual(['breath', 'inhale', 1, 1, 1]);
  });

  it('ignores endRetention outside the hold or while paused', () => {
    const { clock, engine } = setup();
    expect(engine.endRetention()).toBeNull(); // breathing part
    clock.advance(BREATHING_MS + 1_000);
    engine.pause();
    expect(engine.endRetention()).toBeNull();
    engine.resume();
    expect(engine.endRetention()).not.toBeNull();
    expect(engine.endRetention()).toBeNull(); // already in the recovery
    expect(engine.holds).toEqual([1]);
    expect(new BreathingEngine(preset467, new FakeClock()).endRetention()).toBeNull();
  });

  it('does not record a hold that is still running, and reset clears the holds', () => {
    const { clock, engine } = setup();
    clock.advance(BREATHING_MS + 30_000);
    engine.endRetention();
    clock.advance(1_750 + 15_000 + 1_750 + BREATHING_MS + 40_000); // second hold, 40 s in
    expect(engine.signal()!.open).toBe(true);
    expect(engine.holds).toEqual([30]);
    expect(engine.signal()!.completed).toBe(1);
    engine.reset();
    expect(engine.holds).toEqual([]);
  });
});

describe('Breath Retention cues', () => {
  const BREATHING_MS = 20 * 3_500;
  const setup = () => {
    const clock = new FakeClock();
    const engine = new BreathingEngine(applyTempo(breathRetentionPreset(20), tempoNormal), clock);
    engine.start();
    return { clock, engine };
  };

  it('lists one breath cue per breath in and a phase cue for the hold and each recovery phase', () => {
    const { clock, engine } = setup();
    clock.advance(BREATHING_MS + 125_000);
    const holdEnd = engine.endRetention()!;
    const cues = engine.cuesBetween(0, holdEnd + 18_500);
    const breaths = cues.filter((c) => c.type === 'breath');
    expect(breaths.map((c) => c.atMs)).toEqual(Array.from({ length: 20 }, (_, i) => i * 3_500));
    expect(cues.filter((c) => c.type === 'phase').map((c) => [c.atMs, c.kind])).toEqual([
      [BREATHING_MS, 'hold'],
      [holdEnd, 'inhale'],
      [holdEnd + 1_750, 'hold'],
      [holdEnd + 16_750, 'exhale'],
    ]);
    expect(cues.filter((c) => c.type === 'hold-minute').map((c) => [c.atMs, c.minute])).toEqual([
      [BREATHING_MS + 60_000, 1],
      [BREATHING_MS + 120_000, 2],
    ]);
    // Recovery hold ticks once per real second, 14 inside the 15 s hold.
    const ticks = cues.filter((c) => c.type === 'tick');
    expect(ticks.map((c) => c.atMs - holdEnd - 1_750)).toEqual(Array.from({ length: 14 }, (_, i) => (i + 1) * 1_000));
    expect(cues.map((c) => c.atMs)).toEqual([...cues.map((c) => c.atMs)].sort((a, b) => a - b));
  });

  it('lists full hold minutes up to the window end while the hold is running', () => {
    const { engine } = setup();
    const cues = engine.cuesBetween(BREATHING_MS + 58_500, BREATHING_MS + 181_000);
    expect(cues.map((c) => [c.type, c.minute])).toEqual([
      ['hold-minute', 1],
      ['hold-minute', 2],
      ['hold-minute', 3],
    ]);
    expect(engine.cuesBetween(BREATHING_MS, BREATHING_MS + 59_999).filter((c) => c.type === 'hold-minute')).toEqual([]);
  });

  it('starts the queue after endRetention with the recovery inhale cue', () => {
    const { clock, engine } = setup();
    clock.advance(BREATHING_MS + 59_500);
    const holdEnd = engine.endRetention()!;
    expect(holdEnd).toBe(engine.sessionElapsedMs());
    const cues = engine.cuesBetween(holdEnd, holdEnd + 5_000);
    expect(cues[0]).toEqual({ atMs: holdEnd, type: 'phase', kind: 'inhale' });
    expect(cues.some((c) => c.type === 'hold-minute')).toBe(false);
  });
});

describe('startAt (debug)', () => {
  it('starts a running session at the given session time from idle, running, or paused', () => {
    const clock = new FakeClock();
    const engine = new BreathingEngine(preset467, clock);
    engine.startAt(4_000); // 4-6-7: the hold starts at 4 s
    expect(engine.state).toBe('running');
    expect(engine.sessionElapsedMs()).toBe(4_000);
    expect(engine.signal()!.kind).toBe('hold');

    clock.advance(1_000);
    engine.startAt(10_000); // running: the exhale
    expect(engine.signal()!.kind).toBe('exhale');
    clock.advance(500);
    expect(engine.sessionElapsedMs()).toBe(10_500);

    engine.pause();
    engine.startAt(0);
    expect(engine.state).toBe('running');
    expect(engine.signal()!.kind).toBe('inhale');
  });

  it('places a Breath Retention session in the recovery with a recorded hold', () => {
    const clock = new FakeClock();
    const engine = new BreathingEngine(applyTempo(breathRetentionPreset(20), tempoNormal), clock);
    const recoveryStart = 20 * 3_500 + 60_000;
    engine.startAt(recoveryStart + 1_750, [60_000]); // the recovery hold
    const s = engine.signal()!;
    expect([s.kind, s.role, s.completed]).toEqual(['hold', null, 1]);
    expect(engine.holds).toEqual([60]);
    expect(engine.cuesBetween(recoveryStart + 1_750, recoveryStart + 1_751)[0]).toEqual({
      atMs: recoveryStart + 1_750,
      type: 'phase',
      kind: 'hold',
    });
  });

  it('drops the holds of an earlier session', () => {
    const clock = new FakeClock();
    const engine = new BreathingEngine(applyTempo(breathRetentionPreset(20), tempoNormal), clock);
    engine.startAt(0, [60_000]);
    engine.startAt(0);
    expect(engine.holds).toEqual([]);
  });
});
