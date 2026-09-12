/**
 * Pass A (geometry) — comparison behaviour.
 *
 * The fixture deliberately uses very different absolute origins on the two
 * sides (Figma canvas at x=4000, browser viewport at x=0) so that any
 * implementation comparing absolute coordinates fails immediately.
 */

import { describe, expect, it } from 'vitest';
import { diffGeometry, toRelativeOffset } from '../src/compare/geometryPass.js';
import { DEFAULT_TOLERANCES } from '../src/config/schema.js';
import type { Tolerances } from '../src/config/schema.js';
import type { ElementPair, SectionContext, Shadow } from '../src/types.js';

const tolerances: Tolerances = DEFAULT_TOLERANCES;

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

function shadow(overrides: Partial<Shadow> = {}): Shadow {
  return {
    offsetX: 0,
    offsetY: 2,
    blur: 8,
    spread: 0,
    color: { r: 0, g: 0, b: 0, a: 0.25 },
    inset: false,
    ...overrides,
  };
}

describe('toRelativeOffset', () => {
  it('subtracts the section origin from the element origin', () => {
    expect(toRelativeOffset({ x: 4120, y: 2480, width: 180, height: 48 }, section.figma))
      .toEqual({ x: 120, y: 80 });
    expect(toRelativeOffset({ x: 120, y: 176, width: 180, height: 48 }, section.live))
      .toEqual({ x: 120, y: 80 });
  });
});

describe('diffGeometry', () => {
  it('reports no issues when relative offsets match despite different absolute origins', () => {
    // The load-bearing test for the whole pass. Both sides sit at a relative
    // (120, 80) but their absolute coordinates differ by thousands of px.
    const element = alignedPair();
    expect(element.figma?.absoluteBoundingBox.x).toBe(4120);
    expect(element.live?.boundingRect.x).toBe(120);
    expect(diffGeometry(element, section, tolerances)).toEqual([]);
  });

  it('reports an offsetX issue when the relative horizontal offset drifts', () => {
    const element = alignedPair();
    element.live!.boundingRect.x = 140;
    const issues = diffGeometry(element, section, tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      pass: 'geometry',
      property: 'offsetX',
      expected: '120px',
      actual: '140px',
      delta: 20,
      tolerance: 2,
    });
  });

  it('ignores a position difference inside tolerance', () => {
    const element = alignedPair();
    element.live!.boundingRect.y = 177.5;
    expect(diffGeometry(element, section, tolerances)).toEqual([]);
  });

  it('reports width independently of position', () => {
    const element = alignedPair();
    element.live!.boundingRect.width = 200;
    const issues = diffGeometry(element, section, tolerances);
    expect(issues.map((issue) => issue.property)).toEqual(['width']);
    expect(issues[0]).toMatchObject({ delta: 20, tolerance: 1 });
  });

  it('reports one padding issue per drifting side, tagged with the side name', () => {
    const element = alignedPair();
    element.live!.padding.left = 32;
    const issues = diffGeometry(element, section, tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ property: 'padding', detail: 'left', delta: 8 });
  });

  it('treats a browser-clamped corner radius as a match', () => {
    // A 40px radius on a 48px-tall box renders as 24px. That is CSS agreeing
    // with the design, not drifting from it.
    const element = alignedPair();
    element.figma!.cornerRadius = {
      topLeft: 40, topRight: 40, bottomRight: 40, bottomLeft: 40,
    };
    element.live!.cornerRadius = {
      topLeft: 24, topRight: 24, bottomRight: 24, bottomLeft: 24,
    };
    expect(diffGeometry(element, section, tolerances)).toEqual([]);
  });

  it('still reports a corner radius that drifts below the clamp', () => {
    const element = alignedPair();
    element.live!.cornerRadius.topLeft = 0;
    const issues = diffGeometry(element, section, tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ property: 'cornerRadius', detail: 'topLeft', delta: -8 });
  });

  it('ignores a color difference below the perceptual tolerance', () => {
    const element = alignedPair();
    element.live!.backgroundColor = { r: 0, g: 103, b: 255, a: 1 };
    expect(diffGeometry(element, section, tolerances)).toEqual([]);
  });

  it('reports a color difference above the perceptual tolerance', () => {
    const element = alignedPair();
    element.live!.backgroundColor = { r: 0, g: 112, b: 255, a: 1 };
    const issues = diffGeometry(element, section, tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      property: 'backgroundColor',
      expected: 'rgb(0, 102, 255)',
      actual: 'rgb(0, 112, 255)',
      tolerance: 2,
    });
    expect(issues[0]?.delta).toBeGreaterThan(2);
  });

  it('reports an opacity-only color difference that deltaE alone would miss', () => {
    const element = alignedPair();
    element.live!.backgroundColor = { r: 0, g: 102, b: 255, a: 0.5 };
    const issues = diffGeometry(element, section, tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      property: 'backgroundColor',
      actual: 'rgba(0, 102, 255, 0.5)',
    });
  });

  it('skips properties the design does not set', () => {
    const element = alignedPair();
    delete element.figma?.padding;
    delete element.figma?.cornerRadius;
    delete element.figma?.backgroundColor;
    element.live!.padding.left = 999;
    element.live!.backgroundColor = { r: 255, g: 0, b: 0, a: 1 };
    expect(diffGeometry(element, section, tolerances)).toEqual([]);
  });

  it('reports a shadow count mismatch without pairing the stacks', () => {
    const element = alignedPair();
    element.figma!.shadows = [shadow()];
    element.live!.shadows = [shadow(), shadow({ offsetY: 12 })];
    const issues = diffGeometry(element, section, tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      property: 'shadow',
      detail: 'count',
      expected: '1 shadow',
      actual: '2 shadows',
    });
  });

  it('reports the drifting metric of a matched shadow, tagged by index', () => {
    const element = alignedPair();
    element.figma!.shadows = [shadow({ blur: 8 })];
    element.live!.shadows = [shadow({ blur: 16 })];
    const issues = diffGeometry(element, section, tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ property: 'shadow', detail: '0.blur', delta: 8 });
  });

  it('reports one structural issue when the live side is missing', () => {
    const issues = diffGeometry(
      { figmaId: 'hero-cta', figma: alignedPair().figma }, section, tolerances,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ property: 'missingInLive' });
  });
});
