/**
 * Report rendering.
 *
 * Element names come from a design file and text content from the live page,
 * so both are untrusted input here.
 */

import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  isColorValue,
  renderElementSection,
  renderHtmlReport,
  renderTextSummary,
  isDataUri,
} from '../src/report/html.js';
import type { ElementReport, Issue, RunReport } from '../src/report/types.js';

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    figmaId: 'hero-cta',
    pass: 'geometry',
    property: 'width',
    severity: 'error',
    expected: '180px',
    actual: '200px',
    delta: 20,
    tolerance: 1,
    ...overrides,
  };
}

function element(overrides: Partial<ElementReport> = {}): ElementReport {
  return {
    figmaId: 'hero-cta',
    paired: true,
    issues: [issue()],
    errorCount: 1,
    warningCount: 0,
    ...overrides,
  };
}

function report(overrides: Partial<RunReport> = {}): RunReport {
  const elements = overrides.elements ?? [element()];
  return {
    timestamp: '2026-09-11T10:00:00.000Z',
    url: 'https://example.com/',
    figmaFileKey: 'AbCdEf123456',
    viewport: { width: 1728, height: 1000 },
    summary: {
      elementsChecked: elements.length,
      elementsPassed: 0,
      elementsFailed: 1,
      errorCount: 1,
      warningCount: 0,
    },
    status: 'fail',
    ...overrides,
    elements,
  };
}

describe('escapeHtml', () => {
  it('escapes the characters that can break out of markup', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">`))
      .toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;');
  });
});

describe('isColorValue', () => {
  it('accepts the rgb forms compare/color.ts emits', () => {
    expect(isColorValue('rgb(0, 102, 255)')).toBe(true);
    expect(isColorValue('rgba(0, 102, 255, 0.5)')).toBe(true);
  });

  it('rejects anything that could smuggle CSS into a style attribute', () => {
    expect(isColorValue('rgb(0,0,0); background:url(javascript:alert(1))')).toBe(false);
    expect(isColorValue('red')).toBe(false);
    expect(isColorValue('24px')).toBe(false);
  });
});

describe('renderElementSection', () => {
  it('shows the delta against the tolerance it was tested against', () => {
    const html = renderElementSection(element());
    expect(html).toContain('+20');
    expect(html).toContain('±1');
  });

  it('marks an element with no issues as passing', () => {
    const html = renderElementSection(element({ issues: [], errorCount: 0 }));
    expect(html).toContain('chip-pass');
    expect(html).not.toContain('<table>');
  });

  it('appends the detail to the property name', () => {
    const html = renderElementSection(
      element({ issues: [issue({ property: 'padding', detail: 'left' })] }),
    );
    expect(html).toContain('<strong>padding</strong><span class="muted">.left</span>');
  });

  it('paints a swatch for a colour issue', () => {
    const html = renderElementSection(element({
      issues: [issue({ property: 'backgroundColor', expected: 'rgb(0, 0, 0)', actual: 'rgb(17, 17, 17)' })],
    }));
    expect(html).toContain('class="swatch" style="background:rgb(0, 0, 0)"');
  });
});

describe('renderHtmlReport', () => {
  it('produces a self-contained document with no external references', () => {
    const html = renderHtmlReport(report());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/src="http|href="http/);
  });

  it('escapes a hostile element name rather than emitting it as markup', () => {
    const html = renderHtmlReport(report({
      elements: [element({ figmaId: '<script>alert(1)</script>' })],
    }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes hostile text content coming back from the page', () => {
    const html = renderHtmlReport(report({
      elements: [element({
        issues: [issue({ property: 'textContent', actual: '<img src=x onerror=alert(1)>' })],
      })],
    }));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('can omit passing elements', () => {
    const elements = [element(), element({ figmaId: 'hero', issues: [], errorCount: 0 })];
    const html = renderHtmlReport(report({ elements }), { includePassing: false });
    expect(html).toContain('hero-cta');
    expect(html).not.toContain('>hero<');
  });
});

describe('renderTextSummary', () => {
  it('leads with the verdict and lists one line per issue', () => {
    const lines = renderTextSummary(report()).split('\n');
    expect(lines[0]).toContain('TOVI FAIL');
    expect(lines[1]).toContain('hero-cta');
    expect(lines[1]).toContain('width');
    expect(lines.at(-1)).toContain('0/1 elements passed');
  });
});

describe('screenshot embedding', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

  it('accepts a base64 png/jpeg/webp data URI', () => {
    expect(isDataUri(png)).toBe(true);
    expect(isDataUri('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
    expect(isDataUri('data:image/webp;base64,UklGRh4AAABXRUJQ')).toBe(true);
  });

  it('rejects anything that is not plainly base64 image data', () => {
    // This value lands in a src attribute, so the guard has to be narrow.
    expect(isDataUri('out/page.png')).toBe(false);
    expect(isDataUri('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isDataUri('javascript:alert(1)')).toBe(false);
    expect(isDataUri('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
  });

  it('embeds the capture when given a data URI', () => {
    const html = renderHtmlReport(report(), { screenshotDataUri: png });
    expect(html).toContain('class="capture"');
    expect(html).toContain(png);
  });

  it('omits the capture entirely when given a path instead of a data URI', () => {
    const html = renderHtmlReport(report(), { screenshotPath: 'out/page.png' });
    expect(html).not.toContain('class="capture"');
    expect(html).toContain('out/page.png');
  });

  it('renders no capture section when no screenshot was taken', () => {
    expect(renderHtmlReport(report())).not.toContain('class="capture"');
  });
});
