// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { BreathingEngine } from './engine';
import { preset467 } from './presets';
import { browserAudioContext, SoundScheduler } from './sound';

it('does nothing under jsdom, which has no Web Audio', () => {
  expect(browserAudioContext()).toBeNull();
  const engine = new BreathingEngine(preset467);
  const scheduler = new SoundScheduler();
  expect(() => {
    scheduler.unlock();
    scheduler.setEnabled(true);
    engine.start();
    scheduler.sync(engine);
    scheduler.recover();
    engine.reset();
    scheduler.sync(engine);
  }).not.toThrow();
});
