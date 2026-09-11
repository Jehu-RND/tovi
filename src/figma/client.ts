/**
 * TOVI — Figma REST API client.
 *
 * STUB: no network calls yet.
 *
 * Auth: the personal access token is read from the FIGMA_TOKEN environment
 * variable and sent as the `X-Figma-Token` header. It is never read from the
 * config file, never logged, and never written to a report.
 */

import type { Rect } from '../types.js';

const FIGMA_API_BASE = 'https://api.figma.com/v1';

/** Thrown for transport failures, auth failures, and unknown node ids. */
export class FigmaApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'FigmaApiError';
  }
}

/**
 * A raw Figma node as returned by `GET /v1/files/:key/nodes`.
 *
 * Deliberately loose — only the fields TOVI reads are named, and each is
 * optional because Figma omits properties that do not apply to a node type.
 * figma/normalize.ts is responsible for turning this into a FigmaSpec.
 */
export interface RawFigmaNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: Rect;
  /** 0–1 float RGBA fills; may include gradients TOVI ignores. */
  fills?: unknown[];
  strokes?: unknown[];
  effects?: unknown[];
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  characters?: string;
  style?: Record<string, unknown>;
  children?: RawFigmaNode[];
  [key: string]: unknown;
}

/** Client bound to one file key and one token. */
export interface FigmaClient {
  /**
   * Fetch the given node ids in a single request.
   *
   * @returns A map keyed by node id. Ids Figma did not return are absent from
   *          the map rather than present-and-null, so callers must check.
   */
  getNodes(nodeIds: string[]): Promise<Map<string, RawFigmaNode>>;
}

/**
 * Construct a Figma client.
 *
 * @param fileKey The Figma file key from the file URL.
 * @param token   Personal access token. Defaults to process.env.FIGMA_TOKEN.
 * @throws {FigmaApiError} when no token is available.
 */
export function createFigmaClient(fileKey: string, token?: string): FigmaClient {
  // TODO: resolve the token from the argument then process.env.FIGMA_TOKEN,
  //       and throw a FigmaApiError with a setup hint when neither is set.
  // TODO: return an object whose getNodes():
  //         - builds `${FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${joined}`
  //         - sends the X-Figma-Token header
  //         - chunks ids so the query string stays under Figma's URL limit
  //         - maps 403 -> "token invalid or lacks access to this file" and
  //           404 -> "file key not found" into readable FigmaApiError messages
  //         - retries 429 and 5xx with backoff, honouring Retry-After
  //         - unwraps the `{ nodes: { "1:23": { document: {...} } } }` envelope
  //           down to the `document` node for each id
  void fileKey;
  void token;
  void FIGMA_API_BASE;
  throw new Error('TODO: createFigmaClient is not implemented');
}
