/**
 * TOVI — Pass A: geometry & spec.
 *
 * STUB: no implementation yet.
 *
 * Compares size, position, padding, corner radius, color, and shadow between
 * the Figma Dev Mode spec values and the live element's getBoundingClientRect
 * + getComputedStyle output.
 *
 * ====================================================================
 * COORDINATE NORMALIZATION — read before implementing anything here.
 * ====================================================================
 *
 * Figma canvas coordinates and browser viewport coordinates MUST NOT be
 * compared directly. They are unrelated coordinate spaces:
 *
 *   - `FigmaSpec.absoluteBoundingBox` is in Figma *canvas* space. Its origin
 *     is wherever the frame happens to sit on an infinite canvas — a designer
 *     dragging the frame 500px to the right changes every x value in the file
 *     without changing the design at all.
 *
 *   - `LiveStyles.boundingRect` comes from `getBoundingClientRect()`, which is
 *     in *viewport* space. It shifts with scroll position, with the header
 *     height above the section, and with any horizontal centering the page
 *     applies at the current viewport width.
 *
 * Comparing those two absolute numbers would report a failure on every single
 * element for reasons that have nothing to do with the design.
 *
 * So positions are normalized against the section container before diffing.
 * For each side independently, subtract the section's own origin from the
 * element's origin:
 *
 *     offsetX = element.x - section.x
 *     offsetY = element.y - section.y
 *
 * Those RELATIVE offsets are what gets compared. Both sides then measure the
 * same thing — "how far into its section does this element start" — which is
 * the actual design intent, and which is invariant to canvas origin, scroll
 * position, and page chrome.
 *
 * Sizes (width/height) need no such treatment: they are already relative
 * quantities and compare directly.
 *
 * Two consequences worth remembering while implementing:
 *   - The section rect must be measured on BOTH sides. A run without a live
 *     section rect cannot do Pass A position checks at all — fail loudly
 *     rather than silently falling back to absolute coordinates.
 *   - The Figma frame width should match the configured viewport width. If it
 *     does not, relative offsets are still valid but a responsive layout may
 *     legitimately differ; that is a config problem to surface, not a diff to
 *     report per element.
 */

import type { ElementPair, SectionContext, Rect, BoxSides, CornerRadius, Shadow } from '../types.js';
import type { Tolerances } from '../config/schema.js';
import type { Issue } from '../report/types.js';

/**
 * Compare the geometry and spec properties of one paired element.
 *
 * @param pair       Figma and live sides for one element.
 * @param section    The container both sides are normalized against. Required
 *                   — see the coordinate normalization note above.
 * @param tolerances Effective tolerances for this element.
 * @returns One Issue per property whose delta exceeded tolerance.
 */
export function diffGeometry(
  pair: ElementPair,
  section: SectionContext,
  tolerances: Tolerances,
): Issue[] {
  // TODO: if either side is missing, return a single structural Issue and stop.
  // TODO: compare width and height directly against tolerances.size.
  // TODO: normalize BOTH sides with toRelativeOffset() before comparing
  //       position, then diff offsetX/offsetY against tolerances.position.
  //       Never compare pair.figma.absoluteBoundingBox.x against
  //       pair.live.boundingRect.x — see the note at the top of this file.
  // TODO: compare padding per side, corner radius per corner, background and
  //       text color via compare/color, and shadows via diffShadows().
  // TODO: skip any property absent on the Figma side — an unset design value
  //       is not an assertion that the live value must be zero.
  void pair;
  void section;
  void tolerances;
  throw new Error('TODO: diffGeometry is not implemented');
}

/**
 * Convert an absolute rect into a section-relative offset.
 *
 * Applied to each side independently, using that side's own section rect.
 * This is the function that makes Figma canvas space and browser viewport
 * space comparable; see the note at the top of this file.
 */
export function toRelativeOffset(_element: Rect, _section: Rect): { x: number; y: number } {
  // TODO: return { x: element.x - section.x, y: element.y - section.y }.
  throw new Error('TODO: toRelativeOffset is not implemented');
}

/** Compare padding side by side, emitting one Issue per drifting side. */
export function diffPadding(
  _figmaId: string,
  _expected: BoxSides,
  _actual: BoxSides,
  _tolerance: number,
): Issue[] {
  // TODO: loop the four sides, setting Issue.detail to the side name.
  throw new Error('TODO: diffPadding is not implemented');
}

/** Compare corner radii, emitting one Issue per drifting corner. */
export function diffCornerRadius(
  _figmaId: string,
  _expected: CornerRadius,
  _actual: CornerRadius,
  _tolerance: number,
): Issue[] {
  // TODO: loop the four corners, setting Issue.detail to the corner name.
  // TODO: guard against CSS clamping — a browser caps radius at half the
  //       shorter side, so a large Figma radius on a small box is a match, not
  //       a mismatch.
  throw new Error('TODO: diffCornerRadius is not implemented');
}

/**
 * Compare shadow stacks.
 *
 * Shadows are ordered lists, so this compares index by index and reports a
 * count mismatch when the stacks are different lengths rather than trying to
 * pair them heuristically.
 */
export function diffShadows(
  _figmaId: string,
  _expected: Shadow[],
  _actual: Shadow[],
  _tolerance: number,
  _colorTolerance: number,
): Issue[] {
  // TODO: report a count mismatch first and return early when lengths differ.
  // TODO: otherwise compare offsetX/offsetY/blur/spread numerically and color
  //       via compare/color, setting Issue.detail to the shadow index.
  throw new Error('TODO: diffShadows is not implemented');
}
