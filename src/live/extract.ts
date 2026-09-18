/**
 * TOVI — live-site extraction via Playwright (Chromium).
 *
 * Determinism matters more than speed here. A run must produce the same
 * numbers twice, so the extractor pins the viewport, waits for `load` and for
 * fonts, settles for a fixed interval, and disables animations before
 * measuring anything. It deliberately does not wait for network-idle — see the
 * note at the goto call for why that is the less reproducible choice.
 *
 * Two rules shape the design of this module:
 *
 *   1. EVERY element is measured in a SINGLE page.evaluate() call. Playwright's
 *      locator helpers scroll elements into view, and getBoundingClientRect()
 *      is viewport-relative — so measuring elements one at a time would read
 *      each against a different scroll origin. Pass A subtracts the section
 *      rect from the element rect, which only cancels scroll out if both were
 *      measured at the SAME scroll position.
 *
 *   2. The browser half returns raw CSS strings for colors and shadows. culori
 *      lives in Node, not in the page, so parsing happens on this side in
 *      normalizeLiveStyles().
 */

import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import type { Borders, BoxSides, CornerRadius, LiveStyles, Rect, Shadow } from '../types.js';
import type { ViewportConfig } from '../config/schema.js';
import { fromCssColor } from '../compare/color.js';

/** Thrown for navigation failures and browser-level problems. */
export class ExtractionError extends Error {
  constructor(message: string, readonly figmaId?: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Pause after load before measuring, for layout to settle.
 *
 * A fixed wait is deliberate. It is the same on every run regardless of how
 * the network behaved, which is the property that matters here.
 */
const SETTLE_MS = 500;

/**
 * How long to wait for images once lazy loading has been switched off.
 *
 * Bounded on purpose. An image that never arrives must not hang a run, and the
 * run says how many were still pending rather than waiting forever for a
 * tracking pixel that was never going to load.
 */
const IMAGE_BUDGET_MS = 5_000;
/*
 * A note on invariant 4, because this constant is where it bends.
 *
 * An image that lands at 4.9s on one run and 5.1s on the next changes that
 * element's measured box, so two runs of the same page can differ. That is a
 * deliberate trade and it is the better half of it: before, a deferred image
 * was RELIABLY measured at 0x0 — deterministic, and wrong. Reproducing a wrong
 * number is not what byte-identical output is for.
 *
 * What does not bend: the difference is never silent. The pending count comes
 * back in ImageResult, the run reports it, and the affected element gets a
 * zeroSize advisory. Do not widen this to make a flaky page settle.
 */

/** Neutralises anything that could change between two runs of the same page. */
const DETERMINISM_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
  html { scroll-behavior: auto !important; }
`;

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
  /**
   * CSS selectors for page furniture to hide before measuring — cookie
   * banners, promo bars, chat widgets. Declared by the config, never guessed
   * at here. See ToviConfig.overlays.
   */
  overlays?: string[];
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
  /** One entry per declared overlay selector, in config order. */
  overlays: OverlayResult[];
  /** What switching lazy loading off did. See promoteLazyImages(). */
  images: ImageResult;
}

/** What one declared overlay selector actually hid. */
export interface OverlayResult {
  selector: string;
  /** How many elements it hid. Zero is a finding, not a non-event. */
  hidden: number;
  /** Set when the browser could not parse the selector at all. */
  invalid?: boolean;
}

/** The outcome of preparing the page's images for measurement. */
export interface ImageResult {
  /** `<img loading="lazy">` elements switched to eager. */
  promoted: number;
  /** Images still not complete when the budget ran out. */
  pending: number;
}

/**
 * What the browser half returns: numbers where the DOM already gives numbers,
 * raw CSS strings where parsing needs culori.
 */
export interface RawLiveStyles {
  boundingRect: Rect;
  padding: BoxSides;
  cornerRadius: CornerRadius;
  /** Computed border widths in px. Already 0 where border-style is none. */
  borderWidths: BoxSides;
  /** Raw CSS border colours, parsed on the Node side. */
  borderColors: { top: string; right: string; bottom: string; left: string };
  backgroundColor: string;
  color: string;
  boxShadow: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  /** NaN when the page leaves line-height at `normal`. */
  lineHeight: number;
  letterSpacing: number;
  textContent: string;
  /**
   * What the matched element actually is: `section.more-content`.
   *
   * A selector says what was looked for; this says what was found. When a
   * check fails, the next question is always "which element is that in the
   * DOM" — without this the answer lives only in the author's head, and a
   * report handed to someone else is a list of numbers with no address.
   */
  describes: string;
  /** Computed `position`, so the report can say when a rect is scroll-bound. */
  position: string;
  /** Images in this element's subtree that had not finished loading. */
  pendingImages: number;
}

/** One element's outcome from the single measurement pass. */
export interface RawMeasurement {
  figmaId: string;
  selector: string;
  status: 'ok' | 'missing' | 'ambiguous';
  matchCount: number;
  styles?: RawLiveStyles;
}

/** Default selector for an element that does not override it. */
export function defaultSelector(figmaId: string): string {
  return `[data-figma-id="${figmaId}"]`;
}

/**
 * Measure every requested element in one pass, inside the page.
 *
 * Serialized into the browser by Playwright, so it may only use DOM APIs — no
 * imports, no closure over Node values, no helpers from module scope.
 */
/* c8 ignore start -- runs in the browser, not under the Node coverage instrument */
function measureAll(targets: Array<{ figmaId: string; selector: string }>): RawMeasurement[] {
  /** Resolve a CSS length that may be a percentage of a box dimension. */
  function toPx(value: string, basis: number): number {
    if (value.endsWith('%')) {
      const percent = Number.parseFloat(value);
      return Number.isFinite(percent) ? (percent / 100) * basis : 0;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** Named CSS weights map onto the numeric scale the design file uses. */
  function toWeight(value: string): number {
    if (value === 'normal') return 400;
    if (value === 'bold') return 700;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  const results: RawMeasurement[] = [];

  for (const target of targets) {
    let matches: NodeListOf<Element>;
    try {
      matches = document.querySelectorAll(target.selector);
    } catch {
      results.push({ ...target, status: 'missing', matchCount: 0 });
      continue;
    }

    if (matches.length === 0) {
      results.push({ ...target, status: 'missing', matchCount: 0 });
      continue;
    }
    if (matches.length > 1) {
      results.push({ ...target, status: 'ambiguous', matchCount: matches.length });
      continue;
    }

    const element = matches[0] as HTMLElement;
    const rect = element.getBoundingClientRect();
    const cs = window.getComputedStyle(element);

    // Why a box can measure 0x0 or short: an <img> with no intrinsic size
    // contributes nothing to layout until its bytes arrive. Counting them here
    // turns "height is 300px out" into "height is 300px out and two images in
    // this element never loaded", which is a different conversation.
    var pendingImages = 0;
    var inner = element.querySelectorAll('img');
    for (var i = 0; i < inner.length; i += 1) {
      if (!(inner[i] as HTMLImageElement).complete) pendingImages += 1;
    }
    if (element.tagName === 'IMG' && !(element as HTMLImageElement).complete) {
      pendingImages += 1;
    }

    // tag#id.class, the way it reads in devtools. Three classes is enough to
    // recognise an element and short enough to sit in a table cell.
    var tag = element.tagName.toLowerCase();
    var elementId = element.id !== '' ? '#' + element.id : '';
    var classes = typeof element.className === 'string' && element.className.trim() !== ''
      ? '.' + element.className.trim().split(/\s+/).slice(0, 3).join('.')
      : '';

    // border-radius percentages resolve against the box's own dimensions.
    const radiusBasisX = rect.width;
    const radiusBasisY = rect.height;

    results.push({
      ...target,
      status: 'ok',
      matchCount: 1,
      styles: {
        describes: tag + elementId + classes,
        position: cs.position,
        pendingImages: pendingImages,
        boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        padding: {
          top: toPx(cs.paddingTop, rect.height),
          right: toPx(cs.paddingRight, rect.width),
          bottom: toPx(cs.paddingBottom, rect.height),
          left: toPx(cs.paddingLeft, rect.width),
        },
        cornerRadius: {
          topLeft: toPx(cs.borderTopLeftRadius.split(' ')[0] ?? '0', radiusBasisX),
          topRight: toPx(cs.borderTopRightRadius.split(' ')[0] ?? '0', radiusBasisX),
          bottomRight: toPx(cs.borderBottomRightRadius.split(' ')[0] ?? '0', radiusBasisY),
          bottomLeft: toPx(cs.borderBottomLeftRadius.split(' ')[0] ?? '0', radiusBasisY),
        },
        // Computed border-width is already 0 when border-style is none or
        // hidden, so the style keyword needs no separate check.
        borderWidths: {
          top: toPx(cs.borderTopWidth, 0),
          right: toPx(cs.borderRightWidth, 0),
          bottom: toPx(cs.borderBottomWidth, 0),
          left: toPx(cs.borderLeftWidth, 0),
        },
        borderColors: {
          top: cs.borderTopColor,
          right: cs.borderRightColor,
          bottom: cs.borderBottomColor,
          left: cs.borderLeftColor,
        },
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        boxShadow: cs.boxShadow,
        fontFamily: cs.fontFamily,
        fontSize: Number.parseFloat(cs.fontSize),
        fontWeight: toWeight(cs.fontWeight),
        // `normal` is font-dependent and not a number we can honestly compare,
        // so it becomes NaN and the text pass skips line-height entirely.
        lineHeight: cs.lineHeight === 'normal' ? Number.NaN : Number.parseFloat(cs.lineHeight),
        // `normal` letter-spacing genuinely is zero.
        letterSpacing: cs.letterSpacing === 'normal' ? 0 : Number.parseFloat(cs.letterSpacing),
        textContent: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
      },
    });
  }

  return results;
}
/* c8 ignore stop */

/**
 * Hide the declared overlays, and report exactly what each selector hid.
 *
 * `display: none` rather than `visibility: hidden`: a promo bar that is merely
 * invisible still occupies its strip of layout, and occupying layout is the
 * whole problem. A selector the browser cannot parse is returned as invalid
 * instead of throwing — one bad entry must not cost the run its other five.
 *
 * Serialized into the browser, so DOM APIs only.
 */
/* c8 ignore start -- runs in the browser, not under the Node coverage instrument */
function hideOverlays(selectors: string[]): OverlayResult[] {
  const results: OverlayResult[] = [];

  for (const selector of selectors) {
    let matches: NodeListOf<Element>;
    try {
      matches = document.querySelectorAll(selector);
    } catch {
      results.push({ selector, hidden: 0, invalid: true });
      continue;
    }
    for (let i = 0; i < matches.length; i += 1) {
      (matches[i] as HTMLElement).style.setProperty('display', 'none', 'important');
    }
    results.push({ selector, hidden: matches.length });
  }

  return results;
}

/**
 * Switch lazy loading off, so below-the-fold images have a size to measure.
 *
 * The extractor never scrolls — invariant 2 — so a `loading="lazy"` image
 * below the fold is never fetched and measures 0x0. Its box then reads as a
 * build defect the size of the whole image, and every element beneath it is
 * reported at the wrong offset. Neither is true: the build is fine and the
 * measurement is what is wrong.
 *
 * Setting `loading` to `eager` on an image that has not started loading makes
 * the browser fetch it immediately, which is the fix the troubleshooting guide
 * used to ask an author to make in their own markup. It is not a heuristic —
 * there is nothing to guess about which images to load, the answer is all of
 * them — and it never touches a comparison, only what is on the page when the
 * comparison happens.
 *
 * @returns How many images were promoted. Waiting for them is the caller's job.
 */
function promoteLazyImages(): number {
  const lazy = document.querySelectorAll('img[loading="lazy"]');
  for (let i = 0; i < lazy.length; i += 1) {
    const image = lazy[i] as HTMLImageElement;
    image.loading = 'eager';
    // Synchronous decode keeps the image from painting — and therefore from
    // resizing its box — after the settle interval has already elapsed.
    image.decoding = 'sync';
  }
  return lazy.length;
}

/** How many images have not finished loading, successfully or otherwise. */
function pendingImageCount(): number {
  return Array.from(document.images).filter((image) => !image.complete).length;
}
/* c8 ignore stop */

/**
 * Split a CSS list on top-level commas only, so the commas inside `rgba(...)`
 * do not split a single shadow into pieces.
 */
export function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim() !== '') parts.push(current.trim());
  return parts;
}

/**
 * Parse a computed `box-shadow` into the shared Shadow type.
 *
 * Chrome normalizes the shorthand to `<color> <x> <y> <blur> <spread>` with an
 * optional trailing `inset`, which is what this expects. Any layer that does
 * not parse is skipped rather than guessed at — a fabricated shadow would be
 * reported as design drift.
 */
export function parseBoxShadow(value: string): Shadow[] {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'none') return [];

  const shadows: Shadow[] = [];
  for (const layer of splitTopLevel(trimmed)) {
    const inset = /\binset\b/.test(layer);
    const withoutInset = layer.replace(/\binset\b/g, ' ');

    // Pull the color out first; what remains is purely lengths.
    const colorMatch = withoutInset.match(/(?:rgba?|hsla?|color|oklch|oklab|lab|lch)\([^)]*\)|#[0-9a-f]{3,8}/i);
    const colorText = colorMatch?.[0];
    if (colorText === undefined) continue;

    const color = fromCssColor(colorText);
    if (color === undefined) continue;

    const lengths = withoutInset
      .replace(colorText, ' ')
      .trim()
      .split(/\s+/)
      .map((token) => Number.parseFloat(token))
      .filter((n) => Number.isFinite(n));

    const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = lengths;
    shadows.push({ offsetX, offsetY, blur, spread, color, inset });
  }

  return shadows;
}

/**
 * Convert one browser measurement into the shared LiveStyles shape.
 *
 * A color the browser reports but culori cannot parse falls back to fully
 * transparent black, which reads as "nothing painted here" — the same thing an
 * unset background means.
 */
export function normalizeLiveStyles(raw: RawLiveStyles, figmaId: string, selector: string): LiveStyles {
  const transparent = { r: 0, g: 0, b: 0, a: 0 };
  const borders: Borders = {
    top: { width: raw.borderWidths.top, color: fromCssColor(raw.borderColors.top) ?? transparent },
    right: { width: raw.borderWidths.right, color: fromCssColor(raw.borderColors.right) ?? transparent },
    bottom: { width: raw.borderWidths.bottom, color: fromCssColor(raw.borderColors.bottom) ?? transparent },
    left: { width: raw.borderWidths.left, color: fromCssColor(raw.borderColors.left) ?? transparent },
  };
  return {
    figmaId,
    selector,
    ...(raw.describes !== undefined && raw.describes !== ''
      ? { describes: raw.describes }
      : {}),
    ...(raw.position !== undefined ? { position: raw.position } : {}),
    ...(raw.pendingImages !== undefined ? { pendingImages: raw.pendingImages } : {}),
    boundingRect: raw.boundingRect,
    padding: raw.padding,
    cornerRadius: raw.cornerRadius,
    borders,
    backgroundColor: fromCssColor(raw.backgroundColor) ?? transparent,
    color: fromCssColor(raw.color) ?? transparent,
    shadows: parseBoxShadow(raw.boxShadow),
    text: {
      fontFamily: raw.fontFamily,
      fontSize: raw.fontSize,
      fontWeight: raw.fontWeight,
      lineHeight: raw.lineHeight,
      letterSpacing: raw.letterSpacing,
    },
    textContent: raw.textContent,
  };
}

/**
 * Launch Chromium, load the page, and measure every requested element.
 *
 * @throws {ExtractionError} when the page cannot be loaded. Missing individual
 *         elements are reported via ExtractResult, not thrown — an element the
 *         build never shipped is a finding, not a crash.
 */
export async function extractLiveStyles(options: ExtractOptions): Promise<ExtractResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const targets = options.figmaIds.map((figmaId) => ({
    figmaId,
    selector: options.selectors?.[figmaId] ?? defaultSelector(figmaId),
  }));

  let browser: Browser | undefined;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new ExtractionError(
        `Could not launch Chromium: ${error instanceof Error ? error.message : String(error)}. ` +
          'Run `npx playwright install chromium` if the browser is not downloaded yet.',
      );
    }

    const context = await browser.newContext({
      viewport: { width: options.viewport.width, height: options.viewport.height },
      deviceScaleFactor: options.viewport.deviceScaleFactor ?? 1,
    });
    const page = await context.newPage();

    // WAITING STRATEGY — `load`, not `networkidle`.
    //
    // networkidle looks like the more careful choice and is in fact the less
    // deterministic one: it resolves when the network has been quiet for a
    // moment, so what it waits for depends on when analytics beacons, chat
    // widgets and tracking pixels happen to stop. On a real marketing page
    // that quiet moment may never arrive — prolook.com does not reach it in
    // 30s — and when it does arrive, it arrives at a different time each run.
    //
    // `load` is a defined event: every resource in the document has loaded.
    // Pairing it with document.fonts.ready and a fixed settle gives a state
    // that is reproducible run to run and does not depend on third parties.
    try {
      await page.goto(options.url, { waitUntil: 'load', timeout });
    } catch (error) {
      throw new ExtractionError(
        `Could not load ${options.url}: ${error instanceof Error ? error.message : String(error)}. ` +
          'If the page is simply slow, raise the timeout in the config.',
      );
    }

    // Measuring before webfonts land yields fallback-font metrics and a page
    // full of false text failures, so wait for them explicitly.
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: DETERMINISM_CSS });

    // PAGE PREPARATION — everything that changes layout happens here, before
    // a single measurement, and every one of these steps is reported. A page
    // quietly altered is a page whose numbers cannot be trusted.
    const overlays = options.overlays !== undefined && options.overlays.length > 0
      ? await page.evaluate(hideOverlays, options.overlays)
      : [];

    const promoted = await page.evaluate(promoteLazyImages);
    if (promoted > 0) {
      // Bounded: an image that never arrives must not hang the run. Whatever
      // is still pending is counted below and reported rather than waited on.
      await page
        .waitForFunction(
          () => Array.from(document.images).every((image) => image.complete),
          undefined,
          { timeout: IMAGE_BUDGET_MS },
        )
        .catch(() => undefined);
    }
    const pending = await page.evaluate(pendingImageCount);

    // Let layout settle after the fonts swap in, the CSS above lands, and the
    // overlays and images have finished rearranging the page.
    await page.waitForTimeout(SETTLE_MS);

    // One call, one scroll origin. See the note at the top of this file.
    const measurements = await page.evaluate(measureAll, targets);

    const styles = new Map<string, LiveStyles>();
    const missing: string[] = [];
    const ambiguous: string[] = [];

    for (const measurement of measurements) {
      if (measurement.status === 'missing') {
        missing.push(measurement.figmaId);
      } else if (measurement.status === 'ambiguous') {
        ambiguous.push(measurement.figmaId);
      } else if (measurement.styles !== undefined) {
        styles.set(
          measurement.figmaId,
          normalizeLiveStyles(measurement.styles, measurement.figmaId, measurement.selector),
        );
      }
    }

    // Screenshot last: a full-page capture scrolls the document, and nothing
    // may move before the measurements are taken.
    let screenshotPath: string | undefined;
    if (options.screenshotPath !== undefined) {
      await page.screenshot({ path: options.screenshotPath, fullPage: true });
      screenshotPath = options.screenshotPath;
    }

    return {
      styles,
      missing,
      ambiguous,
      overlays,
      images: { promoted, pending },
      ...(screenshotPath !== undefined ? { screenshotPath } : {}),
    };
  } finally {
    // Close in finally so a throw above cannot leak a browser process.
    await browser?.close();
  }
}

/**
 * Pull the section container's rect out of an extraction result.
 *
 * Pass A normalizes every element against this, so its absence is fatal to the
 * whole geometry pass rather than to one element.
 */
export function sectionRectFrom(result: ExtractResult, figmaId: string): Rect {
  const section = result.styles.get(figmaId);
  if (section === undefined) {
    throw new ExtractionError(
      `Section container "${figmaId}" was not found on the page, so element positions ` +
        'cannot be normalized. Pass A needs it on both sides.',
      figmaId,
    );
  }
  return section.boundingRect;
}
