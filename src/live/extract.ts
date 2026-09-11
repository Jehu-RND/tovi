/**
 * TOVI — live-site extraction via Playwright (Chromium).
 *
 * STUB: no browser automation yet.
 *
 * Determinism matters more than speed here. A run must produce the same
 * numbers twice, so the extractor pins the viewport, waits for fonts and
 * network to settle, and disables animations before measuring anything.
 */

import type { LiveStyles, Rect } from '../types.js';
import type { ViewportConfig } from '../config/schema.js';

/** Thrown for navigation failures and missing elements. */
export class ExtractionError extends Error {
  constructor(message: string, readonly figmaId?: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface ExtractOptions {
  url: string;
  viewport: ViewportConfig;
  /** Pairing keys to look for; each resolves to `[data-figma-id="<key>"]`. */
  figmaIds: string[];
  /** Per-element selector overrides, keyed by figmaId. */
  selectors?: Record<string, string>;
  /** Navigation timeout in ms. */
  timeout?: number;
  /** Optional path to write a full-page screenshot for the report. */
  screenshotPath?: string;
}

export interface ExtractResult {
  /** Successfully measured elements, keyed by figmaId. */
  styles: Map<string, LiveStyles>;
  /** figmaIds whose selector matched nothing on the page. */
  missing: string[];
  /** figmaIds whose selector matched more than one element (ambiguous). */
  ambiguous: string[];
  /** Where the screenshot was written, when requested. */
  screenshotPath?: string;
}

/**
 * Launch Chromium, load the page, and measure every requested element.
 *
 * @throws {ExtractionError} when the page cannot be loaded. Missing individual
 *         elements are reported via ExtractResult, not thrown.
 */
export async function extractLiveStyles(_options: ExtractOptions): Promise<ExtractResult> {
  // TODO: launch chromium headless and open a context at the configured
  //       viewport size and deviceScaleFactor.
  // TODO: navigate with waitUntil 'networkidle', then await
  //       document.fonts.ready — measuring before webfonts land yields
  //       fallback-font metrics and a page full of false text failures.
  // TODO: inject a stylesheet disabling animations, transitions, and
  //       scroll-behavior so mid-animation values can't be captured.
  // TODO: for each figmaId, count matches for its selector; record 0 matches
  //       in `missing` and >1 in `ambiguous` rather than guessing.
  // TODO: run readElementStyles in the page context for each match.
  // TODO: take the screenshot when screenshotPath is set, then close the
  //       browser in a finally block so a throw can't leak the process.
  throw new Error('TODO: extractLiveStyles is not implemented');
}

/**
 * Browser-context measurement for a single element.
 *
 * This function body is serialized into the page by Playwright, so it may only
 * use DOM APIs — no imports, no closure over Node values.
 *
 * @param _selector CSS selector for the element.
 * @param _figmaId  Pairing key, passed through onto the result.
 */
export function readElementStyles(_selector: string, _figmaId: string): LiveStyles {
  // TODO: querySelector, then read getBoundingClientRect() for the rect and
  //       getComputedStyle() for everything else.
  // TODO: normalize computed values before returning:
  //         - lineHeight 'normal' -> resolve to a px number
  //         - letterSpacing 'normal' -> 0
  //         - fontWeight names ('bold') -> numeric 700
  //         - fontFamily -> first family in the stack, quotes stripped
  //         - box-shadow -> parse the shorthand into Shadow[]
  //         - colors -> leave as CSS strings for compare/color.ts to parse
  // TODO: collapse textContent whitespace to a single space and trim.
  throw new Error('TODO: readElementStyles is not implemented');
}

/**
 * Locate the section container both sides are normalized against.
 * Returns its viewport-space rect; see compare/geometryPass.ts.
 */
export async function extractSectionRect(_selector: string): Promise<Rect> {
  // TODO: measure the section element the same way as any other, returning
  //       just its bounding rect.
  throw new Error('TODO: extractSectionRect is not implemented');
}
