import { breathCountChoices, BREATH_RETENTION_ID, presetChoices } from './presets';
import type { Theme } from './theme';

/** The settings a URL can carry; each field is present only when valid. */
export interface UrlSettings {
  presetId?: string;
  tempoId?: string;
  breaths?: number;
  sound?: boolean;
  theme?: Theme;
}

/** The current settings, as the URL is written from them. */
export interface CurrentSettings {
  presetId: string;
  tempoId: string;
  breaths: number;
  sound: boolean;
  /** The night mode override; null while the system preference applies. */
  theme: Theme | null;
}

const KEYS = ['pattern', 'tempo', 'breaths', 'sound', 'theme'] as const;

/**
 * Reads the settings from a query string. Each parameter is checked on its
 * own; an invalid one is left out, so the app uses that setting's default.
 */
export function parseSettings(search: string): UrlSettings {
  const params = new URLSearchParams(search);
  const settings: UrlSettings = {};

  const preset = presetChoices.find(({ id }) => id === params.get('pattern'));
  if (preset) settings.presetId = preset.id;
  // A tempo is checked against the pattern it will be used with.
  const tempoPattern = preset ?? presetChoices[0]!;
  const tempo = tempoPattern.tempos.find(({ id }) => id === params.get('tempo'));
  if (tempo) settings.tempoId = tempo.id;

  const breaths = params.get('breaths');
  if (breaths !== null && breathCountChoices.some((b) => String(b) === breaths)) settings.breaths = Number(breaths);

  const sound = params.get('sound');
  if (sound === 'on' || sound === 'off') settings.sound = sound === 'on';

  const theme = params.get('theme');
  if (theme === 'day' || theme === 'night') settings.theme = theme;

  return settings;
}

/**
 * The query string for the current settings, keeping any other parameters of
 * `currentSearch` first and in order. Defaults for sound and theme are left
 * out; the breath count is written for Breath Retention only.
 */
export function formatSettings(settings: CurrentSettings, currentSearch: string): string {
  const params = new URLSearchParams(currentSearch);
  for (const key of KEYS) params.delete(key);
  params.set('pattern', settings.presetId);
  params.set('tempo', settings.tempoId);
  if (settings.presetId === BREATH_RETENTION_ID) params.set('breaths', String(settings.breaths));
  if (!settings.sound) params.set('sound', 'off');
  if (settings.theme) params.set('theme', settings.theme);
  return `?${params}`;
}
