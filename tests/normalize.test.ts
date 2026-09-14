/**
 * Figma node normalization.
 */

import { describe, expect, it } from 'vitest';
import {
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
