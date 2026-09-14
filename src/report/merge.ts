/**
 * TOVI — issue grouping.
 *
 * Both passes emit flat Issue lists. This module regroups them by element and
 * computes the counters the report and the CLI exit code depend on.
 *
 * Output ordering is fully determined here: elements follow config order and
 * issues follow a fixed severity/property order. Two runs over an unchanged
 * page must produce byte-identical reports, or diffing them across builds —
 * the main reason to keep the JSON output — stops working.
 */

import type { ToviConfig } from '../config/schema.js';
import type { ElementReport, Issue, IssueProperty, RunReport, RunSummary, Severity } from './types.js';

/** Sort weight per severity; lower sorts first. */
const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Canonical property order within an element, so reports read consistently. */
const PROPERTY_ORDER: IssueProperty[] = [
  'missingInFigma',
  'missingInLive',
  'ambiguousInLive',
  'skipped',
  'width',
  'height',
  'offsetX',
  'offsetY',
  'padding',
  'cornerRadius',
  'border',
  'backgroundColor',
  'color',
  'shadow',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textContent',
];

function propertyRank(property: IssueProperty): number {
  const index = PROPERTY_ORDER.indexOf(property);
  return index === -1 ? PROPERTY_ORDER.length : index;
}

/** Stable ordering: severity, then property, then detail. */
function compareIssues(a: Issue, b: Issue): number {
  const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (bySeverity !== 0) return bySeverity;

  const byProperty = propertyRank(a.property) - propertyRank(b.property);
  if (byProperty !== 0) return byProperty;

  return (a.detail ?? '').localeCompare(b.detail ?? '');
}

/**
 * Group a flat issue list into one ElementReport per configured element.
 *
 * Elements with no issues are kept, not dropped — a report that lists only
 * failures gives no evidence that anything actually passed.
 */
export function mergeIssues(config: ToviConfig, issues: Issue[]): ElementReport[] {
  const byId = new Map<string, ElementReport>();

  // Seed in config order so passing elements still appear, in a stable place.
  for (const element of config.elements) {
    byId.set(element.figmaId, {
      figmaId: element.figmaId,
      config: element,
      paired: true,
      issues: [],
      errorCount: 0,
      warningCount: 0,
    });
  }

  for (const issue of issues) {
    let report = byId.get(issue.figmaId);
    if (report === undefined) {
      // An issue for an unconfigured element means a pass invented one. Keep
      // it rather than dropping it — silently losing a finding is worse than
      // an unexpected row in the report.
      report = {
        figmaId: issue.figmaId,
        paired: true,
        issues: [],
        errorCount: 0,
        warningCount: 0,
      };
      byId.set(issue.figmaId, report);
    }

    report.issues.push(issue);
    if (issue.severity === 'error') report.errorCount += 1;
    if (issue.severity === 'warning') report.warningCount += 1;
    if (
      issue.property === 'missingInFigma' ||
      issue.property === 'missingInLive' ||
      issue.property === 'ambiguousInLive'
    ) {
      report.paired = false;
    }
  }

  const reports = [...byId.values()];
  for (const report of reports) {
    report.issues.sort(compareIssues);
  }
  return reports;
}

/** Roll element reports up into the run-level counters. */
export function summarize(elements: ElementReport[]): RunSummary {
  let elementsPassed = 0;
  let elementsFailed = 0;
  let errorCount = 0;
  let warningCount = 0;

  for (const element of elements) {
    errorCount += element.errorCount;
    warningCount += element.warningCount;
    // An element passes when it has no error-severity issues. Warnings, such
    // as copy drift, are informational and never fail it.
    if (element.errorCount === 0) elementsPassed += 1;
    else elementsFailed += 1;
  }

  return {
    elementsChecked: elements.length,
    elementsPassed,
    elementsFailed,
    errorCount,
    warningCount,
  };
}

/**
 * Assemble the final RunReport.
 *
 * Status is `fail` when any error-severity issue exists; warnings alone do not
 * fail a run.
 */
export function buildRunReport(
  config: ToviConfig,
  issues: Issue[],
  timestamp: string,
): RunReport {
  const elements = mergeIssues(config, issues);
  const summary = summarize(elements);

  return {
    timestamp,
    url: config.url,
    figmaFileKey: config.figmaFileKey ?? '',
    viewport: { width: config.viewport.width, height: config.viewport.height },
    summary,
    elements,
    status: summary.errorCount > 0 ? 'fail' : 'pass',
  };
}
