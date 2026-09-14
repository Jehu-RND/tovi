/**
 * Pass B (text) — comparison behaviour.
 */

import { describe, expect, it } from 'vitest';
import { comparableTextKeys, diffText, normalizeFontFamily } from '../src/compare/textPass.js';
import { DEFAULT_TOLERANCES } from '../src/config/schema.js';
import type { Tolerances } from '../src/config/schema.js';
import type { ElementPair, TextSpec } from '../src/types.js';

const tolerances: Tolerances = DEFAULT_TOLERANCES;

/** Build a TextSpec with sensible defaults for whichever fields a test ignores. */
function textSpec(overrides: Partial<TextSpec> = {}): TextSpec {
  return {
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: 600,
    lineHeight: 32,
    letterSpacing: 0,
    ...overrides,
  };
}

/** Build a paired element whose two sides differ only where a test says so. */
function pair(
  figmaText: Partial<TextSpec> = {},
  liveText: Partial<TextSpec> = {},
  extra: { characters?: string; textContent?: string } = {},
): ElementPair {
  return {
    figmaId: 'hero-heading',
    figma: {
      figmaId: 'hero-heading',
      nodeId: '1:23',
      type: 'TEXT',
      absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 64 },
      text: textSpec(figmaText),
      ...(extra.characters !== undefined ? { characters: extra.characters } : {}),
    },
    live: {
      figmaId: 'hero-heading',
      selector: '[data-figma-id="hero-heading"]',
      boundingRect: { x: 0, y: 0, width: 600, height: 64 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      cornerRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
      color: { r: 17, g: 17, b: 17, a: 1 },
      shadows: [],
      text: textSpec(liveText),
      textContent: extra.textContent ?? 'Hero heading',
    },
  };
}

describe('normalizeFontFamily', () => {
  it('takes the first family and strips quotes and case', () => {
    expect(normalizeFontFamily('"Inter", system-ui, sans-serif')).toBe('inter');
    expect(normalizeFontFamily("  'Source Serif Pro' , Georgia ")).toBe('source serif pro');
  });
});

describe('comparableTextKeys', () => {
  it('skips properties that are unusable on either side', () => {
    const a = textSpec();
    const b = textSpec({ fontFamily: '', lineHeight: Number.NaN });
    expect(comparableTextKeys(a, b)).toEqual(['fontSize', 'fontWeight', 'letterSpacing']);
  });
});

describe('diffText', () => {
  it('reports no issues when every text property matches', () => {
    expect(diffText(pair(), tolerances)).toEqual([]);
  });

  it('reports a fontSize issue when the size drifts beyond tolerance', () => {
    const issues = diffText(pair({ fontSize: 24 }, { fontSize: 28 }), tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      pass: 'text',
      property: 'fontSize',
      severity: 'error',
      expected: '24px',
      actual: '28px',
      delta: 4,
      tolerance: 0.5,
    });
  });

  it('ignores a size difference that falls within tolerance', () => {
    expect(diffText(pair({ fontSize: 24 }, { fontSize: 24.3 }), tolerances)).toEqual([]);
  });

  it('reports a fontWeight issue for any difference, without a px unit', () => {
    const issues = diffText(pair({ fontWeight: 600 }, { fontWeight: 700 }), tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      property: 'fontWeight',
      expected: '600',
      actual: '700',
      delta: 100,
    });
  });

  it('compares only the first family in a CSS font stack', () => {
    const issues = diffText(
      pair({ fontFamily: 'Inter' }, { fontFamily: 'Inter, system-ui, sans-serif' }),
      tolerances,
    );
    expect(issues).toEqual([]);
  });

  it('reports a fontFamily issue with no delta when the families differ', () => {
    const issues = diffText(pair({ fontFamily: 'Inter' }, { fontFamily: 'Roboto' }), tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ property: 'fontFamily', expected: 'Inter', actual: 'Roboto' });
    expect(issues[0]?.delta).toBeUndefined();
  });

  it('reports copy drift as a warning, not an error', () => {
    const issues = diffText(
      pair({}, {}, { characters: 'Ship   faster', textContent: 'Ship sooner' }),
      tolerances,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      property: 'textContent',
      severity: 'warning',
      expected: 'Ship faster',
      actual: 'Ship sooner',
    });
  });

  it('ignores whitespace-only copy differences', () => {
    const issues = diffText(
      pair({}, {}, { characters: 'Ship\n  faster', textContent: 'Ship faster' }),
      tolerances,
    );
    expect(issues).toEqual([]);
  });

  it('returns nothing for a non-TEXT node', () => {
    const element = pair();
    delete element.figma?.text;
    expect(diffText(element, tolerances)).toEqual([]);
  });

  // --- Skipped properties are reported, not dropped ---

  it('reports a NaN line-height as an info skip rather than silence', () => {
    const issues = diffText(pair({}, { lineHeight: Number.NaN }), tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      property: 'skipped',
      severity: 'info',
      expected: 'lineHeight compared',
      actual: 'lineHeight skipped',
    });
    expect(issues[0]!.detail).toContain('normal');
  });

  it('never fails a run on a skip alone', () => {
    const issues = diffText(pair({}, { lineHeight: Number.NaN }), tolerances);
    expect(issues.every((issue) => issue.severity !== 'error')).toBe(true);
  });

  it('says which side is missing the value', () => {
    const issues = diffText(pair({ fontWeight: Number.NaN }), tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.detail).toContain('Figma node does not report it');
  });

  it('still compares every other property when one is skipped', () => {
    const issues = diffText(pair({}, { lineHeight: Number.NaN, fontSize: 30 }), tolerances);
    expect(issues.filter((issue) => issue.property === 'fontSize')).toHaveLength(1);
    expect(issues.filter((issue) => issue.property === 'skipped')).toHaveLength(1);
  });

  it('reports one structural issue when the live side is missing', () => {
    const issues = diffText({ figmaId: 'hero-heading', figma: pair().figma }, tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ property: 'missingInLive', severity: 'error' });
  });

  it('reports one structural issue when the Figma side is missing', () => {
    const issues = diffText({ figmaId: 'hero-heading', live: pair().live }, tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ property: 'missingInFigma', severity: 'error' });
  });
});
