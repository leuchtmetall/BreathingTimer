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
  name: '4-6-7 Breathing',
  phases: [
    { kind: 'inhale', seconds: 4, fill: [0, 1] },
    { kind: 'hold', seconds: 6, fill: [1, 1] },
    { kind: 'exhale', seconds: 7, fill: [1, 0] },
  ],
  countSeconds: 1,
  ticks: true,
};

/**
 * Balanced Breathing: inhale and exhale of equal length, no holds. Each phase
 * shows a whole number of evenly spaced ticks, so a 5.5 s phase ticks every
 * 1.1 s rather than once per real second.
 */
export function balancedPreset(seconds: number): Preset {
  return {
    name: 'Balanced Breathing',
    phases: [
      { kind: 'inhale', seconds, fill: [0, 1] },
      { kind: 'exhale', seconds, fill: [1, 0] },
    ],
    countSeconds: seconds / Math.floor(seconds),
    ticks: true,
  };
}

/** Balanced Breathing phase lengths in seconds, offered by the tempo control. */
export const balancedPhaseChoices: readonly number[] = [4, 5, 5.5, 6, 7];
export const defaultBalancedPhase = 5.5;

/** Box Breathing at one count per real second: inhale, hold, exhale, hold. */
export function boxPreset(counts: number): Preset {
  return {
    name: 'Box Breathing',
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

/** Box Breathing phase lengths in seconds, offered by the tempo control. */
export const boxPhaseChoices: readonly number[] = [3, 4, 5, 7, 8];
export const defaultBoxPhase = 5;

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

/** Playback tempo: the real length, in seconds, of one counted second. */
export interface Tempo {
  id: string;
  /** Slow, Normal, or Fast. */
  name: string;
  /** Name with the count length, as 4-6-7 shows it. */
  label: string;
  secondLength: number;
}

function tempo(id: string, name: string, secondLength: number): Tempo {
  return { id, name, label: `${name} (${secondLength} s per count)`, secondLength };
}

export const tempoSlow = tempo('slow', 'Slow', 1.25);
export const tempoNormal = tempo('normal', 'Normal', 1);
export const tempoFast = tempo('fast', 'Fast', 0.8);

/** Ordered Slow/Normal/Fast catalog, slowest first; Normal is the default. */
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

/** One choice of the tempo control; what it offers depends on the pattern. */
export interface TempoChoice {
  id: string;
  label: string;
  /** The session preset in real seconds; `breaths` is used by Breath Retention only. */
  build(breaths: number): Preset;
}

export interface PresetChoice {
  id: string;
  label: string;
  tempos: readonly TempoChoice[];
  defaultTempoId: string;
}

export const BREATH_RETENTION_ID = 'breath-retention';

/**
 * Ordered UI catalog; the first entry is the default selection. Pattern and
 * tempo ids are also the bookmark URL format (`?pattern=box&tempo=5`), so
 * renaming one breaks old bookmarks.
 */
export const presetChoices: readonly PresetChoice[] = [
  {
    id: 'balanced',
    label: 'Balanced Breathing',
    tempos: balancedPhaseChoices.map((seconds) => ({
      id: String(seconds),
      label: `${seconds} s per phase`,
      build: () => balancedPreset(seconds),
    })),
    defaultTempoId: String(defaultBalancedPhase),
  },
  {
    id: 'box',
    label: 'Box Breathing',
    tempos: boxPhaseChoices.map((counts) => ({
      id: String(counts),
      label: `${counts} s per phase`,
      build: () => boxPreset(counts),
    })),
    defaultTempoId: String(defaultBoxPhase),
  },
  {
    id: '467',
    label: preset467.name,
    tempos: tempoChoices.map((t) => ({ id: t.id, label: t.label, build: () => applyTempo(preset467, t) })),
    defaultTempoId: defaultTempo.id,
  },
  {
    id: BREATH_RETENTION_ID,
    label: presetBreathRetention.name,
    tempos: tempoChoices.map((t) => ({
      id: t.id,
      label: t.name,
      build: (breaths) => applyTempo(breathRetentionPreset(breaths), t),
    })),
    defaultTempoId: defaultTempo.id,
  },
];
