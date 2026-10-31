import type { Cue } from './engine';
import type { PhaseKind, Preset } from './presets';
import { runningLabel } from './renderer';

/** Where a debug jump lands: a fresh session this far in, with these holds. */
export interface JumpTarget {
  readonly label: string;
  readonly sessionMs: number;
  readonly holdsMs: readonly number[];
}

/** How far before a phase's end the "−3 s" entries land. */
const BEFORE_END_MS = 3_000;
/** Breath Retention: the hold entry that lands just before its first full minute. */
const BEFORE_MINUTE_MS = 57_000;
/** Breath Retention: the hold recorded for round 1 when jumping into the recovery. */
const DEBUG_HOLD_MS = 60_000;

/**
 * Jump entries for a tempo-resolved preset, in its first cycle or round: each
 * phase's start and 3 s before its end (never before its start). Breath
 * Retention collapses its breathing part into one entry pair and offers the
 * hold at its start and 3 s before its first minute.
 */
export function jumpTargets(preset: Preset): JumpTarget[] {
  const targets: JumpTarget[] = [];
  const pair = (name: string, startMs: number, durMs: number, holdsMs: readonly number[] = []) => {
    targets.push({ label: `${name} · start`, sessionMs: startMs, holdsMs });
    targets.push({ label: `${name} · −3 s`, sessionMs: Math.max(startMs, startMs + durMs - BEFORE_END_MS), holdsMs });
  };
  const openIndex = preset.phases.findIndex(({ role }) => role === 'retention');
  let startMs = 0;
  if (openIndex < 0) {
    for (const phase of preset.phases) {
      const durMs = phase.seconds * 1000;
      pair(runningLabel(phase.kind), startMs, durMs);
      startMs += durMs;
    }
    return targets;
  }
  const breathingMs = preset.phases.slice(0, openIndex).reduce((sum, p) => sum + p.seconds * 1000, 0);
  pair('Breathing', 0, breathingMs);
  targets.push({ label: 'Hold · start', sessionMs: breathingMs, holdsMs: [] });
  targets.push({ label: 'Hold · 0:57', sessionMs: breathingMs + BEFORE_MINUTE_MS, holdsMs: [] });
  startMs = breathingMs + DEBUG_HOLD_MS;
  for (const phase of preset.phases.slice(openIndex + 1)) {
    const durMs = phase.seconds * 1000;
    pair(`Recovery ${runningLabel(phase.kind).toLowerCase()}`, startMs, durMs, [DEBUG_HOLD_MS]);
    startMs += durMs;
  }
  return targets;
}

/** A sound the debug menu can play: a cue type and, for phase tones, its kind. */
export interface SoundChoice {
  readonly label: string;
  readonly type: Cue['type'];
  readonly kind?: PhaseKind;
}

/** Every sound the app makes, in the order the menu lists them. */
export const soundChoices: readonly SoundChoice[] = [
  { label: 'Breathe in tone', type: 'phase', kind: 'inhale' },
  { label: 'Hold tone', type: 'phase', kind: 'hold' },
  { label: 'Breathe out tone', type: 'phase', kind: 'exhale' },
  { label: 'Tick', type: 'tick' },
  { label: 'Breath tick', type: 'breath' },
  { label: 'Hold minute melody', type: 'hold-minute' },
];

export interface DebugMenuActions {
  jump(target: JumpTarget): void;
  preview(choice: SoundChoice): void;
}

/**
 * The collapsed debug menu, appended to `parent`. Only built in debug mode;
 * `rebuild` refreshes the jump entries for a newly selected preset.
 */
export class DebugMenu {
  private readonly jumps: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly actions: DebugMenuActions,
  ) {
    const menu = document.createElement('details');
    menu.className = 'debug-menu';
    const summary = document.createElement('summary');
    summary.textContent = 'Debug';
    this.jumps = group('Jump');
    const sounds = group('Sounds');
    sounds.append(...soundChoices.map((choice) => menuButton(choice.label, () => actions.preview(choice))));
    menu.append(summary, this.jumps.parentElement!, sounds.parentElement!);
    parent.append(menu);
  }

  rebuild(preset: Preset): void {
    this.jumps.replaceChildren(
      ...jumpTargets(preset).map((target) => menuButton(target.label, () => this.actions.jump(target))),
    );
  }
}

/** A titled section; returns the element that holds its buttons. */
function group(title: string): HTMLElement {
  const section = document.createElement('section');
  section.dataset.group = title.toLowerCase();
  const heading = document.createElement('h2');
  heading.textContent = title;
  const buttons = document.createElement('div');
  buttons.className = 'debug-buttons';
  section.append(heading, buttons);
  return buttons;
}

function menuButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}
