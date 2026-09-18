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
import type { Check, Issue } from '../report/types.js';
import { colorDistance, colorsMatch, formatColor } from './color.js';
import {
  compareNumeric, notePass, noteIssue, round, structuralIssue, valueIssue,
} from './issues.js';
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
  checks?: Check[],
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

  // --- Measurement advisories, before the numbers they qualify. ---
  //
  // None of these changes a comparison, raises a tolerance, or suppresses a
  // finding. Each states a fact about how one side was authored or measured
  // that changes what the deltas below it MEAN. Triage 001 had to rediscover
  // every one of them by hand; sixteen of its thirty-five findings were
  // explained by facts the tool already knew and did not say.
  for (const advisory of measurementAdvisories(figmaId, figma, live, section, liveRect)) {
    issues.push(advisory);
    noteIssue(checks, advisory);
  }

  // --- Size: already relative, compares directly. ---
  const width = compareNumeric(
    figmaId, 'geometry', 'width', figmaRect.width, liveRect.width, tolerances.size, { checks },
  );
  if (width !== undefined) issues.push(width);

  const height = compareNumeric(
    figmaId, 'geometry', 'height', figmaRect.height, liveRect.height, tolerances.size, { checks },
  );
  if (height !== undefined) issues.push(height);

  // --- Position: normalize BOTH sides against their own section first. ---
  // Never compare figmaRect.x against liveRect.x. See the note above.
  const expectedOffset = toRelativeOffset(figmaRect, section.figma);
  const actualOffset = toRelativeOffset(liveRect, section.live);

  const offsetX = compareNumeric(
    figmaId, 'geometry', 'offsetX', expectedOffset.x, actualOffset.x, tolerances.position,
    { checks },
  );
  if (offsetX !== undefined) issues.push(offsetX);

  const offsetY = compareNumeric(
    figmaId, 'geometry', 'offsetY', expectedOffset.y, actualOffset.y, tolerances.position,
    { checks },
  );
  if (offsetY !== undefined) issues.push(offsetY);

  // --- Spec properties. Each is skipped when the design does not set it: an
  // unset design value is not an assertion that the live value must be zero.
  if (figma.padding !== undefined) {
    issues.push(...diffPadding(figmaId, figma.padding, live.padding, tolerances.padding, checks));
  }

  if (figma.cornerRadius !== undefined) {
    issues.push(
      ...diffCornerRadius(
        figmaId, figma.cornerRadius, live.cornerRadius, tolerances.cornerRadius, liveRect, checks,
      ),
    );
  }

  if (figma.borders !== undefined) {
    // A stroke on a TEXT node is a glyph outline, not a box border. CSS spells
    // that -webkit-text-stroke; `border` on the same element draws a rectangle
    // around the text instead. Comparing the two is a category error that can
    // only ever fail, so the widths are not compared — but the stroke is still
    // reported, because invariant 3 forbids turning an uncomparable property
    // into silence.
    if (figma.type === 'TEXT') {
      const outlineIssue = valueIssue(
        figmaId, 'geometry', 'border',
        `${describeStrokeWidths(figma.borders)} text outline (-webkit-text-stroke)`,
        'not compared — CSS border draws a box, not a glyph outline',
        { severity: 'info', detail: 'textStroke' },
      );
      issues.push(outlineIssue);
      noteIssue(checks, outlineIssue);
    } else {
      issues.push(
        ...diffBorders(figmaId, figma.borders, live.borders, tolerances.border,
          tolerances.color, checks),
      );

      // CSS borders are always drawn inside the border box. A CENTER or OUTSIDE
      // stroke is painted partly or wholly beyond the node's bounds, so the
      // widths still compare but the box they imply does not — say so rather
      // than letting a matching width read as a matching design.
      if (figma.strokeAlign !== undefined && figma.strokeAlign !== 'INSIDE') {
        const alignIssue = valueIssue(
          figmaId, 'geometry', 'border', 'INSIDE (CSS border)', figma.strokeAlign, {
            severity: 'info',
            detail: 'strokeAlign',
          },
        );
        issues.push(alignIssue);
        noteIssue(checks, alignIssue);
      }
    }
  }

  if (figma.backgroundColor !== undefined) {
    const issue = diffColor(
      figmaId, 'backgroundColor', figma.backgroundColor, live.backgroundColor, tolerances.color,
      undefined, checks,
    );
    if (issue !== undefined) issues.push(issue);
  }

  if (figma.color !== undefined) {
    const issue = diffColor(figmaId, 'color', figma.color, live.color, tolerances.color,
      undefined, checks);
    if (issue !== undefined) issues.push(issue);
  }

  if (figma.shadows !== undefined) {
    issues.push(
      ...diffShadows(figmaId, figma.shadows, live.shadows, tolerances.shadow,
        tolerances.color, checks),
    );
  }

  return issues;
}

/**
 * The facts about this measurement that the deltas alone do not carry.
 *
 * Emitted as `info`, so a run's verdict is identical with and without them —
 * which is the point: they are evidence for whoever reads the findings, not
 * part of the finding. They are collected in one place so the list of things
 * TOVI knows but used to keep to itself can be read at a glance.
 */
function measurementAdvisories(
  figmaId: string,
  figma: NonNullable<ElementPair['figma']>,
  live: NonNullable<ElementPair['live']>,
  section: SectionContext,
  liveRect: Rect,
): Issue[] {
  const issues: Issue[] = [];

  // T-27. A Figma TEXT node can size its own box to the glyphs it contains,
  // and then the box is the ink — not the column the text was laid out in. A
  // heading whose live element spans a 1470px content column reports a 742px
  // Figma box because that is how wide the words happen to be, and the
  // resulting width and offsetX deltas are arithmetic on the difference:
  // (1470 - 742) / 2 = 364, exactly the offsetX delta triage 001 reported.
  //
  // The comparison is left alone. Suppressing it would hide a text element
  // genuinely built at the wrong width, and the design file, not the tool, is
  // where this is fixed — by giving the node a fixed size, or by pairing the
  // live element against the frame that actually holds it.
  if (figma.type === 'TEXT' && figma.textAutoResize !== undefined) {
    const hug = figma.textAutoResize;
    if (hug === 'WIDTH_AND_HEIGHT' || hug === 'HEIGHT') {
      const bothAxes = hug === 'WIDTH_AND_HEIGHT';
      const axes = bothAxes ? 'width and height are' : 'height is';
      const affected = bothAxes ? 'width, height, offsetX and offsetY' : 'height and offsetY';
      issues.push(
        valueIssue(
          figmaId, 'geometry', 'boxShape',
          `textAutoResize: ${hug} — the design box hugs the glyphs, ${axes} not laid out`,
          `${affected} below compare a glyph hug against a laid-out element`,
          { severity: 'info', detail: 'textAutoResize' },
        ),
      );
    }
  }

  // T-04. An element that occupies no space produces a delta the size of the
  // whole design box, which reads exactly like a component that was never
  // built. The commonest cause is an image with no intrinsic size that has not
  // loaded — live/extract.ts switches lazy loading off before measuring, so
  // one still pending here did not arrive within the budget.
  if (liveRect.width === 0 || liveRect.height === 0) {
    const pending = live.pendingImages ?? 0;
    issues.push(
      valueIssue(
        figmaId, 'geometry', 'zeroSize',
        `${round(figma.absoluteBoundingBox.width)}×${round(figma.absoluteBoundingBox.height)} in the design`,
        `${round(liveRect.width)}×${round(liveRect.height)} on the page — it occupies no space`,
        {
          severity: 'info',
          detail: pending > 0
            ? `${pending} image${pending === 1 ? '' : 's'} here had not finished loading`
            : 'display:none, an empty inline, or a replaced element with no intrinsic size',
        },
      ),
    );
  }

  // T-05. getBoundingClientRect() is viewport-relative, so a fixed or sticky
  // element's rect is a function of scroll position. TOVI measures at scroll 0
  // and never moves — invariant 2 — which makes the number reproducible, but
  // reproducible is not the same as what the design meant. Worse when the
  // SECTION is the sticky one: every offset in the run is then measured
  // against a rect that slides.
  const position = live.position;
  if (position === 'fixed' || position === 'sticky') {
    issues.push(
      valueIssue(
        figmaId, 'geometry', 'positioning',
        'a rect anchored to the document',
        `position: ${position} — anchored to the viewport, measured at scroll 0`,
        {
          severity: 'info',
          detail: figmaId === section.figmaId
            ? 'this is the section container, so every offset in the run rests on it'
            : 'its offset holds at the top of the page and nowhere else',
        },
      ),
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
  checks?: Check[],
): Issue[] {
  const issues: Issue[] = [];
  for (const side of SIDES) {
    const issue = compareNumeric(
      figmaId, 'geometry', 'padding', expected[side], actual[side], tolerance,
      { detail: side, checks },
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
  checks?: Check[],
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
      { detail: corner, checks },
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
  checks?: Check[],
): Issue[] {
  const issues: Issue[] = [];

  for (const side of SIDES) {
    const want = expected[side];
    const got = actual[side];

    const width = compareNumeric(
      figmaId, 'geometry', 'border', want.width, got.width, tolerance,
      { detail: `${side}.width`, checks },
    );
    if (width !== undefined) issues.push(width);

    // Colour is only meaningful where a border is drawn on both sides, so a
    // side with no border records no colour check rather than a passing one.
    if (want.width > 0 && got.width > 0) {
      const distance = colorDistance(want.color, got.color);
      if (colorsMatch(want.color, got.color, colorTolerance)) {
        notePass(checks, figmaId, 'geometry', 'border',
          formatColor(want.color), formatColor(got.color),
          { delta: distance, tolerance: colorTolerance, detail: `${side}.color` });
      } else {
        const issue = valueIssue(
          figmaId, 'geometry', 'border', formatColor(want.color), formatColor(got.color),
          { delta: distance, tolerance: colorTolerance, detail: `${side}.color` },
        );
        issues.push(issue);
        noteIssue(checks, issue);
      }
    }
  }

  return issues;
}

/**
 * Describe a stroke's widths for the text-outline note, e.g. "1px" or
 * "1/2/1/2px". One number when every side agrees, which is the usual case.
 */
function describeStrokeWidths(borders: Borders): string {
  const widths = SIDES.map((side) => round(borders[side].width));
  const uniform = widths.every((width) => width === widths[0]);
  return uniform ? `${widths[0]}px` : `${widths.join('/')}px`;
}

/** Compare one color, reporting the perceptual distance as the delta. */
function diffColor(
  figmaId: string,
  property: 'backgroundColor' | 'color',
  expected: Rgba,
  actual: Rgba,
  tolerance: number,
  detail?: string,
  checks?: Check[],
): Issue | undefined {
  const distance = colorDistance(expected, actual);
  if (colorsMatch(expected, actual, tolerance)) {
    notePass(checks, figmaId, 'geometry', property, formatColor(expected), formatColor(actual), {
      delta: distance,
      tolerance,
      ...(detail !== undefined ? { detail } : {}),
    });
    return undefined;
  }
  const issue = valueIssue(
    figmaId, 'geometry', property, formatColor(expected), formatColor(actual), {
      delta: distance,
      tolerance,
      ...(detail !== undefined ? { detail } : {}),
    },
  );
  noteIssue(checks, issue);
  return issue;
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
  checks?: Check[],
): Issue[] {
  if (expected.length !== actual.length) {
    const countIssue = valueIssue(
      figmaId,
      'geometry',
      'shadow',
      `${expected.length} shadow${expected.length === 1 ? '' : 's'}`,
      `${actual.length} shadow${actual.length === 1 ? '' : 's'}`,
      { detail: 'count' },
    );
    noteIssue(checks, countIssue);
    return [countIssue];
  }

  const issues: Issue[] = [];
  for (let index = 0; index < expected.length; index += 1) {
    const want = expected[index];
    const got = actual[index];
    if (want === undefined || got === undefined) continue;

    if (want.inset !== got.inset) {
      const insetIssue = valueIssue(
        figmaId,
        'geometry',
        'shadow',
        want.inset ? 'inset' : 'outset',
        got.inset ? 'inset' : 'outset',
        { detail: `${index}.inset` },
      );
      issues.push(insetIssue);
      noteIssue(checks, insetIssue);
      // An inset/outset flip makes the remaining numbers incomparable.
      continue;
    }

    const metrics = ['offsetX', 'offsetY', 'blur', 'spread'] as const;
    for (const metric of metrics) {
      const issue = compareNumeric(
        figmaId, 'geometry', 'shadow', want[metric], got[metric], tolerance,
        { detail: `${index}.${metric}`, checks },
      );
      if (issue !== undefined) issues.push(issue);
    }

    const shadowDistance = colorDistance(want.color, got.color);
    if (colorsMatch(want.color, got.color, colorTolerance)) {
      notePass(checks, figmaId, 'geometry', 'shadow',
        formatColor(want.color), formatColor(got.color),
        { delta: shadowDistance, tolerance: colorTolerance, detail: `${index}.color` });
    } else {
      const colorIssue = valueIssue(
        figmaId, 'geometry', 'shadow', formatColor(want.color), formatColor(got.color),
        { delta: shadowDistance, tolerance: colorTolerance, detail: `${index}.color` },
      );
      issues.push(colorIssue);
      noteIssue(checks, colorIssue);
    }
  }
  return issues;
}
