/**
 * Comparison wiring — how runCheck pairs elements and dispatches the passes,
 * without a network or a browser.
 */

import { describe, expect, it } from 'vitest';
import { compareAll, runNotes } from '../src/index.js';
import { validateConfig } from '../src/config/loadConfig.js';
import type { ToviConfig } from '../src/config/schema.js';
import type { FigmaSpec, LiveStyles } from '../src/types.js';

/** Section at an arbitrary canvas origin; elements offset from it. */
const SECTION_ORIGIN = { x: -94257, y: -63049 };

function config(elements: unknown[]): ToviConfig {
  return validateConfig({
    figmaFileKey: 'KEY',
    url: 'https://example.com/',
    section: 'hero',
    viewport: { width: 1728, height: 1000 },
    elements,
  });
}

function figmaSpec(figmaId: string, dx: number, dy: number, w = 180, h = 48): FigmaSpec {
  return {
    figmaId,
    nodeId: '1:1',
    type: 'FRAME',
    absoluteBoundingBox: {
      x: SECTION_ORIGIN.x + dx, y: SECTION_ORIGIN.y + dy, width: w, height: h,
    },
  };
}

function liveStyles(figmaId: string, dx: number, dy: number, w = 180, h = 48): LiveStyles {
  // Live sits at a completely different origin: the section starts 140px down
  // the viewport, nowhere near the Figma canvas coordinates.
  return {
    figmaId,
    selector: `[data-figma-id="${figmaId}"]`,
    boundingRect: { x: dx, y: 140 + dy, width: w, height: h },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    cornerRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
    backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
    color: { r: 0, g: 0, b: 0, a: 1 },
    shadows: [],
    text: { fontFamily: 'Gotham', fontSize: 16, fontWeight: 400, lineHeight: 24, letterSpacing: 0 },
    textContent: '',
  };
}

const BASE_ELEMENTS = [
  { figmaId: 'hero', nodeId: '1:1', passes: ['geometry'] },
  { figmaId: 'hero-cta', nodeId: '1:2', passes: ['geometry'] },
];

describe('compareAll', () => {
  it('finds nothing when relative offsets agree across unrelated origins', () => {
    const specs = new Map([
      ['hero', figmaSpec('hero', 0, 0, 1728, 6537)],
      ['hero-cta', figmaSpec('hero-cta', 460, 1511)],
    ]);
    const styles = new Map([
      ['hero', liveStyles('hero', 0, 0, 1728, 6537)],
      ['hero-cta', liveStyles('hero-cta', 460, 1511)],
    ]);
    expect(compareAll(config(BASE_ELEMENTS), specs, styles)).toEqual([]);
  });

  it('reports a missing live element once, not once per pass', () => {
    const elements = [
      { figmaId: 'hero', nodeId: '1:1', passes: ['geometry'] },
      { figmaId: 'hero-cta', nodeId: '1:2', passes: ['text', 'geometry'] },
    ];
    const specs = new Map([
      ['hero', figmaSpec('hero', 0, 0, 1728, 6537)],
      ['hero-cta', figmaSpec('hero-cta', 460, 1511)],
    ]);
    const styles = new Map([['hero', liveStyles('hero', 0, 0, 1728, 6537)]]);

    const issues = compareAll(config(elements), specs, styles);
    const ctaIssues = issues.filter((i) => i.figmaId === 'hero-cta');
    expect(ctaIssues).toHaveLength(1);
    expect(ctaIssues[0]?.property).toBe('missingInLive');
  });

  it('reports a duplicated attribute as ambiguous, and runs no passes for it', () => {
    const specs = new Map([
      ['hero', figmaSpec('hero', 0, 0, 1728, 6537)],
      ['hero-cta', figmaSpec('hero-cta', 460, 1511)],
    ]);
    const styles = new Map([['hero', liveStyles('hero', 0, 0, 1728, 6537)]]);

    const issues = compareAll(config(BASE_ELEMENTS), specs, styles, new Set(['hero-cta']));
    const ctaIssues = issues.filter((i) => i.figmaId === 'hero-cta');
    expect(ctaIssues).toHaveLength(1);
    expect(ctaIssues[0]).toMatchObject({
      property: 'ambiguousInLive',
      detail: '[data-figma-id="hero-cta"]',
    });
  });

  it('says geometry was skipped rather than silently reporting nothing', () => {
    // The section is missing on the live side, so no element can be normalized.
    const specs = new Map([
      ['hero', figmaSpec('hero', 0, 0, 1728, 6537)],
      ['hero-cta', figmaSpec('hero-cta', 460, 1511)],
    ]);
    const styles = new Map([['hero-cta', liveStyles('hero-cta', 999, 999)]]);

    const issues = compareAll(config(BASE_ELEMENTS), specs, styles);
    const cta = issues.filter((i) => i.figmaId === 'hero-cta');
    expect(cta).toHaveLength(1);
    expect(cta[0]).toMatchObject({ property: 'skipped', severity: 'info' });
    // An info issue must not turn into a failure on its own.
    expect(cta[0]?.severity).not.toBe('error');
  });

  it('compares the section container by size but not by its own offset', () => {
    // A container measured against itself is always at offset (0,0), so an
    // offset issue there would be meaningless — but a size change is real.
    const specs = new Map([['hero', figmaSpec('hero', 0, 0, 1728, 6537)]]);
    const styles = new Map([['hero', liveStyles('hero', 0, 0, 1600, 6537)]]);

    const issues = compareAll(config([{ figmaId: 'hero', nodeId: '1:1', passes: ['geometry'] }]), specs, styles);
    expect(issues.map((i) => i.property)).toEqual(['width']);
  });

  it('honours relativeTo, measuring against a different container', () => {
    const elements = [
      { figmaId: 'hero', nodeId: '1:1', passes: ['geometry'] },
      { figmaId: 'panel', nodeId: '1:2', passes: ['geometry'] },
      { figmaId: 'badge', nodeId: '1:3', relativeTo: 'panel', passes: ['geometry'] },
    ];
    const specs = new Map([
      ['hero', figmaSpec('hero', 0, 0, 1728, 6537)],
      ['panel', figmaSpec('panel', 100, 200, 400, 300)],
      ['badge', figmaSpec('badge', 140, 240, 40, 40)],   // 40,40 inside panel
    ]);
    const styles = new Map([
      ['hero', liveStyles('hero', 0, 0, 1728, 6537)],
      ['panel', liveStyles('panel', 700, 900, 400, 300)],  // panel moved wholesale
      ['badge', liveStyles('badge', 740, 940, 40, 40)],    // still 40,40 inside it
    ]);

    const issues = compareAll(config(elements), specs, styles);
    // The panel itself drifted relative to the hero; the badge did not drift
    // relative to the panel, so only the panel is reported.
    expect(issues.every((i) => i.figmaId === 'panel')).toBe(true);
    expect(issues.map((i) => i.property).sort()).toEqual(['offsetX', 'offsetY']);
  });

  it('does not restate a structural problem normalization already reported', () => {
    // A node that failed to normalize carries an issue saying why, which is
    // more useful than "no Figma node found". Emitting both states the same
    // fact twice, in descending order of usefulness.
    const cfg = config([{ figmaId: 'hero', nodeId: '1:1' }]);
    const issues = compareAll(cfg, new Map(), new Map(), new Set(), new Set(['hero']));
    expect(issues).toEqual([]);
  });

  it('still reports a genuinely absent node', () => {
    const cfg = config([{ figmaId: 'hero', nodeId: '1:1' }]);
    const issues = compareAll(cfg, new Map(), new Map());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ property: 'missingInFigma' });
  });
});

/**
 * runNotes — what the extractor did to the page, said out loud.
 *
 * The zero cases matter most: an overlay selector that hid nothing is how an
 * author learns the vendor renamed the class, and silence there is how a
 * config keeps looking correct long after it stopped being so.
 */
describe('runNotes', () => {
  it('says how many elements each overlay hid', () => {
    const notes = runNotes({
      overlays: [{ selector: '.promo', hidden: 2 }],
      images: { promoted: 0, pending: 0 },
    });
    expect(notes).toEqual([
      { kind: 'overlay', message: 'overlay ".promo" hid 2 elements before measuring' },
    ]);
  });

  it('says so when an overlay matched nothing, rather than staying quiet', () => {
    const notes = runNotes({
      overlays: [{ selector: '.gone', hidden: 0 }],
      images: { promoted: 0, pending: 0 },
    });
    expect(notes[0]?.message).toContain('matched nothing');
  });

  it('names a selector the browser could not parse', () => {
    const notes = runNotes({
      overlays: [{ selector: '.a[', hidden: 0, invalid: true }],
      images: { promoted: 0, pending: 0 },
    });
    expect(notes[0]?.message).toContain('not a selector the browser can parse');
  });

  it('keeps the overlays in config order, so two runs read alike', () => {
    const notes = runNotes({
      overlays: [{ selector: '.a', hidden: 1 }, { selector: '.b', hidden: 1 }],
      images: { promoted: 0, pending: 0 },
    });
    expect(notes[0]?.message).toContain('".a"');
    expect(notes[1]?.message).toContain('".b"');
  });

  it('counts in the singular when exactly one thing happened', () => {
    const notes = runNotes({
      overlays: [{ selector: '.promo', hidden: 1 }],
      images: { promoted: 1, pending: 0 },
    });
    expect(notes[0]?.message).toContain('hid 1 element before');
    expect(notes[1]?.message).toContain('1 lazy-loaded image switched');
  });

  it('reports lazy images only when some were promoted', () => {
    expect(runNotes({ overlays: [], images: { promoted: 0, pending: 0 } })).toEqual([]);
    expect(runNotes({ overlays: [], images: { promoted: 1, pending: 0 } })[0]?.kind)
      .toBe('lazyImages');
  });

  it('reports images that never arrived, because a box relying on one is short', () => {
    const notes = runNotes({ overlays: [], images: { promoted: 4, pending: 1 } });
    expect(notes.map((note) => note.kind)).toEqual(['lazyImages', 'pendingImages']);
    expect(notes[1]?.message).toContain('1 image had still not loaded');
  });
});
