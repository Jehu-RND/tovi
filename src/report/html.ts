/**
 * TOVI — HTML report rendering.
 *
 * Renders a RunReport into a single self-contained HTML string: inline CSS, no
 * external assets, no scripts fetched from a CDN. The output is written to a
 * file and opened locally, so it must work with no network.
 *
 * Every interpolated value is escaped. Element names come from a design file
 * and text content comes from the live page — both are untrusted input as far
 * as this renderer is concerned.
 */

import type { ElementReport, Issue, RunReport } from './types.js';

export interface RenderOptions {
  /** Optional screenshot path to link alongside the results. */
  screenshotPath?: string;
  /** Include elements that passed. Defaults to true. */
  includePassing?: boolean;
}

/** Escape a string for safe interpolation into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Whether a formatted value is a CSS color we can paint a swatch with.
 *
 * Deliberately narrow: it only matches the `rgb()` / `rgba()` form that
 * compare/color.ts emits, so arbitrary text from the page can never reach a
 * style attribute.
 */
export function isColorValue(value: string): boolean {
  return /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)$/.test(value);
}

/** Render a value cell, with a swatch when the value is a color. */
function renderValue(value: string): string {
  const escaped = escapeHtml(value);
  if (!isColorValue(value)) return `<code>${escaped}</code>`;
  // Safe: isColorValue has already constrained this to digits and commas.
  return `<span class="swatch" style="background:${escaped}"></span><code>${escaped}</code>`;
}

/** Format the delta column, including the tolerance it was tested against. */
function renderDelta(issue: Issue): string {
  if (issue.delta === undefined) return '<span class="muted">—</span>';
  const sign = issue.delta > 0 ? '+' : '';
  const delta = `${sign}${issue.delta}`;
  if (issue.tolerance === undefined) return `<code>${escapeHtml(delta)}</code>`;
  return `<code>${escapeHtml(delta)}</code> <span class="muted">vs ±${escapeHtml(String(issue.tolerance))}</span>`;
}

/** Property label, with the side / corner / index appended when present. */
function renderProperty(issue: Issue): string {
  const label = escapeHtml(issue.property);
  if (issue.detail === undefined) return `<strong>${label}</strong>`;
  return `<strong>${label}</strong><span class="muted">.${escapeHtml(issue.detail)}</span>`;
}

function renderIssueRow(issue: Issue): string {
  return `
      <tr class="sev-${escapeHtml(issue.severity)}">
        <td><span class="chip chip-${escapeHtml(issue.severity)}">${escapeHtml(issue.severity)}</span></td>
        <td><span class="muted">${escapeHtml(issue.pass)}</span></td>
        <td>${renderProperty(issue)}</td>
        <td>${renderValue(issue.expected)}</td>
        <td>${renderValue(issue.actual)}</td>
        <td>${renderDelta(issue)}</td>
      </tr>`;
}

/** Render one element's block. Split out so it can be unit tested alone. */
export function renderElementSection(element: ElementReport): string {
  const failed = element.errorCount > 0;
  const status = failed ? 'fail' : 'pass';
  const nodeId = element.config?.nodeId;
  const selector = element.config?.selector;

  const meta: string[] = [];
  if (nodeId !== undefined) meta.push(`node <code>${escapeHtml(nodeId)}</code>`);
  if (selector !== undefined) meta.push(`selector <code>${escapeHtml(selector)}</code>`);
  if (!element.paired) meta.push('<span class="muted">unpaired</span>');

  if (element.issues.length === 0) {
    return `
    <section class="element ok">
      <h2><span class="chip chip-pass">pass</span> ${escapeHtml(element.figmaId)}</h2>
      <p class="meta">${meta.join(' · ')}</p>
    </section>`;
  }

  return `
    <section class="element ${status}">
      <h2><span class="chip chip-${status}">${status}</span> ${escapeHtml(element.figmaId)}</h2>
      <p class="meta">${meta.join(' · ')}</p>
      <table>
        <thead>
          <tr><th>severity</th><th>pass</th><th>property</th><th>expected</th><th>actual</th><th>delta</th></tr>
        </thead>
        <tbody>${element.issues.map(renderIssueRow).join('')}
        </tbody>
      </table>
    </section>`;
}

const STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #fbfbfc; color: #16181d;
  }
  .wrap { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
  .muted { color: #6b7280; }
  .summary {
    background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
    padding: 16px 18px; margin-bottom: 20px;
  }
  .summary dl { display: flex; flex-wrap: wrap; gap: 20px 32px; margin: 12px 0 0; }
  .summary dt { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
  .summary dd { margin: 2px 0 0; font-size: 18px; font-variant-numeric: tabular-nums; }
  .element {
    background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
    padding: 14px 16px; margin-bottom: 12px;
  }
  .element.fail { border-left: 3px solid #dc2626; }
  .element.ok   { border-left: 3px solid #16a34a; }
  .meta { margin: 0; font-size: 12px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th {
    text-align: left; font-size: 11px; text-transform: uppercase;
    letter-spacing: .04em; color: #6b7280; font-weight: 600;
    padding: 6px 8px; border-bottom: 1px solid #e5e7eb;
  }
  td { padding: 7px 8px; border-bottom: 1px solid #f1f2f4; vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  .chip {
    display: inline-block; padding: 1px 7px; border-radius: 999px;
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em;
  }
  .chip-error, .chip-fail { background: #fee2e2; color: #991b1b; }
  .chip-warning { background: #fef3c7; color: #92400e; }
  .chip-info { background: #e0e7ff; color: #3730a3; }
  .chip-pass { background: #dcfce7; color: #166534; }
  .swatch {
    display: inline-block; width: 11px; height: 11px; border-radius: 3px;
    border: 1px solid rgba(0,0,0,.25); margin-right: 6px; vertical-align: -1px;
  }
  .verdict { font-size: 13px; font-weight: 600; }
  .verdict.fail { color: #dc2626; }
  .verdict.pass { color: #16a34a; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1115; color: #e6e8ec; }
    .summary, .element { background: #161a21; border-color: #272c36; }
    th { border-bottom-color: #272c36; color: #9aa2b1; }
    td { border-bottom-color: #1e232c; }
    .muted { color: #9aa2b1; }
  }
`;

/**
 * Render a full RunReport to a standalone HTML document.
 *
 * @returns A complete HTML string, ready to write to disk.
 */
export function renderHtmlReport(report: RunReport, options: RenderOptions = {}): string {
  const includePassing = options.includePassing ?? true;
  const elements = includePassing
    ? report.elements
    : report.elements.filter((element) => element.issues.length > 0);

  const screenshot = options.screenshotPath;
  const screenshotRow = screenshot !== undefined
    ? `<dt>screenshot</dt><dd style="font-size:13px"><code>${escapeHtml(screenshot)}</code></dd>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TOVI report — ${escapeHtml(report.url)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
  <div class="summary">
    <h1>TOVI report</h1>
    <p class="meta">
      <code>${escapeHtml(report.url)}</code> ·
      Figma <code>${escapeHtml(report.figmaFileKey)}</code> ·
      ${report.viewport.width}×${report.viewport.height} ·
      ${escapeHtml(report.timestamp)}
    </p>
    <dl>
      <div><dt>verdict</dt><dd class="verdict ${escapeHtml(report.status)}">${escapeHtml(report.status)}</dd></div>
      <div><dt>elements</dt><dd>${report.summary.elementsChecked}</dd></div>
      <div><dt>passed</dt><dd>${report.summary.elementsPassed}</dd></div>
      <div><dt>failed</dt><dd>${report.summary.elementsFailed}</dd></div>
      <div><dt>errors</dt><dd>${report.summary.errorCount}</dd></div>
      <div><dt>warnings</dt><dd>${report.summary.warningCount}</dd></div>
      ${screenshotRow}
    </dl>
  </div>
${elements.map(renderElementSection).join('\n')}
</div>
</body>
</html>
`;
}

/** Render a plain-text summary for terminal output. Kept grep-able. */
export function renderTextSummary(report: RunReport): string {
  const lines: string[] = [];
  lines.push(`TOVI ${report.status.toUpperCase()}  ${report.url}  (${report.viewport.width}x${report.viewport.height})`);

  for (const element of report.elements) {
    if (element.issues.length === 0) continue;
    for (const issue of element.issues) {
      const detail = issue.detail === undefined ? '' : `.${issue.detail}`;
      const delta = issue.delta === undefined ? '' : `  delta ${issue.delta > 0 ? '+' : ''}${issue.delta}`;
      lines.push(
        `  ${issue.severity.padEnd(7)} ${element.figmaId}  ${issue.property}${detail}` +
          `  expected ${issue.expected}  actual ${issue.actual}${delta}`,
      );
    }
  }

  const { summary } = report;
  lines.push(
    `  ${summary.elementsPassed}/${summary.elementsChecked} elements passed, ` +
      `${summary.errorCount} error(s), ${summary.warningCount} warning(s)`,
  );
  return lines.join('\n');
}
