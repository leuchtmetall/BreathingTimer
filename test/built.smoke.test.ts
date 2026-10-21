// Node-environment test driving the real build artifact: dist/index.html.
// Must run after `npm run build`. Fails with a clear message if it is stale.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const distPath = join(import.meta.dirname, '..', 'dist', 'index.html');

type Frame = () => void;

interface Harness {
  dom: JSDOM;
  stepFrame(): void;
  advance(ms: number): void;
  errors: string[];
}

/** Executes dist/index.html with a fake clock and manually stepped rAF. */
function loadBuiltApp(): Harness {
  const builtAt = statSync(distPath).mtimeMs;
  const sourceAt = sourcesMtime();
  if (builtAt < sourceAt) {
    throw new Error('dist/index.html is stale — run `npm run build` first');
  }

  const html = readFileSync(distPath, 'utf8');
  const errors: string[] = [];
  let virtualNow = 0;
  const frameQueue: Frame[] = [];

  const dom = new JSDOM(html, {
    url: 'file:///BreathingTimer/dist/index.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.performance.now = () => virtualNow;
      window.requestAnimationFrame = ((cb: Frame) => {
        frameQueue.push(cb);
        return frameQueue.length;
      }) as unknown as typeof window.requestAnimationFrame;
      window.addEventListener('error', (e) => errors.push(String(e.error ?? e)));
    },
  });

  // jsdom does not execute <script type="module">; run the exact shipped
  // bundle text manually (the bundle is import-free, so this is faithful).
  const inline = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (!inline) throw new Error('dist/index.html has no inline script');
  dom.window.eval(inline[1]!);

  return {
    dom,
    errors,
    stepFrame(): void {
      const frames = frameQueue.splice(0);
      for (const frame of frames) frame();
    },
    advance(ms: number): void {
      virtualNow += ms;
      this.stepFrame();
    },
  };
}

/** Newest mtime among every source file the build inlines. */
function sourcesMtime(): number {
  const root = join(import.meta.dirname, '..');
  let latest = statSync(join(root, 'index.html')).mtimeMs;
  const base = join(root, 'src');
  for (const f of [
    'main.ts',
    'engine.ts',
    'renderer.ts',
    'presets.ts',
    'theme.ts',
    'sound.ts',
    'style.css',
  ]) {
    latest = Math.max(latest, statSync(join(base, f)).mtimeMs);
  }
  return latest;
}

describe('built single-file app (dist/index.html)', () => {
  it('runs a complete session with zero runtime errors', () => {
    const app = loadBuiltApp();
    const { document } = app.dom.window;
    const label = () => document.querySelector('#phase-label')!.textContent;
    const countdown = () => document.querySelector('#countdown')!.textContent;
    const radius = () => document.querySelector('#ring')!.getAttribute('r');
    const state = () =>
      document.querySelector('#app')!.getAttribute('data-session-state');

    // idle initial frame: base breathing radius, empty arc
    app.stepFrame();
    expect(state()).toBe('idle');
    expect(label()).toBe('Ready');
    expect(radius()).toBe('40.00');

    // start -> inhale grows frame by frame
    (document.querySelector('#start')! as HTMLButtonElement).click();
    app.advance(0);
    expect(state()).toBe('running');
    expect(label()).toBe('Breathe in');
    let last = Number(radius());
    for (let ms = 16; ms <= 4000; ms += 16) {
      app.advance(16);
      expect(Number(radius())).toBeGreaterThanOrEqual(last);
      last = Number(radius());
    }

    // hold keeps the size and shows the label; seconds stay hidden (7s < 10s)
    app.advance(2000); // 2s into hold
    expect(label()).toBe('Hold');
    expect(countdown()).toBe('');
    const heldRadius = Number(radius());
    app.advance(1000);
    expect(Number(radius())).toBeCloseTo(heldRadius, 1);

    // exhale shrinks
    app.advance(5500); // into exhale
    expect(label()).toBe('Breathe out');
    expect(Number(radius())).toBeLessThan(heldRadius);

    // pause freezes both label and shape
    (document.querySelector('#pause')! as HTMLButtonElement).click();
    expect(state()).toBe('paused');
    const pausedLabel = label();
    const pausedRadius = radius();
    app.advance(60_000); // wall time passes while frozen
    expect(label()).toBe(pausedLabel);
    expect(radius()).toBe(pausedRadius);

    // resume continues the exhale
    (document.querySelector('#resume')! as HTMLButtonElement).click();
    app.advance(500);
    expect(state()).toBe('running');
    expect(Number(radius())).toBeLessThanOrEqual(Number(pausedRadius));

    // loop: pausing freezes session time, so ~6.1s after resume lands just
    // pausing freezes session time, so ~6.1s after resume lands just
    // past the 17s cycle boundary -> second cycle, inhale again
    app.advance(6_100);
    expect(label()).toBe('Breathe in');

    expect(app.errors).toEqual([]);
  });

  it('ships tick marks and the sound switch with no external or audio-file resources', () => {
    const html = readFileSync(distPath, 'utf8');
    // Nothing is loaded from outside the file: no src/href to a URL, no
    // audio files (sounds are synthesized in the page).
    expect(html).not.toMatch(/\b(?:src|href)=["']?(?:https?:)?\/\//i);
    expect(html).not.toMatch(/\.(?:mp3|wav|ogg|m4a|aac|flac)\b/i);
    expect(html).not.toMatch(/<audio\b/i);

    const app = loadBuiltApp();
    const { document } = app.dom.window;
    const ticks = () => document.querySelectorAll('#ticks line').length;
    const toggle = document.querySelector<HTMLButtonElement>('#sound-toggle')!;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('true'); // on by default

    app.stepFrame();
    expect(ticks()).toBe(0); // idle
    (document.querySelector('#start')! as HTMLButtonElement).click();
    app.advance(500);
    expect(ticks()).toBe(4); // 4-6-7 inhale
    toggle.click(); // jsdom has no Web Audio: switches, stays silent, no errors
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    app.advance(4_000);
    expect(ticks()).toBe(6); // hold
    expect(app.errors).toEqual([]);
  });
});
