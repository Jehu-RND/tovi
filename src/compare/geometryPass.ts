/**
 * TOVI — Pass A: geometry & spec.
 *
 * Compares size, position, padding, corner radius, border, color, and shadow
 * between the Figma Dev Mode spec values and the live element's
 * getBoundingClientRect + getComputedStyle output.
 *
 * ====================================================================
 * COORDINATE NORMALIZATION — read before changing anything here.
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
 * Two consequences worth remembering:
 *   - The section rect must be measured on BOTH sides. A run without a live
 *     section rect cannot do Pass A position checks at all — fail loudly
 *     rather than silently falling back to absolute coordinates.
 *   - The Figma frame width should match the configured viewport width. If it
 *     does not, relative offsets are still valid but a responsive layout may
 *     legitimately differ; that is a config problem to surface, not a diff to
 *     report per element.
 */

import type {
  Borders,
  BoxSides,
  CornerRadius,
  ElementPair,
  Rect,
  SectionContext,
  Shadow,
} from '../types.js';
import type { Tolerances } from '../config/schema.js';
import type { Issue } from '../report/types.js';
import { colorDistance, colorsMatch, formatColor } from './color.js';
import { compareNumeric, structuralIssue, valueIssue } from './issues.js';
import type { Rgba } from '../types.js';

const SIDES: Array<keyof BoxSides> = ['top', 'right', 'bottom', 'left'];
const CORNERS: Array<keyof CornerRadius> = [
  'topLeft',
  'topRight',
  'bottomRight',
  'bottomLeft',
];

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
  if (pair.figma === undefined) {
    return [structuralIssue(pair.figmaId, 'geometry', 'missingInFigma')];
  }
  if (pair.live === undefined) {
    return [structuralIssue(pair.figmaId, 'geometry', 'missingInLive')];
  }

  const { figmaId, figma, live } = pair;
  const figmaRect = figma.absoluteBoundingBox;
  const liveRect = live.boundingRect;
  const issues: Issue[] = [];

  // --- Size: already relative, compares directly. ---
  const width = compareNumeric(
    figmaId, 'geometry', 'width', figmaRect.width, liveRect.width, tolerances.size,
  );
  if (width !== undefined) issues.push(width);

  const height = compareNumeric(
    figmaId, 'geometry', 'height', figmaRect.height, liveRect.height, tolerances.size,
  );
  if (height !== undefined) issues.push(height);

  // --- Position: normalize BOTH sides against their own section first. ---
  // Never compare figmaRect.x against liveRect.x. See the note above.
  const expectedOffset = toRelativeOffset(figmaRect, section.figma);
  const actualOffset = toRelativeOffset(liveRect, section.live);

  const offsetX = compareNumeric(
    figmaId, 'geometry', 'offsetX', expectedOffset.x, actualOffset.x, tolerances.position,
  );
  if (offsetX !== undefined) issues.push(offsetX);

  const offsetY = compareNumeric(
    figmaId, 'geometry', 'offsetY', expectedOffset.y, actualOffset.y, tolerances.position,
  );
  if (offsetY !== undefined) issues.push(offsetY);

  // --- Spec properties. Each is skipped when the design does not set it: an
  // unset design value is not an assertion that the live value must be zero.
  if (figma.padding !== undefined) {
    issues.push(...diffPadding(figmaId, figma.padding, live.padding, tolerances.padding));
  }

  if (figma.cornerRadius !== undefined) {
    issues.push(
      ...diffCornerRadius(
        figmaId, figma.cornerRadius, live.cornerRadius, tolerances.cornerRadius, liveRect,
      ),
    );
  }

  if (figma.borders !== undefined) {
    issues.push(
      ...diffBorders(figmaId, figma.borders, live.borders, tolerances.border, tolerances.color),
    );

    // CSS borders are always drawn inside the border box. A CENTER or OUTSIDE
    // stroke is painted partly or wholly beyond the node's bounds, so the
    // widths still compare but the box they imply does not — say so rather
    // than letting a matching width read as a matching design.
    if (figma.strokeAlign !== undefined && figma.strokeAlign !== 'INSIDE') {
      issues.push(
        valueIssue(figmaId, 'geometry', 'border', 'INSIDE (CSS border)', figma.strokeAlign, {
          severity: 'info',
          detail: 'strokeAlign',
        }),
      );
    }
  }

  if (figma.backgroundColor !== undefined) {
    const issue = diffColor(
      figmaId, 'backgroundColor', figma.backgroundColor, live.backgroundColor, tolerances.color,
    );
    if (issue !== undefined) issues.push(issue);
  }

  if (figma.color !== undefined) {
    const issue = diffColor(figmaId, 'color', figma.color, live.color, tolerances.color);
    if (issue !== undefined) issues.push(issue);
  }

  if (figma.shadows !== undefined) {
    issues.push(
      ...diffShadows(figmaId, figma.shadows, live.shadows, tolerances.shadow, tolerances.color),
    );
  }

  return issues;
}

/**
 * Convert an absolute rect into a section-relative offset.
 *
 * Applied to each side independently, using that side's own section rect.
 * This is the function that makes Figma canvas space and browser viewport
 * space comparable; see the note at the top of this file.
 */
export function toRelativeOffset(element: Rect, section: Rect): { x: number; y: number } {
  return { x: element.x - section.x, y: element.y - section.y };
}

/** Compare padding side by side, emitting one Issue per drifting side. */
export function diffPadding(
  figmaId: string,
  expected: BoxSides,
  actual: BoxSides,
  tolerance: number,
): Issue[] {
  const issues: Issue[] = [];
  for (const side of SIDES) {
    const issue = compareNumeric(
      figmaId, 'geometry', 'padding', expected[side], actual[side], tolerance, { detail: side },
    );
    if (issue !== undefined) issues.push(issue);
  }
  return issues;
}

/**
 * The largest radius a browser will actually paint on a box of this size.
 *
 * CSS clamps border-radius so adjacent corners cannot overlap, capping each at
 * half the shorter side. A 40px radius specified on a 48px-tall pill renders
 * as 24px — that is the browser agreeing with the design, not drifting from
 * it, so the expected value is clamped the same way before comparison.
 */
function clampRadius(radius: number, rect: Rect): number {
  return Math.min(radius, Math.min(rect.width, rect.height) / 2);
}

/** Compare corner radii, emitting one Issue per drifting corner. */
export function diffCornerRadius(
  figmaId: string,
  expected: CornerRadius,
  actual: CornerRadius,
  tolerance: number,
  liveRect: Rect,
): Issue[] {
  const issues: Issue[] = [];
  for (const corner of CORNERS) {
    const issue = compareNumeric(
      figmaId,
      'geometry',
      'cornerRadius',
      clampRadius(expected[corner], liveRect),
      actual[corner],
      tolerance,
      { detail: corner },
    );
    if (issue !== undefined) issues.push(issue);
  }
  return issues;
}

/**
 * Compare borders side by side.
 *
 * Width is compared on every side. Colour is compared only where a border is
 * actually drawn on both sides: CSS reports a colour for a border of zero
 * width — usually `currentColor` resolved against the text — and flagging that
 * would report a colour mismatch on an element that has no visible border at
 * all.
 */
export function diffBorders(
  figmaId: string,
  expected: Borders,
  actual: Borders,
  tolerance: number,
  colorTolerance: number,
): Issue[] {
  const issues: Issue[] = [];

  for (const side of SIDES) {
    const want = expected[side];
    const got = actual[side];

    const width = compareNumeric(
      figmaId, 'geometry', 'border', want.width, got.width, tolerance,
      { detail: `${side}.width` },
    );
    if (width !== undefined) issues.push(width);

    if (want.width > 0 && got.width > 0 && !colorsMatch(want.color, got.color, colorTolerance)) {
      issues.push(
        valueIssue(
          figmaId, 'geometry', 'border', formatColor(want.color), formatColor(got.color),
          {
            delta: colorDistance(want.color, got.color),
            tolerance: colorTolerance,
            detail: `${side}.color`,
          },
        ),
      );
    }
  }

  return issues;
}

/** Compare one color, reporting the perceptual distance as the delta. */
function diffColor(
  figmaId: string,
  property: 'backgroundColor' | 'color',
  expected: Rgba,
  actual: Rgba,
  tolerance: number,
  detail?: string,
): Issue | undefined {
  if (colorsMatch(expected, actual, tolerance)) return undefined;
  return valueIssue(figmaId, 'geometry', property, formatColor(expected), formatColor(actual), {
    delta: colorDistance(expected, actual),
    tolerance,
    ...(detail !== undefined ? { detail } : {}),
  });
}

/**
 * Compare shadow stacks.
 *
 * Shadows are ordered lists, so this compares index by index and reports a
 * count mismatch when the stacks are different lengths rather than trying to
 * pair them heuristically — a guess there would attribute a delta to the wrong
 * layer and send someone editing the wrong rule.
 */
export function diffShadows(
  figmaId: string,
  expected: Shadow[],
  actual: Shadow[],
  tolerance: number,
  colorTolerance: number,
): Issue[] {
  if (expected.length !== actual.length) {
    return [
      valueIssue(
        figmaId,
        'geometry',
        'shadow',
        `${expected.length} shadow${expected.length === 1 ? '' : 's'}`,
        `${actual.length} shadow${actual.length === 1 ? '' : 's'}`,
        { detail: 'count' },
      ),
    ];
  }

  const issues: Issue[] = [];
  for (let index = 0; index < expected.length; index += 1) {
    const want = expected[index];
    const got = actual[index];
    if (want === undefined || got === undefined) continue;

    if (want.inset !== got.inset) {
      issues.push(
        valueIssue(
          figmaId,
          'geometry',
          'shadow',
          want.inset ? 'inset' : 'outset',
          got.inset ? 'inset' : 'outset',
          { detail: `${index}.inset` },
        ),
      );
      // An inset/outset flip makes the remaining numbers incomparable.
      continue;
    }

    const metrics = ['offsetX', 'offsetY', 'blur', 'spread'] as const;
    for (const metric of metrics) {
      const issue = compareNumeric(
        figmaId, 'geometry', 'shadow', want[metric], got[metric], tolerance,
        { detail: `${index}.${metric}` },
      );
      if (issue !== undefined) issues.push(issue);
    }

    if (!colorsMatch(want.color, got.color, colorTolerance)) {
      issues.push(
        valueIssue(
          figmaId, 'geometry', 'shadow', formatColor(want.color), formatColor(got.color),
          {
            delta: colorDistance(want.color, got.color),
            tolerance: colorTolerance,
            detail: `${index}.color`,
          },
        ),
      );
    }
  }
  return issues;
}
