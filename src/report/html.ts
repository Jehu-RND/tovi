/**
 * TOVI — HTML report rendering.
 *
 * STUB: no implementation yet.
 *
 * Renders a RunReport into a single self-contained HTML string: inline CSS, no
 * external assets, no scripts fetched from a CDN. The output is written to a
 * file and opened locally, so it must work with no network.
 */

import type { RunReport, ElementReport } from './types.js';

export interface RenderOptions {
  /** Optional screenshot path to embed alongside the results. */
  screenshotPath?: string;
  /** Include elements that passed. Defaults to true. */
  includePassing?: boolean;
}

/**
 * Render a full RunReport to a standalone HTML document.
 *
 * @returns A complete HTML string, ready to write to disk.
 */
export function renderHtmlReport(_report: RunReport, _options?: RenderOptions): string {
  // TODO: emit a <!doctype html> document with inline <style>, a summary
  //       header (url, timestamp, viewport, pass/fail counts), and one section
  //       per element.
  // TODO: escape every interpolated value — element names and text content
  //       come from the page and the design file, so they are untrusted input.
  // TODO: show expected vs actual side by side with the delta and the
  //       tolerance it was tested against, so a reader can see why something
  //       was flagged rather than just that it was.
  // TODO: render color issues with a swatch for each side.
  throw new Error('TODO: renderHtmlReport is not implemented');
}

/** Render one element's block. Split out so it can be unit tested alone. */
export function renderElementSection(_element: ElementReport): string {
  // TODO: header with the figmaId and a pass/fail chip, then an issue table.
  throw new Error('TODO: renderElementSection is not implemented');
}

/** Render a plain-text summary for terminal output. */
export function renderTextSummary(_report: RunReport): string {
  // TODO: one line per failing element plus a final tally; keep it grep-able.
  throw new Error('TODO: renderTextSummary is not implemented');
}

/** Escape a string for safe interpolation into HTML. */
export function escapeHtml(_value: string): string {
  // TODO: replace & < > " ' with entities.
  throw new Error('TODO: escapeHtml is not implemented');
}
