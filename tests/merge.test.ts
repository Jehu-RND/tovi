/**
 * Report merging — grouping, counting, and the ordering invariant 4 rests on.
 *
 * This module had no direct test until the measurement advisories were added.
 * That mattered: `PROPERTY_ORDER` is the only thing keeping two runs over an
 * unchanged page byte-identical, and a property missing from it sorts last and
 * becomes insertion-dependent — a failure that produces a correct-looking
 * report and a diff that moves for no reason.
 */

import { describe, expect, it } from 'vitest';
import { buildRunReport, mergeIssues, summarize } from '../src/report/merge.js';
import { validateConfig } from '../src/config/loadConfig.js';
import type { ToviConfig } from '../src/config/schema.js';
import type { Issue, IssueProperty, RunNote, Severity } from '../src/report/types.js';

const config: ToviConfig = validateConfig({
  figmaFileKey: 'KEY',
  url: 'https://example.com/',
  section: 'hero',
  viewport: { width: 1440, height: 900 },
  elements: [
    { figmaId: 'hero', nodeId: '1:20' },
    { figmaId: 'hero-cta', nodeId: '1:45' },
  ],
});

function issue(
  property: IssueProperty,
  severity: Severity = 'error',
  overrides: Partial<Issue> = {},
): Issue {
  return {
    figmaId: 'hero-cta',
    pass: 'geometry',
    property,
    severity,
    expected: 'a',
    actual: 'b',
    ...overrides,
  };
}

/** The properties of one element's issues, in the order the report will show. */
function orderOf(issues: Issue[]): IssueProperty[] {
  const element = mergeIssues(config, issues).find((e) => e.figmaId === 'hero-cta');
  return (element?.issues ?? []).map((i) => i.property);
}

describe('mergeIssues — ordering', () => {
  it('sorts errors before warnings before info, whatever order they arrive in', () => {
    expect(orderOf([
      issue('boxShape', 'info'),
      issue('textContent', 'warning'),
      issue('width'),
    ])).toEqual(['width', 'textContent', 'boxShape']);
  });

  it('puts the measurement advisories in a fixed order among themselves', () => {
    // Shuffled on the way in; the output order must not depend on it.
    expect(orderOf([
      issue('positioning', 'info'),
      issue('zeroSize', 'info'),
      issue('boxShape', 'info'),
    ])).toEqual(['boxShape', 'zeroSize', 'positioning']);

    expect(orderOf([
      issue('zeroSize', 'info'),
      issue('boxShape', 'info'),
      issue('positioning', 'info'),
    ])).toEqual(['boxShape', 'zeroSize', 'positioning']);
  });

  it('pins the whole property order, so adding one cannot go unreviewed', () => {
    // Deliberately a second copy of PROPERTY_ORDER rather than a derivation of
    // it. A property left out of the table sorts last, which is *stable* on its
    // own and so invisible to any test that only compares two shufflings — it
    // only breaks the day a second property is left out too. Writing the order
    // down means adding a property to the union makes this test fail until
    // someone has decided where it belongs.
    const shuffled: IssueProperty[] = [
      'letterSpacing', 'zeroSize', 'width', 'missingInLive', 'shadow', 'border',
      'textContent', 'boxShape', 'offsetY', 'fontFamily', 'skipped', 'color',
      'cornerRadius', 'positioning', 'height', 'missingInFigma', 'fontWeight',
      'padding', 'backgroundColor', 'ambiguousInLive', 'offsetX', 'lineHeight',
      'fontSize',
    ];
    expect(orderOf(shuffled.map((property) => issue(property, 'info')))).toEqual([
      'missingInFigma', 'missingInLive', 'ambiguousInLive', 'skipped',
      'boxShape', 'zeroSize', 'positioning',
      'width', 'height', 'offsetX', 'offsetY', 'padding', 'cornerRadius',
      'border', 'backgroundColor', 'color', 'shadow',
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
      'textContent',
    ]);
  });

  it('breaks a property tie on detail, so per-side findings read consistently', () => {
    const element = mergeIssues(config, [
      issue('padding', 'error', { detail: 'top' }),
      issue('padding', 'error', { detail: 'bottom' }),
    ]).find((e) => e.figmaId === 'hero-cta');
    expect(element?.issues.map((i) => i.detail)).toEqual(['bottom', 'top']);
  });

  it('keeps elements in config order, including the ones with nothing wrong', () => {
    expect(mergeIssues(config, [issue('width')]).map((e) => e.figmaId))
      .toEqual(['hero', 'hero-cta']);
  });
});

describe('mergeIssues — counting', () => {
  it('counts errors and warnings but never info', () => {
    const element = mergeIssues(config, [
      issue('width'), issue('textContent', 'warning'), issue('boxShape', 'info'),
    ]).find((e) => e.figmaId === 'hero-cta');
    expect(element?.errorCount).toBe(1);
    expect(element?.warningCount).toBe(1);
  });

  it('passes an element carrying only advisories', () => {
    // The whole point of an info advisory: it explains, it does not judge.
    const elements = mergeIssues(config, [
      issue('boxShape', 'info'), issue('positioning', 'info'),
    ]);
    expect(summarize(elements).elementsPassed).toBe(2);
    expect(summarize(elements).errorCount).toBe(0);
  });

  it('marks an element unpaired only for a structural issue', () => {
    const structural = mergeIssues(config, [issue('missingInLive')]);
    expect(structural.find((e) => e.figmaId === 'hero-cta')?.paired).toBe(false);
    const advisory = mergeIssues(config, [issue('zeroSize', 'info')]);
    expect(advisory.find((e) => e.figmaId === 'hero-cta')?.paired).toBe(true);
  });
});

describe('buildRunReport — notes', () => {
  const notes: RunNote[] = [{ kind: 'overlay', message: 'overlay ".promo" hid 1 element' }];

  it('carries the notes it was given', () => {
    expect(buildRunReport(config, [], 'T', [], undefined, notes).notes).toEqual(notes);
  });

  it('omits the key entirely when the run prepared nothing', () => {
    // Omitted rather than empty, so a run that hid nothing produces the report
    // it always did — byte for byte, against a committed baseline.
    const report = buildRunReport(config, [], 'T', [], undefined, []);
    expect('notes' in report).toBe(false);
  });

  it('omits it when no notes argument is passed at all', () => {
    expect('notes' in buildRunReport(config, [], 'T')).toBe(false);
  });

  it('fails the run on an error and passes it on an advisory', () => {
    expect(buildRunReport(config, [issue('width')], 'T').status).toBe('fail');
    expect(buildRunReport(config, [issue('zeroSize', 'info')], 'T').status).toBe('pass');
  });
});
