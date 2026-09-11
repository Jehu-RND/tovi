/**
 * Pass A (geometry) — placeholder tests.
 *
 * Skipped until diffGeometry() is implemented. The fixture below deliberately
 * uses very different absolute origins on the two sides (Figma canvas at
 * x=4000, browser viewport at x=0) so that the first real test to run will
 * catch any implementation that compares absolute coordinates.
 */

import { describe, it, expect } from 'vitest';
import type { ElementPair, SectionContext } from '../src/types.js';
import type { Tolerances } from '../src/config/schema.js';
import { DEFAULT_TOLERANCES } from '../src/config/schema.js';

/**
 * The section both sides are normalized against.
 *
 * Figma's canvas origin and the browser's viewport origin are unrelated —
 * that gap is exactly what normalization has to cancel out.
 */
const section: SectionContext = {
  figmaId: 'hero',
  figma: { x: 4000, y: 2400, width: 1440, height: 720 },
  live: { x: 0, y: 96, width: 1440, height: 720 },
};

/** An element sitting 120px in and 80px down from its section on both sides. */
function alignedPair(): ElementPair {
  return {
    figmaId: 'hero-cta',
    figma: {
      figmaId: 'hero-cta',
      nodeId: '1:45',
      type: 'FRAME',
      absoluteBoundingBox: { x: 4120, y: 2480, width: 180, height: 48 },
      padding: { top: 12, right: 24, bottom: 12, left: 24 },
      cornerRadius: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
      backgroundColor: { r: 0, g: 102, b: 255, a: 1 },
      shadows: [],
    },
    live: {
      figmaId: 'hero-cta',
      selector: '[data-figma-id="hero-cta"]',
      boundingRect: { x: 120, y: 176, width: 180, height: 48 },
      padding: { top: 12, right: 24, bottom: 12, left: 24 },
      cornerRadius: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
      backgroundColor: { r: 0, g: 102, b: 255, a: 1 },
      color: { r: 255, g: 255, b: 255, a: 1 },
      shadows: [],
      text: {
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 24,
        letterSpacing: 0,
      },
      textContent: 'Get started',
    },
  };
}

const tolerances: Tolerances = DEFAULT_TOLERANCES;

describe('toRelativeOffset', () => {
  it.skip('subtracts the section origin from the element origin', () => {
    // TODO: toRelativeOffset({x: 4120, y: 2480, ...}, section.figma)
    //       -> { x: 120, y: 80 }
    expect(section.figma.x).toBe(4000);
  });
});

describe('diffGeometry', () => {
  it.skip('reports no issues when relative offsets match despite different absolute origins', () => {
    // This is the load-bearing test for the whole pass. Both sides sit at a
    // relative (120, 80) but their absolute coordinates differ by thousands of
    // px. An implementation that compares absolute values fails here.
    // TODO: expect(diffGeometry(alignedPair(), section, tolerances)).toEqual([]);
    expect(alignedPair().figma?.absoluteBoundingBox.x).toBe(4120);
  });

  it.skip('reports an offsetX issue when the relative horizontal offset drifts', () => {
    // TODO: shift the live rect to x=140 -> one 'offsetX' issue with delta 20.
  });

  it.skip('reports width and height issues independently of position', () => {
    // TODO: live width 200 vs figma 180 -> one 'width' issue, no position ones.
  });

  it.skip('reports one padding issue per drifting side, tagged with the side name', () => {
    // TODO: live paddingLeft 32 vs figma 24 -> one issue with detail 'left'.
  });

  it.skip('treats a browser-clamped corner radius as a match', () => {
    // TODO: figma radius 40 on a 48px-tall box; CSS clamps to 24 -> [].
  });

  it.skip('reports a color issue only when the perceptual distance exceeds tolerance', () => {
    // TODO: rgb(0,102,255) vs rgb(0,103,255) -> [] (deltaE under tolerance).
    expect(tolerances.color).toBe(2);
  });

  it.skip('reports a shadow count mismatch without pairing the stacks', () => {
    // TODO: figma has 1 shadow, live has 2 -> one 'shadow' issue about count.
  });
});
