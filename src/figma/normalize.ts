/**
 * TOVI — raw Figma node -> internal FigmaSpec.
 *
 * STUB: no implementation yet.
 *
 * This module owns every Figma-specific quirk so that the comparison passes
 * only ever see clean, CSS-comparable numbers: 0–1 float colors become Rgba,
 * percentage line-heights become px, and a single `cornerRadius` is expanded
 * into four corners.
 */

import type { FigmaSpec, Shadow, TextSpec, CornerRadius, BoxSides } from '../types.js';
import type { RawFigmaNode } from './client.js';

/**
 * Convert one raw Figma node into a FigmaSpec.
 *
 * @param node    The raw node from the REST API.
 * @param figmaId The pairing key — the layer name, which must equal the live
 *                element's `data-figma-id`.
 */
export function normalizeFigmaNode(node: RawFigmaNode, figmaId: string): FigmaSpec {
  // TODO: copy through id/type/absoluteBoundingBox, throwing if the node has
  //       no absoluteBoundingBox (an invisible or detached node cannot be
  //       compared and should surface as a structural issue instead).
  // TODO: call the extract* helpers below for each optional property group.
  void node;
  void figmaId;
  throw new Error('TODO: normalizeFigmaNode is not implemented');
}

/**
 * Pick the first visible SOLID fill and normalize it to Rgba.
 * Returns undefined when the node has no fills, none are visible, or the
 * topmost visible fill is a gradient or image (out of scope for v1).
 */
export function extractSolidFill(_fills: unknown[] | undefined) {
  // TODO: filter to `visible !== false` and `type === 'SOLID'`, take the last
  //       entry (Figma paints fills bottom-up), and fold the paint's own
  //       `opacity` into the color's alpha before converting via compare/color.
  throw new Error('TODO: extractSolidFill is not implemented');
}

/**
 * Expand Figma's corner radius representation into four explicit corners.
 * Figma reports either a uniform `cornerRadius` or a
 * `rectangleCornerRadii` tuple in [TL, TR, BR, BL] order.
 */
export function extractCornerRadius(_node: RawFigmaNode): CornerRadius | undefined {
  // TODO: prefer rectangleCornerRadii when present, else broadcast
  //       cornerRadius to all four corners, else return undefined.
  throw new Error('TODO: extractCornerRadius is not implemented');
}

/** Read auto-layout padding. Returns undefined for non-auto-layout nodes. */
export function extractPadding(_node: RawFigmaNode): BoxSides | undefined {
  // TODO: read paddingTop/Right/Bottom/Left, defaulting each missing side to
  //       0 only when at least one side is present.
  throw new Error('TODO: extractPadding is not implemented');
}

/**
 * Convert Figma DROP_SHADOW / INNER_SHADOW effects into the shared Shadow type.
 * Blur/layer-blur effects are ignored — they have no CSS box-shadow equivalent.
 */
export function extractShadows(_effects: unknown[] | undefined): Shadow[] {
  // TODO: filter to visible DROP_SHADOW and INNER_SHADOW effects, map
  //       offset.x/y, radius -> blur, spread, color -> Rgba, and set
  //       `inset` for INNER_SHADOW.
  throw new Error('TODO: extractShadows is not implemented');
}

/**
 * Build a TextSpec from a TEXT node's `style` block.
 *
 * Note the two unit conversions that must happen here, not downstream:
 *   - lineHeight: Figma may report lineHeightPx, lineHeightPercent, or
 *     lineHeightPercentFontSize. Resolve all of them to px.
 *   - letterSpacing: Figma reports px, but a percentage-based type style
 *     resolves against fontSize. Resolve to px.
 */
export function extractTextSpec(_style: Record<string, unknown> | undefined): TextSpec | undefined {
  // TODO: map fontFamily / fontSize / fontWeight straight through, then apply
  //       the two conversions above.
  throw new Error('TODO: extractTextSpec is not implemented');
}
