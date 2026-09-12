/**
 * TOVI — report types.
 *
 * An Issue is the atomic unit of output: one property, on one element, whose
 * measured delta exceeded its tolerance. Issues carry the raw numbers so the
 * report can show the arithmetic rather than just a verdict.
 */

import type { ElementConfig } from '../config/schema.js';

/** Which comparison pass produced an issue. */
export type PassName = 'text' | 'geometry';

/**
 * Severity is derived, not judged: `error` when the delta exceeds tolerance,
 * `warning` for advisory findings (missing optional property, copy drift),
 * `info` for context that never fails a run.
 */
export type Severity = 'error' | 'warning' | 'info';

/**
 * The property an issue is about. A closed union so the report can group and
 * sort without string matching.
 */
export type IssueProperty =
  // Pass B — text
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'letterSpacing'
  // Pass A — geometry & spec
  | 'width'
  | 'height'
  | 'offsetX'
  | 'offsetY'
  | 'padding'
  | 'cornerRadius'
  | 'backgroundColor'
  | 'color'
  | 'shadow'
  // Structural
  | 'missingInFigma'
  | 'missingInLive'
  | 'ambiguousInLive'
  | 'skipped'
  | 'textContent';

/** One property-level mismatch. */
export interface Issue {
  /** Pairing key of the element this issue belongs to. */
  figmaId: string;
  pass: PassName;
  property: IssueProperty;
  severity: Severity;

  /** Design value, formatted for display (e.g. "24px", "rgb(17, 17, 17)"). */
  expected: string;
  /** Live value, formatted for display. */
  actual: string;

  /**
   * Signed numeric difference (actual - expected) where the property is
   * numeric; a deltaE for colors. Absent for non-numeric properties such as
   * fontFamily or the structural issues.
   */
  delta?: number;
  /** The tolerance this delta was tested against. */
  tolerance?: number;

  /** Which box side / corner / shadow index the issue refers to, if any. */
  detail?: string;
}

/** All issues for a single element, plus enough context to render them. */
export interface ElementReport {
  figmaId: string;
  /** The config entry that produced this element, for selector/node id. */
  config?: ElementConfig;
  /** True when both a Figma node and a live element were found. */
  paired: boolean;
  issues: Issue[];
  /** Convenience counts, filled in by report/merge.ts. */
  errorCount: number;
  warningCount: number;
}

/** Summary counters for a whole run. */
export interface RunSummary {
  elementsChecked: number;
  elementsPassed: number;
  elementsFailed: number;
  errorCount: number;
  warningCount: number;
}

/** The complete result of one `tovi check`. */
export interface RunReport {
  /** ISO 8601 timestamp of when the run started. */
  timestamp: string;
  url: string;
  figmaFileKey: string;
  /** Viewport the live page was rendered at. */
  viewport: { width: number; height: number };
  summary: RunSummary;
  elements: ElementReport[];
  /**
   * Overall verdict. `pass` when no error-severity issues were found —
   * warnings alone do not fail a run.
   */
  status: 'pass' | 'fail';
}
