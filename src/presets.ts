export type PhaseKind = 'inhale' | 'hold' | 'exhale';

/**
 * One phase of a breathing preset.
 *
 * `seconds` is authored in counts in the catalog below (a count equals one
 * second at Normal tempo). `applyTempo` is the single boundary that turns
 * counts into real seconds: the engine only ever receives a tempo-resolved
 * preset, so inside the engine `seconds` always means real seconds.
 *
 * `fill` is the lung-fill level the phase animates between: the first value is
 * the fill at phase start, the second the fill at phase end. Hold phases keep
 * the fill constant (e.g. [1, 1] for a hold with full lungs).
 */
export interface Phase {
  kind: PhaseKind;
  seconds: number;
  fill: readonly [number, number];
}

export interface Preset {
  name: string;
  phases: readonly Phase[];
}

/** 4-6-7 breathing: inhale 4 counts, hold with full lungs 6, exhale 7. */
export const preset467: Preset = {
  name: '4-6-7',
  phases: [
    { kind: 'inhale', seconds: 4, fill: [0, 1] },
    { kind: 'hold', seconds: 6, fill: [1, 1] },
    { kind: 'exhale', seconds: 7, fill: [1, 0] },
  ],
};

function boxPreset(counts: number): Preset {
  return {
    name: `Box Breathing (${counts} counts per phase)`,
    phases: [
      { kind: 'inhale', seconds: counts, fill: [0, 1] },
      { kind: 'hold', seconds: counts, fill: [1, 1] },
      { kind: 'exhale', seconds: counts, fill: [1, 0] },
      { kind: 'hold', seconds: counts, fill: [0, 0] },
    ],
  };
}

export const presetBox4 = boxPreset(4);
export const presetBox5 = boxPreset(5);
export const presetBox7 = boxPreset(7);

export interface PresetChoice {
  id: string;
  label: string;
  preset: Preset;
}

/** Ordered UI catalog; the first entry is the default selection. */
export const presetChoices: readonly PresetChoice[] = [
  { id: '467', label: '4-6-7', preset: preset467 },
  { id: 'box-4', label: presetBox4.name, preset: presetBox4 },
  { id: 'box-5', label: presetBox5.name, preset: presetBox5 },
  { id: 'box-7', label: presetBox7.name, preset: presetBox7 },
];

/** Playback tempo: the real length, in seconds, of one counted second. */
export interface Tempo {
  id: string;
  label: string;
  secondLength: number;
}

function tempo(id: string, name: string, secondLength: number): Tempo {
  return { id, label: `${name} (${secondLength} s per count)`, secondLength };
}

export const tempoSlow = tempo('slow', 'Slow', 1.25);
export const tempoNormal = tempo('normal', 'Normal', 1);
export const tempoFast = tempo('fast', 'Fast', 0.8);

/** Ordered UI catalog, slowest first; Normal is the default selection. */
export const tempoChoices: readonly Tempo[] = [tempoSlow, tempoNormal, tempoFast];
export const defaultTempo = tempoNormal;

/** Resolves a counts-authored preset into real seconds at the given tempo. */
export function applyTempo(preset: Preset, tempo: Tempo): Preset {
  return {
    name: preset.name,
    phases: preset.phases.map((phase) => ({
      ...phase,
      seconds: phase.seconds * tempo.secondLength,
    })),
  };
}
