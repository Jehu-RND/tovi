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
import type { Check } from '../src/report/types.js';

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
      borders: {
        top: { width: 0, color: { r: 0, g: 0, b: 0, a: 0 } },
        right: { width: 0, color: { r: 0, g: 0, b: 0, a: 0 } },
        bottom: { width: 0, color: { r: 0, g: 0, b: 0, a: 0 } },
        left: { width: 0, color: { r: 0, g: 0, b: 0, a: 0 } },
      },
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

  // --- Borders (Pass A) ---

  /** A uniform border of `width` px in `color` on all four sides. */
  function border(width: number, color = { r: 17, g: 17, b: 17, a: 1 }) {
    return {
      top: { width, color },
      right: { width, color },
      bottom: { width, color },
      left: { width, color },
    };
  }

  it('accepts a border within tolerance', () => {
    const element = alignedPair();
    element.figma!.borders = border(2);
    element.live!.borders = border(2.3);
    expect(diffGeometry(element, section, tolerances)).toEqual([]);
  });

  it('reports a border width past tolerance, tagged by side', () => {
    const element = alignedPair();
    element.figma!.borders = border(1);
    element.live!.borders = border(2);
    const issues = diffGeometry(element, section, tolerances);
    expect(issues).toHaveLength(4);
    expect(issues[0]).toMatchObject({
      property: 'border',
      detail: 'top.width',
      expected: '1px',
      actual: '2px',
      delta: 1,
      tolerance: 0.5,
    });
  });

  it('signs the delta so a thinner live border reads negative', () => {
    const element = alignedPair();
    element.figma!.borders = border(4);
    element.live!.borders = { ...border(4), left: { width: 1, color: { r: 17, g: 17, b: 17, a: 1 } } };
    const issues = diffGeometry(element, section, tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ detail: 'left.width', delta: -3 });
  });

  it('skips borders entirely when the design does not set a stroke', () => {
    const element = alignedPair();
    element.live!.borders = border(3);
    // figma.borders stays undefined — an unset stroke asserts nothing.
    expect(diffGeometry(element, section, tolerances)).toEqual([]);
  });

  it('reports a border colour mismatch as a perceptual distance', () => {
    const element = alignedPair();
    element.figma!.borders = border(2, { r: 0, g: 102, b: 255, a: 1 });
    element.live!.borders = border(2, { r: 255, g: 0, b: 0, a: 1 });
    const issues = diffGeometry(element, section, tolerances);
    expect(issues).toHaveLength(4);
    expect(issues[0]).toMatchObject({ property: 'border', detail: 'top.color' });
    expect(issues[0]!.delta).toBeGreaterThan(2);
  });

  it('does not compare the colour of a border that is not drawn', () => {
    const element = alignedPair();
    // Both sides agree there is no border on the right; CSS still reports a
    // colour for it, and that colour must not be flagged.
    element.figma!.borders = { ...border(2), right: { width: 0, color: { r: 0, g: 0, b: 0, a: 1 } } };
    element.live!.borders = { ...border(2), right: { width: 0, color: { r: 255, g: 255, b: 255, a: 1 } } };
    expect(diffGeometry(element, section, tolerances)).toEqual([]);
  });

  it('notes a non-INSIDE stroke alignment without failing the run', () => {
    const element = alignedPair();
    element.figma!.borders = border(2);
    element.figma!.strokeAlign = 'OUTSIDE';
    element.live!.borders = border(2);
    const issues = diffGeometry(element, section, tolerances);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      property: 'border',
      detail: 'strokeAlign',
      severity: 'info',
      actual: 'OUTSIDE',
    });
  });

  it('reports one structural issue when the live side is missing', () => {
    const issues = diffGeometry(
      { figmaId: 'hero-cta', figma: alignedPair().figma }, section, tolerances,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ property: 'missingInLive' });
  });
});

/**
 * T-29. A stroke on a TEXT node is a glyph outline — CSS spells that
 * -webkit-text-stroke, while `border` draws a rectangle around the text
 * instead. Triage 001 produced four border errors from one such node, none of
 * which a live element could ever have satisfied.
 */
describe('a stroke on a TEXT node is not a CSS border', () => {
  /** A text layer carrying a 1px outline, as node 12576:8122 does. */
  function outlinedText(type: string): ElementPair {
    const pair = alignedPair();
    return {
      ...pair,
      figma: {
        ...pair.figma!,
        type,
        strokeAlign: 'OUTSIDE',
        borders: {
          top: { width: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
          right: { width: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
          bottom: { width: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
          left: { width: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
        },
      },
    };
  }

  it('raises no border-width errors for a TEXT node', () => {
    const issues = diffGeometry(outlinedText('TEXT'), section, DEFAULT_TOLERANCES);
    const widthErrors = issues.filter(
      (i) => i.property === 'border' && i.severity === 'error',
    );
    expect(widthErrors).toEqual([]);
  });

  it('still reports the outline, rather than going silent', () => {
    // Invariant 3: an uncomparable property must never read as a passing one.
    const issues = diffGeometry(outlinedText('TEXT'), section, DEFAULT_TOLERANCES);
    const note = issues.find((i) => i.property === 'border');
    expect(note?.severity).toBe('info');
    expect(note?.expected).toContain('text outline');
    expect(note?.detail).toBe('textStroke');
    expect(note?.expected).toContain('-webkit-text-stroke');
  });

  it('still compares borders on a non-TEXT node', () => {
    // The narrow fix must not turn into "stop comparing borders".
    const issues = diffGeometry(outlinedText('RECTANGLE'), section, DEFAULT_TOLERANCES);
    const widthErrors = issues.filter(
      (i) => i.property === 'border' && i.severity === 'error',
    );
    expect(widthErrors).toHaveLength(4);
  });
});

/**
 * Measurement advisories — T-27, T-04, T-05.
 *
 * Three facts the tool knew and used to keep to itself. Every test here checks
 * the same two things: that the advisory is emitted, and that it changes
 * nothing — no error, no suppressed finding, no altered delta. An advisory
 * that moves a verdict is not an advisory, it is a weakened check.
 */
describe('diffGeometry — measurement advisories', () => {
  /** A TEXT node 728px narrower than the element it is paired against. */
  function textPair(autoResize?: 'NONE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT'): ElementPair {
    const pair = alignedPair();
    pair.figma = {
      ...pair.figma!,
      type: 'TEXT',
      absoluteBoundingBox: { x: 4120, y: 2480, width: 742, height: 48 },
      ...(autoResize !== undefined ? { textAutoResize: autoResize } : {}),
    };
    pair.live = { ...pair.live!, boundingRect: { x: 120, y: 176, width: 1470, height: 48 } };
    return pair;
  }

  it('says when a TEXT node hugs its glyphs on both axes', () => {
    const issues = diffGeometry(textPair('WIDTH_AND_HEIGHT'), section, tolerances);
    const advisory = issues.find((issue) => issue.property === 'boxShape');
    expect(advisory?.severity).toBe('info');
    expect(advisory?.detail).toBe('textAutoResize');
    expect(advisory?.expected).toContain('WIDTH_AND_HEIGHT');
  });

  it('names only the height axis when only the height hugs', () => {
    const issues = diffGeometry(textPair('HEIGHT'), section, tolerances);
    const advisory = issues.find((issue) => issue.property === 'boxShape');
    expect(advisory?.expected).toContain('HEIGHT');
    expect(advisory?.actual).toBe('height and offsetY below compare a glyph hug against a laid-out element');
  });

  it('says nothing for a TEXT node whose box was laid out', () => {
    const issues = diffGeometry(textPair('NONE'), section, tolerances);
    expect(issues.some((issue) => issue.property === 'boxShape')).toBe(false);
  });

  it('says nothing when Figma did not report textAutoResize', () => {
    const issues = diffGeometry(textPair(), section, tolerances);
    expect(issues.some((issue) => issue.property === 'boxShape')).toBe(false);
  });

  it('still reports the width delta it is explaining', () => {
    // The advisory exists to explain this finding, never to replace it. A
    // text element genuinely built 728px too wide must still fail.
    const issues = diffGeometry(textPair('WIDTH_AND_HEIGHT'), section, tolerances);
    const width = issues.find((issue) => issue.property === 'width');
    expect(width?.severity).toBe('error');
    expect(width?.delta).toBe(728);
  });

  it('adds no error-severity issue of its own', () => {
    const issues = diffGeometry(textPair('WIDTH_AND_HEIGHT'), section, tolerances);
    const advisories = issues.filter(
      (issue) => issue.property === 'boxShape' || issue.property === 'zeroSize' ||
        issue.property === 'positioning',
    );
    expect(advisories.every((issue) => issue.severity === 'info')).toBe(true);
  });

  it('says when the live element occupies no space, and blames the images', () => {
    const pair = alignedPair();
    pair.live = {
      ...pair.live!,
      boundingRect: { x: 120, y: 176, width: 180, height: 0 },
      pendingImages: 2,
    };
    const advisory = diffGeometry(pair, section, tolerances)
      .find((issue) => issue.property === 'zeroSize');
    expect(advisory?.severity).toBe('info');
    expect(advisory?.actual).toContain('180×0');
    expect(advisory?.detail).toBe('2 images here had not finished loading');
  });

  it('still reports the height error the zero size produced', () => {
    // The tempting "fix" is to skip the size diff when the live rect is 0x0.
    // That would turn an element the build never rendered into a silent pass,
    // which is the one outcome invariant 3 forbids.
    const pair = alignedPair();
    pair.live = {
      ...pair.live!,
      boundingRect: { x: 120, y: 176, width: 180, height: 0 },
      pendingImages: 2,
    };
    const height = diffGeometry(pair, section, tolerances)
      .find((issue) => issue.property === 'height');
    expect(height?.severity).toBe('error');
    expect(height?.delta).toBe(-48);
  });

  it('offers the other causes when no image is pending', () => {
    const pair = alignedPair();
    pair.live = { ...pair.live!, boundingRect: { x: 120, y: 176, width: 0, height: 0 } };
    const advisory = diffGeometry(pair, section, tolerances)
      .find((issue) => issue.property === 'zeroSize');
    expect(advisory?.detail).toContain('display:none');
  });

  it('says nothing about size for an element that occupies space', () => {
    const issues = diffGeometry(alignedPair(), section, tolerances);
    expect(issues.some((issue) => issue.property === 'zeroSize')).toBe(false);
  });

  it('says when a rect is anchored to the viewport rather than the document', () => {
    const pair = alignedPair();
    pair.live = { ...pair.live!, position: 'sticky' };
    const advisory = diffGeometry(pair, section, tolerances)
      .find((issue) => issue.property === 'positioning');
    expect(advisory?.severity).toBe('info');
    expect(advisory?.actual).toContain('position: sticky');
    expect(advisory?.detail).toBe('its offset holds at the top of the page and nowhere else');
  });

  it('says so more loudly when the sticky element is the section itself', () => {
    const pair = alignedPair();
    pair.figmaId = 'hero';
    pair.figma = { ...pair.figma!, figmaId: 'hero' };
    pair.live = { ...pair.live!, figmaId: 'hero', position: 'fixed' };
    const advisory = diffGeometry(pair, section, tolerances)
      .find((issue) => issue.property === 'positioning');
    expect(advisory?.detail).toContain('every offset in the run rests on it');
  });

  it('still reports the offset error on a sticky element', () => {
    // Same trap as above, one property over: "an offset on a sticky element is
    // meaningless, so skip it" would hide a header built 40px too low.
    const pair = alignedPair();
    pair.live = {
      ...pair.live!,
      position: 'sticky',
      boundingRect: { x: 120, y: 216, width: 180, height: 48 },
    };
    const issues = diffGeometry(pair, section, tolerances);
    expect(issues.find((issue) => issue.property === 'offsetY')?.delta).toBe(40);
    expect(issues.some((issue) => issue.property === 'positioning')).toBe(true);
  });

  it('says nothing for an ordinary statically positioned element', () => {
    const pair = alignedPair();
    pair.live = { ...pair.live!, position: 'static' };
    expect(
      diffGeometry(pair, section, tolerances).some((issue) => issue.property === 'positioning'),
    ).toBe(false);
  });

  it('records each advisory as a check, so nothing it says is invisible', () => {
    const pair = textPair('WIDTH_AND_HEIGHT');
    pair.live = { ...pair.live!, position: 'sticky' };
    const checks: Check[] = [];
    diffGeometry(pair, section, tolerances, checks);
    expect(checks.filter((check) => check.property === 'boxShape')).toHaveLength(1);
    expect(checks.filter((check) => check.property === 'positioning')).toHaveLength(1);
  });
});
