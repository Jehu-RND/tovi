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

  it('reads per-side border width and colour from a real computed style', () => {
    const cta = result.styles.get('hero-cta');
    expect(cta?.borders.top).toEqual({ width: 2, color: { r: 0, g: 51, b: 153, a: 1 } });
    expect(cta?.borders.left.width).toBe(2);
  });

  it('reports zero-width borders for an element that has none', () => {
    // Computed border-width is already 0 when border-style is none, so the
    // style keyword needs no separate check in the browser half.
    const heading = result.styles.get('hero-heading');
    expect(heading?.borders.top.width).toBe(0);
    expect(heading?.borders.bottom.width).toBe(0);
  });

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

/**
 * Real-site hardening — T-03, T-04, T-05, against real Chromium.
 *
 * Every one of these was catalogued as a risk before it was ever seen. The
 * fixture makes each of them happen on purpose, so the behaviour is a
 * measurement rather than an expectation:
 *
 *   - a promo bar INSIDE the section, which section-relative normalization
 *     cannot absorb, and a cookie banner outside it, which it can;
 *   - a `loading="lazy"` image 10,000px down, which Chromium genuinely defers
 *     — the control test below measures it at 0×0 to prove the trap is real
 *     and not merely described;
 *   - a `position: sticky` header, measured at scroll 0.
 */
const hardeningUrl = pathToFileURL(resolve(here, 'fixtures/hardening.html')).href;

describe.skipIf(!hasChromium)('extractLiveStyles — real-site hardening', () => {
  const figmaIds = ['hero', 'site-header', 'hero-heading', 'hero-media'];
  let plain: ExtractResult;
  let hidden: ExtractResult;
  /** What a browser that does nothing clever sees, for the lazy-image control. */
  let unassisted: { width: number; height: number; complete: boolean };

  beforeAll(async () => {
    plain = await extractLiveStyles({
      url: hardeningUrl, viewport: { width: 1440, height: 900 }, figmaIds,
    });
    hidden = await extractLiveStyles({
      url: hardeningUrl,
      viewport: { width: 1440, height: 900 },
      figmaIds,
      // The last two are the cases that matter as much as the working one: a
      // selector that matches nothing, and one the browser cannot parse.
      overlays: ['.promo-bar', '.cookie-banner', '.was-renamed-last-quarter', '.a[' ],
    });

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(hardeningUrl, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    unassisted = await page.evaluate(() => {
      const image = document.querySelector('.hero__media') as HTMLImageElement;
      const rect = image.getBoundingClientRect();
      return { width: rect.width, height: rect.height, complete: image.complete };
    });
    await browser.close();
  }, 90_000);

  it('confirms the lazy image really is deferred, so the rest of this means something', () => {
    // The control. Without this, every assertion below could be passing
    // because Chromium loaded the image anyway.
    expect(unassisted).toEqual({ width: 0, height: 0, complete: false });
  });

  it('measures the deferred image at its real size, without scrolling', () => {
    // T-04. Invariant 2 forbids scrolling, so the fix is to stop the deferral
    // rather than to go and look at the image.
    const media = plain.styles.get('hero-media');
    expect(media?.boundingRect.width).toBe(240);
    expect(media?.boundingRect.height).toBe(160);
  });

  it('reports what it did to the images, and that none were left pending', () => {
    expect(plain.images).toEqual({ promoted: 1, pending: 0 });
    expect(plain.styles.get('hero-media')?.pendingImages).toBe(0);
  });

  it('shifts every offset in the section when a promo bar inside it is hidden', () => {
    // T-03. The 64px bar is inside the section, so both sides of the
    // subtraction move together and normalization cancels nothing.
    const before = toRelativeOffset(
      plain.styles.get('hero-heading')!.boundingRect, sectionRectFrom(plain, 'hero'),
    );
    const after = toRelativeOffset(
      hidden.styles.get('hero-heading')!.boundingRect, sectionRectFrom(hidden, 'hero'),
    );
    expect(before.y - after.y).toBe(64);
  });

  it('says how many elements each declared overlay hid', () => {
    expect(hidden.overlays).toEqual([
      { selector: '.promo-bar', hidden: 1 },
      { selector: '.cookie-banner', hidden: 1 },
      { selector: '.was-renamed-last-quarter', hidden: 0 },
      { selector: '.a[', hidden: 0, invalid: true },
    ]);
  });

  it('lets one unparseable selector cost the run nothing but itself', () => {
    // The assertion above already shows `.a[` came back invalid. This one is
    // the actual guarantee: the four elements were still measured and the
    // promo bar was still hidden, so a typo in entry four does not silently
    // take entries one to three down with it.
    expect([...hidden.styles.keys()].sort()).toEqual(
      ['hero', 'hero-heading', 'hero-media', 'site-header'],
    );
  });

  it('hides nothing at all when none are declared', () => {
    expect(plain.overlays).toEqual([]);
  });

  it('reads the computed position, so a viewport-anchored rect can be named', () => {
    // T-05. Measured at scroll 0 and never anywhere else, which is what makes
    // the number reproducible — and what makes it worth saying out loud.
    expect(plain.styles.get('site-header')?.position).toBe('sticky');
    expect(plain.styles.get('hero-heading')?.position).toBe('static');
  });

  it('measures the sticky header at its resting height at scroll 0', () => {
    expect(plain.styles.get('site-header')?.boundingRect.height).toBe(72);
    expect(plain.styles.get('site-header')?.boundingRect.y).toBe(64);
  });
});
