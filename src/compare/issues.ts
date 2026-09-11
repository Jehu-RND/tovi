/**
 * TOVI — Issue construction.
 *
 * Both passes reduce to the same primitive: measure a delta, compare it to a
 * tolerance, and build an Issue when it is exceeded. That primitive lives here
 * so the two passes stay consistent about rounding, formatting, and severity.
 */

import type { Issue, IssueProperty, PassName, Severity } from '../report/types.js';

/** Deltas are rounded to this many decimals before display and comparison. */
const PRECISION = 3;

export interface NumericIssueOptions {
  /** Unit suffix for display. Defaults to 'px'; pass '' for unitless values. */
  unit?: string;
  /** Which side / corner / index the issue refers to. */
  detail?: string;
  /** Defaults to 'error'. */
  severity?: Severity;
}

/** Round to PRECISION decimals, dropping trailing zeroes. */
export function round(value: number): number {
  return Number(value.toFixed(PRECISION));
}

/** Format a measurement for display, e.g. "24px" or "600". */
export function formatValue(value: number, unit = 'px'): string {
  return `${round(value)}${unit}`;
}

/**
 * Compare one numeric property and build an Issue when it drifts too far.
 *
 * The delta is rounded before it is tested, so a value that differs only in
 * float noise (24 vs 24.0000000001) can never trip a zero tolerance.
 *
 * @returns An Issue when |actual - expected| > tolerance, else undefined.
 */
export function compareNumeric(
  figmaId: string,
  pass: PassName,
  property: IssueProperty,
  expected: number,
  actual: number,
  tolerance: number,
  options: NumericIssueOptions = {},
): Issue | undefined {
  const delta = round(actual - expected);
  if (Math.abs(delta) <= tolerance) return undefined;

  const unit = options.unit ?? 'px';
  return {
    figmaId,
    pass,
    property,
    severity: options.severity ?? 'error',
    expected: formatValue(expected, unit),
    actual: formatValue(actual, unit),
    delta,
    tolerance,
    ...(options.detail !== undefined ? { detail: options.detail } : {}),
  };
}

/**
 * Build an Issue for a non-numeric mismatch — a font family, a color, a piece
 * of copy — where there is no meaningful delta to report.
 */
export function valueIssue(
  figmaId: string,
  pass: PassName,
  property: IssueProperty,
  expected: string,
  actual: string,
  options: { severity?: Severity; detail?: string; delta?: number; tolerance?: number } = {},
): Issue {
  return {
    figmaId,
    pass,
    property,
    severity: options.severity ?? 'error',
    expected,
    actual,
    ...(options.delta !== undefined ? { delta: round(options.delta) } : {}),
    ...(options.tolerance !== undefined ? { tolerance: options.tolerance } : {}),
    ...(options.detail !== undefined ? { detail: options.detail } : {}),
  };
}

/**
 * Build the structural Issue for an element that exists on only one side.
 *
 * A pass that hits this returns it alone and stops: comparing against a side
 * that isn't there would emit a dozen property failures that all restate the
 * same single fact.
 */
export function structuralIssue(
  figmaId: string,
  pass: PassName,
  property: 'missingInFigma' | 'missingInLive',
): Issue {
  const missingSide = property === 'missingInFigma' ? 'Figma node' : 'live element';
  return {
    figmaId,
    pass,
    property,
    severity: 'error',
    expected: property === 'missingInFigma' ? `a ${missingSide} named "${figmaId}"` : 'present',
    actual: `no ${missingSide} found`,
  };
}

/** Collapse runs of whitespace and trim, so copy compares on words alone. */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
