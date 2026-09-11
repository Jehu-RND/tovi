/**
 * TOVI — config loading and validation.
 *
 * STUB: no implementation yet.
 */

import type { ToviConfig } from './schema.js';

/** Thrown when the config file is missing, malformed, or fails validation. */
export class ConfigError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Read and validate a TOVI config file.
 *
 * @param configPath Path to `tovi.config.json`, relative to cwd.
 * @returns The parsed config with defaults applied.
 * @throws {ConfigError} when the file is unreadable or invalid.
 */
export async function loadConfig(configPath: string): Promise<ToviConfig> {
  // TODO: read the file from disk and JSON.parse it, wrapping any syntax
  //       error in a ConfigError that names the path and line.
  // TODO: validate the shape — `url` is a valid absolute URL, `section` is a
  //       non-empty string, `viewport.width`/`height` are positive integers,
  //       `elements` is a non-empty array.
  // TODO: validate each element — `figmaId` and `nodeId` present, `figmaId`
  //       unique across the list (duplicates would make pairing ambiguous),
  //       `relativeTo` (when set) refers to another element's figmaId or the
  //       run-level section.
  // TODO: merge DEFAULT_TOLERANCES <- config.tolerances <- element.tolerances
  //       so every element ends up with a fully-populated Tolerances object.
  // TODO: fall back to process.env.FIGMA_FILE_KEY when figmaFileKey is absent,
  //       and raise a ConfigError if neither is set.
  throw new Error(`TODO: loadConfig is not implemented (requested: ${configPath})`);
}

/**
 * Resolve the effective tolerances for one element by layering the element's
 * overrides over the run-level values over the built-in defaults.
 */
export function resolveTolerances(
  _config: ToviConfig,
  _figmaId: string,
): ToviConfig['tolerances'] {
  // TODO: implement the three-way merge described above.
  throw new Error('TODO: resolveTolerances is not implemented');
}
