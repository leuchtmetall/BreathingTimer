export type Theme = 'day' | 'night';

export const NIGHT_QUERY = '(prefers-color-scheme: dark)';

type MatchMedia = (query: string) => MediaQueryList;

/**
 * Night mode activation. The palette itself is pure CSS: the system
 * preference applies through a `prefers-color-scheme` media query, and a
 * manual override is a `data-theme` attribute on the root element that wins
 * in both directions. This controller only owns the override and the toggle's
 * pressed state.
 *
 * The override is deliberately in memory only (never written to storage), so
 * a reload follows the system preference again.
 */
export class ThemeController {
  private readonly root: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly query: MediaQueryList | null;
  private override: Theme | null = null;

  constructor(root: HTMLElement, toggleButton: HTMLButtonElement, matchMedia?: MatchMedia) {
    this.root = root;
    this.toggleButton = toggleButton;
    this.query = nightQuery(matchMedia);
    // Keep the toggle's pressed state in step with a live system change.
    this.query?.addEventListener?.('change', () => this.reflect());
    toggleButton.addEventListener('click', () => this.toggle());
    this.reflect();
  }

  get systemTheme(): Theme {
    return this.query?.matches ? 'night' : 'day';
  }

  get theme(): Theme {
    return this.override ?? this.systemTheme;
  }

  toggle(): void {
    this.override = this.theme === 'night' ? 'day' : 'night';
    this.reflect();
  }

  private reflect(): void {
    if (this.override) this.root.dataset.theme = this.override;
    else delete this.root.dataset.theme;
    this.toggleButton.setAttribute('aria-pressed', String(this.theme === 'night'));
  }
}

/** The system night query, or null where matchMedia is unavailable (jsdom). */
function nightQuery(matchMedia: MatchMedia | undefined): MediaQueryList | null {
  if (typeof matchMedia !== 'function') return null;
  try {
    return matchMedia(NIGHT_QUERY);
  } catch {
    return null;
  }
}
