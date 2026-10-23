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
    choose('preset-select', '467');
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

describe('Pattern stepping buttons', () => {
  const pattern = () => $<HTMLSelectElement>('#preset-select').value;

  it('steps forward through every pattern and wraps around', async () => {
    await load();
    expect(pattern()).toBe('balanced');
    click('preset-next');
    expect(pattern()).toBe('box');
    expect(app().dataset.preset).toBe('box');
    expect($<HTMLSelectElement>('#tempo-select').value).toBe('5');
    click('preset-next');
    expect(pattern()).toBe('467');
    click('preset-next');
    expect(pattern()).toBe('breath-retention');
    expect(app().dataset.preset).toBe('breath-retention');
    click('preset-next');
    expect(pattern()).toBe('balanced');
  });

  it('steps backward and wraps from the first pattern to the last', async () => {
    await load();
    click('preset-prev');
    expect(pattern()).toBe('breath-retention');
    expect(Array.from($<HTMLSelectElement>('#tempo-select').options, (o) => o.textContent)).toEqual([
      'Slow',
      'Normal',
      'Fast',
    ]);
    click('preset-prev');
    expect(pattern()).toBe('467');
  });

  it('is unavailable during a session', async () => {
    await load();
    click('start');
    expect($<HTMLButtonElement>('#preset-prev').disabled).toBe(true);
    expect($<HTMLButtonElement>('#preset-next').disabled).toBe(true);
    // Even a click that gets through changes nothing.
    $<HTMLButtonElement>('#preset-next').disabled = false;
    click('preset-next');
    expect(pattern()).toBe('balanced');
    click('reset');
    expect($<HTMLButtonElement>('#preset-next').disabled).toBe(false);
  });

  it('sits inside the pattern control with accessible names, and only there', async () => {
    await load();
    const stepper = $('#preset-select').closest('.stepper')!;
    expect(stepper.querySelector('#preset-prev')!.getAttribute('aria-label')).toBe('Previous pattern');
    expect(stepper.querySelector('#preset-next')!.getAttribute('aria-label')).toBe('Next pattern');
    expect($<HTMLButtonElement>('#preset-prev').type).toBe('button');
    // Buttons are not inside a label, so pressing them never opens the list.
    expect($('#preset-prev').closest('label')).toBeNull();
    expect(text('label[for="preset-select"]')).toBe('Breathing pattern');
    expect($('#tempo-select').closest('.stepper')).toBeNull();
    expect(document.querySelectorAll('.stepper')).toHaveLength(1);
  });

  it('gives the pattern select a fixed width on its own row', async () => {
    await load();
    const rule = css.slice(css.indexOf('.stepper select {'), css.indexOf('}', css.indexOf('.stepper select {')));
    expect(rule).toMatch(/\bwidth: min\(80vw, \d+(\.\d+)?rem\)/);
    expect(rule).toContain('text-align-last: center');
    // Its own row: the controls after it change with the pattern and must not move it.
    expect(css).toMatch(/\.pattern-control \{[^}]*flex-basis: 100%/);
    expect($('.pattern-control').contains($('#preset-select'))).toBe(true);
  });
});

describe('Tempo follows the pattern', () => {
  const tempos = () => Array.from($<HTMLSelectElement>('#tempo-select').options, (o) => [o.value, o.textContent]);
  const tempo = () => $<HTMLSelectElement>('#tempo-select').value;

  it('offers 4 to 7 seconds per phase for Balanced Breathing, selected by default with 5.5', async () => {
    await load();
    expect($<HTMLSelectElement>('#preset-select').value).toBe('balanced');
    expect(tempos()).toEqual([
      ['4', '4 s per phase'],
      ['5', '5 s per phase'],
      ['5.5', '5.5 s per phase'],
      ['6', '6 s per phase'],
      ['7', '7 s per phase'],
    ]);
    expect(tempo()).toBe('5.5');
  });

  it('runs Balanced Breathing in and out at the chosen phase length', async () => {
    await load();
    click('start');
    at(5_400);
    expect(text('#phase-label')).toBe('Breathe in');
    at(5_600);
    expect(text('#phase-label')).toBe('Breathe out');
    at(11_100);
    expect(text('#phase-label')).toBe('Breathe in');
  });

  it('offers 3 to 8 seconds per phase for Box Breathing, with 5 selected and the Tempo caption', async () => {
    await load();
    choose('preset-select', 'box');
    expect(tempos()).toEqual([
      ['3', '3 s per phase'],
      ['4', '4 s per phase'],
      ['5', '5 s per phase'],
      ['7', '7 s per phase'],
      ['8', '8 s per phase'],
    ]);
    expect(tempo()).toBe('5');
    expect(text('label[for="tempo-select"] span')).toBe('Tempo');
  });

  it('runs Box Breathing at the chosen phase length', async () => {
    await load();
    choose('preset-select', 'box');
    choose('tempo-select', '3');
    click('start');
    at(2_900);
    expect(text('#phase-label')).toBe('Breathe in');
    at(3_100);
    expect(text('#phase-label')).toBe('Hold');
  });

  it('remembers each pattern\'s tempo while the page is open', async () => {
    await load();
    choose('preset-select', '467');
    choose('tempo-select', 'fast');
    choose('preset-select', 'box');
    expect(tempo()).toBe('5');
    choose('tempo-select', '7');
    choose('preset-select', 'breath-retention');
    expect(tempo()).toBe('normal');
    choose('preset-select', '467');
    expect(tempo()).toBe('fast');
    expect(tempos()[2]).toEqual(['fast', 'Fast (0.8 s per count)']);
    choose('preset-select', 'box');
    expect(tempo()).toBe('7');
  });

  it('locks the tempo during a session', async () => {
    await load();
    choose('preset-select', 'box');
    click('start');
    expect($<HTMLSelectElement>('#tempo-select').disabled).toBe(true);
    choose('tempo-select', '8');
    expect(tempo()).toBe('5');
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
    choose('preset-select', '467');
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

  it('puts Breathe in on its own row above the preset controls, laid out only during a session', async () => {
    await load();
    const row = $('#breathe-in').parentElement!;
    expect(row.classList.contains('breathe-in-row')).toBe(true);
    expect(row.parentElement).toBe($('.controls'));
    expect(row.parentElement!.firstElementChild).toBe(row);
    expect(row.contains($('#reset'))).toBe(false);
    // Hidden by default; laid out for a running or paused Breath Retention session.
    expect(css).toMatch(/\.breathe-in-row \{\s*display: none;\s*flex-basis: 100%;/);
    expect(css).toMatch(
      /\.app\[data-preset="breath-retention"\]:not\(\[data-session-state="idle"\]\) \.breathe-in-row \{\s*display: flex;/,
    );
    // Within the row, the button keeps its space while hidden outside the hold.
    expect(css).toMatch(/#breathe-in \{\s*visibility: hidden;/);
    expect(css).not.toMatch(/#breathe-in \{\s*display:/);
  });

  it('runs a round: breathing, the hold, Breathe in, recovery, Done', async () => {
    await startRetention();
    expect(css).toMatch(/\.app\[data-session-state="running"\]\[data-role="retention"\] #breathe-in \{\s*visibility: visible;/);
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

describe('Debug menu', () => {
  const menu = () => document.querySelector<HTMLDetailsElement>('.debug-menu');
  const menuButton = (label: string) =>
    Array.from(menu()!.querySelectorAll('button')).find((b) => b.textContent === label)!;
  const jumpLabels = () => Array.from(menu()!.querySelectorAll('[data-group="jump"] button'), (b) => b.textContent);
  const debugOn = async () => {
    vi.doMock('./debug', () => ({ DEBUG: true }));
    await load();
  };

  it('is not on the page when debug mode is off', async () => {
    await load();
    expect(menu()).toBeNull();
  });

  it('is collapsed at load, inside the display, and lists the entries for the selected pattern', async () => {
    await debugOn();
    expect(menu()!.open).toBe(false);
    expect(menu()!.closest('.display')).not.toBeNull();
    expect(jumpLabels()).toHaveLength(4); // Balanced Breathing
    choose('preset-select', 'box');
    expect(jumpLabels()).toHaveLength(8);
    choose('preset-select', 'breath-retention');
    expect(jumpLabels()).toHaveLength(10);
    expect(jumpLabels()).toContain('Hold · 0:57');
  });

  it('jumps from idle into a running session at the chosen phase', async () => {
    await debugOn();
    choose('preset-select', '467');
    menuButton('Breathe out · start').click();
    at(0);
    expect(app().dataset.sessionState).toBe('running');
    expect(text('#phase-label')).toBe('Breathe out');
  });

  it('jumps into the Breath Retention recovery with round 1 recorded', async () => {
    await debugOn();
    choose('preset-select', 'breath-retention');
    menuButton('Recovery hold · start').click();
    at(0);
    expect(text('#phase-label')).toBe('Hold');
    expect(rounds()).toEqual(['Round 1 01:00']);
    expect(text('#reset')).toBe('Done');
  });

  it('plays a sound without touching the session', async () => {
    const started: number[] = [];
    class FakeContext {
      currentTime = 0;
      state = 'running';
      destination = {};
      createOscillator() {
        return {
          type: 'sine',
          frequency: { value: 0 },
          onended: null,
          connect() {},
          disconnect() {},
          start(this: { frequency: { value: number } }) {
            started.push(this.frequency.value);
          },
          stop() {},
        };
      }
      createGain() {
        const param = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
        return { gain: param, connect() {}, disconnect() {} };
      }
      resume() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal('AudioContext', FakeContext);
    try {
      await debugOn();
      menuButton('Breathe out tone').click();
      at(0);
      expect(started).toEqual([440]);
      expect(app().dataset.sessionState).toBe('idle');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
