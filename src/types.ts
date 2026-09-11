/**
 * TOVI — shared domain types.
 *
 * These types are the contract between the four stages of a run:
 *
 *   figma/  -> FigmaSpec   (design intent, from the Figma REST API)
 *   live/   -> LiveStyles  (observed reality, from Playwright)
 *   compare/-> Issue[]     (numeric deltas that exceed tolerance)
 *   report/ -> RunReport   (grouped, rendered)
 *
 * Everything here is plain data. No AI, no heuristics — a run is a pure
 * function of (FigmaSpec, LiveStyles, Tolerances) -> Issue[].
 */

/** CSS-ish pixel value. Figma units and CSS px are both treated as px. */
export type Px = number;

/**
 * Canonical color form used across the whole tool.
 *
 * Figma gives 0–1 float RGBA; the browser gives `rgb()` / `rgba()` / `color()`
 * strings. Both are normalized into this shape by compare/color.ts before any
 * comparison happens. Channels are 0–255 integers, alpha is 0–1.
 */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Per-side box values (padding, and the normalized offsets used by Pass A). */
export interface BoxSides {
  top: Px;
  right: Px;
  bottom: Px;
  left: Px;
}

/** Corner radii, always expanded to four corners even if Figma reports one. */
export interface CornerRadius {
  topLeft: Px;
  topRight: Px;
  bottomRight: Px;
  bottomLeft: Px;
}

/** A single drop/inner shadow layer. */
export interface Shadow {
  offsetX: Px;
  offsetY: Px;
  blur: Px;
  spread: Px;
  color: Rgba;
  inset: boolean;
}

/** Axis-aligned rectangle. Coordinate space depends on the field's docs. */
export interface Rect {
  x: Px;
  y: Px;
  width: Px;
  height: Px;
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

/**
 * The five text properties Pass B compares.
 *
 * `lineHeight` and `letterSpacing` are normalized to px before they land here
 * — Figma can express them as percentages and CSS can report `normal`, so the
 * normalizers own that conversion, not the comparison pass.
 */
export interface TextSpec {
  fontFamily: string;
  fontSize: Px;
  /** Numeric weight, 100–900. Named CSS weights are mapped during normalization. */
  fontWeight: number;
  lineHeight: Px;
  letterSpacing: Px;
}

/* ------------------------------------------------------------------ *
 * Figma side
 * ------------------------------------------------------------------ */

/**
 * A normalized Figma node — the design's intent for one tagged element.
 *
 * Produced by figma/normalize.ts from the raw REST response. Optional fields
 * are genuinely absent in the design (a frame with no fill, a node with no
 * text) rather than "not looked up yet"; the comparison passes skip any
 * property that is absent on either side.
 */
export interface FigmaSpec {
  /** Figma layer name — the pairing key, matches `data-figma-id` in the DOM. */
  figmaId: string;
  /** Figma's own node id, e.g. "1:23". Kept for links back into the file. */
  nodeId: string;
  /** Node type as reported by Figma: FRAME, TEXT, RECTANGLE, INSTANCE, ... */
  type: string;

  /**
   * Absolute bounding box in Figma *canvas* coordinates.
   *
   * WARNING: never compared directly against a browser rect. See
   * compare/geometryPass.ts for how positions are normalized first.
   */
  absoluteBoundingBox: Rect;

  padding?: BoxSides;
  cornerRadius?: CornerRadius;
  /** First visible solid fill, normalized. Gradients are out of scope for v1. */
  backgroundColor?: Rgba;
  /** Text color for TEXT nodes. */
  color?: Rgba;
  shadows?: Shadow[];
  text?: TextSpec;
  /** Literal string content, used only to warn about obvious copy drift. */
  characters?: string;
}

/* ------------------------------------------------------------------ *
 * Live side
 * ------------------------------------------------------------------ */

/**
 * Observed styles for one element on the live page.
 *
 * Produced by live/extract.ts inside the browser: `getBoundingClientRect()`
 * for geometry plus `getComputedStyle()` for everything else, then normalized
 * into the same units and color form as FigmaSpec.
 */
export interface LiveStyles {
  /** Value of the element's `data-figma-id` attribute — the pairing key. */
  figmaId: string;
  /** CSS selector that located the element, for reporting. */
  selector: string;

  /** getBoundingClientRect(), in *viewport* coordinates. Not directly comparable. */
  boundingRect: Rect;

  padding: BoxSides;
  cornerRadius: CornerRadius;
  backgroundColor: Rgba;
  color: Rgba;
  shadows: Shadow[];
  text: TextSpec;
  /** textContent, trimmed and whitespace-collapsed. */
  textContent: string;
}

/* ------------------------------------------------------------------ *
 * Pairing
 * ------------------------------------------------------------------ */

/**
 * One element's design and live sides brought together.
 *
 * Either side may be missing — a node in the config that has no matching DOM
 * element (or vice versa) is itself a reportable finding.
 */
export interface ElementPair {
  figmaId: string;
  figma?: FigmaSpec;
  live?: LiveStyles;
}

/**
 * The container both sides are measured against.
 *
 * Pass A subtracts this rect from each element's position to get section-
 * relative offsets, which cancels out canvas origin, page scroll, and any
 * global horizontal centering. See compare/geometryPass.ts.
 */
export interface SectionContext {
  figmaId: string;
  figma: Rect;
  live: Rect;
}
