/**
 * TOVI — selector probe.
 *
 * Answers one question fast: does this CSS selector find the element you meant?
 *
 * Without it, authoring a config is a guessing loop — type a selector, run a
 * full check (launch Chromium, fetch every Figma node, compare), read
 * `missingInLive`, guess again. That is ten seconds and a Figma round trip to
 * learn something the page alone can answer.
 *
 * The probe loads the page once and reports, per selector, how many elements
 * matched and what the first one actually is. It also proposes candidate
 * selectors from the page itself, so a section can be picked rather than
 * guessed at.
 *
 * This is an authoring aid and touches nothing in the comparison path. It
 * never produces an Issue and never affects a verdict.
 */

import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import type { ViewportConfig } from '../config/schema.js';
import { ExtractionError } from './extract.js';

const DEFAULT_TIMEOUT_MS = 30_000;

/** Smallest area a node must cover to be proposed as a section. */
const MIN_CANDIDATE_AREA = 40_000;

/** Candidates returned. Enough to choose from, short enough to read. */
const MAX_CANDIDATES = 40;

/** What one requested selector matched. */
export interface ProbeMatch {
  selector: string;
  /** How many elements the selector found. Exactly 1 is what a check needs. */
  count: number;
  /** A human description of the first match: `div.level-of-play · 1440×980`. */
  describes?: string;
  /** Trimmed text content of the first match, for recognising it. */
  text?: string;
  /** True when the selector is not valid CSS at all. */
  invalid?: boolean;
}

/** A selector the page suggests for itself. */
export interface ProbeCandidate {
  selector: string;
  describes: string;
  width: number;
  height: number;
  text?: string;
}

export interface ProbeResult {
  matches: ProbeMatch[];
  candidates: ProbeCandidate[];
}

export interface ProbeOptions {
  url: string;
  viewport: ViewportConfig;
  selectors: string[];
  timeout?: number;
}

/**
 * Runs inside the page. DOM APIs only — no imports, no closure over Node
 * values, same constraint as the extractor's measuring pass.
 */
/* c8 ignore start -- runs in the browser, not under the Node coverage instrument */
function probeAll(input: { selectors: string[]; minArea: number; maxCandidates: number }): {
  matches: ProbeMatch[];
  candidates: ProbeCandidate[];
} {
  function describe(el: Element): string {
    var tag = el.tagName.toLowerCase();
    var id = el.id ? '#' + el.id : '';
    var cls = typeof el.className === 'string' && el.className.trim() !== ''
      ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
      : '';
    var rect = el.getBoundingClientRect();
    return tag + id + cls + ' · ' + Math.round(rect.width) + '×' + Math.round(rect.height);
  }

  function snippet(el: Element): string {
    var text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    return text.length > 90 ? text.slice(0, 90) + '…' : text;
  }

  var matches: ProbeMatch[] = [];
  for (const selector of input.selectors) {
    let found: NodeListOf<Element>;
    try {
      found = document.querySelectorAll(selector);
    } catch {
      matches.push({ selector: selector, count: 0, invalid: true });
      continue;
    }
    const first = found[0];
    matches.push({
      selector: selector,
      count: found.length,
      ...(first !== undefined ? { describes: describe(first), text: snippet(first) } : {}),
    });
  }

  // Candidates: sizeable blocks carrying a class that is unique on the page.
  // A class used once is a selector someone can read and trust; anything
  // repeated would be ambiguous and is exactly what we want to steer away from.
  var candidates: ProbeCandidate[] = [];
  var seen: Record<string, boolean> = {};
  var blocks = document.querySelectorAll('main, section, header, footer, article, div');

  for (var i = 0; i < blocks.length; i += 1) {
    if (candidates.length >= input.maxCandidates) break;
    var el = blocks[i] as HTMLElement;
    var rect = el.getBoundingClientRect();
    if (rect.width * rect.height < input.minArea) continue;

    var selector = '';
    if (el.id !== '' && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
      selector = '#' + el.id;
    } else if (typeof el.className === 'string') {
      var classes = el.className.trim().split(/\s+/);
      for (var c = 0; c < classes.length; c += 1) {
        var name = classes[c];
        if (name === undefined || name === '') continue;
        var candidate = '.' + CSS.escape(name);
        try {
          if (document.querySelectorAll(candidate).length === 1) { selector = candidate; break; }
        } catch { /* unusable class name; try the next */ }
      }
    }

    if (selector === '' || seen[selector]) continue;
    seen[selector] = true;
    candidates.push({
      selector: selector,
      describes: describe(el),
      width: rect.width,
      height: rect.height,
      ...(snippet(el) !== '' ? { text: snippet(el) } : {}),
    });
  }

  return { matches: matches, candidates: candidates };
}
/* c8 ignore stop */

/**
 * Load the page once and report what the given selectors match.
 *
 * @throws {ExtractionError} when the page cannot be loaded.
 */
export async function probeSelectors(options: ProbeOptions): Promise<ProbeResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
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

    try {
      // Same reasoning as the extractor: `load` is a defined event, network
      // idle depends on when third-party scripts happen to stop.
      await page.goto(options.url, { waitUntil: 'load', timeout });
    } catch (error) {
      throw new ExtractionError(
        `Could not load ${options.url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return await page.evaluate(probeAll, {
      selectors: options.selectors,
      minArea: MIN_CANDIDATE_AREA,
      maxCandidates: MAX_CANDIDATES,
    });
  } finally {
    await browser?.close();
  }
}
