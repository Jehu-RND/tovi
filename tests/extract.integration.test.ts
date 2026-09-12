/**
 * Live extraction — the browser half, against a controlled fixture.
 *
 * This is the test that proves coordinate normalization works against a real
 * browser rather than against hand-written numbers: the fixture puts a 96px
 * header above the section, so every element's viewport y differs from its
 * section-relative y by exactly that much.
 *
 * Requires Chromium (`npx playwright install chromium`). The suite skips
 * itself rather than failing when the browser is not downloaded.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { extractLiveStyles, sectionRectFrom } from '../src/live/extract.js';
import type { ExtractResult } from '../src/live/extract.js';
import { toRelativeOffset } from '../src/compare/geometryPass.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = pathToFileURL(resolve(here, 'fixtures/page.html')).href;

/** Whether Chromium is actually downloaded for this Playwright version. */
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

describe.skipIf(!hasChromium)('extractLiveStyles', () => {
  let result: ExtractResult;

  beforeAll(async () => {
    result = await extractLiveStyles({
      url: fixtureUrl,
      viewport: { width: 1440, height: 900 },
      figmaIds: ['hero', 'hero-heading', 'hero-cta', 'hero-avatar', 'hero-dupe', 'hero-nope'],
    });
  }, 60_000);

  it('reports an element that is not on the page as missing, without throwing', () => {
    expect(result.missing).toEqual(['hero-nope']);
  });

  it('reports a duplicated data-figma-id as ambiguous rather than picking one', () => {
    expect(result.ambiguous).toEqual(['hero-dupe']);
    expect(result.styles.has('hero-dupe')).toBe(false);
  });

  it('measures positions relative to the section, cancelling out page chrome', () => {
    // The fixture places the heading at left:120 top:80 inside a section that
    // itself starts 96px down the viewport. The absolute y is therefore 176,
    // and only the relative offset matches what the design specifies.
    const section = sectionRectFrom(result, 'hero');
    const heading = result.styles.get('hero-heading');

    expect(section.y).toBe(96);
    expect(heading?.boundingRect.y).toBe(176);
    expect(toRelativeOffset(heading!.boundingRect, section)).toEqual({ x: 120, y: 80 });
  });

  it('reads box metrics, padding and radius from computed style', () => {
    const cta = result.styles.get('hero-cta');
    expect(cta?.boundingRect).toMatchObject({ width: 180, height: 48 });
    expect(cta?.padding).toEqual({ top: 12, right: 24, bottom: 12, left: 24 });
    expect(cta?.cornerRadius).toEqual({
      topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8,
    });
  });

  it('resolves a percentage border-radius against the box', () => {
    // border-radius: 50% on a 64px square is 32px.
    expect(result.styles.get('hero-avatar')?.cornerRadius).toEqual({
      topLeft: 32, topRight: 32, bottomRight: 32, bottomLeft: 32,
    });
  });

  it('parses colours and box-shadow into the shared forms', () => {
    const cta = result.styles.get('hero-cta');
    expect(cta?.backgroundColor).toEqual({ r: 0, g: 102, b: 255, a: 1 });
    expect(cta?.color).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(cta?.shadows).toEqual([{
      offsetX: 0, offsetY: 2, blur: 8, spread: 1,
      color: { r: 0, g: 0, b: 0, a: 0.25 }, inset: false,
    }]);
  });

  it('reads text metrics, resolving letter-spacing and line-height to px', () => {
    expect(result.styles.get('hero-heading')?.text).toMatchObject({
      fontSize: 40,
      fontWeight: 700,
      lineHeight: 48,
      letterSpacing: -0.4,
    });
  });

  it('keeps an unset line-height as NaN across the browser bridge', () => {
    // The section sets no line-height, so Chrome reports `normal`. NaN must
    // survive serialization, because that is what makes the text pass skip it
    // instead of comparing against a fabricated number.
    const lineHeight = result.styles.get('hero')?.text.lineHeight;
    expect(typeof lineHeight).toBe('number');
    expect(Number.isNaN(lineHeight)).toBe(true);
  });

  it('collapses whitespace in text content', () => {
    expect(result.styles.get('hero-heading')?.textContent).toBe('Built for every player');
  });
});
