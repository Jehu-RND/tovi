/**
 * TOVI — layer discovery.
 *
 * Turns a Figma file's node tree into a flat, readable list of
 * `nodeId  type  name  size` rows, so a config can be assembled from real ids
 * instead of typed by hand.
 *
 * This exists because hand-authoring is the worst part of using TOVI: every
 * `figmaId` -> `nodeId` pair typed by eye, on a page that may be thousands of
 * pixels tall, with `Frame 31306` and six layers called `Button` to tell apart.
 * Every one of those is a chance to produce a `missingInFigma` that looks like
 * a deleted layer.
 *
 * Nothing here compares anything — it is a read-only lookup that never touches
 * the live page.
 */

import type { FigmaFile, RawFigmaNode } from './client.js';

/** One row of the flattened tree. */
export interface LayerRow {
  /** Figma node id, in the `1:23` form the config takes. */
  nodeId: string;
  name: string;
  /** FRAME, TEXT, INSTANCE, RECTANGLE, ... */
  type: string;
  /** Nesting level below the page, used for indentation. */
  depth: number;
  /** Ancestor names joined with " / ", for telling six Buttons apart. */
  path: string;
  /** Absent on nodes Figma cannot measure — which cannot be compared either. */
  width?: number;
  height?: number;
}

export interface FlattenOptions {
  /** Only include this page (CANVAS node), matched case-insensitively. */
  page?: string;
  /** Only include nodes whose name contains this, case-insensitively. */
  search?: string;
  /** Only include these node types, upper-cased. */
  types?: string[];
  /** Stop descending below this depth. */
  maxDepth?: number;
}

/** Case-insensitive "contains", used for both page and name matching. */
function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Flatten a file's document tree into rows, in document order.
 *
 * Document order is the point: it matches what the designer sees in the layers
 * panel, so a row can be found by scrolling to where the layer sits rather
 * than by searching.
 *
 * Filters narrow which rows are *returned*, never which are traversed — a
 * search for "cta" still finds one nested inside a frame that does not match.
 */
export function flattenLayers(file: FigmaFile, options: FlattenOptions = {}): LayerRow[] {
  const rows: LayerRow[] = [];
  const types = options.types?.map((type) => type.toUpperCase());

  function walk(node: RawFigmaNode, depth: number, trail: string[]): void {
    if (options.maxDepth !== undefined && depth > options.maxDepth) return;

    const box = node.absoluteBoundingBox;
    const matchesType = types === undefined || types.includes(node.type.toUpperCase());
    const matchesSearch = options.search === undefined || contains(node.name, options.search);

    if (matchesType && matchesSearch) {
      rows.push({
        nodeId: node.id,
        name: node.name,
        type: node.type,
        depth,
        path: trail.join(' / '),
        ...(box !== undefined ? { width: box.width, height: box.height } : {}),
      });
    }

    for (const child of node.children ?? []) {
      walk(child, depth + 1, [...trail, node.name]);
    }
  }

  // The document's own children are the file's pages; start one level in so
  // depth 0 is a page and depth 1 is a top-level frame.
  const pages = selectPages(file.document.children ?? [], options.page);
  for (const page of pages) {
    walk(page, 0, []);
  }

  return rows;
}

/**
 * Reduce a page name to comparable word tokens.
 *
 * Real Figma page names carry decoration that is not part of the name anyone
 * would type — "Men's Basketball 🏀" is the actual name in the file this was
 * built against. Stripping everything that is not a letter or a digit leaves
 * `["men", "s", "basketball"]`, which is what a person means when they type
 * `--page "Men's Basketball"`.
 */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .split(' ')
    .filter((token) => token !== '');
}

/** Whether `needle` appears in `haystack` as a run of consecutive tokens. */
function hasTokenRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;

  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) return true;
  }
  return false;
}

/**
 * Pick the pages a `--page` argument refers to.
 *
 * Matching is on whole words, not raw substrings, and that is the whole point.
 * Two real traps make the naive version wrong:
 *
 *   - **Decoration.** Pages are named "Men's Basketball 🏀", so an exact string
 *     comparison against "Men's Basketball" never fires.
 *   - **Substrings that span words.** "Women's Basketball" *contains* the
 *     characters of "Men's Basketball" — `wo|men's basketball`. A raw substring
 *     match therefore selects both pages, and a run silently compares against
 *     the wrong design.
 *
 * So names reduce to word tokens, a full token match wins outright, and the
 * loose form falls back to a run of consecutive tokens — which "Women's" fails,
 * because "women" is not "men".
 */
export function selectPages(pages: RawFigmaNode[], wanted?: string): RawFigmaNode[] {
  if (wanted === undefined) return pages;

  const needle = nameTokens(wanted);
  if (needle.length === 0) return pages;

  const full = pages.filter((page) => {
    const tokens = nameTokens(page.name);
    return tokens.length === needle.length && tokens.every((t, i) => t === needle[i]);
  });
  if (full.length > 0) return full;

  return pages.filter((page) => hasTokenRun(nameTokens(page.name), needle));
}

/** The page names in a file, for the error message when no page matches. */
export function pageNames(file: FigmaFile): string[] {
  return (file.document.children ?? []).map((page) => page.name);
}

/** Pad or truncate so columns line up without a table library. */
function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width - 1) + '…' : value.padEnd(width);
}

/**
 * Render rows as an aligned, indented listing.
 *
 * Indentation mirrors the layers panel so a row can be located by shape;
 * the node id is first because that is the thing being copied out.
 */
export function renderLayers(file: FigmaFile, rows: LayerRow[]): string {
  const lines: string[] = [`${file.name}  —  ${rows.length} layer${rows.length === 1 ? '' : 's'}`, ''];

  for (const row of rows) {
    const indent = '  '.repeat(row.depth);
    const size = row.width !== undefined && row.height !== undefined
      ? `${Math.round(row.width)}×${Math.round(row.height)}`
      : '—';
    lines.push(
      `  ${pad(row.nodeId, 12)}${pad(row.type, 11)}${pad(indent + row.name, 46)}${size}`,
    );
  }

  if (rows.length === 0) {
    lines.push('  no layers matched');
  }

  return lines.join('\n');
}
