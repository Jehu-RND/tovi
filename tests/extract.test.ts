/**
 * Live extraction — the pure half.
 *
 * The browser half needs Chromium and is covered by the integration test;
 * everything here runs in Node and parses what the browser hands back.
 */

import { describe, expect, it } from 'vitest';
import {
  defaultSelector,
  normalizeLiveStyles,
  parseBoxShadow,
  splitTopLevel,
} from '../src/live/extract.js';
import type { RawLiveStyles } from '../src/live/extract.js';

describe('defaultSelector', () => {
  it('targets the data-figma-id attribute', () => {
    expect(defaultSelector('hero-cta')).toBe('[data-figma-id="hero-cta"]');
  });
});

describe('splitTopLevel', () => {
  it('does not split on the commas inside rgba()', () => {
    expect(splitTopLevel('rgba(0, 0, 0, 0.25) 0px 2px 8px, rgb(1, 2, 3) 0px 1px 2px'))
      .toEqual(['rgba(0, 0, 0, 0.25) 0px 2px 8px', 'rgb(1, 2, 3) 0px 1px 2px']);
  });

  it('returns a single part when there is no top-level comma', () => {
    expect(splitTopLevel('rgb(0, 0, 0) 0px 0px 0px')).toEqual(['rgb(0, 0, 0) 0px 0px 0px']);
  });
});

describe('parseBoxShadow', () => {
  it('returns nothing for none', () => {
    expect(parseBoxShadow('none')).toEqual([]);
    expect(parseBoxShadow('  ')).toEqual([]);
  });

  it('parses the shape Chrome reports', () => {
    expect(parseBoxShadow('rgba(0, 0, 0, 0.25) 0px 2px 8px 1px')).toEqual([{
      offsetX: 0, offsetY: 2, blur: 8, spread: 1,
      color: { r: 0, g: 0, b: 0, a: 0.25 }, inset: false,
    }]);
  });

  it('detects inset', () => {
    expect(parseBoxShadow('rgb(0, 0, 0) 0px 1px 2px 0px inset')[0]?.inset).toBe(true);
  });

  it('parses a multi-layer shadow in order', () => {
    const shadows = parseBoxShadow(
      'rgba(0, 0, 0, 0.1) 0px 1px 2px 0px, rgba(0, 0, 0, 0.2) 0px 4px 8px 2px',
    );
    expect(shadows).toHaveLength(2);
    expect(shadows[0]).toMatchObject({ offsetY: 1, blur: 2, spread: 0 });
    expect(shadows[1]).toMatchObject({ offsetY: 4, blur: 8, spread: 2 });
  });

  it('handles negative offsets', () => {
    expect(parseBoxShadow('rgb(0, 0, 0) -2px -4px 6px 0px')[0])
      .toMatchObject({ offsetX: -2, offsetY: -4 });
  });

  it('skips a layer whose colour cannot be parsed rather than fabricating one', () => {
    expect(parseBoxShadow('notacolor 0px 2px 4px')).toEqual([]);
  });
});

describe('normalizeLiveStyles', () => {
  function raw(overrides: Partial<RawLiveStyles> = {}): RawLiveStyles {
    return {
      boundingRect: { x: 120, y: 176, width: 180, height: 48 },
      padding: { top: 12, right: 24, bottom: 12, left: 24 },
      cornerRadius: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
      borderWidths: { top: 0, right: 0, bottom: 0, left: 0 },
      borderColors: {
        top: 'rgb(0, 0, 0)',
        right: 'rgb(0, 0, 0)',
        bottom: 'rgb(0, 0, 0)',
        left: 'rgb(0, 0, 0)',
      },
      backgroundColor: 'rgb(0, 102, 255)',
      color: 'rgb(255, 255, 255)',
      boxShadow: 'none',
      fontFamily: '"Gotham", system-ui, sans-serif',
      fontSize: 16,
      fontWeight: 600,
      lineHeight: 24,
      letterSpacing: 0,
      textContent: 'Get started',
      ...overrides,
    };
  }

  it('parses CSS colours into the shared Rgba form', () => {
    const styles = normalizeLiveStyles(raw(), 'hero-cta', '[data-figma-id="hero-cta"]');
    expect(styles.backgroundColor).toEqual({ r: 0, g: 102, b: 255, a: 1 });
    expect(styles.color).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it('treats an unparseable colour as nothing painted', () => {
    const styles = normalizeLiveStyles(
      raw({ backgroundColor: 'rgba(0, 0, 0, 0)' }), 'x', 'sel',
    );
    expect(styles.backgroundColor.a).toBe(0);
  });

  it('carries the full font stack through for the text pass to narrow', () => {
    const styles = normalizeLiveStyles(raw(), 'x', 'sel');
    expect(styles.text.fontFamily).toBe('"Gotham", system-ui, sans-serif');
  });

  it('keeps a NaN line-height so the text pass skips it', () => {
    const styles = normalizeLiveStyles(raw({ lineHeight: Number.NaN }), 'x', 'sel');
    expect(Number.isNaN(styles.text.lineHeight)).toBe(true);
  });
});
