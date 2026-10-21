// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { BreathingEngine, type Clock } from './engine';
import { preset467, type Preset } from './presets';
import { Renderer, type RenderTargets } from './renderer';

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
    dot: document.querySelector<SVGCircleElement>('#dot')!,
    phaseLabel: document.querySelector<HTMLElement>('#phase-label')!,
    countdown: document.querySelector<HTMLElement>('#countdown')!,
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
    const engine = new BreathingEngine(boxPreset(), new FakeClock());
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
    const strokeW = Number(
      document.querySelector<SVGCircleElement>('#ring')!.getAttribute('stroke-width'),
    );
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
    const ringW = Number(
      document.querySelector<SVGCircleElement>('#ring')!.getAttribute('stroke-width'),
    );
    // the unfilled outline matches the filled arc; backdrop is far thicker
    expect(trackW).toBe(ringW);
    expect(backdropW).toBeGreaterThan(trackW);
    expect(trackStroke()).not.toBe(backdropStroke()); // dim vs dark shades differ
    // and the whole stack follows the same breathing radius
    expect(ringRadius()).toBe(
      Number(document.querySelector<SVGCircleElement>('.ring-track')!.getAttribute('r')),
    );
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

    clock.t = 66_000; // wall time passes but the signal is frozen
    r.renderPaused(engine.signal()!);
    expect(ringRadius()).toBe(radius);
    expect(ringProgress()).toBeCloseTo(2 / 6, 2);
    expect(document.querySelector('#countdown')!.textContent).toBe(remaining);
    expect(
      (document.querySelector('#phase-label') as HTMLElement).textContent!.startsWith('Paused'),
    ).toBe(true);
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

function boxPreset(): Preset {
  return {
    name: 'box-4',
    phases: [
      { kind: 'inhale', seconds: 4, fill: [0, 1] },
      { kind: 'hold', seconds: 4, fill: [1, 1] },
      { kind: 'exhale', seconds: 4, fill: [1, 0] },
      { kind: 'hold', seconds: 4, fill: [0, 0] },
    ],
  };
}

function longHoldPreset(): Preset {
  return {
    name: 'long-hold',
    phases: [
      { kind: 'inhale', seconds: 4, fill: [0, 1] },
      { kind: 'hold', seconds: 15, fill: [1, 1] },
      { kind: 'exhale', seconds: 8, fill: [1, 0] },
    ],
  };
}

describe('Control wiring', () => {
  it('carries session state as a data attribute for the visibility CSS', async () => {
    // Stub rAF before loading the app glue so no animation loop runs here;
    // state transitions render synchronously on user actions.
    viStubRaf();
    await import('./main');

    const app = document.querySelector<HTMLElement>('#app')!;
    expect(app.getAttribute('data-session-state')).toBe('idle');

    (document.querySelector('#start') as HTMLButtonElement).click();
    expect(app.getAttribute('data-session-state')).toBe('running');
    expect(
      (document.querySelector('#phase-label') as HTMLElement).textContent,
    ).toBe('Breathe in');

    (document.querySelector('#pause') as HTMLButtonElement).click();
    expect(app.getAttribute('data-session-state')).toBe('paused');

    (document.querySelector('#reset') as HTMLButtonElement).click();
    expect(app.getAttribute('data-session-state')).toBe('idle');
    expect(
      (document.querySelector('#phase-label') as HTMLElement).textContent,
    ).toBe('Ready');
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
