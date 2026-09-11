/**
 * TOVI — color normalization.
 *
 * Figma and CSS describe the same color in incompatible ways, so both sides
 * are converted to the shared Rgba form before any comparison. All actual
 * color math (parsing, space conversion, perceptual distance) is delegated to
 * culori — TOVI does not implement its own.
 */

import { converter, differenceCiede2000, parse } from 'culori';
import type { Rgba } from '../types.js';

/** A Figma paint color: all four channels are 0–1 floats. */
export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

const toRgb = converter('rgb');
const ciede2000 = differenceCiede2000();

/**
 * Alpha values closer than this are treated as equal. Figma stores alpha as a
 * float and browsers round it to 2–3 decimals on the way out of
 * getComputedStyle, so an exact comparison reports noise.
 */
const ALPHA_EPSILON = 0.01;

/** Below this alpha a color is invisible, and its channels stop mattering. */
const INVISIBLE_ALPHA = 0.005;

/** Clamp to 0–255 and round, so channels are always comparable integers. */
function toChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

/** Convert our 0–255 Rgba into the 0–1 form culori works in. */
function toCulori(color: Rgba) {
  return {
    mode: 'rgb' as const,
    r: color.r / 255,
    g: color.g / 255,
    b: color.b / 255,
    alpha: color.a,
  };
}

/**
 * Convert a Figma 0–1 float color into the canonical Rgba form.
 *
 * @param color   The raw `color` object from a fill or effect.
 * @param opacity The paint's own `opacity`, folded into alpha when present.
 */
export function fromFigmaColor(color: FigmaColor, opacity?: number): Rgba {
  const alpha = (color.a ?? 1) * (opacity ?? 1);
  return {
    r: toChannel(color.r),
    g: toChannel(color.g),
    b: toChannel(color.b),
    a: Math.max(0, Math.min(1, alpha)),
  };
}

/**
 * Parse any CSS color string into the canonical Rgba form.
 * Handles rgb()/rgba()/hex/named/color() by handing the string to culori.
 *
 * @returns undefined for `none`, empty input, and unparseable strings.
 *          `transparent` parses to a real value with alpha 0 rather than
 *          undefined — the browser genuinely reported a color there.
 */
export function fromCssColor(css: string): Rgba | undefined {
  const trimmed = css.trim();
  if (trimmed === '' || trimmed === 'none') return undefined;

  const parsed = parse(trimmed);
  if (parsed === undefined) return undefined;

  const rgb = toRgb(parsed);
  if (rgb === undefined) return undefined;

  return {
    r: toChannel(rgb.r),
    g: toChannel(rgb.g),
    b: toChannel(rgb.b),
    a: rgb.alpha ?? 1,
  };
}

/**
 * Perceptual distance between two colors, for comparison against the `color`
 * tolerance.
 *
 * A per-channel RGB difference is the wrong metric — it reports large deltas
 * for changes the eye cannot see and small ones for changes it can. culori's
 * CIEDE2000 implementation is used instead, so the tolerance value is a
 * deltaE, where roughly 1 is the just-noticeable threshold.
 *
 * Alpha is NOT part of deltaE. Two colors that differ only in opacity score 0
 * here, so callers must also check {@link alphaDelta}; {@link colorsMatch}
 * does both and is what the passes actually call.
 */
export function colorDistance(a: Rgba, b: Rgba): number {
  // Both invisible: the channels behind a zero alpha are arbitrary, and
  // comparing them would flag transparent-vs-transparent as a large diff.
  if (a.a < INVISIBLE_ALPHA && b.a < INVISIBLE_ALPHA) return 0;
  return ciede2000(toCulori(a), toCulori(b));
}

/** Absolute difference in opacity between two colors. */
export function alphaDelta(a: Rgba, b: Rgba): number {
  return Math.abs(a.a - b.a);
}

/**
 * Whether two colors match within tolerance, accounting for both hue and
 * opacity. This is the check the comparison passes use.
 */
export function colorsMatch(expected: Rgba, actual: Rgba, tolerance: number): boolean {
  if (alphaDelta(expected, actual) > ALPHA_EPSILON) return false;
  return colorDistance(expected, actual) <= tolerance;
}

/** Format an Rgba for display in a report, e.g. "rgb(17, 17, 17)". */
export function formatColor(color: Rgba): string {
  const { r, g, b, a } = color;
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  // Trim trailing zeroes so 0.50 reads as 0.5.
  const alpha = Number(a.toFixed(3));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
