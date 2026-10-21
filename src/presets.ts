export type PhaseKind = 'inhale' | 'hold' | 'exhale';

/**
 * One phase of a breathing preset.
 *
 * `fill` is the lung-fill level the phase animates between: the first value is
 * the fill at phase start, the second the fill at phase end. Hold phases keep
 * the fill constant (e.g. [1, 1] for a hold with full lungs).
 *
 * Future extensions the engine data shape must admit (see todo backlog):
 * faster/slower seconds per preset, presets with no visual change on holds.
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

/** 4-6-7 breathing: inhale 4 s, hold with full lungs 6 s, exhale 7 s. */
export const preset467: Preset = {
  name: '4-6-7',
  phases: [
    { kind: 'inhale', seconds: 4, fill: [0, 1] },
    { kind: 'hold', seconds: 6, fill: [1, 1] },
    { kind: 'exhale', seconds: 7, fill: [1, 0] },
  ],
};
