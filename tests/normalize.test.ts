/**
 * Figma node normalization.
 */

import { describe, expect, it } from 'vitest';
import {
  cssWeightFromStyleName,
  extractCornerRadius,
  extractPadding,
  extractShadows,
  extractSolidFill,
  extractTextSpec,
  normalizeFigmaNode,
} from '../src/figma/normalize.js';
import type { RawFigmaNode } from '../src/figma/client.js';

const box = { x: 4000, y: 2400, width: 180, height: 48 };

function node(overrides: Partial<RawFigmaNode> = {}): RawFigmaNode {
  return { id: '1:45', name: 'hero-cta', type: 'FRAME', absoluteBoundingBox: box, ...overrides };
}

describe('extractSolidFill', () => {
  it('converts 0-1 floats to 0-255 channels', () => {
    const fills = [{ type: 'SOLID', color: { r: 0, g: 0.4, b: 1, a: 1 } }];
    expect(extractSolidFill(fills)).toEqual({ r: 0, g: 102, b: 255, a: 1 });
  });

  it('folds the paint opacity into alpha', () => {
    const fills = [{ type: 'SOLID', opacity: 0.5, color: { r: 0, g: 0, b: 0, a: 1 } }];
    expect(extractSolidFill(fills)?.a).toBe(0.5);
  });

  it('skips hidden fills and uses the topmost visible one', () => {
    const fills = [
      { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } },
      { type: 'SOLID', visible: false, color: { r: 0, g: 1, b: 0, a: 1 } },
    ];
    expect(extractSolidFill(fills)).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('returns undefined for a gradient, rather than reaching past it', () => {
    const fills = [
      { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } },
      {
        type: 'GRADIENT_LINEAR',
        gradientStops: [
          { color: { r: 0, g: 0, b: 0, a: 1 }, position: 0 },
          { color: { r: 1, g: 1, b: 1, a: 1 }, position: 1 },
        ],
      },
    ];
    expect(extractSolidFill(fills)).toBeUndefined();
  });

  it('flattens a gradient whose stops are all one colour', () => {
    // Designers flatten a gradient to a single colour and Figma keeps
    // reporting GRADIENT_LINEAR. Visually it is solid, so compare it.
    const fills = [{
      type: 'GRADIENT_LINEAR',
      gradientStops: [
        { color: { r: 0, g: 0, b: 0, a: 1 }, position: 0 },
        { color: { r: 0, g: 0, b: 0, a: 1 }, position: 1 },
      ],
    }];
    expect(extractSolidFill(fills)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('returns undefined for an image fill', () => {
    expect(extractSolidFill([{ type: 'IMAGE', scaleMode: 'FILL' }])).toBeUndefined();
  });

  it('returns undefined when there are no fills', () => {
    expect(extractSolidFill(undefined)).toBeUndefined();
    expect(extractSolidFill([])).toBeUndefined();
  });
});

describe('extractCornerRadius', () => {
  it('broadcasts a uniform radius to four corners', () => {
    expect(extractCornerRadius(node({ cornerRadius: 8 }))).toEqual({
      topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8,
    });
  });

  it('reads the per-corner tuple as [TL, TR, BR, BL]', () => {
    expect(extractCornerRadius(node({ rectangleCornerRadii: [1, 2, 3, 4] }))).toEqual({
      topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4,
    });
  });

  it('returns undefined when the design sets no radius', () => {
    expect(extractCornerRadius(node())).toBeUndefined();
  });
});

describe('extractPadding', () => {
  it('fills unset sides with 0 when any side is set', () => {
    expect(extractPadding(node({ paddingLeft: 24 }))).toEqual({
      top: 0, right: 0, bottom: 0, left: 24,
    });
  });

  it('returns undefined for a node with no padding at all', () => {
    expect(extractPadding(node())).toBeUndefined();
  });
});

describe('extractShadows', () => {
  it('maps a drop shadow onto the shared Shadow shape', () => {
    const effects = [{
      type: 'DROP_SHADOW',
      offset: { x: 0, y: 2 },
      radius: 8,
      spread: 1,
      color: { r: 0, g: 0, b: 0, a: 0.25 },
    }];
    expect(extractShadows(effects)).toEqual([{
      offsetX: 0, offsetY: 2, blur: 8, spread: 1,
      color: { r: 0, g: 0, b: 0, a: 0.25 }, inset: false,
    }]);
  });

  it('marks inner shadows as inset', () => {
    expect(extractShadows([{ type: 'INNER_SHADOW' }])[0]?.inset).toBe(true);
  });

  it('ignores hidden effects and blurs', () => {
    const effects = [
      { type: 'DROP_SHADOW', visible: false },
      { type: 'LAYER_BLUR', radius: 4 },
    ];
    expect(extractShadows(effects)).toEqual([]);
  });
});

describe('extractTextSpec', () => {
  it('reads the resolved line height in px', () => {
    const style = {
      fontFamily: 'Inter', fontSize: 24, fontWeight: 600,
      lineHeightPx: 32, lineHeightPercent: 133, letterSpacing: -0.5,
    };
    expect(extractTextSpec(style)).toEqual({
      fontFamily: 'Inter', fontSize: 24, fontWeight: 600,
      lineHeight: 32, letterSpacing: -0.5,
    });
  });

  it('uses NaN for an unreported line height so the pass skips it', () => {
    const spec = extractTextSpec({ fontFamily: 'Inter', fontSize: 24 });
    expect(Number.isNaN(spec?.lineHeight)).toBe(true);
  });

  it('returns undefined without a family and size', () => {
    expect(extractTextSpec({ fontSize: 24 })).toBeUndefined();
    expect(extractTextSpec(undefined)).toBeUndefined();
  });
});

describe('normalizeFigmaNode', () => {
  it('treats a TEXT node fill as the type colour, not a background', () => {
    const spec = normalizeFigmaNode(
      node({
        type: 'TEXT',
        characters: 'Get started',
        fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
        style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 600, lineHeightPx: 24 },
      }),
      'hero-cta-label',
    );
    expect(spec.color).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(spec.backgroundColor).toBeUndefined();
    expect(spec.characters).toBe('Get started');
  });

  it('treats a FRAME fill as the background', () => {
    const spec = normalizeFigmaNode(
      node({ fills: [{ type: 'SOLID', color: { r: 0, g: 0.4, b: 1, a: 1 } }] }),
      'hero-cta',
    );
    expect(spec.backgroundColor).toEqual({ r: 0, g: 102, b: 255, a: 1 });
    expect(spec.color).toBeUndefined();
    expect(spec.text).toBeUndefined();
  });

  it('reads a uniform stroke into four equal borders', () => {
    const spec = normalizeFigmaNode(
      node({
        strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
        strokeWeight: 2,
        strokeAlign: 'INSIDE',
      }),
      'hero-cta',
    );
    expect(spec.borders?.top).toEqual({ width: 2, color: { r: 0, g: 0, b: 0, a: 1 } });
    expect(spec.borders?.left.width).toBe(2);
    expect(spec.strokeAlign).toBe('INSIDE');
  });

  it('lets individualStrokeWeights override the uniform weight per side', () => {
    const spec = normalizeFigmaNode(
      node({
        strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
        strokeWeight: 1,
        individualStrokeWeights: { top: 0, right: 0, bottom: 3, left: 0 },
      }),
      'hero-cta',
    );
    expect(spec.borders?.bottom.width).toBe(3);
    expect(spec.borders?.top.width).toBe(0);
  });

  it('defaults a stroke with no explicit weight to 1px, as Figma draws it', () => {
    const spec = normalizeFigmaNode(
      node({ strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }] }),
      'hero-cta',
    );
    expect(spec.borders?.top.width).toBe(1);
  });

  it('reports no borders for a node with no stroke', () => {
    const spec = normalizeFigmaNode(node({}), 'hero-cta');
    expect(spec.borders).toBeUndefined();
    expect(spec.strokeAlign).toBeUndefined();
  });

  it('reports no borders when every side is zero-width', () => {
    const spec = normalizeFigmaNode(
      node({
        strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
        strokeWeight: 0,
      }),
      'hero-cta',
    );
    expect(spec.borders).toBeUndefined();
  });

  it('carries a non-INSIDE stroke alignment through for the pass to flag', () => {
    const spec = normalizeFigmaNode(
      node({
        strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
        strokeWeight: 2,
        strokeAlign: 'OUTSIDE',
      }),
      'hero-cta',
    );
    expect(spec.strokeAlign).toBe('OUTSIDE');
  });

  it('throws for a node with no bounding box', () => {
    const bare: RawFigmaNode = { id: '1:9', name: 'ghost', type: 'FRAME' };
    expect(() => normalizeFigmaNode(bare, 'ghost')).toThrow(/absoluteBoundingBox/);
  });
});

/**
 * T-28. Figma reports a variable font's weight axis value, not a CSS weight:
 * Gotham Medium comes back as 350 against a correct CSS 500, so a zero
 * tolerance flagged every heading set in it. The style name is the reliable
 * half — and the mapping must not swallow a genuine weight mismatch.
 */
describe('font weight resolves from the style name', () => {
  const style = (fontStyle: string, fontWeight: number): Record<string, unknown> => ({
    fontFamily: 'Gotham', fontSize: 32, fontStyle, fontWeight,
  });

  it('prefers the CSS weight name over Figma\'s axis value', () => {
    // The exact case from triage 001: node 12576:8124.
    expect(extractTextSpec(style('Medium', 350))?.fontWeight).toBe(500);
  });

  it('still reports Bold as 700, so a real 700-vs-600 defect survives', () => {
    // Node 12576:8122. If the mapping hid this, it would have traded a false
    // positive for a false negative, which is the worse trade.
    expect(extractTextSpec(style('Bold', 700))?.fontWeight).toBe(700);
  });

  it('maps every weight name CSS defines', () => {
    const cases: Array<[string, number]> = [
      ['Thin', 100], ['Hairline', 100], ['ExtraLight', 200], ['UltraLight', 200],
      ['Light', 300], ['Regular', 400], ['Normal', 400], ['Medium', 500],
      ['SemiBold', 600], ['DemiBold', 600], ['Bold', 700],
      ['ExtraBold', 800], ['UltraBold', 800], ['Black', 900], ['Heavy', 900],
    ];
    for (const [name, weight] of cases) {
      expect(cssWeightFromStyleName(name), name).toBe(weight);
    }
  });

  it('ignores slant, spacing and case', () => {
    expect(cssWeightFromStyleName('SemiBold Italic')).toBe(600);
    expect(cssWeightFromStyleName('semi bold')).toBe(600);
    expect(cssWeightFromStyleName('Light Oblique')).toBe(300);
  });

  it('falls back to the number for a name CSS does not define', () => {
    // "Book" is a foundry's own naming with no defined CSS equivalent.
    // Guessing at it would invent a finding out of nothing.
    expect(cssWeightFromStyleName('Book')).toBeUndefined();
    expect(extractTextSpec(style('Book', 325))?.fontWeight).toBe(325);
  });

  it('falls back to the number when there is no style name at all', () => {
    expect(extractTextSpec({ fontFamily: 'Inter', fontSize: 16, fontWeight: 450 })?.fontWeight)
      .toBe(450);
  });
});

/**
 * `textAutoResize` — T-27.
 *
 * Read so the report can say when a TEXT node's box is its glyphs rather than
 * a layout box. Nothing downstream compares it; it only ever explains.
 *
 * The fixtures below use the shape the REST API actually returns, which is not
 * the shape the Plugin API returns. The first version of this suite invented
 * the Plugin API's shape, passed, and shipped an advisory that could never fire
 * on a real file — a run against the real Figma file is what caught it. Every
 * `style` block here is copied from a real node in that file.
 */
describe('normalizeFigmaNode — textAutoResize', () => {
  /** A real TEXT node's style block: "SELECT YOUR LEVEL OF PLAY", 12576:8122. */
  function textNode(autoResize?: string): RawFigmaNode {
    return node({
      type: 'TEXT',
      characters: 'Select your level of play',
      style: {
        fontFamily: 'Gotham',
        fontStyle: 'Bold',
        fontWeight: 700,
        fontSize: 48,
        letterSpacing: -0.48,
        lineHeightPx: 60,
        ...(autoResize !== undefined ? { textAutoResize: autoResize } : {}),
      },
    });
  }

  it('carries a shrink-wrapped TEXT node through to the spec', () => {
    expect(normalizeFigmaNode(textNode('WIDTH_AND_HEIGHT'), 'heading').textAutoResize)
      .toBe('WIDTH_AND_HEIGHT');
  });

  it('carries the height-only form, which hugs one axis', () => {
    expect(normalizeFigmaNode(textNode('HEIGHT'), 'heading').textAutoResize).toBe('HEIGHT');
  });

  it('reads it from style, not from the node', () => {
    // The regression. On the node is where the Plugin API puts it, and reading
    // there finds undefined on every TEXT node the REST API returns — a silent
    // no-op that looks exactly like a design with no shrink-wrapped text in it.
    const wrongPlace = node({
      type: 'TEXT',
      characters: 'Select your level of play',
      style: { fontFamily: 'Gotham', fontSize: 48 },
      textAutoResize: 'WIDTH_AND_HEIGHT',
    });
    expect(normalizeFigmaNode(wrongPlace, 'heading').textAutoResize).toBeUndefined();
  });

  it('ignores it on a node that is not TEXT', () => {
    // A FRAME's box is always laid out, so one stray field must not produce an
    // advisory about a node the advisory is not true of.
    const frame = node({ style: { textAutoResize: 'WIDTH_AND_HEIGHT' } });
    expect(normalizeFigmaNode(frame, 'hero').textAutoResize).toBeUndefined();
  });

  it('drops a value outside the four Figma documents', () => {
    expect(normalizeFigmaNode(textNode('SOMETHING_NEW'), 'heading').textAutoResize)
      .toBeUndefined();
  });

  it('leaves it absent when Figma did not report it at all', () => {
    expect(normalizeFigmaNode(textNode(), 'heading').textAutoResize).toBeUndefined();
  });
});
