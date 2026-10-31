import { describe, expect, it } from 'vitest';
import { breathCountChoices, presetChoices } from './presets';
import { formatSettings, parseSettings, type CurrentSettings } from './url-settings';

const defaults: CurrentSettings = { presetId: 'balanced', tempoId: '5.5', breaths: 30, sound: true, theme: null };

describe('parseSettings', () => {
  it('reads a full setup', () => {
    expect(parseSettings('?pattern=breath-retention&tempo=slow&breaths=40&sound=off&theme=night')).toEqual({
      presetId: 'breath-retention',
      tempoId: 'slow',
      breaths: 40,
      sound: false,
      theme: 'night',
    });
  });

  it('returns nothing for an empty query', () => {
    expect(parseSettings('')).toEqual({});
  });

  it('takes a phase length or a tempo name, by pattern', () => {
    expect(parseSettings('?pattern=balanced&tempo=6')).toEqual({ presetId: 'balanced', tempoId: '6' });
    expect(parseSettings('?pattern=467&tempo=fast')).toEqual({ presetId: '467', tempoId: 'fast' });
  });

  it('checks a tempo without a pattern against the default pattern', () => {
    expect(parseSettings('?tempo=4')).toEqual({ tempoId: '4' });
    expect(parseSettings('?tempo=slow')).toEqual({});
  });

  it('ignores each invalid value on its own', () => {
    expect(parseSettings('?pattern=square&sound=off')).toEqual({ sound: false });
    expect(parseSettings('?pattern=box&tempo=slow')).toEqual({ presetId: 'box' });
    expect(parseSettings('?pattern=breath-retention&breaths=33')).toEqual({ presetId: 'breath-retention' });
    expect(parseSettings('?breaths=40.0&sound=mute&theme=dark&other=1')).toEqual({});
  });

  it('keeps a breath count without Breath Retention', () => {
    expect(parseSettings('?pattern=box&breaths=40')).toEqual({ presetId: 'box', breaths: 40 });
  });
});

describe('formatSettings', () => {
  it('writes pattern and tempo, and no defaults for sound and theme', () => {
    expect(formatSettings({ ...defaults, presetId: 'box', tempoId: '5' }, '')).toBe('?pattern=box&tempo=5');
  });

  it('writes the breath count for Breath Retention only', () => {
    expect(formatSettings({ ...defaults, presetId: 'breath-retention', tempoId: 'normal', breaths: 35 }, '')).toBe(
      '?pattern=breath-retention&tempo=normal&breaths=35',
    );
    expect(formatSettings({ ...defaults, breaths: 35 }, '')).toBe('?pattern=balanced&tempo=5.5');
  });

  it('writes sound off and a theme override', () => {
    expect(formatSettings({ ...defaults, sound: false, theme: 'night' }, '')).toBe(
      '?pattern=balanced&tempo=5.5&sound=off&theme=night',
    );
    expect(formatSettings({ ...defaults, theme: 'day' }, '')).toBe('?pattern=balanced&tempo=5.5&theme=day');
  });

  it('keeps other parameters first and replaces old settings', () => {
    expect(formatSettings(defaults, '?ref=home&pattern=box&sound=off')).toBe('?ref=home&pattern=balanced&tempo=5.5');
  });

  it('round-trips every pattern and tempo in the catalog', () => {
    for (const preset of presetChoices) {
      for (const tempo of preset.tempos) {
        for (const breaths of breathCountChoices) {
          const settings: CurrentSettings = {
            presetId: preset.id,
            tempoId: tempo.id,
            breaths,
            sound: false,
            theme: 'day',
          };
          const parsed = parseSettings(formatSettings(settings, ''));
          expect(parsed.presetId).toBe(preset.id);
          expect(parsed.tempoId).toBe(tempo.id);
          expect(parsed.sound).toBe(false);
          expect(parsed.theme).toBe('day');
          if (preset.id === 'breath-retention') expect(parsed.breaths).toBe(breaths);
        }
      }
    }
  });
});
