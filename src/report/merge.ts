/**
 * TOVI — issue grouping.
 *
 * STUB: no implementation yet.
 *
 * Both passes emit flat Issue lists. This module regroups them by element and
 * computes the counters the report and the CLI exit code depend on.
 */

import type { ToviConfig } from '../config/schema.js';
import type { ElementReport, Issue, RunReport, RunSummary } from './types.js';

/**
 * Group a flat issue list into one ElementReport per configured element.
 *
 * Elements with no issues are kept, not dropped — a report that lists only
 * failures gives no evidence that anything actually passed.
 */
export function mergeIssues(_config: ToviConfig, _issues: Issue[]): ElementReport[] {
  // TODO: seed one ElementReport per config element so passing elements appear.
  // TODO: bucket issues by figmaId, warning on any issue whose figmaId is not
  //       in the config (that would mean a pass invented an element).
  // TODO: fill errorCount/warningCount per element, and set `paired` false
  //       when the element carries a missingInFigma/missingInLive issue.
  // TODO: sort issues within an element by severity then property so report
  //       output is stable across runs — a diffable report is the point.
  throw new Error('TODO: mergeIssues is not implemented');
}

/** Roll element reports up into the run-level counters. */
export function summarize(_elements: ElementReport[]): RunSummary {
  // TODO: count elements checked/passed/failed and total errors/warnings.
  //       An element "passes" when it has zero error-severity issues.
  throw new Error('TODO: summarize is not implemented');
}

/**
 * Assemble the final RunReport.
 *
 * Status is `fail` when any error-severity issue exists; warnings alone do not
 * fail a run.
 */
export function buildRunReport(
  _config: ToviConfig,
  _issues: Issue[],
  _timestamp: string,
): RunReport {
  // TODO: mergeIssues -> summarize -> assemble, deriving status from
  //       summary.errorCount.
  throw new Error('TODO: buildRunReport is not implemented');
}
