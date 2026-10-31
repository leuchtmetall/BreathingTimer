// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BreathingEngine, type Clock } from './engine';
import {
  applyTempo,
  balancedPreset,
  boxPreset,
  breathRetentionPreset,
  preset467,
  presetChoices,
  tempoChoices,
  tempoFast,
  tempoNormal,
  tempoSlow,
  type Preset,
} from './presets';
import { Renderer, type RenderTargets } from './renderer';

// The wiring tests below pause and resume, which only debug mode offers;
// src/controls.dom.test.ts covers normal mode.
vi.mock('./debug', () => ({ DEBUG: true }));

class FakeClock implements Clock {
  t = 0;
  now(): number {
    return this.t;
  }
}

const appRoot = join(import.meta.dirname, '..');

// Use the real index.html markup so ids/classes under test cannot drift.
beforeAll(() => {
  const html = readFileSync(join(appRoot, 'index.html'), 'utf8');
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  document.body.innerHTML = body;
});

function targets(): RenderTargets {
  return {
    ring: document.querySelector<SVGCircleElement>('#ring')!,
    track: document.querySelector<SVGCircleElement>('.ring-track')!,
    ringBackdrop: document.querySelector<SVGCircleElement>('#ring-backdrop')!,
    ticks: document.querySelector<SVGGElement>('#ticks')!,
    dot: document.querySelector<SVGCircleElement>('#dot')!,
    phaseLabel: document.querySelector<HTMLElement>('#phase-label')!,
    countdown: document.querySelector<HTMLElement>('#countdown')!,
    sessionStats: document.querySelector<HTMLElement>('#session-stats')!,
    summaryStats: document.querySelector<HTMLElement>('#summary-stats')!,
    rounds: document.querySelector<HTMLOListElement>('#rounds')!,
  };
}

/** Filled arc as a 0..1 progress fraction (relative to the arc's own radius). */
function ringProgress(): number {
  const ring = document.querySelector<SVGCircleElement>('#ring')!;
  const dash = ring.getAttribute('stroke-dasharray')!;
  const radius = Number(ring.getAttribute('r'));
  return Number(dash.split(' ')[0]) / (2 * Math.PI * radius);
}

/** Breathing radius of the filling circle itself. */
function ringRadius(): number {
  return Number(document.querySelector<SVGCircleElement>('#ring')!.getAttribute('r'));
}

function dotEl(): SVGCircleElement {
  return document.querySelector<SVGCircleElement>('#dot')!;
}

function ringStroke(): string {
  return document.querySelector<SVGCircleElement>('#ring')!.style.stroke;
}

function trackStroke(): string {
  return document.querySelector<SVGCircleElement>('.ring-track')!.style.stroke;
}

function backdropStroke(): string {
  return document.querySelector<SVGCircleElement>('#ring-backdrop')!.style.stroke;
}

function dotFill(): string {
  return dotEl().style.fill;
}

describe('Renderer (DOM)', () => {
  it('the filling circle itself breathes: grows, holds, shrinks — no inner circle', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const r = new Renderer(targets());

    expect(document.querySelector('#shape')).toBeNull();

    const radiusAt = (ms: number) => {
      r.renderRunning(engine.signalAt(ms)!);
      return ringRadius();
    };

    const rStart = radiusAt(0);
    const rInQuarter = radiusAt(1000);
    const rInHalf = radiusAt(2000);
    const rInFull = radiusAt(3999);

    // grows smoothly over multiple frames, monotonic
    expect(rInQuarter).toBeGreaterThan(rStart);
    expect(rInHalf).toBeGreaterThan(rInQuarter);
    expect(rInFull).toBeGreaterThan(rInHalf);

    // constant during hold
    expect(radiusAt(7500)).toBeCloseTo(rInFull, 1);

    // shrinks during exhale, monotonic (eased: subtle early drop)
    expect(radiusAt(11_000)).toBeLessThan(rInFull);
    expect(radiusAt(13_000)).toBeLessThan(radiusAt(11_000));
    expect(radiusAt(15_000)).toBeLessThan(radiusAt(13_000));

    // near base again at the end of exhale (7s: 10..17)
    expect(radiusAt(16_999)).toBeLessThan(radiusAt(15_000));
  });

  it('applies bright/dim/dark shades per phase to the layers', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const r = new Renderer(targets());

    r.renderRunning(engine.signalAt(1000)!); // inhale
    expect(ringStroke()).toBe('var(--color-in)');
    expect(trackStroke()).toBe('var(--color-in-dim)');
    expect(backdropStroke()).toBe('var(--color-in-dark)');
    expect(dotFill()).toBe('var(--color-in)');

    r.renderRunning(engine.signalAt(7000)!); // full-lung hold
    expect(ringStroke()).toBe('var(--color-hold-full)'); // lighter gray
    expect(trackStroke()).toBe('var(--color-hold-full-dim)');
    expect(backdropStroke()).toBe('var(--color-hold-full-dark)');

    r.renderRunning(engine.signalAt(12_000)!); // exhale
    expect(ringStroke()).toBe('var(--color-out)');
    expect(trackStroke()).toBe('var(--color-out-dim)');
    expect(backdropStroke()).toBe('var(--color-out-dark)');
    expect(dotFill()).toBe('var(--color-out)');
  });

  it('colors an empty-lung hold with the darker gray after an exhale', () => {
    const engine = new BreathingEngine(boxPreset(4), new FakeClock());
    engine.start();
    const r = new Renderer(targets());
    r.renderRunning(engine.signalAt(14_000)!); // empty-lung hold
    expect(ringStroke()).toBe('var(--color-idle)');
    expect(trackStroke()).toBe('var(--color-idle-dim)');
    expect(backdropStroke()).toBe('var(--color-idle-dark)');
    expect(dotFill()).toBe('var(--color-idle)');
  });

  it('fades straight to the new colors on start and phase change (CSS rule)', () => {
    // jsdom does not animate, so assert the mechanism: the stylesheet carries
    // a stroke transition for the fading layers only (spec: filled arc and
    // dot switch instantly, the unfilled outline fades with no memory stage).
    const css = readFileSync(join(appRoot, 'src', 'style.css'), 'utf8');
    expect(css).toContain('transition: stroke 1s linear');
    expect(css).toMatch(/\.ring-backdrop,\s*\.ring-track\s*\{\s*transition: stroke 1s linear/);
    const ringBlock = css.match(/#ring \{[^}]*\}/)?.[0] ?? '';
    expect(ringBlock).not.toContain('transition');

    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const r = new Renderer(targets());
    r.renderIdle(); // ready state first

    // First frame after starting: unfilled outline is already at its target
    // (the CSS transition animates the paint; the renderer sets target colors)
    r.renderRunning(engine.signalAt(100)!);
    expect(trackStroke()).toBe('var(--color-in-dim)');
    expect(backdropStroke()).toBe('var(--color-in-dark)');

    r.renderRunning(engine.signalAt(4000)!); // hold begins
    expect(trackStroke()).toBe('var(--color-hold-full-dim)');
    expect(ringStroke()).toBe('var(--color-hold-full)');
    expect(backdropStroke()).toBe('var(--color-hold-full-dark)');

    r.renderIdle(); // reset: fade back to neutral grays
    expect(trackStroke()).toBe('var(--color-idle-dim)');
    expect(backdropStroke()).toBe('var(--color-idle-dark)');
  });

  it('fills the ring linearly with elapsed phase time', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const r = new Renderer(targets());

    r.renderRunning(engine.signalAt(2000)!); // halfway through inhale
    expect(ringProgress()).toBeCloseTo(0.5, 2);

    r.renderRunning(engine.signalAt(6000)!); // 2s into the 6s hold
    expect(ringProgress()).toBeCloseTo(2 / 6, 2);

    r.renderRunning(engine.signalAt(16_999)!); // 1ms before exhale ends
    expect(ringProgress()).toBeCloseTo(1, 3);
  });

  it('resets the arc at each phase start and moves the dot with it', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const r = new Renderer(targets());

    r.renderRunning(engine.signalAt(3999)!);
    expect(ringProgress()).toBeGreaterThan(0.99);

    r.renderRunning(engine.signalAt(4000)!); // hold begins: arc reset
    expect(ringProgress()).toBeCloseTo(0, 2);
    // 0 progress = top of the circle; full lungs still -> radius 48
    expect(ringRadius()).toBeCloseTo(48, 1);
    expect(Number(dotEl().getAttribute('cx'))).toBeCloseTo(58, 1);
    expect(Number(dotEl().getAttribute('cy'))).toBeCloseTo(10, 1);

    r.renderRunning(engine.signalAt(1000)!); // 25% of the inhale
    expect(ringProgress()).toBeCloseTo(0.25, 2);
    // a quarter of the way around = 3 o'clock (x = center + breathing radius)
    const quarterRadius = ringRadius();
    expect(quarterRadius).toBeGreaterThan(40);
    expect(Number(dotEl().getAttribute('cx'))).toBeCloseTo(58 + quarterRadius, 1);
    expect(Number(dotEl().getAttribute('cy'))).toBeCloseTo(58, 1);
  });

  it('renders a dot larger than the ring stroke but small overall', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const r = new Renderer(targets());
    r.renderRunning(engine.signalAt(1000)!);
    const dotR = Number(dotEl().getAttribute('r'));
    const strokeW = Number(document.querySelector<SVGCircleElement>('#ring')!.getAttribute('stroke-width'));
    expect(dotR).toBeGreaterThan(strokeW);
    expect(dotR).toBeLessThanOrEqual(3.5);
  });

  it('renders track matching the arc; backdrop thicker than both', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const r = new Renderer(targets());
    r.renderRunning(engine.signalAt(1000)!);

    const backdropW = Number(backdropWidth());
    const trackW = Number(trackWidth());
    const ringW = Number(document.querySelector<SVGCircleElement>('#ring')!.getAttribute('stroke-width'));
    // the unfilled outline matches the filled arc; backdrop is far thicker
    expect(trackW).toBe(ringW);
    expect(backdropW).toBeGreaterThan(trackW);
    expect(trackStroke()).not.toBe(backdropStroke()); // dim vs dark shades differ
    // and the whole stack follows the same breathing radius
    expect(ringRadius()).toBe(Number(document.querySelector<SVGCircleElement>('.ring-track')!.getAttribute('r')));
  });

  it('keeps every layer inside the viewport at full lungs (no clipping)', () => {
    const svg = document.querySelector('svg')!;
    const viewSize = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const backdropW = Number(backdropWidth());
    // worst case: full-lung radius + half the backdrop stroke
    const maxOuterEdge = 58 + 48 + backdropW / 2;
    expect(maxOuterEdge).toBeLessThanOrEqual(viewSize);

    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const r = new Renderer(targets());
    r.renderRunning(engine.signalAt(3999)!); // full lungs
    expect(ringRadius()).toBe(48);
    expect(maxOuterEdge).toBeLessThanOrEqual(viewSize);
  });

  it('shows phase label; no seconds for phases shorter than 10s', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const r = new Renderer(targets());

    r.renderRunning(engine.signalAt(100)!);
    expect(document.querySelector('#phase-label')!.textContent).toBe('Breathe in');
    expect(document.querySelector('#countdown')!.textContent).toBe('');

    r.renderRunning(engine.signalAt(6000)!); // 2s into hold
    expect(document.querySelector('#phase-label')!.textContent).toBe('Hold');
    expect(document.querySelector('#countdown')!.textContent).toBe('');
  });

  it('shows seconds remaining for phases of at least 10 seconds', () => {
    const engine = new BreathingEngine(longHoldPreset(), new FakeClock());
    engine.start();
    const longHold = new Renderer(targets());
    longHold.renderRunning(engine.signalAt(6000)!); // 2s into the 15s hold
    expect(document.querySelector('#phase-label')!.textContent).toBe('Hold');
    expect(document.querySelector('#countdown')!.textContent).toBe('13');
  });

  it('applies the 10-second countdown threshold to real, tempo-scaled duration', () => {
    const countdown = () => document.querySelector('#countdown')!.textContent;

    // Box Breathing's longest phase, 8 s, stays below the threshold.
    const box = new BreathingEngine(boxPreset(8), new FakeClock());
    const boxRenderer = new Renderer(targets());
    for (const ms of [2_000, 10_000, 20_000, 30_000]) {
      boxRenderer.renderRunning(box.signalAt(ms));
      expect(countdown()).toBe('');
    }

    // The converse proves it is real seconds, not counts: an 8-count exhale
    // (hidden at Normal) lasts 10 real seconds at Slow and so shows seconds.
    const long = new BreathingEngine(applyTempo(longHoldPreset(), tempoSlow), new FakeClock());
    const longRenderer = new Renderer(targets());
    // Slow long-hold: inhale 5 s + hold 18.75 s, so the exhale starts at 23.75 s.
    longRenderer.renderRunning(long.signalAt(23_750 + 2_500));
    expect(document.querySelector('#phase-label')!.textContent).toBe('Breathe out');
    expect(countdown()).toBe('8'); // ceil(10 - 2.5)
  });

  it('shows completed cycles and formats total session time', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const r = new Renderer(targets());

    r.renderRunning(engine.signalAt(0));
    expect(document.querySelector('#session-stats')!.textContent).toBe('Cycles: 0 · Time: 00:00');

    r.renderRunning(engine.signalAt(17_000)); // first complete 4-6-7 cycle
    expect(document.querySelector('#session-stats')!.textContent).toBe('Cycles: 1 · Time: 00:17');

    r.renderRunning(engine.signalAt(60_000));
    expect(document.querySelector('#session-stats')!.textContent).toBe('Cycles: 3 · Time: 01:00');

    r.renderIdle();
    expect(document.querySelector('#session-stats')!.textContent).toBe('');
  });

  it('freezes displayed values while paused', () => {
    const clock = new FakeClock();
    const engine = new BreathingEngine(preset467, clock);
    engine.start();
    clock.t = 6_000;
    engine.pause();
    const r = new Renderer(targets());
    r.renderPaused(engine.signal()!);
    const radius = ringRadius();
    const remaining = document.querySelector('#countdown')!.textContent;
    const stats = document.querySelector('#session-stats')!.textContent;

    clock.t = 66_000; // wall time passes but the signal is frozen
    r.renderPaused(engine.signal()!);
    expect(ringRadius()).toBe(radius);
    expect(ringProgress()).toBeCloseTo(2 / 6, 2);
    expect(document.querySelector('#countdown')!.textContent).toBe(remaining);
    expect(document.querySelector('#session-stats')!.textContent).toBe(stats);
    expect((document.querySelector('#phase-label') as HTMLElement).textContent!.startsWith('Paused')).toBe(true);
  });

  it('idle display: neutral palette, empty ring at base radius, no dot or countdown', () => {
    const r = new Renderer(targets());
    r.renderIdle();
    expect(document.querySelector('#phase-label')!.textContent).toBe('Ready');
    expect(document.querySelector('#countdown')!.textContent).toBe('');
    expect(ringRadius()).toBeCloseTo(40, 1);
    expect(ringStroke()).toBe('none');
    expect(trackStroke()).toBe('var(--color-idle-dim)');
    expect(backdropStroke()).toBe('var(--color-idle-dark)');
    expect(dotEl().getAttribute('visibility')).toBe('hidden');
    expect(ringProgress()).toBeCloseTo(0, 2);
  });

  it('eases the breathing motion: slow at the ends, fastest mid-growth', () => {
    const engine = new BreathingEngine(preset467, new FakeClock());
    engine.start();
    const r = new Renderer(targets());

    const radiusAt = (ms: number) => {
      r.renderRunning(engine.signalAt(ms)!);
      return ringRadius();
    };
    const delta = (a: number, b: number) => Math.abs(radiusAt(b) - radiusAt(a));

    const startDelta = delta(0, 400); // first 10% of inhale
    const midDelta = delta(1600, 2400); // around 50% of inhale
    const endDelta = delta(3599, 3999); // last 10% of inhale

    expect(midDelta).toBeGreaterThan(startDelta);
    expect(midDelta).toBeGreaterThan(endDelta);
    // amplitude at least 8 units (spec: twice the previous 4-unit range)
    expect(radiusAt(3999) - radiusAt(0)).toBeGreaterThanOrEqual(7.9);
  });
});

function longHoldPreset(): Preset {
  return {
    name: 'long-hold',
    phases: [
      { kind: 'inhale', seconds: 4, fill: [0, 1] },
      { kind: 'hold', seconds: 15, fill: [1, 1] },
      { kind: 'exhale', seconds: 8, fill: [1, 0] },
    ],
    countSeconds: 1,
    ticks: true,
  };
}

describe('Tick marks and flash (DOM)', () => {
  const tickLines = () => Array.from(document.querySelectorAll<SVGLineElement>('#ticks line'));
  const flashing = () => {
    const ring = document.querySelector('#ring')!;
    return ring.classList.contains('flash-a') || ring.classList.contains('flash-b');
  };
  /** Distance of a tick's midpoint from the centre, on the view scale. */
  const tickRadius = (line: SVGLineElement) => {
    const x = (Number(line.getAttribute('x1')) + Number(line.getAttribute('x2'))) / 2 - 58;
    const y = (Number(line.getAttribute('y1')) + Number(line.getAttribute('y2'))) / 2 - 58;
    return Math.hypot(x, y);
  };
  const setup = (preset: Preset) => {
    const renderer = new Renderer(targets());
    renderer.usePreset(preset);
    const engine = new BreathingEngine(preset, new FakeClock());
    return { renderer, run: (ms: number) => renderer.renderRunning(engine.signalAt(ms)) };
  };

  it("draws one tick per count of the current phase, from 12 o'clock", () => {
    const { renderer, run } = setup(applyTempo(preset467, tempoNormal));
    run(500);
    expect(tickLines()).toHaveLength(4);
    run(5_000);
    expect(tickLines()).toHaveLength(6);
    run(12_000);
    expect(tickLines()).toHaveLength(7);
    const first = tickLines()[0]!;
    expect(Number(first.getAttribute('x1'))).toBeCloseTo(58, 1);
    expect(Number(first.getAttribute('y1'))).toBeLessThan(58);
    renderer.renderIdle();
  });

  it('follows counts at every tempo', () => {
    for (const tempo of [tempoSlow, tempoFast]) {
      const preset = applyTempo(preset467, tempo);
      const { renderer, run } = setup(preset);
      const count = preset.countSeconds * 1000;
      run(2 * count);
      expect(tickLines()).toHaveLength(4);
      run(7 * count);
      expect(tickLines()).toHaveLength(6);
      run(13 * count);
      expect(tickLines()).toHaveLength(7);
      renderer.renderIdle();
    }
  });

  it('shows one tick per second of a Box Breathing phase', () => {
    const { renderer, run } = setup(boxPreset(8));
    for (let phase = 0; phase < 4; phase++) {
      run((phase + 0.5) * 8_000);
      expect(tickLines()).toHaveLength(8);
    }
    renderer.renderIdle();
  });

  it('splits a 5.5 s Balanced Breathing phase into 5 equal arcs', () => {
    const { renderer, run } = setup(balancedPreset(5.5));
    run(1_000);
    expect(tickLines()).toHaveLength(5);
    run(8_000);
    expect(tickLines()).toHaveLength(5);
    renderer.renderIdle();
  });

  it('tints the ticks in the current ring color', () => {
    const { renderer, run } = setup(applyTempo(preset467, tempoNormal));
    const tint = () => document.querySelector<SVGGElement>('#ticks')!.style.getPropertyValue('--tick-phase');
    for (const ms of [500, 5_000, 12_000]) {
      run(ms);
      expect(tint()).toBe(ringStroke());
    }
    expect(new Set([500, 5_000, 12_000].map((ms) => (run(ms), tint()))).size).toBe(3);
    renderer.renderIdle();
  });

  it('keeps the ticks on the breathing radius', () => {
    const { renderer, run } = setup(applyTempo(preset467, tempoNormal));
    for (const ms of [200, 2_000, 3_900, 7_000]) {
      run(ms);
      for (const line of tickLines()) expect(tickRadius(line)).toBeCloseTo(ringRadius(), 1);
    }
    renderer.renderIdle();
  });

  it('shows no ticks while idle or for a preset without ticks', () => {
    const { renderer, run } = setup({ ...preset467, ticks: false });
    run(500);
    expect(tickLines()).toHaveLength(0);
    run(1_500);
    expect(flashing()).toBe(false);
    renderer.renderIdle();
    // Tick marks follow the engine's preset, which the app always shares with the renderer.
    const withTicks = setup(preset467);
    withTicks.run(5_500);
    expect(tickLines()).toHaveLength(6);
    withTicks.renderer.renderIdle();
    expect(tickLines()).toHaveLength(0);
  });

  it('flashes on an in-phase tick but not at a phase start', () => {
    const { renderer, run } = setup(applyTempo(preset467, tempoNormal));
    run(0);
    expect(flashing()).toBe(false); // session start
    run(900);
    expect(flashing()).toBe(false);
    run(1_010);
    expect(flashing()).toBe(true); // tick 1 of the inhale
    renderer.renderIdle();

    // A phase start alone never flashes.
    const fresh = setup(applyTempo(preset467, tempoNormal));
    fresh.run(3_990);
    fresh.run(4_010);
    expect(flashing()).toBe(false);
    fresh.renderer.renderIdle();
  });

  it('restarts the flash on every tick by switching classes', () => {
    const { renderer, run } = setup(applyTempo(preset467, tempoNormal));
    const ring = document.querySelector('#ring')!;
    run(500);
    run(1_010);
    const first = ring.classList.contains('flash-a') ? 'flash-a' : 'flash-b';
    run(2_010);
    expect(ring.classList.contains(first)).toBe(false);
    expect(flashing()).toBe(true);
    renderer.renderIdle();
  });

  it('flashes at most once after skipped frames', () => {
    const { renderer, run } = setup(applyTempo(preset467, tempoNormal));
    const ring = document.querySelector('#ring')!;
    const spy = vi.spyOn(ring.classList, 'toggle');
    run(4_100);
    run(8_500); // three ticks of the hold passed at once
    expect(spy.mock.calls.filter(([, force]) => force === true)).toHaveLength(1);
    spy.mockRestore();
    renderer.renderIdle();
  });

  it('does not flash while paused or again after resuming', () => {
    const preset = applyTempo(preset467, tempoNormal);
    const renderer = new Renderer(targets());
    renderer.usePreset(preset);
    const engine = new BreathingEngine(preset, new FakeClock());
    renderer.renderRunning(engine.signalAt(900));
    renderer.renderRunning(engine.signalAt(1_010));
    expect(flashing()).toBe(true);
    renderer.renderPaused(engine.signalAt(1_020));
    expect(flashing()).toBe(false);
    renderer.renderRunning(engine.signalAt(1_030)); // resumed, same tick
    expect(flashing()).toBe(false);
    renderer.renderRunning(engine.signalAt(2_010));
    expect(flashing()).toBe(true);

    // Reset clears the stored tick: a new session's first frame never flashes.
    renderer.renderIdle();
    expect(flashing()).toBe(false);
    renderer.renderRunning(engine.signalAt(2_500));
    expect(flashing()).toBe(false);
    renderer.renderIdle();
  });
});

describe('Control wiring', () => {
  it('carries session state as a data attribute for the visibility CSS', async () => {
    // Stub rAF before loading the app glue so no animation loop runs here;
    // state transitions render synchronously on user actions.
    viStubRaf();
    await import('./main');

    const app = document.querySelector<HTMLElement>('#app')!;
    expect(app.getAttribute('data-session-state')).toBe('idle');

    const presetSelector = document.querySelector<HTMLSelectElement>('#preset-select')!;
    expect(document.querySelector('label[for="preset-select"]')!.textContent).toContain('Breathing pattern');
    expect(Array.from(presetSelector.options, ({ value, textContent }) => [value, textContent])).toEqual(
      presetChoices.map(({ id, label }) => [id, label]),
    );
    expect(presetSelector.value).toBe('balanced');

    presetSelector.value = 'box';
    presetSelector.dispatchEvent(new Event('change', { bubbles: true }));
    expect(presetSelector.value).toBe('box');

    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    (document.querySelector('#start') as HTMLButtonElement).click();
    expect(app.getAttribute('data-session-state')).toBe('running');
    expect(presetSelector.disabled).toBe(true);
    expect((document.querySelector('#phase-label') as HTMLElement).textContent).toBe('Breathe in');
    expect(document.querySelector('#session-stats')!.textContent).toBe('Cycles: 0 · Time: 00:00');

    now.mockReturnValue(4500);
    (document.querySelector('#pause') as HTMLButtonElement).click();
    expect(app.getAttribute('data-session-state')).toBe('paused');
    expect((document.querySelector('#phase-label') as HTMLElement).textContent).toBe('Paused · breathe in'); // Box Breathing (5 s per phase) has not reached its hold.
    expect(presetSelector.disabled).toBe(true);

    presetSelector.value = 'breath-retention';
    presetSelector.dispatchEvent(new Event('change', { bubbles: true }));
    expect(presetSelector.value).toBe('box');

    (document.querySelector('#resume') as HTMLButtonElement).click();
    expect(app.getAttribute('data-session-state')).toBe('running');
    (document.querySelector('#reset') as HTMLButtonElement).click();
    expect(app.getAttribute('data-session-state')).toBe('idle');
    expect(presetSelector.disabled).toBe(false);
    expect(presetSelector.value).toBe('box');
    expect((document.querySelector('#phase-label') as HTMLElement).textContent).toBe('Ready');
    expect(document.querySelector('#session-stats')!.textContent).toBe('');
    now.mockRestore();
  });

  it('applies the selected tempo to a new session and locks it while active', async () => {
    viStubRaf();
    await import('./main');

    const label = () => (document.querySelector('#phase-label') as HTMLElement).textContent;
    const click = (id: string) => (document.querySelector(`#${id}`) as HTMLButtonElement).click();
    const choose = (select: HTMLSelectElement, value: string) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const presetSelector = document.querySelector<HTMLSelectElement>('#preset-select')!;
    const tempoSelector = document.querySelector<HTMLSelectElement>('#tempo-select')!;

    // The wiring tests share one app instance; the previous one left Box selected.
    choose(presetSelector, '467');
    expect(tempoSelector).not.toBeNull();
    expect(tempoSelector.closest('.controls')).not.toBeNull();
    expect(document.querySelector('label[for="tempo-select"]')!.textContent).toContain('Tempo');
    expect(Array.from(tempoSelector.options, ({ value, textContent }) => [value, textContent])).toEqual(
      tempoChoices.map(({ id, label: text }) => [id, text]),
    );
    expect(tempoSelector.value).toBe('normal');
    expect(tempoSelector.disabled).toBe(false);

    choose(tempoSelector, 'fast');
    expect(tempoSelector.value).toBe('fast');

    // Fast 4-6-7: the inhale lasts 3.2 s, so 3.3 s is already the hold
    // (at Normal tempo it would still be the inhale).
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    click('start');
    expect(tempoSelector.disabled).toBe(true);
    now.mockReturnValue(3_100);
    click('pause');
    expect(label()).toBe('Paused · breathe in');
    expect(tempoSelector.disabled).toBe(true);

    // A change attempted while active is rejected and the display restored.
    choose(tempoSelector, 'slow');
    expect(tempoSelector.value).toBe('fast');

    click('resume');
    expect(tempoSelector.disabled).toBe(true);
    now.mockReturnValue(3_300);
    click('pause');
    expect(label()).toBe('Paused · hold');

    click('reset');
    expect(tempoSelector.disabled).toBe(false);
    expect(tempoSelector.value).toBe('fast');
    expect(presetSelector.value).toBe('467');
    now.mockRestore();
  });

  it('offers an accessible night toggle outside the session controls', async () => {
    viStubRaf();
    await import('./main');

    const toggle = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.type).toBe('button');
    expect(toggle.closest('.controls')).toBeNull();
    expect(toggle.closest('.display')).not.toBeNull();
    // Keyboard reachable: a native, enabled button in the tab order.
    expect(toggle.disabled).toBe(false);
    expect(toggle.tabIndex).toBeGreaterThanOrEqual(0);
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    // Announced as a "Night mode" toggle with its on/off state; the glyph is hidden.
    expect(toggle.getAttribute('aria-label')).toBe('Night mode');
    expect(toggle.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    // jsdom has no matchMedia, so the app falls back to day mode.
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('switches the palette mid-session without disturbing the session', async () => {
    viStubRaf();
    await import('./main');

    const root = document.documentElement;
    const app = document.querySelector<HTMLElement>('#app')!;
    const toggle = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
    const click = (id: string) => (document.querySelector(`#${id}`) as HTMLButtonElement).click();
    const label = () => (document.querySelector('#phase-label') as HTMLElement).textContent;
    const stats = () => document.querySelector('#session-stats')!.textContent;
    const preset = document.querySelector<HTMLSelectElement>('#preset-select')!;
    const tempo = document.querySelector<HTMLSelectElement>('#tempo-select')!;
    preset.value = '467';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    tempo.value = 'normal';
    tempo.dispatchEvent(new Event('change', { bubbles: true }));

    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    click('start');
    now.mockReturnValue(5_000); // 1 s into the 6 s hold

    toggle.click(); // while running
    expect(root.dataset.theme).toBe('night');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(app.dataset.sessionState).toBe('running');

    now.mockReturnValue(12_000); // 2 s into the exhale
    click('pause');
    expect(label()).toBe('Paused · breathe out');
    expect(stats()).toBe('Cycles: 0 · Time: 00:12');

    toggle.click(); // while paused
    expect(root.dataset.theme).toBe('day');
    expect(app.dataset.sessionState).toBe('paused');
    expect(label()).toBe('Paused · breathe out');
    expect(stats()).toBe('Cycles: 0 · Time: 00:12');

    click('resume');
    now.mockReturnValue(18_000); // 1 s into the second cycle
    click('pause');
    expect(label()).toBe('Paused · breathe in');
    expect(stats()).toBe('Cycles: 1 · Time: 00:18');

    click('reset');
    delete root.dataset.theme;
    now.mockRestore();
  });
});

describe('Sound switch wiring', () => {
  /** Minimal Web Audio stand-in recording each oscillator's start and stops. */
  class FakeAudioContext {
    static instances: FakeAudioContext[] = [];
    currentTime = 0;
    state = 'running';
    destination = {};
    oscillators: { startAt: number; stops: number[] }[] = [];
    constructor() {
      FakeAudioContext.instances.push(this);
    }
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: { value: 0 },
        onended: null,
        startAt: NaN,
        stops: [] as number[],
        connect() {},
        disconnect() {},
        start(when: number) {
          osc.startAt = when;
        },
        stop(when: number) {
          osc.stops.push(when);
        },
      };
      this.oscillators.push(osc);
      return osc;
    }
    createGain() {
      const param = {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
      };
      return { gain: param, connect() {}, disconnect() {} };
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
  }
  const cancelled = (o: { stops: number[] }) => o.stops.includes(0);

  it('offers an accessible sound switch, on by default, outside the session controls', async () => {
    viStubRaf();
    await import('./main');
    const toggle = document.querySelector<HTMLButtonElement>('#sound-toggle')!;
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.type).toBe('button');
    expect(toggle.closest('.controls')).toBeNull();
    expect(toggle.closest('.display')).not.toBeNull();
    expect(toggle.getAttribute('aria-label')).toBe('Sound');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.disabled).toBe(false);
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
  });

  it('plays from Start by default; toggles mid-session without disturbing it', async () => {
    viStubRaf();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    await import('./main');
    const click = (id: string) => (document.querySelector(`#${id}`) as HTMLButtonElement).click();
    const label = () => (document.querySelector('#phase-label') as HTMLElement).textContent;
    const stats = () => document.querySelector('#session-stats')!.textContent;
    const toggle = document.querySelector<HTMLButtonElement>('#sound-toggle')!;
    const preset = document.querySelector<HTMLSelectElement>('#preset-select')!;
    const tempo = document.querySelector<HTMLSelectElement>('#tempo-select')!;
    preset.value = '467';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    tempo.value = 'normal';
    tempo.dispatchEvent(new Event('change', { bubbles: true }));
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    click('start'); // the user action that unlocks audio
    const ctx = FakeAudioContext.instances.at(-1)!;
    const first = [...ctx.oscillators];
    expect(first[0]!.startAt).toBeCloseTo(ctx.currentTime, 6); // inhale tone at start

    now.mockReturnValue(5_500); // 1.5 s into the hold
    click('pause');
    const before = [label(), stats()];
    expect(first.every(cancelled)).toBe(true);

    click('resume'); // pausing released audio, so this is a new context
    const resumed = FakeAudioContext.instances.at(-1)!;
    expect(resumed).not.toBe(ctx);
    const second = [...resumed.oscillators];
    // Next cue is the hold tick at 6 s: 0.5 s after the current position.
    expect(second[0]!.startAt).toBeCloseTo(resumed.currentTime + 0.5, 6);

    toggle.click(); // off, while running
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(second.every(cancelled)).toBe(true);
    click('pause');
    expect([label(), stats()]).toEqual(before);
    click('resume');
    expect(FakeAudioContext.instances.at(-1)).toBe(resumed); // silent, and no audio taken
    expect(resumed.oscillators).toHaveLength(second.length);

    toggle.click(); // on again, while running
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    const third = FakeAudioContext.instances.at(-1)!.oscillators;
    expect(third.length).toBeGreaterThan(0);
    expect(document.querySelector('#app')!.getAttribute('data-session-state')).toBe('running');
    click('reset');
    expect(third.every(cancelled)).toBe(true);

    now.mockRestore();
    vi.unstubAllGlobals();
  });

  it('turns sound on again after a reload', async () => {
    viStubRaf();
    await import('./main');
    (document.querySelector('#sound-toggle') as HTMLButtonElement).click();
    expect(document.querySelector('#sound-toggle')!.getAttribute('aria-pressed')).toBe('false');

    // Reload from a URL with no `sound` parameter (the written query would keep
    // it off): fresh markup and a fresh run of the app module.
    history.replaceState(null, '', '/');
    vi.resetModules();
    const html = readFileSync(join(appRoot, 'index.html'), 'utf8');
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
    await import('./main');
    expect(document.querySelector('#sound-toggle')!.getAttribute('aria-pressed')).toBe('true');
  });
});

function viStubRaf(): void {
  globalThis.requestAnimationFrame = (() => 0) as unknown as typeof requestAnimationFrame;
}

function backdropWidth(): string | null {
  return document.querySelector<SVGCircleElement>('#ring-backdrop')!.getAttribute('stroke-width');
}

function trackWidth(): string | null {
  return document.querySelector<SVGCircleElement>('.ring-track')!.getAttribute('stroke-width');
}

describe('Breath Retention display (DOM)', () => {
  // Normal tempo, 20 breaths: breathing 0..70 s, then the hold.
  const BREATHING_MS = 70_000;
  const setup = () => {
    const clock = new FakeClock();
    const preset = applyTempo(breathRetentionPreset(20), tempoNormal);
    const engine = new BreathingEngine(preset, clock);
    const renderer = new Renderer(targets());
    renderer.usePreset(preset);
    renderer.clearSummary();
    engine.start();
    return { clock, engine, renderer, run: (ms: number) => renderer.renderRunning(engine.signalAt(ms)) };
  };
  const text = (selector: string) => document.querySelector(selector)!.textContent;
  const tickCount = () => document.querySelectorAll('#ticks line').length;

  it('draws a full orange ring that breathes, with no dot or ticks, and the breath number', () => {
    const { run } = setup();
    run(16 * 3_500 + 1_000); // breath 17, breathing in
    expect(ringProgress()).toBeCloseTo(1, 3);
    expect(ringStroke()).toBe('var(--color-breath)');
    expect(trackStroke()).toBe('var(--color-breath-dim)');
    expect(backdropStroke()).toBe('var(--color-breath-dark)');
    expect(dotEl().getAttribute('visibility')).toBe('hidden');
    expect(tickCount()).toBe(0);
    expect(text('#countdown')).toBe('17/20');
    expect(text('#phase-label')).toBe('Breathe in');
    const grown = ringRadius();
    run(16 * 3_500 + 1_750 + 1_700); // end of that breath out
    expect(ringRadius()).toBeLessThan(grown);
    expect(text('#countdown')).toBe('17/20');
  });

  it('draws a full turquoise ring with a 20 s pulse and the hold time counting up', () => {
    const { engine, renderer, run } = setup();
    const base = (() => {
      run(BREATHING_MS);
      return ringRadius();
    })();
    expect(ringStroke()).toBe('var(--color-retention)');
    expect(dotEl().getAttribute('visibility')).toBe('hidden');
    expect(tickCount()).toBe(0);
    expect(text('#phase-label')).toBe('Hold');
    run(BREATHING_MS + 10_000);
    expect(ringRadius()).toBeCloseTo(48, 1); // full at half the pulse
    run(BREATHING_MS + 20_000);
    expect(ringRadius()).toBeCloseTo(base, 1); // back at base after one pulse
    expect(base).toBeCloseTo(40, 1);
    run(BREATHING_MS + 92_000);
    expect(text('#countdown')).toBe('01:32');
    // Paused: the pulse freezes with the signal.
    const frozen = engine.signalAt(BREATHING_MS + 3_000);
    renderer.renderPaused(frozen);
    const r = ringRadius();
    renderer.renderPaused(frozen);
    expect(ringRadius()).toBe(r);
  });

  it('renders the recovery like a regular hold with 15 ticks and the seconds remaining', () => {
    const { clock, engine, renderer } = setup();
    clock.t = BREATHING_MS + 30_000;
    engine.endRetention();
    clock.t += 1_750 + 5_000;
    renderer.renderRunning(engine.signal()!);
    expect(ringStroke()).toBe('var(--color-hold-full)');
    expect(ringProgress()).toBeCloseTo(1 / 3, 2);
    expect(dotEl().getAttribute('visibility')).toBe('visible');
    expect(tickCount()).toBe(15);
    expect(text('#countdown')).toBe('10');
    expect(text('#session-stats')).toBe('Rounds: 1 · Time: 01:46');
  });

  it('counts rounds in the stats from the first moment of the recovery', () => {
    const { clock, engine, renderer } = setup();
    renderer.renderRunning(engine.signal()!);
    expect(text('#session-stats')).toBe('Rounds: 0 · Time: 00:00');
    clock.t = BREATHING_MS + 10_000;
    engine.endRetention();
    renderer.renderRunning(engine.signal()!);
    expect(text('#session-stats')).toBe('Rounds: 1 · Time: 01:20');
  });

  it('lists finished rounds below the circle and keeps them with the stats after the session', () => {
    const { clock, engine, renderer } = setup();
    const rounds = () => Array.from(document.querySelectorAll('#rounds li'), (li) => li.textContent);
    clock.t = BREATHING_MS + 92_000;
    engine.endRetention();
    renderer.renderRounds(engine.holds);
    expect(rounds()).toEqual(['Round 1 01:32']);
    clock.t += 18_500 + BREATHING_MS + 125_000;
    engine.endRetention();
    renderer.renderRunning(engine.signal()!);
    renderer.renderRounds(engine.holds);
    expect(rounds()).toEqual(['Round 1 01:32', 'Round 2 02:05']);

    renderer.showSummary();
    engine.reset();
    renderer.renderIdle();
    expect(text('#session-stats')).toBe('');
    expect(text('#summary-stats')).toBe('Rounds: 2 · Time: 06:15');
    expect(rounds()).toHaveLength(2);
    expect(document.querySelector('#rounds')!.closest('.overlay')).toBeNull();

    renderer.clearSummary();
    expect(text('#summary-stats')).toBe('');
    expect(rounds()).toEqual([]);
  });
});
