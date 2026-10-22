// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appRoot = join(import.meta.dirname, '..');
const css = readFileSync(join(import.meta.dirname, 'style.css'), 'utf8');

/** The animation loop's callback, run by hand to render a frame. */
let frame: FrameRequestCallback | null = null;
let now: ReturnType<typeof vi.spyOn>;

/** A fresh page and a fresh run of the app module (debug off unless mocked). */
async function load(): Promise<void> {
  vi.resetModules();
  const html = readFileSync(join(appRoot, 'index.html'), 'utf8');
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    frame = cb;
    return 0;
  }) as typeof requestAnimationFrame;
  await import('./main');
}

/** Moves wall time to `ms` and renders one frame. */
function at(ms: number): void {
  now.mockReturnValue(ms);
  frame!(ms);
}

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const text = (selector: string) => $(selector).textContent;
const click = (id: string) => $<HTMLButtonElement>(`#${id}`).click();
const choose = (id: string, value: string) => {
  const select = $<HTMLSelectElement>(`#${id}`);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};
const app = () => $('#app');
const rounds = () => Array.from(document.querySelectorAll('#rounds li'), (li) => li.textContent);

beforeEach(() => {
  now = vi.spyOn(performance, 'now').mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('./debug');
});

describe('Debug mode', () => {
  it('removes pause and resume from the page when off', async () => {
    await load();
    expect(document.querySelector('#pause')).toBeNull();
    expect(document.querySelector('#resume')).toBeNull();
    expect(app().dataset.debug).toBeUndefined();
    click('start');
    expect(app().dataset.sessionState).toBe('running');
  });

  it('offers pause while running and resume while paused when on', async () => {
    vi.doMock('./debug', () => ({ DEBUG: true }));
    await load();
    expect(app().dataset.debug).toBe('');
    click('start');
    expect(app().dataset.sessionState).toBe('running');
    click('pause');
    expect(app().dataset.sessionState).toBe('paused');
    click('resume');
    expect(app().dataset.sessionState).toBe('running');
    // The visibility CSS still hides each in the other state.
    expect(css).toContain('.app[data-session-state="running"] #resume');
    expect(css).toContain('.app[data-session-state="paused"] #pause');
  });
});

describe('Done label and summary', () => {
  it('labels the reset control Done after the first cycle and moves the stats below the circle', async () => {
    await load();
    click('start');
    at(0);
    expect(text('#reset')).toBe('Reset');
    at(16_900);
    expect(text('#reset')).toBe('Reset');
    at(17_100);
    expect(text('#reset')).toBe('Done');
    at(20_000); // partial second cycle counts toward the time

    click('reset');
    expect(app().dataset.sessionState).toBe('idle');
    expect(text('#phase-label')).toBe('Ready');
    expect(text('#session-stats')).toBe('');
    expect(text('#summary-stats')).toBe('Cycles: 1 · Time: 00:20');
    expect($('#summary-stats').closest('.display')).toBeNull();
    expect(text('#reset')).toBe('Reset');

    click('start');
    expect(text('#summary-stats')).toBe('');
    expect(text('#session-stats')).toBe('Cycles: 0 · Time: 00:00');
  });

  it('shows a summary after Reset too, before any cycle completed', async () => {
    await load();
    click('start');
    at(3_000);
    click('reset');
    expect(text('#summary-stats')).toBe('Cycles: 0 · Time: 00:03');
  });
});

describe('Breath Retention controls', () => {
  // Normal tempo, 20 breaths: breathing 0..70 s, then the hold.
  const startRetention = async () => {
    await load();
    choose('preset-select', 'breath-retention');
    choose('breaths-select', '20');
    click('start');
    at(0);
  };

  it('shows its options only while selected, with their defaults and tempo labels', async () => {
    await load();
    const tempoLabels = () => Array.from($<HTMLSelectElement>('#tempo-select').options, (o) => o.textContent);
    expect(app().dataset.preset).toBe('467');
    expect(css).toContain('.app:not([data-preset="breath-retention"]) .breath-retention-only');
    expect($('#breaths-select').closest('.breath-retention-only')).not.toBeNull();
    expect($('#breaths-select').closest('.controls')).not.toBeNull();
    expect(document.querySelector('#hold-sound-select')).toBeNull();
    expect(tempoLabels()).toEqual(['Slow (1.25 s per count)', 'Normal (1 s per count)', 'Fast (0.8 s per count)']);

    choose('preset-select', 'breath-retention');
    expect(app().dataset.preset).toBe('breath-retention');
    expect(Array.from($<HTMLSelectElement>('#breaths-select').options, (o) => o.value)).toEqual([
      '20',
      '25',
      '30',
      '35',
      '40',
    ]);
    expect($<HTMLSelectElement>('#breaths-select').value).toBe('30');
    expect(tempoLabels()).toEqual(['Slow', 'Normal', 'Fast']);

    choose('preset-select', '467');
    expect(tempoLabels()[0]).toBe('Slow (1.25 s per count)');
  });

  it('locks the breath count during a session', async () => {
    await startRetention();
    const breaths = $<HTMLSelectElement>('#breaths-select');
    expect(breaths.disabled).toBe(true);
    choose('breaths-select', '40');
    expect(breaths.value).toBe('20');
    expect(text('#countdown')).toBe('1/20');
  });

  it('runs a round: breathing, the hold, Breathe in, recovery, Done', async () => {
    await startRetention();
    expect(css).toContain('.app[data-session-state="running"][data-role="retention"] #breathe-in');
    at(16 * 3_500 + 500);
    expect(text('#countdown')).toBe('17/20');
    expect(app().dataset.role).toBe('breath');

    click('breathe-in'); // not in the hold: nothing happens
    expect(app().dataset.role).toBe('breath');

    at(70_000 + 92_000);
    expect(app().dataset.role).toBe('retention');
    expect(text('#countdown')).toBe('01:32');
    expect(text('#reset')).toBe('Reset');

    click('breathe-in');
    expect(app().dataset.role).toBe('');
    expect(text('#phase-label')).toBe('Breathe in');
    expect(rounds()).toEqual(['Round 1 01:32']);
    expect(text('#reset')).toBe('Done');
    expect(text('#session-stats')).toBe('Rounds: 1 · Time: 02:42');

    at(70_000 + 92_000 + 1_750 + 5_000);
    expect(text('#countdown')).toBe('10');
    click('reset');
    expect(rounds()).toEqual(['Round 1 01:32']);
    expect(text('#summary-stats')).toBe('Rounds: 1 · Time: 02:48');

    click('start');
    expect(rounds()).toEqual([]);
  });
});
