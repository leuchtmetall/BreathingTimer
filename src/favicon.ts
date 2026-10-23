/** Fallbacks when a palette variable cannot be resolved (idle grays). */
const FALLBACK_COLOR = '#6b7280';
const FALLBACK_BACKDROP = '#33373e';
/** How far the backdrop is lifted from the track shade toward the bright color. */
const BACKDROP_LIFT = 0.4;
/** How far the progress ring is lifted from the bright color toward white. */
const RING_LIFT = 0.35;

/**
 * The display's layers at icon scale: the thick backdrop with the full,
 * thin progress ring on its midline (thicker than in the app to read at 16px).
 */
export function faviconSvg(color: string, backdrop: string): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    `<circle cx="16" cy="16" r="10" fill="none" stroke="${backdrop}" stroke-width="8"/>` +
    `<circle cx="16" cy="16" r="10" fill="none" stroke="${color}" stroke-width="1.5"/>` +
    '</svg>'
  );
}

export function faviconHref(color: string, backdrop: string): string {
  return `data:image/svg+xml,${encodeURIComponent(faviconSvg(color, backdrop))}`;
}

/**
 * Tints the favicon with the arc's current color. Takes the same
 * `var(--color-…)` expressions the renderer uses and resolves them against
 * the root, since a favicon cannot see the page's CSS variables; the backdrop
 * takes the matching `-dim` (track) shade lifted toward the bright color, and
 * the ring the bright color lifted toward white, so both stay visible in a
 * dark tab bar. Writes only when the resolved colors change; call `refresh()`
 * after a theme change.
 */
export class FaviconController {
  private readonly root: HTMLElement;
  private readonly link: HTMLLinkElement;
  private expression = '';
  private key = '';

  constructor(root: HTMLElement, link: HTMLLinkElement) {
    this.root = root;
    this.link = link;
  }

  show(expression: string): void {
    if (this.expression === expression) return;
    this.expression = expression;
    this.refresh();
  }

  /** Re-resolves the current color (the palette changes with the theme). */
  refresh(): void {
    const name = this.expression.match(/^var\((--[\w-]+)\)$/)?.[1];
    const color = this.resolve(name, FALLBACK_COLOR);
    const track = this.resolve(name && `${name}-dim`, FALLBACK_BACKDROP);
    const backdrop = mixHex(track, color, BACKDROP_LIFT) ?? track;
    const ring = mixHex(color, '#ffffff', RING_LIFT) ?? color;
    const key = `${ring}/${backdrop}`;
    if (this.key === key) return;
    this.key = key;
    this.link.href = faviconHref(ring, backdrop);
  }

  private resolve(name: string | undefined, fallback: string): string {
    if (!name) return fallback;
    return getComputedStyle(this.root).getPropertyValue(name).trim() || fallback;
  }
}

/** Blends two `#rrggbb` colors (`t` = 0 gives `a`); null for any other format. */
export function mixHex(a: string, b: string, t: number): string | null {
  const [from, to] = [rgb(a), rgb(b)];
  if (!from || !to) return null;
  return '#' + from.map((x, i) => Math.round(x + (to[i]! - x) * t).toString(16).padStart(2, '0')).join('');
}

function rgb(hex: string): number[] | null {
  const match = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return match ? match.slice(1).map((h) => parseInt(h, 16)) : null;
}
