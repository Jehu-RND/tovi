/**
 * Config validation.
 *
 * Includes a check that the shipped example config actually validates — an
 * example that does not load is worse than no example.
 */

import { describe, expect, it } from 'vitest';
import { loadConfig, resolveTolerances, validateConfig } from '../src/config/loadConfig.js';
import { DEFAULT_TOLERANCES } from '../src/config/schema.js';

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    figmaFileKey: 'AbCdEf123456',
    url: 'https://example.com/',
    section: 'hero',
    viewport: { width: 1440, height: 900 },
    elements: [
      { figmaId: 'hero', nodeId: '1:20' },
      { figmaId: 'hero-cta', nodeId: '1:45' },
    ],
    ...overrides,
  };
}

describe('validateConfig', () => {
  it('applies default tolerances when none are given', () => {
    expect(validateConfig(baseConfig()).tolerances).toEqual(DEFAULT_TOLERANCES);
  });

  it('layers config tolerances over the defaults', () => {
    const config = validateConfig(baseConfig({ tolerances: { position: 6 } }));
    expect(config.tolerances.position).toBe(6);
    expect(config.tolerances.size).toBe(DEFAULT_TOLERANCES.size);
  });

  it('rejects a relative URL', () => {
    expect(() => validateConfig(baseConfig({ url: '/hero' }))).toThrow(/absolute URL/);
  });

  it('rejects duplicate figmaIds, which would make pairing ambiguous', () => {
    const elements = [
      { figmaId: 'hero', nodeId: '1:20' },
      { figmaId: 'hero', nodeId: '1:21' },
    ];
    expect(() => validateConfig(baseConfig({ elements }))).toThrow(/Duplicate figmaId/);
  });

  it('requires the section to be a configured element, so its node id is known', () => {
    expect(() => validateConfig(baseConfig({ section: 'nowhere' }))).toThrow(/must be listed/);
  });

  it('rejects an unknown tolerance key rather than silently ignoring it', () => {
    expect(() => validateConfig(baseConfig({ tolerances: { fontsize: 1 } })))
      .toThrow(/unknown key "fontsize"/);
  });

  it('rejects an unknown pass name', () => {
    const elements = [
      { figmaId: 'hero', nodeId: '1:20', passes: ['colour'] },
      { figmaId: 'hero-cta', nodeId: '1:45' },
    ];
    expect(() => validateConfig(baseConfig({ elements }))).toThrow(/valid values/);
  });

  it('rejects a relativeTo that names no configured element', () => {
    const elements = [
      { figmaId: 'hero', nodeId: '1:20' },
      { figmaId: 'hero-cta', nodeId: '1:45', relativeTo: 'sidebar' },
    ];
    expect(() => validateConfig(baseConfig({ elements }))).toThrow(/relativeTo/);
  });
});

describe('resolveTolerances', () => {
  it('layers element overrides over the run-level values', () => {
    const config = validateConfig(baseConfig({
      tolerances: { position: 6 },
      elements: [
        { figmaId: 'hero', nodeId: '1:20' },
        { figmaId: 'hero-cta', nodeId: '1:45', tolerances: { position: 10 } },
      ],
    }));

    expect(resolveTolerances(config, 'hero').position).toBe(6);
    expect(resolveTolerances(config, 'hero-cta').position).toBe(10);
    expect(resolveTolerances(config, 'hero-cta').size).toBe(DEFAULT_TOLERANCES.size);
  });
});

describe('loadConfig', () => {
  it('loads the shipped example config', async () => {
    const config = await loadConfig('tovi.config.example.json');
    expect(config.section).toBe('hero');
    expect(config.elements.map((element) => element.figmaId)).toContain('hero');
    expect(config.tolerances).toMatchObject(DEFAULT_TOLERANCES);
  });

  it('reports a missing file with its path', async () => {
    await expect(loadConfig('does-not-exist.json')).rejects.toThrow(/Cannot read config file/);
  });
});

/**
 * `overlays` — T-03.
 *
 * Declared page furniture, hidden before anything is measured. Validated here
 * rather than at measure time: a run that hides nothing because of a stray
 * bracket reports offsets that look exactly like design drift.
 */
describe('validateConfig — overlays', () => {
  it('keeps the declared selectors in the order they were written', () => {
    const config = validateConfig(baseConfig({ overlays: ['#promo-bar', '.cookie-banner'] }));
    expect(config.overlays).toEqual(['#promo-bar', '.cookie-banner']);
  });

  it('trims surrounding whitespace, which a pasted selector carries', () => {
    expect(validateConfig(baseConfig({ overlays: ['  .promo  '] })).overlays).toEqual(['.promo']);
  });

  it('leaves the key absent when none are declared', () => {
    expect(validateConfig(baseConfig()).overlays).toBeUndefined();
  });

  it('rejects a bare string, which would iterate as characters', () => {
    expect(() => validateConfig(baseConfig({ overlays: '.promo' }))).toThrow(/must be an array/);
  });

  it('rejects an empty entry, which would match the whole document or nothing', () => {
    expect(() => validateConfig(baseConfig({ overlays: ['.promo', '  '] })))
      .toThrow(/overlays\[1\]/);
  });

  it('rejects a duplicate, since one of the two is not doing what it looks like', () => {
    expect(() => validateConfig(baseConfig({ overlays: ['.promo', '.promo'] })))
      .toThrow(/Duplicate overlay/);
  });
});
