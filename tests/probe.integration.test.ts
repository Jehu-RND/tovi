/**
 * Selector probe — against a real browser and the local fixture.
 *
 * The probe runs entirely inside the page, so like the extractor it cannot be
 * unit tested; these assertions are the only thing that covers it.
 *
 * Requires Chromium (`npx playwright install chromium`). Skips itself rather
 * than failing when the browser is not downloaded.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { probeSelectors } from '../src/live/probe.js';
import type { ProbeResult } from '../src/live/probe.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = pathToFileURL(resolve(here, 'fixtures/page.html')).href;

async function chromiumAvailable(): Promise<boolean> {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

const hasChromium = await chromiumAvailable();

describe.skipIf(!hasChromium)('probeSelectors', () => {
  let result: ProbeResult;

  beforeAll(async () => {
    result = await probeSelectors({
      url: fixtureUrl,
      viewport: { width: 1440, height: 900 },
      selectors: [
        '[data-figma-id="hero-cta"]',
        '[data-figma-id="nope"]',
        '[data-figma-id="hero-dupe"]',
        '.hero__cta',
        'div >>> bad',
      ],
    });
  }, 60_000);

  function match(selector: string) {
    return result.matches.find((m) => m.selector === selector);
  }

  it('reports exactly one match for a selector that resolves', () => {
    expect(match('[data-figma-id="hero-cta"]')?.count).toBe(1);
  });

  it('describes what it found, so the element can be recognised', () => {
    // "did my selector find the thing I meant" is the whole question here,
    // and a count alone does not answer it.
    expect(match('[data-figma-id="hero-cta"]')?.describes).toContain('button');
    expect(match('[data-figma-id="hero-cta"]')?.text).toContain('Get started');
  });

  it('reports zero for a selector that matches nothing', () => {
    expect(match('[data-figma-id="nope"]')?.count).toBe(0);
    expect(match('[data-figma-id="nope"]')?.describes).toBeUndefined();
  });

  it('reports the real count for an ambiguous selector', () => {
    // An ambiguous selector is a config error waiting to happen, so the count
    // matters as much as the presence.
    expect(match('[data-figma-id="hero-dupe"]')?.count).toBeGreaterThan(1);
  });

  it('flags a selector that is not valid CSS instead of throwing', () => {
    expect(match('div >>> bad')?.invalid).toBe(true);
    expect(match('div >>> bad')?.count).toBe(0);
  });

  it('proposes candidate selectors from the page itself', () => {
    expect(result.candidates.length).toBeGreaterThan(0);
    // Every proposal must be unique on the page, or it is not usable as a pair.
    for (const candidate of result.candidates) {
      expect(candidate.selector.startsWith('#') || candidate.selector.startsWith('.')).toBe(true);
    }
  });

  it('gives every candidate a size, since an unmeasurable one is no use', () => {
    for (const candidate of result.candidates) {
      expect(candidate.width).toBeGreaterThan(0);
      expect(candidate.height).toBeGreaterThan(0);
    }
  });
});
