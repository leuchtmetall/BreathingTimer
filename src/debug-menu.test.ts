import { describe, expect, it } from 'vitest';
import { jumpTargets } from './debug-menu';
import { BreathingEngine } from './engine';
import {
  applyTempo,
  balancedPreset,
  boxPreset,
  breathRetentionPreset,
  preset467,
  tempoFast,
  tempoNormal,
} from './presets';

/** Where a jump lands, as the engine sees it. */
function landing(engine: BreathingEngine, sessionMs: number, holdsMs: readonly number[]) {
  engine.startAt(sessionMs, holdsMs);
  const s = engine.signalAt(sessionMs);
  return { kind: s.kind, role: s.role, phaseIndex: s.phaseIndex, elapsed: Math.round(s.phaseElapsed * 1000) };
}

describe('jumpTargets', () => {
  it('offers each cyclic phase at its start and 3 s before its end', () => {
    expect(jumpTargets(applyTempo(balancedPreset(5.5), tempoNormal))).toHaveLength(4);
    expect(jumpTargets(applyTempo(boxPreset(5), tempoNormal))).toHaveLength(8);
    const preset = applyTempo(preset467, tempoNormal);
    const targets = jumpTargets(preset);
    expect(targets.map((t) => t.label)).toEqual([
      'Breathe in · start',
      'Breathe in · −3 s',
      'Hold · start',
      'Hold · −3 s',
      'Breathe out · start',
      'Breathe out · −3 s',
    ]);
    const engine = new BreathingEngine(preset);
    const landed = targets.map((t) => landing(engine, t.sessionMs, t.holdsMs));
    expect(landed.map((l) => [l.phaseIndex, l.elapsed])).toEqual([
      [0, 0],
      [0, 1_000],
      [1, 0],
      [1, 3_000],
      [2, 0],
      [2, 4_000],
    ]);
    expect(targets.every((t) => t.holdsMs.length === 0)).toBe(true);
  });

  it('offers the Breath Retention parts, the hold minute, and the recovery', () => {
    const preset = applyTempo(breathRetentionPreset(20), tempoNormal);
    const targets = jumpTargets(preset);
    expect(targets.map((t) => t.label)).toEqual([
      'Breathing · start',
      'Breathing · −3 s',
      'Hold · start',
      'Hold · 0:57',
      'Recovery breathe in · start',
      'Recovery breathe in · −3 s',
      'Recovery hold · start',
      'Recovery hold · −3 s',
      'Recovery breathe out · start',
      'Recovery breathe out · −3 s',
    ]);
    const engine = new BreathingEngine(preset);
    const landed = targets.map((t) => landing(engine, t.sessionMs, t.holdsMs));
    expect(landed.map((l) => [l.kind, l.role])).toEqual([
      ['inhale', 'breath'],
      ['inhale', 'breath'],
      ['hold', 'retention'],
      ['hold', 'retention'],
      ['inhale', null],
      ['inhale', null],
      ['hold', null],
      ['hold', null],
      ['exhale', null],
      ['exhale', null],
    ]);
    expect([landed[1]!.phaseIndex, landed[1]!.elapsed]).toEqual([38, 500]); // in the last breath
    expect(landed[3]!.elapsed).toBe(57_000);
    expect(landed[7]!.elapsed).toBe(12_000);
    expect(targets.slice(4).every((t) => t.holdsMs.join() === '60000')).toBe(true);
    expect(targets.slice(0, 4).every((t) => t.holdsMs.length === 0)).toBe(true);
  });

  it('lands short phases on their start', () => {
    const targets = jumpTargets(applyTempo(breathRetentionPreset(20), tempoFast));
    const at = (label: string) => targets.find((t) => t.label === label)!.sessionMs;
    expect(at('Recovery breathe in · −3 s')).toBe(at('Recovery breathe in · start'));
    expect(at('Recovery breathe out · −3 s')).toBe(at('Recovery breathe out · start'));
  });
});
