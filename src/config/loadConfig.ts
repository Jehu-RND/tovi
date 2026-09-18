/**
 * TOVI — config loading and validation.
 *
 * Validation is strict and eager: every problem is raised as a ConfigError
 * naming the exact path that is wrong. A run that starts with a half-valid
 * config produces mismatches that look like design drift but are really typos,
 * which is the most expensive kind of false positive this tool can emit.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  ElementConfig,
  PartialTolerances,
  Tolerances,
  ToviConfig,
  ViewportConfig,
} from './schema.js';
import { DEFAULT_TOLERANCES } from './schema.js';

/** Thrown when the config file is missing, malformed, or fails validation. */
export class ConfigError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const TOLERANCE_KEYS = Object.keys(DEFAULT_TOLERANCES) as Array<keyof Tolerances>;
const VALID_PASSES = new Set(['text', 'geometry']);

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Require a non-empty string at `field`. */
function requireString(source: Record<string, unknown>, field: string, path?: string): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`"${field}" must be a non-empty string`, path);
  }
  return value;
}

/** Read an optional string; absent and empty are both treated as absent. */
function optionalString(
  source: Record<string, unknown>,
  field: string,
  path?: string,
): string | undefined {
  const value = source[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`"${field}" must be a non-empty string when present`, path);
  }
  return value;
}

function requirePositiveNumber(
  source: Record<string, unknown>,
  field: string,
  path?: string,
): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ConfigError(`"${field}" must be a positive number`, path);
  }
  return value;
}

/** Validate a partial tolerance block: known keys only, all finite and >= 0. */
function validateTolerances(
  value: unknown,
  where: string,
  path?: string,
): PartialTolerances {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new ConfigError(`${where}.tolerances must be an object`, path);
  }

  const result: PartialTolerances = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!TOLERANCE_KEYS.includes(key as keyof Tolerances)) {
      throw new ConfigError(
        `${where}.tolerances has unknown key "${key}". Valid keys: ${TOLERANCE_KEYS.join(', ')}`,
        path,
      );
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
      throw new ConfigError(`${where}.tolerances.${key} must be a number >= 0`, path);
    }
    result[key as keyof Tolerances] = raw;
  }
  return result;
}

function validateViewport(value: unknown, path?: string): ViewportConfig {
  if (!isRecord(value)) {
    throw new ConfigError('"viewport" must be an object with width and height', path);
  }
  const width = requirePositiveNumber(value, 'width', path);
  const height = requirePositiveNumber(value, 'height', path);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new ConfigError('"viewport.width" and "viewport.height" must be integers', path);
  }

  const scale = value['deviceScaleFactor'];
  if (scale === undefined) return { width, height };
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
    throw new ConfigError('"viewport.deviceScaleFactor" must be a positive number', path);
  }
  return { width, height, deviceScaleFactor: scale };
}

function validateElement(value: unknown, index: number, path?: string): ElementConfig {
  const where = `elements[${index}]`;
  if (!isRecord(value)) {
    throw new ConfigError(`${where} must be an object`, path);
  }

  const figmaId = requireString(value, 'figmaId', path);
  const nodeId = requireString(value, 'nodeId', path);
  const selector = optionalString(value, 'selector', path);
  const relativeTo = optionalString(value, 'relativeTo', path);

  let passes: Array<'text' | 'geometry'> | undefined;
  const rawPasses = value['passes'];
  if (rawPasses !== undefined) {
    if (!Array.isArray(rawPasses) || rawPasses.length === 0) {
      throw new ConfigError(`${where}.passes must be a non-empty array`, path);
    }
    for (const pass of rawPasses) {
      if (typeof pass !== 'string' || !VALID_PASSES.has(pass)) {
        throw new ConfigError(
          `${where}.passes contains "${String(pass)}"; valid values are "text" and "geometry"`,
          path,
        );
      }
    }
    passes = rawPasses as Array<'text' | 'geometry'>;
  }

  const tolerances = validateTolerances(value['tolerances'], where, path);

  return {
    figmaId,
    nodeId,
    ...(selector !== undefined ? { selector } : {}),
    ...(relativeTo !== undefined ? { relativeTo } : {}),
    ...(passes !== undefined ? { passes } : {}),
    ...(Object.keys(tolerances).length > 0 ? { tolerances } : {}),
  };
}

/**
 * Validate an already-parsed config value.
 *
 * Exported so tests can exercise validation without touching the filesystem.
 */
export function validateConfig(value: unknown, path?: string): ToviConfig {
  if (!isRecord(value)) {
    throw new ConfigError('Config must be a JSON object', path);
  }

  const url = requireString(value, 'url', path);
  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    throw new ConfigError(`"url" must be an absolute URL, got "${url}"`, path);
  }

  const section = requireString(value, 'section', path);
  const viewport = validateViewport(value['viewport'], path);

  const rawElements = value['elements'];
  if (!Array.isArray(rawElements) || rawElements.length === 0) {
    throw new ConfigError('"elements" must be a non-empty array', path);
  }
  const elements = rawElements.map((element, index) => validateElement(element, index, path));

  // Duplicate keys would make pairing ambiguous — two config entries would
  // both claim the same DOM element and the same Figma layer.
  const seen = new Set<string>();
  for (const element of elements) {
    if (seen.has(element.figmaId)) {
      throw new ConfigError(`Duplicate figmaId "${element.figmaId}" in elements`, path);
    }
    seen.add(element.figmaId);
  }

  // The section's own rect has to be fetched from Figma, which needs its
  // nodeId — so the section must itself be a configured element.
  if (!seen.has(section)) {
    throw new ConfigError(
      `"section" is "${section}" but no element with that figmaId is configured. ` +
        'The section container must be listed in "elements" so its node id is known.',
      path,
    );
  }

  for (const element of elements) {
    if (element.relativeTo !== undefined && !seen.has(element.relativeTo)) {
      throw new ConfigError(
        `Element "${element.figmaId}" has relativeTo "${element.relativeTo}", ` +
          'which is not a configured figmaId',
        path,
      );
    }
  }

  const rawTimeout = value['timeout'];
  if (rawTimeout !== undefined) {
    if (typeof rawTimeout !== 'number' || !Number.isFinite(rawTimeout) || rawTimeout <= 0) {
      throw new ConfigError('"timeout" must be a positive number of milliseconds', path);
    }
  }
  const timeout = rawTimeout as number | undefined;

  const tolerances: Tolerances = {
    ...DEFAULT_TOLERANCES,
    ...validateTolerances(value['tolerances'], 'config', path),
  };

  const fontAliases = validateFontAliases(value['fontAliases'], path);
  const overlays = validateOverlays(value['overlays'], path);

  // The token is never read from config; only the file key may live here, and
  // the environment can supply it instead.
  const figmaFileKey = optionalString(value, 'figmaFileKey', path) ?? process.env['FIGMA_FILE_KEY'];
  if (figmaFileKey === undefined || figmaFileKey.trim() === '') {
    throw new ConfigError(
      'No Figma file key. Set "figmaFileKey" in the config or FIGMA_FILE_KEY in the environment.',
      path,
    );
  }

  return {
    figmaFileKey, url, section, viewport, tolerances, elements,
    ...(timeout !== undefined ? { timeout } : {}),
    ...(fontAliases !== undefined ? { fontAliases } : {}),
    ...(overlays !== undefined ? { overlays } : {}),
  };
}

/**
 * Validate the optional `overlays` list.
 *
 * Every entry is a CSS selector, and a selector the browser cannot parse is
 * rejected here rather than at measure time: a run that hides nothing because
 * of a stray bracket produces offsets that look like design drift, which is
 * the expensive kind of wrong. Duplicates are rejected for the same reason a
 * duplicate figmaId is — one of the two is not doing what its author thinks.
 */
function validateOverlays(raw: unknown, path?: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new ConfigError('"overlays" must be an array of CSS selectors', path);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  raw.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.trim() === '') {
      throw new ConfigError(`"overlays[${index}]" must be a non-empty CSS selector`, path);
    }
    const selector = entry.trim();
    if (seen.has(selector)) {
      throw new ConfigError(`Duplicate overlay selector "${selector}"`, path);
    }
    seen.add(selector);
    out.push(selector);
  });
  return out;
}

/**
 * Validate the optional `fontAliases` map.
 *
 * Rejected rather than ignored when malformed: a typo here silently restores
 * the noise the map exists to remove, and a config that looks like it declares
 * an alias but does not is worse than one that never tried.
 */
function validateFontAliases(
  raw: unknown,
  path?: string,
): Record<string, string> | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError('"fontAliases" must be an object mapping font name to font name', path);
  }

  const out: Record<string, string> = {};
  for (const [key, alias] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof alias !== 'string' || alias.trim() === '') {
      throw new ConfigError(`"fontAliases.${key}" must be a non-empty string`, path);
    }
    if (key.trim() === '') {
      throw new ConfigError('"fontAliases" keys must not be empty', path);
    }
    out[key] = alias;
  }
  return out;
}

/**
 * Read and validate a TOVI config file.
 *
 * @param configPath Path to `tovi.config.json`, relative to cwd.
 * @returns The parsed config with defaults applied.
 * @throws {ConfigError} when the file is unreadable or invalid.
 */
export async function loadConfig(configPath: string): Promise<ToviConfig> {
  const absolute = resolve(configPath);

  let raw: string;
  try {
    raw = await readFile(absolute, 'utf8');
  } catch (error) {
    throw new ConfigError(`Cannot read config file: ${describe(error)}`, absolute);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError(`Config is not valid JSON: ${describe(error)}`, absolute);
  }

  return validateConfig(parsed, absolute);
}

/**
 * Resolve the effective tolerances for one element by layering the element's
 * overrides over the run-level values.
 *
 * The run-level values already have DEFAULT_TOLERANCES folded in by
 * {@link validateConfig}, so this completes the three-way merge.
 */
export function resolveTolerances(config: ToviConfig, figmaId: string): Tolerances {
  const element = config.elements.find((candidate) => candidate.figmaId === figmaId);
  if (element === undefined) {
    throw new ConfigError(`No element configured with figmaId "${figmaId}"`);
  }
  return { ...config.tolerances, ...(element.tolerances ?? {}) };
}
