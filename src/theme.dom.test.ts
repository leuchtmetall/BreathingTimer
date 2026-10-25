// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NIGHT_QUERY, ThemeController } from './theme';

const css = readFileSync(join(import.meta.dirname, 'style.css'), 'utf8');

/** `--name: value` declarations of the first block matching `selector {`. */
function declarations(selectorPattern: string): Map<string, string> {
  const block = css.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`))?.[1];
  if (block === undefined) throw new Error(`No CSS block for ${selectorPattern}`);
  return new Map(
    Array.from(block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), ([, name, value]) => [
      name!,
      value!.trim(),
    ]),
  );
}

const day = declarations(':root');
// Either quote style, so a CSS reformat cannot hide the night blocks.
const nightOverride = declarations(":root\\[data-theme=[\"']night[\"']\\]");
const nightSystem = declarations(
  "@media \\(prefers-color-scheme: dark\\)\\s*\\{\\s*:root:not\\(\\[data-theme=[\"']day[\"']\\]\\)",
);

const HUES = ['in', 'out', 'hold-full', 'idle', 'breath', 'retention'] as const;

function rgb(hex: string): [number, number, number] {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('Night mode palette (style.css)', () => {
  it('defines a night value for every colour variable declared on :root', () => {
    expect(day.size).toBeGreaterThan(0);
    expect(day.has('--ghost')).toBe(true);
    expect([...nightOverride.keys()].sort()).toEqual([...day.keys()].sort());
    // Both activation paths must resolve to the same palette.
    expect(nightSystem).toEqual(nightOverride);
  });

  it('defines all three shades for every phase hue in both palettes', () => {
    for (const palette of [day, nightOverride]) {
      for (const hue of HUES) {
        for (const suffix of ['', '-dim', '-dark']) {
          expect(palette.get(`--color-${hue}${suffix}`)).toBeDefined();
        }
      }
    }
  });

  it('uses no blue hue anywhere in night mode', () => {
    // Warm ordering (red >= green >= blue) keeps every hue between red and
    // yellow, or neutral; it excludes all blues, cyans, and violets.
    for (const [name, value] of nightOverride) {
      if (name.startsWith('--color-retention')) continue; // the turquoise exception
      const [r, g, b] = rgb(value);
      expect(r >= g && g >= b, `${name} ${value} is not warm`).toBe(true);
    }
  });

  it('keeps the Breath Retention hold turquoise in night mode', () => {
    for (const suffix of ['', '-dim', '-dark']) {
      const [r, g, b] = rgb(nightOverride.get(`--color-retention${suffix}`)!);
      // Turquoise: green and blue close together, both well above red.
      expect(g > r * 1.5 && b > r * 1.5 && Math.abs(g - b) <= g * 0.15, suffix).toBe(true);
    }
  });

  it('keeps the night breathing orange clearly apart from the amber exhale', () => {
    const hue = (hex: string) => {
      const [r, g, b] = rgb(hex).map((c) => c / 255) as [number, number, number];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      // Warm colors only (red is the maximum), so one branch of the hue formula suffices.
      expect(max).toBe(r);
      return (60 * ((g - b) / (max - min)) + 360) % 360;
    };
    const breath = hue(nightOverride.get('--color-breath')!);
    expect(hue(nightOverride.get('--color-out')!) - breath).toBeGreaterThanOrEqual(12);
    expect(breath - hue(nightOverride.get('--color-in')!)).toBeGreaterThanOrEqual(8);
  });

  it('is dimmer than day mode for every variable', () => {
    for (const [name, value] of nightOverride) {
      expect(luminance(value), name).toBeLessThan(luminance(day.get(name)!));
    }
  });

  it('keeps the unfilled outline visibly brighter than the backdrop for every hue', () => {
    for (const palette of [day, nightOverride]) {
      for (const hue of HUES) {
        const dim = palette.get(`--color-${hue}-dim`)!;
        const dark = palette.get(`--color-${hue}-dark`)!;
        expect(luminance(dim)).toBeGreaterThan(luminance(dark));
        expect(contrast(dim, dark), `${hue} dim vs dark`).toBeGreaterThanOrEqual(1.25);
      }
    }
  });

  it('flips the palette in both directions through the data-theme override', () => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const root = document.documentElement;
    const out = () => getComputedStyle(root).getPropertyValue('--color-out').trim();
    try {
      delete root.dataset.theme;
      expect(out()).toBe(day.get('--color-out'));
      root.dataset.theme = 'night';
      expect(out()).toBe(nightOverride.get('--color-out'));
      root.dataset.theme = 'day';
      expect(out()).toBe(day.get('--color-out'));
    } finally {
      style.remove();
      delete root.dataset.theme;
    }
  });
});

/** A MediaQueryList stand-in reporting a fixed system preference. */
function fakeMatchMedia(prefersDark: boolean) {
  const listeners: Array<() => void> = [];
  const list = {
    matches: prefersDark,
    media: NIGHT_QUERY,
    addEventListener: (_type: string, cb: () => void) => listeners.push(cb),
  };
  const matchMedia = vi.fn((_query: string) => list as unknown as MediaQueryList);
  return {
    matchMedia,
    setSystemDark(dark: boolean) {
      list.matches = dark;
      listeners.forEach((cb) => cb());
    },
  };
}

function fixture() {
  const root = document.createElement('div');
  const toggle = document.createElement('button');
  return { root, toggle };
}

describe('ThemeController', () => {
  afterEach(() => vi.restoreAllMocks());

  it('follows a dark system preference with no override', () => {
    const { root, toggle } = fixture();
    const { matchMedia } = fakeMatchMedia(true);
    const controller = new ThemeController(root, toggle, matchMedia);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    expect(controller.theme).toBe('night');
    // The system preference is applied by the CSS media query, not an attribute.
    expect(root.dataset.theme).toBeUndefined();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('follows a light system preference with no override', () => {
    const { root, toggle } = fixture();
    const controller = new ThemeController(root, toggle, fakeMatchMedia(false).matchMedia);
    expect(controller.theme).toBe('day');
    expect(root.dataset.theme).toBeUndefined();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('falls back to day mode when matchMedia is unavailable or throws', () => {
    const missing = fixture();
    expect(new ThemeController(missing.root, missing.toggle, undefined).theme).toBe('day');
    expect(missing.toggle.getAttribute('aria-pressed')).toBe('false');

    const throwing = fixture();
    const broken = () => {
      throw new Error('unsupported');
    };
    expect(new ThemeController(throwing.root, throwing.toggle, broken).theme).toBe('day');
  });

  it('lets the manual override win over the system preference in both directions', () => {
    const dark = fixture();
    const darkSystem = new ThemeController(dark.root, dark.toggle, fakeMatchMedia(true).matchMedia);
    dark.toggle.click();
    expect(darkSystem.theme).toBe('day');
    expect(dark.root.dataset.theme).toBe('day');
    expect(dark.toggle.getAttribute('aria-pressed')).toBe('false');

    const light = fixture();
    const fake = fakeMatchMedia(false);
    const lightSystem = new ThemeController(light.root, light.toggle, fake.matchMedia);
    light.toggle.click();
    expect(lightSystem.theme).toBe('night');
    expect(light.root.dataset.theme).toBe('night');
    // A live system change no longer moves an overridden mode.
    fake.setSystemDark(false);
    expect(lightSystem.theme).toBe('night');
    expect(light.toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('tracks a live system change while there is no override', () => {
    const { root, toggle } = fixture();
    const fake = fakeMatchMedia(false);
    const controller = new ThemeController(root, toggle, fake.matchMedia);
    fake.setSystemDark(true);
    expect(controller.theme).toBe('night');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('starts from a given override whatever the system preference', () => {
    const { root, toggle } = fixture();
    const controller = new ThemeController(root, toggle, fakeMatchMedia(false).matchMedia, 'night');
    expect(controller.theme).toBe('night');
    expect(controller.override).toBe('night');
    expect(root.dataset.theme).toBe('night');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    expect(controller.override).toBe('day');
  });

  it('reports no override until toggled, then follows the toggle', () => {
    const { root, toggle } = fixture();
    const controller = new ThemeController(root, toggle, fakeMatchMedia(true).matchMedia);
    expect(controller.override).toBeNull();
    toggle.click();
    expect(controller.override).toBe('day');
    toggle.click();
    expect(controller.override).toBe('night');
  });

  it('never persists the override, so a fresh init follows the system again', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const cookie = document.cookie;

    const first = fixture();
    const before = new ThemeController(first.root, first.toggle, fakeMatchMedia(true).matchMedia);
    first.toggle.click();
    expect(before.theme).toBe('day');

    // "Reload": a fresh controller on fresh elements with the same system.
    const second = fixture();
    const after = new ThemeController(second.root, second.toggle, fakeMatchMedia(true).matchMedia);
    expect(after.theme).toBe('night');
    expect(second.root.dataset.theme).toBeUndefined();

    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe(cookie);
  });
});
