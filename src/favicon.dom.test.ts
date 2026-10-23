// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { FaviconController, faviconHref, mixHex } from './favicon';

describe('FaviconController', () => {
  let root: HTMLElement;
  let link: HTMLLinkElement;

  beforeEach(() => {
    root = document.documentElement;
    root.style.setProperty('--color-in', '#e5484d');
    root.style.setProperty('--color-in-dim', '#63191e');
    root.style.setProperty('--color-out', '#3e8fdd');
    root.style.setProperty('--color-out-dim', '#1c3f60');
    link = document.createElement('link');
    document.head.append(link);
  });

  it('draws the backdrop and the full ring in the resolved palette colors', () => {
    const favicon = new FaviconController(root, link);
    favicon.show('var(--color-in)');
    expect(link.href).toBe(faviconHref(mixHex('#e5484d', '#ffffff', 0.35)!, mixHex('#63191e', '#e5484d', 0.4)!));
    expect(decodeURIComponent(link.href)).toContain('stroke="#972c31" stroke-width="8"');
    expect(decodeURIComponent(link.href)).toContain('stroke="#ee888b" stroke-width="1.5"');
    favicon.show('var(--color-out)');
    expect(link.href).toBe(faviconHref(mixHex('#3e8fdd', '#ffffff', 0.35)!, mixHex('#1c3f60', '#3e8fdd', 0.4)!));
  });

  it('picks up a palette change on refresh', () => {
    const favicon = new FaviconController(root, link);
    favicon.show('var(--color-in)');
    root.style.setProperty('--color-in', '#b8281f');
    favicon.show('var(--color-in)');
    expect(link.href).toBe(faviconHref(mixHex('#e5484d', '#ffffff', 0.35)!, mixHex('#63191e', '#e5484d', 0.4)!));
    favicon.refresh();
    expect(link.href).toBe(faviconHref(mixHex('#b8281f', '#ffffff', 0.35)!, mixHex('#63191e', '#b8281f', 0.4)!));
  });

  it('falls back to idle gray for an unknown color', () => {
    const favicon = new FaviconController(root, link);
    favicon.show('var(--color-missing)');
    expect(link.href).toBe(faviconHref('#9fa3ac', '#494f58'));
  });

  it('blends hex colors and rejects other formats', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#102030', '#102030', 0.4)).toBe('#102030');
    expect(mixHex('red', '#ffffff', 0.5)).toBeNull();
  });
});
