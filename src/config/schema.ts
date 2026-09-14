/**
 * TOVI — config file types (`tovi.config.json`).
 *
 * The config is the whole input surface of a run: which Figma file, which live
 * URL, which elements to check, and how much drift is acceptable. Secrets are
 * NOT part of it — the Figma token comes from the FIGMA_TOKEN env var only.
 */

import type { Px } from '../types.js';

/**
 * Per-property tolerances. A difference is only reported when it exceeds the
 * tolerance for its property, so every check is a deliberate threshold rather
 * than an exact-match assertion.
 */
export interface Tolerances {
  /** Pass A: width/height delta, in px. */
  size: Px;
  /** Pass A: section-relative x/y offset delta, in px. */
  position: Px;
  /** Pass A: per-side padding delta, in px. */
  padding: Px;
  /** Pass A: per-corner radius delta, in px. */
  cornerRadius: Px;
  /**
   * Pass A: per-side border width delta, in px. Deliberately below 1: a 1px
   * border built as 2px is plainly visible, so a 1px floor would hide the
   * most common border defect there is.
   */
  border: Px;
  /**
   * Pass A: color distance. Compared as a perceptual deltaE via culori, so
   * this is a deltaE threshold, not a per-channel 0–255 one.
   */
  color: number;
  /** Pass A: shadow offset/blur/spread delta, in px. */
  shadow: Px;
  /** Pass B: font-size delta, in px. */
  fontSize: Px;
  /** Pass B: numeric weight delta. 0 means exact match required. */
  fontWeight: number;
  /** Pass B: line-height delta, in px. */
  lineHeight: Px;
  /** Pass B: letter-spacing delta, in px. */
  letterSpacing: Px;
}

/** Tolerances may be overridden per element; anything omitted inherits global. */
export type PartialTolerances = Partial<Tolerances>;

/** One tagged element to check. */
export interface ElementConfig {
  /**
   * Shared pairing key: the Figma layer name AND the value of the element's
   * `data-figma-id` attribute in the DOM. Must match on both sides exactly.
   */
  figmaId: string;
  /** Figma node id, e.g. "1:23". Used to fetch this node from the REST API. */
  nodeId: string;
  /**
   * Optional CSS selector override. Defaults to `[data-figma-id="<figmaId>"]`.
   */
  selector?: string;
  /**
   * figmaId of the element this one is positioned relative to. Defaults to the
   * run-level `section`. See SectionContext in ../types.ts.
   */
  relativeTo?: string;
  /** Which passes to run for this element. Defaults to both. */
  passes?: Array<'text' | 'geometry'>;
  /** Narrow overrides layered on top of the run-level tolerances. */
  tolerances?: PartialTolerances;
}

/** Viewport used for the Playwright run. Figma frame width should match. */
export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

/** The parsed, validated `tovi.config.json`. */
export interface ToviConfig {
  /** Figma file key. Falls back to the FIGMA_FILE_KEY env var when omitted. */
  figmaFileKey?: string;
  /** Live page to inspect. */
  url: string;
  /**
   * figmaId of the container that both sides are normalized against. Every
   * element's position is measured relative to this rect.
   */
  section: string;
  viewport: ViewportConfig;
  /**
   * Navigation timeout in ms. Defaults to 30000. Raise it for a page that is
   * genuinely slow rather than genuinely stuck.
   */
  timeout?: number;
  /** Run-level defaults; each element may override individual entries. */
  tolerances: Tolerances;
  elements: ElementConfig[];
}

/**
 * Defaults applied when the config omits a tolerance.
 *
 * Sub-pixel rounding, font hinting, and Figma's own rounding mean a 1px floor
 * is the practical zero for geometry — an exact-match default would report
 * noise on every run.
 */
export const DEFAULT_TOLERANCES: Tolerances = {
  size: 1,
  position: 2,
  padding: 1,
  cornerRadius: 1,
  border: 0.5,
  color: 2,
  shadow: 1,
  fontSize: 0.5,
  fontWeight: 0,
  lineHeight: 1,
  letterSpacing: 0.2,
};
