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

/**
 * One side's border: how thick it is and what colour it is painted in.
 *
 * A width of 0 means no border on that side, and its colour is then
 * meaningless — CSS still reports a colour for a border that is not drawn.
 */
export interface BorderSide {
  width: Px;
  color: Rgba;
}

/**
 * Per-side borders. Figma strokes and CSS borders both normalize into this.
 *
 * Figma paints one stroke colour for the whole node and may vary the weight
 * per side; CSS can vary both. The shared shape carries both per side so
 * neither source has to be special-cased downstream.
 */
export interface Borders {
  top: BorderSide;
  right: BorderSide;
  bottom: BorderSide;
  left: BorderSide;
}

/**
 * How Figma aligns a stroke to the node's edge.
 *
 * Only INSIDE corresponds to a CSS border, which is always drawn inside the
 * border box. CENTER and OUTSIDE paint beyond the node's bounds, so widths
 * still compare but the box they imply does not — Pass A says so rather than
 * reporting a confident match.
 */
export type StrokeAlign = 'INSIDE' | 'OUTSIDE' | 'CENTER';

/**
 * How a Figma TEXT node decides the size of its own box.
 *
 * Only `NONE` gives a box anyone laid out on purpose. `HEIGHT` fixes the width
 * and lets the height follow the wrapped glyphs; `WIDTH_AND_HEIGHT` shrink-
 * wraps both axes, so the box is the ink and nothing else — a heading whose
 * live element spans a 1470px column reports a 742px Figma box for no reason
 * other than that the words happen to be that wide.
 *
 * TOVI never changes a comparison because of this. It says so, because a
 * width delta explained by the authoring of the design file is a different
 * fact from a width delta caused by the build.
 */
export type TextAutoResize = 'NONE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT' | 'TRUNCATE';

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
  /**
   * Stroke, normalized per side. Absent when the node has no visible stroke —
   * which is not an assertion that the live element must have no border.
   */
  borders?: Borders;
  /** Present only alongside `borders`. See StrokeAlign. */
  strokeAlign?: StrokeAlign;
  /** First visible solid fill, normalized. Gradients are out of scope for v1. */
  backgroundColor?: Rgba;
  /** Text color for TEXT nodes. */
  color?: Rgba;
  shadows?: Shadow[];
  text?: TextSpec;
  /** Literal string content, used only to warn about obvious copy drift. */
  characters?: string;
  /**
   * TEXT nodes only: whether the node's box is a layout box or a glyph hug.
   * Absent on every other node type, and on a TEXT node Figma did not report
   * it for. See TextAutoResize.
   */
  textAutoResize?: TextAutoResize;
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
  /**
   * What the matched element actually is: `section.more-content`.
   *
   * The selector says what was looked for; this says what was found. Absent
   * only for a measurement taken before this existed.
   */
  describes?: string;

  /** getBoundingClientRect(), in *viewport* coordinates. Not directly comparable. */
  boundingRect: Rect;

  padding: BoxSides;
  cornerRadius: CornerRadius;
  /** Computed per-side border width and colour. Width is 0 when none is drawn. */
  borders: Borders;
  backgroundColor: Rgba;
  color: Rgba;
  shadows: Shadow[];
  text: TextSpec;
  /** textContent, trimmed and whitespace-collapsed. */
  textContent: string;

  /**
   * Computed `position`. `fixed` and `sticky` are anchored to the viewport
   * rather than to the document, so their rect is a function of scroll — and
   * TOVI measures at scroll 0, never anywhere else.
   *
   * Optional only because a measurement taken before this existed has none.
   */
  position?: string;
  /**
   * Images inside this element (the element itself included) that had not
   * finished loading when it was measured.
   *
   * The reason a box can measure 0×0 or short: an `<img>` with no intrinsic
   * size contributes nothing to layout until its bytes arrive. Reported, not
   * corrected — see the lazy-image note in live/extract.ts.
   */
  pendingImages?: number;
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
