export type PhaseKind = 'inhale' | 'hold' | 'exhale';

/**
 * Breath Retention parts drawn differently from regular phases: `breath` for
 * the fast breathing part, `retention` for the hold the user ends.
 */
export type PhaseRole = 'breath' | 'retention';

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
  /** Unused for a `retention` phase: it lasts until the user ends it. */
  seconds: number;
  fill: readonly [number, number];
  role?: PhaseRole;
  /** Real seconds the tempo never scales; ticks once per real second. */
  fixed?: boolean;
  /** Overrides the preset's `ticks` flag for this phase. */
  ticks?: boolean;
}

export interface Preset {
  name: string;
  phases: readonly Phase[];
  /** Real length of one count in seconds; 1 in the catalog, set by `applyTempo`. */
  countSeconds: number;
  /** Whether the preset shows tick marks, flashes, and plays in-phase ticks. */
  ticks: boolean;
}

/** 4-6-7 breathing: inhale 4 counts, hold with full lungs 6, exhale 7. */
export const preset467: Preset = {
  name: '4-6-7',
  phases: [
    { kind: 'inhale', seconds: 4, fill: [0, 1] },
    { kind: 'hold', seconds: 6, fill: [1, 1] },
    { kind: 'exhale', seconds: 7, fill: [1, 0] },
  ],
  countSeconds: 1,
  ticks: true,
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
    countSeconds: 1,
    ticks: true,
  };
}

export const presetBox4 = boxPreset(4);
export const presetBox5 = boxPreset(5);
export const presetBox7 = boxPreset(7);

/** One full breath (in and out) of Breath Retention at Normal tempo, in counts. */
export const BREATH_COUNTS = 3.5;
export const breathCountChoices: readonly number[] = [20, 25, 30, 35, 40];
export const defaultBreathCount = 30;

/**
 * Breath Retention: `breaths` fast breaths, a hold with empty lungs that the
 * user ends, then a recovery breath in, a fixed 15 s hold, and a breath out.
 * Only the recovery hold shows ticks (one per real second).
 */
export function breathRetentionPreset(breaths: number): Preset {
  const half = BREATH_COUNTS / 2;
  const breathing = Array.from({ length: breaths }, (): Phase[] => [
    { kind: 'inhale', seconds: half, fill: [0, 1], role: 'breath' },
    { kind: 'exhale', seconds: half, fill: [1, 0], role: 'breath' },
  ]).flat();
  return {
    name: 'Breath Retention',
    phases: [
      ...breathing,
      { kind: 'hold', seconds: 0, fill: [0, 0], role: 'retention' },
      { kind: 'inhale', seconds: half, fill: [0, 1] },
      { kind: 'hold', seconds: 15, fill: [1, 1], fixed: true, ticks: true },
      { kind: 'exhale', seconds: half, fill: [1, 0] },
    ],
    countSeconds: 1,
    ticks: false,
  };
}

export const presetBreathRetention = breathRetentionPreset(defaultBreathCount);

/** Whether the preset has a hold the user ends (Breath Retention). */
export function hasRetention(preset: Preset): boolean {
  return preset.phases.some(({ role }) => role === 'retention');
}

export interface PresetChoice {
  id: string;
  label: string;
  preset: Preset;
}

export const BREATH_RETENTION_ID = 'breath-retention';

/** Ordered UI catalog; the first entry is the default selection. */
export const presetChoices: readonly PresetChoice[] = [
  { id: '467', label: '4-6-7', preset: preset467 },
  { id: 'box-4', label: presetBox4.name, preset: presetBox4 },
  { id: 'box-5', label: presetBox5.name, preset: presetBox5 },
  { id: 'box-7', label: presetBox7.name, preset: presetBox7 },
  { id: BREATH_RETENTION_ID, label: presetBreathRetention.name, preset: presetBreathRetention },
];

/** Playback tempo: the real length, in seconds, of one counted second. */
export interface Tempo {
  id: string;
  /** Slow, Normal, or Fast. */
  name: string;
  /** Name with the count length, for the cyclic presets. */
  label: string;
  secondLength: number;
}

function tempo(id: string, name: string, secondLength: number): Tempo {
  return { id, name, label: `${name} (${secondLength} s per count)`, secondLength };
}

/** Tempo choice text: Breath Retention shows no count length. */
export function tempoLabel(tempo: Tempo, preset: Preset): string {
  return hasRetention(preset) ? tempo.name : tempo.label;
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
    ...preset,
    phases: preset.phases.map((phase) => ({
      ...phase,
      seconds: phase.fixed ? phase.seconds : phase.seconds * tempo.secondLength,
    })),
    countSeconds: preset.countSeconds * tempo.secondLength,
  };
}
