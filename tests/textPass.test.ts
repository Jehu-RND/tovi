/**
 * Pass B (text) — placeholder tests.
 *
 * These are skipped on purpose: the implementation is still a stub, so an
 * active test here would fail the suite for a known reason and train everyone
 * to ignore red. Un-skip each one as diffText() lands.
 */

import { describe, it, expect } from 'vitest';
import type { ElementPair, TextSpec } from '../src/types.js';
import type { Tolerances } from '../src/config/schema.js';
import { DEFAULT_TOLERANCES } from '../src/config/schema.js';

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
function pair(figmaText: Partial<TextSpec>, liveText: Partial<TextSpec>): ElementPair {
  return {
    figmaId: 'hero-heading',
    figma: {
      figmaId: 'hero-heading',
      nodeId: '1:23',
      type: 'TEXT',
      absoluteBoundingBox: { x: 0, y: 0, width: 600, height: 64 },
      text: textSpec(figmaText),
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
      textContent: 'Hero heading',
    },
  };
}

const tolerances: Tolerances = DEFAULT_TOLERANCES;

describe('diffText', () => {
  it.skip('reports no issues when every text property matches', () => {
    // TODO: expect(diffText(pair({}, {}), tolerances)).toEqual([]);
    expect(pair({}, {})).toBeDefined();
  });

  it.skip('reports a fontSize issue when the size drifts beyond tolerance', () => {
    // TODO: figma 24px vs live 28px -> one 'fontSize' issue with delta 4.
    expect(tolerances.fontSize).toBe(0.5);
  });

  it.skip('ignores a size difference that falls within tolerance', () => {
    // TODO: figma 24px vs live 24.3px -> [].
  });

  it.skip('reports a fontWeight issue for any difference (tolerance is 0)', () => {
    // TODO: figma 600 vs live 700 -> one 'fontWeight' issue.
  });

  it.skip('compares only the first family in a CSS font stack', () => {
    // TODO: figma "Inter" vs live "Inter, system-ui, sans-serif" -> [].
  });

  it.skip('reports a structural issue when the live side is missing', () => {
    // TODO: pair with live undefined -> one 'missingInLive' issue, and no
    //       per-property issues alongside it.
  });
});
