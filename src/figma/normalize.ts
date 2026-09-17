/**
 * TOVI — raw Figma node -> internal FigmaSpec.
 *
 * This module owns every Figma-specific quirk so that the comparison passes
 * only ever see clean, CSS-comparable numbers: 0–1 float colors become Rgba,
 * line heights resolve to px, and a single `cornerRadius` is expanded into
 * four corners.
 */

import type {
  Borders,
  BoxSides,
  CornerRadius,
  FigmaSpec,
  Rgba,
  Shadow,
  StrokeAlign,
  TextAutoResize,
  TextSpec,
} from '../types.js';
import { fromFigmaColor } from '../compare/color.js';
import type { FigmaColor } from '../compare/color.js';
import type { RawFigmaNode } from './client.js';

/** Thrown when a node cannot be expressed as a FigmaSpec at all. */
export class FigmaNormalizeError extends Error {
  constructor(message: string, readonly figmaId?: string) {
    super(message);
    this.name = 'FigmaNormalizeError';
  }
}

interface FigmaGradientStop {
  color?: FigmaColor;
  position?: number;
}

interface FigmaPaint {
  type?: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  gradientStops?: FigmaGradientStop[];
}

interface FigmaEffect {
  type?: string;
  visible?: boolean;
  radius?: number;
  spread?: number;
  color?: FigmaColor;
  offset?: { x?: number; y?: number };
}

/** Box sides in the order borders are reported. */
const SIDES = ['top', 'right', 'bottom', 'left'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Read a numeric field, returning undefined for anything non-finite. */
function num(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function str(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Whether two Figma float colors are the same to within float noise. */
function sameFigmaColor(a: FigmaColor, b: FigmaColor): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  return close(a.r, b.r) && close(a.g, b.g) && close(a.b, b.b) && close(a.a ?? 1, b.a ?? 1);
}

/**
 * Collapse a gradient whose stops are all the same color down to that color.
 *
 * Designers routinely leave a gradient in place after flattening it to one
 * color, and Figma keeps reporting it as GRADIENT_LINEAR. Visually it is a
 * solid, so refusing to compare it would silently skip the element's color.
 * A gradient with genuinely different stops still returns undefined — there is
 * no single value to compare it against.
 */
function flattenGradient(paint: FigmaPaint): Rgba | undefined {
  const stops = paint.gradientStops;
  if (!Array.isArray(stops) || stops.length === 0) return undefined;

  const colors: FigmaColor[] = [];
  for (const stop of stops) {
    const color = isRecord(stop) ? (stop as FigmaGradientStop).color : undefined;
    if (color === undefined || color === null) return undefined;
    colors.push(color);
  }

  const first = colors[0];
  if (first === undefined) return undefined;
  if (!colors.every((color) => sameFigmaColor(color, first))) return undefined;

  return fromFigmaColor(first, paint.opacity);
}

/**
 * Pick the effective solid fill and normalize it to Rgba.
 *
 * Returns undefined when the node has no fills, none are visible, or the
 * effective fill has no single color to compare against (an image, or a
 * gradient with genuinely different stops).
 *
 * Fill order: Figma paints the array in order, so a later entry sits on top of
 * an earlier one and the last visible paint is what you see. Multiple stacked
 * fills are rare on the elements TOVI checks, but worth confirming against a
 * real file the first time a stacked fill shows up.
 */
export function extractSolidFill(fills: unknown[] | undefined): Rgba | undefined {
  if (!Array.isArray(fills)) return undefined;

  for (let index = fills.length - 1; index >= 0; index -= 1) {
    const paint = fills[index];
    if (!isRecord(paint)) continue;

    const typed = paint as FigmaPaint;
    if (typed.visible === false) continue;

    if (typed.type === 'SOLID') {
      if (typed.color === undefined) continue;
      return fromFigmaColor(typed.color, typed.opacity);
    }

    // A visible gradient may still be one flat color; anything else on top
    // (an image, a real gradient) means there is nothing to compare, and we
    // stop rather than reaching past it to a solid underneath.
    if (typed.type !== undefined && typed.type.startsWith('GRADIENT_')) {
      return flattenGradient(typed);
    }

    return undefined;
  }

  return undefined;
}

/**
 * Expand Figma's corner radius representation into four explicit corners.
 * Figma reports either a uniform `cornerRadius` or a `rectangleCornerRadii`
 * tuple in [TL, TR, BR, BL] order.
 */
export function extractCornerRadius(node: RawFigmaNode): CornerRadius | undefined {
  const radii = node.rectangleCornerRadii;
  if (Array.isArray(radii) && radii.length === 4) {
    const [topLeft, topRight, bottomRight, bottomLeft] = radii;
    return { topLeft, topRight, bottomRight, bottomLeft };
  }

  const uniform = num(node, 'cornerRadius');
  if (uniform === undefined) return undefined;

  return {
    topLeft: uniform,
    topRight: uniform,
    bottomRight: uniform,
    bottomLeft: uniform,
  };
}

/**
 * Convert a node's stroke into per-side borders.
 *
 * Figma models a stroke as paints plus a weight, where the paints apply to the
 * whole node and only the weight may vary per side. CSS varies both, so the
 * shared shape carries a colour per side and this function repeats Figma's
 * single stroke colour across all four.
 *
 * Returns undefined when there is nothing to compare: no visible stroke paint,
 * or a stroke whose every side is zero-width. An absent stroke is not an
 * assertion that the live element must have no border — Pass A skips the
 * property rather than demanding zeroes the design never specified.
 */
export function extractBorders(node: RawFigmaNode): Borders | undefined {
  // Strokes are paints, so the fill logic already handles solids, invisible
  // paints, and gradients flattened to one colour.
  const color = extractSolidFill(node.strokes);
  if (color === undefined) return undefined;

  // Figma omits strokeWeight on nodes that never had a stroke, but a node with
  // stroke paints and no explicit weight is drawn at 1px.
  const uniform = num(node, 'strokeWeight') ?? 1;
  const individual = node.individualStrokeWeights;
  const widthFor = (side: 'top' | 'right' | 'bottom' | 'left'): number => {
    const override = isRecord(individual) ? num(individual, side) : undefined;
    return override ?? uniform;
  };

  const borders: Borders = {
    top: { width: widthFor('top'), color },
    right: { width: widthFor('right'), color },
    bottom: { width: widthFor('bottom'), color },
    left: { width: widthFor('left'), color },
  };

  const anyDrawn = SIDES.some((side) => borders[side].width > 0);
  return anyDrawn ? borders : undefined;
}

/**
 * Read how a TEXT node sizes its own box.
 *
 * Figma omits this on every node type that is not TEXT, and on a TEXT node it
 * is one of four documented values. An unrecognised value returns undefined
 * rather than a guess: the only thing this drives is an advisory, and an
 * advisory that states something untrue about the design file is worse than no
 * advisory at all.
 */
export function extractTextAutoResize(node: RawFigmaNode): TextAutoResize | undefined {
  const raw = str(node as unknown as Record<string, unknown>, 'textAutoResize');
  if (raw === 'NONE' || raw === 'HEIGHT' || raw === 'WIDTH_AND_HEIGHT' || raw === 'TRUNCATE') {
    return raw;
  }
  return undefined;
}

/** Normalize Figma's stroke alignment, defaulting to its own default. */
export function extractStrokeAlign(node: RawFigmaNode): StrokeAlign {
  const raw = str(node as unknown as Record<string, unknown>, 'strokeAlign');
  return raw === 'OUTSIDE' || raw === 'CENTER' ? raw : 'INSIDE';
}

/**
 * Read auto-layout padding. Returns undefined for non-auto-layout nodes.
 *
 * A node with any padding set gets all four sides, defaulting the unset ones
 * to 0 — that is what Figma means. A node with none set returns undefined, so
 * Pass A skips padding entirely rather than asserting zeroes the design never
 * specified.
 */
export function extractPadding(node: RawFigmaNode): BoxSides | undefined {
  const top = num(node, 'paddingTop');
  const right = num(node, 'paddingRight');
  const bottom = num(node, 'paddingBottom');
  const left = num(node, 'paddingLeft');

  if (top === undefined && right === undefined && bottom === undefined && left === undefined) {
    return undefined;
  }

  return {
    top: top ?? 0,
    right: right ?? 0,
    bottom: bottom ?? 0,
    left: left ?? 0,
  };
}

/**
 * Convert Figma DROP_SHADOW / INNER_SHADOW effects into the shared Shadow type.
 * Blur effects (LAYER_BLUR, BACKGROUND_BLUR) are ignored — they have no CSS
 * box-shadow equivalent to compare against.
 */
export function extractShadows(effects: unknown[] | undefined): Shadow[] {
  if (!Array.isArray(effects)) return [];

  const shadows: Shadow[] = [];
  for (const effect of effects) {
    if (!isRecord(effect)) continue;

    const typed = effect as FigmaEffect;
    if (typed.visible === false) continue;
    if (typed.type !== 'DROP_SHADOW' && typed.type !== 'INNER_SHADOW') continue;

    shadows.push({
      offsetX: typed.offset?.x ?? 0,
      offsetY: typed.offset?.y ?? 0,
      blur: typed.radius ?? 0,
      spread: typed.spread ?? 0,
      color: typed.color !== undefined
        ? fromFigmaColor(typed.color)
        : { r: 0, g: 0, b: 0, a: 1 },
      inset: typed.type === 'INNER_SHADOW',
    });
  }
  return shadows;
}

/**
 * Build a TextSpec from a TEXT node's `style` block.
 *
 * Figma can express line height as px, as a percentage of the font size, or as
 * a percentage of the intrinsic height — but it always also reports the
 * resolved `lineHeightPx`, so that is what we read. Letter spacing is already
 * px. Neither conversion belongs downstream.
 *
 * A property Figma does not report becomes NaN rather than a guessed value;
 * comparableTextKeys() in the text pass skips non-finite properties, so an
 * unreported line height is silently not compared instead of failing loudly
 * against a fabricated default.
 */
export function extractTextSpec(style: Record<string, unknown> | undefined): TextSpec | undefined {
  if (!isRecord(style)) return undefined;

  const fontFamily = str(style, 'fontFamily');
  const fontSize = num(style, 'fontSize');
  if (fontFamily === undefined || fontSize === undefined) return undefined;

  return {
    fontFamily,
    fontSize,
    fontWeight: resolveFontWeight(style),
    lineHeight: num(style, 'lineHeightPx') ?? Number.NaN,
    letterSpacing: num(style, 'letterSpacing') ?? 0,
  };
}

/**
 * CSS weight names and their numeric equivalents, from CSS Fonts Level 4.
 *
 * A closed table of the names the spec actually defines. Anything outside it —
 * a foundry's own naming like "Book" or "Roman" — is left to the numeric
 * weight rather than guessed at, because a wrong mapping here invents a
 * finding out of nothing.
 */
const CSS_WEIGHT_NAMES: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

/**
 * The CSS weight a Figma text style means.
 *
 * Figma reports `fontWeight` as the font's own weight axis value, which for a
 * variable font is not a CSS weight at all: Gotham Medium comes back as `350`
 * against a correct CSS `500`, so a zero tolerance flags every heading set in
 * it. The same node also reports `fontStyle: "Medium"`, and Medium *is* 500 —
 * the design said so in words, and the words are the reliable half.
 *
 * So the name wins when it is one CSS defines, and the number is the fallback.
 * This is a fixed lookup, not a similarity match: a style name either is in the
 * table or it is not, which keeps the comparison path free of heuristics
 * (invariant 7).
 *
 * Deliberately narrow. It does not absorb a genuine weight mismatch — a node
 * whose style is "Bold" still resolves to 700 and still fails against a live
 * 600, which is the finding this must not hide.
 */
export function resolveFontWeight(style: Record<string, unknown>): number {
  const named = cssWeightFromStyleName(str(style, 'fontStyle'));
  if (named !== undefined) return named;
  return num(style, 'fontWeight') ?? Number.NaN;
}

/**
 * Map a Figma `fontStyle` string onto a CSS weight.
 *
 * Figma joins weight and slant into one string — "Bold", "SemiBold Italic",
 * "Light Oblique" — so the slant words are dropped and the rest is matched
 * against the table with spacing and case removed, since "SemiBold",
 * "Semi Bold" and "semibold" are the same weight written three ways.
 *
 * @returns The numeric weight, or undefined when the name is not one CSS
 *          defines — in which case the caller keeps Figma's number.
 */
export function cssWeightFromStyleName(fontStyle: string | undefined): number | undefined {
  if (fontStyle === undefined) return undefined;
  const key = fontStyle
    .toLowerCase()
    .replace(/italic|oblique/g, '')
    .replace(/[^a-z]/g, '');
  if (key === '') return undefined;
  return CSS_WEIGHT_NAMES[key];
}

/**
 * Convert one raw Figma node into a FigmaSpec.
 *
 * @param node    The raw node from the REST API.
 * @param figmaId The pairing key — the layer name, which must equal the live
 *                element's `data-figma-id`.
 * @throws {FigmaNormalizeError} when the node has no bounding box.
 */
export function normalizeFigmaNode(node: RawFigmaNode, figmaId: string): FigmaSpec {
  const box = node.absoluteBoundingBox;
  if (box === undefined) {
    throw new FigmaNormalizeError(
      `Figma node "${figmaId}" (${node.id}) has no absoluteBoundingBox. ` +
        'Hidden and detached nodes cannot be measured.',
      figmaId,
    );
  }

  const isText = node.type === 'TEXT';
  // On a TEXT node `fills` is the type colour; on any other node it is the
  // background. Same field, two different CSS properties.
  const fill = extractSolidFill(node.fills);
  const padding = extractPadding(node);
  const cornerRadius = extractCornerRadius(node);
  const borders = extractBorders(node);
  const shadows = extractShadows(node.effects);
  const text = isText ? extractTextSpec(node.style) : undefined;
  const characters = isText ? node.characters : undefined;
  const textAutoResize = isText ? extractTextAutoResize(node) : undefined;

  return {
    figmaId,
    nodeId: node.id,
    type: node.type,
    absoluteBoundingBox: box,
    ...(padding !== undefined ? { padding } : {}),
    ...(cornerRadius !== undefined ? { cornerRadius } : {}),
    ...(borders !== undefined
      ? { borders, strokeAlign: extractStrokeAlign(node) }
      : {}),
    ...(!isText && fill !== undefined ? { backgroundColor: fill } : {}),
    ...(isText && fill !== undefined ? { color: fill } : {}),
    ...(shadows.length > 0 ? { shadows } : {}),
    ...(text !== undefined ? { text } : {}),
    ...(characters !== undefined ? { characters } : {}),
    ...(textAutoResize !== undefined ? { textAutoResize } : {}),
  };
}
