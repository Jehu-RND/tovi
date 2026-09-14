/**
 * TOVI — Pass B: text.
 *
 * Compares the five text properties that define a typographic style:
 * font family, size, weight, line-height, and letter-spacing.
 *
 * This pass is deliberately position-blind. It never looks at where the text
 * sits, only at how it is set, which makes it stable against layout reflow and
 * lets it run on elements whose geometry is expected to differ.
 *
 * Units are already normalized to px by the time specs reach this module —
 * figma/normalize.ts and live/extract.ts own that conversion.
 */

import type { ElementPair, TextSpec } from '../types.js';
import type { Tolerances } from '../config/schema.js';
import type { Check, Issue } from '../report/types.js';
import {
  compareNumeric,
  notePass,
  noteIssue,
  normalizeWhitespace,
  structuralIssue,
  valueIssue,
} from './issues.js';

/** The properties Pass B compares, in report order. */
const TEXT_KEYS: Array<keyof TextSpec> = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
];

/** Tolerance key for each numeric text property. */
const TOLERANCE_KEYS = {
  fontSize: 'fontSize',
  fontWeight: 'fontWeight',
  lineHeight: 'lineHeight',
  letterSpacing: 'letterSpacing',
} as const satisfies Record<string, keyof Tolerances>;

/**
 * Compare the text properties of one paired element.
 *
 * @param pair       Figma and live sides for one element.
 * @param tolerances Effective tolerances for this element.
 * @returns One Issue per property whose delta exceeded tolerance. An empty
 *          array means the text matches.
 */
export function diffText(
  pair: ElementPair,
  tolerances: Tolerances,
  checks?: Check[],
  fontAliases?: Record<string, string>,
): Issue[] {
  if (pair.figma === undefined) {
    return [structuralIssue(pair.figmaId, 'text', 'missingInFigma')];
  }
  if (pair.live === undefined) {
    return [structuralIssue(pair.figmaId, 'text', 'missingInLive')];
  }

  // A non-TEXT node carries no type spec; there is nothing for Pass B to say.
  const expected = pair.figma.text;
  if (expected === undefined) return [];

  const actual = pair.live.text;
  const comparable = new Set(comparableTextKeys(expected, actual));
  const issues: Issue[] = [];
  const { figmaId } = pair;

  // Font family has no meaningful numeric delta, so no tolerance applies.
  // Only the first family in the CSS stack is compared — the rest are
  // fallbacks that the design never claimed anything about.
  if (comparable.has('fontFamily')) {
    const expectedFamily = normalizeFontFamily(expected.fontFamily);
    const actualFamily = normalizeFontFamily(actual.fontFamily);
    if (!familiesMatch(expectedFamily, actualFamily, fontAliases)) {
      const familyIssue = valueIssue(
        figmaId, 'text', 'fontFamily', expected.fontFamily, actual.fontFamily,
      );
      issues.push(familyIssue);
      noteIssue(checks, familyIssue);
    } else {
      notePass(checks, figmaId, 'text', 'fontFamily', expected.fontFamily, actual.fontFamily);
    }
  }

  for (const [key, toleranceKey] of Object.entries(TOLERANCE_KEYS)) {
    const property = key as keyof typeof TOLERANCE_KEYS;
    if (!comparable.has(property)) continue;

    // Weight is a unitless 100–900 number; the rest are px.
    const unit = property === 'fontWeight' ? '' : 'px';
    const issue = compareNumeric(
      figmaId,
      'text',
      property,
      expected[property],
      actual[property],
      tolerances[toleranceKey],
      { unit, checks },
    );
    if (issue !== undefined) issues.push(issue);
  }

  // A property that could not be compared is reported as an info-severity
  // skip rather than dropped. Silence here is indistinguishable from a pass,
  // and `line-height: normal` — the common case — would otherwise look like a
  // line height that matched the design.
  for (const key of TEXT_KEYS) {
    if (comparable.has(key)) continue;
    const skipIssue = valueIssue(
      figmaId, 'text', 'skipped', `${key} compared`, `${key} skipped`, {
        severity: 'info',
        detail: skipReason(key, expected, actual),
      },
    );
    issues.push(skipIssue);
    noteIssue(checks, skipIssue);
  }

  // Copy drift is advisory, not a failure: it usually explains a wrapping or
  // height difference reported elsewhere, and content legitimately differs
  // between a design file and a live CMS.
  const expectedCopy = pair.figma.characters;
  if (expectedCopy !== undefined) {
    const a = normalizeWhitespace(expectedCopy);
    const b = normalizeWhitespace(pair.live.textContent);
    if (a !== b) {
      const copyIssue = valueIssue(figmaId, 'text', 'textContent', a, b, { severity: 'warning' });
      issues.push(copyIssue);
      noteIssue(checks, copyIssue);
    } else {
      notePass(checks, figmaId, 'text', 'textContent', a, b);
    }
  }

  return issues;
}

/**
 * Whether two normalized family names refer to the same typeface.
 *
 * Equal strings match. Beyond that, only a declared alias does: the config's
 * `fontAliases` map is consulted in both directions, so it does not matter
 * which side of the pair was written on the left. No similarity matching, no
 * prefix stripping — `Gotham` and `Hco Gotham` are the same typeface only
 * because someone said so, which is what keeps this deterministic.
 */
export function familiesMatch(
  expected: string,
  actual: string,
  aliases?: Record<string, string>,
): boolean {
  if (expected === actual) return true;
  if (aliases === undefined) return false;

  for (const [from, to] of Object.entries(aliases)) {
    const a = normalizeFontFamily(from);
    const b = normalizeFontFamily(to);
    if ((a === expected && b === actual) || (a === actual && b === expected)) return true;
  }
  return false;
}

/**
 * Normalize a font family name for comparison: strip quotes, trim, lowercase,
 * and take the first entry of a CSS font stack.
 */
export function normalizeFontFamily(family: string): string {
  const first = family.split(',')[0] ?? '';
  return first.trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
}

/**
 * Explain why a text property could not be compared.
 *
 * The wording matters more than it looks: someone reading a skipped
 * line-height needs to know it is a property of their CSS, not a gap in the
 * tool, or they will go looking for a bug that is not there.
 */
function skipReason(key: keyof TextSpec, expected: TextSpec, actual: TextSpec): string {
  const haveDesign = isUsable(expected[key]);
  const haveLive = isUsable(actual[key]);

  if (!haveLive && key === 'lineHeight') {
    return 'line-height is `normal` on the live element — font-dependent, so there is no honest number to compare';
  }
  if (!haveDesign && !haveLive) return `${key}: neither side reports a value`;
  if (!haveDesign) return `${key}: the Figma node does not report it`;
  return `${key}: the live element does not report a comparable value`;
}

/** Whether a value is present and usable for comparison. */
function isUsable(value: string | number): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  return Number.isFinite(value);
}

/**
 * Narrow a TextSpec to the subset both sides actually provided.
 *
 * An absent or non-finite property is skipped rather than compared against
 * NaN, which would otherwise surface as a confident-looking failure.
 */
export function comparableTextKeys(a: TextSpec, b: TextSpec): Array<keyof TextSpec> {
  return TEXT_KEYS.filter((key) => isUsable(a[key]) && isUsable(b[key]));
}
