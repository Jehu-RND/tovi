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
