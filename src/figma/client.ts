/**
 * TOVI — Figma REST API client.
 *
 * Auth: the personal access token is read from the FIGMA_TOKEN environment
 * variable and sent as the `X-Figma-Token` header. It is never read from the
 * config file, never logged, and never written to a report.
 *
 * Note that node properties come from the ordinary REST API — a Dev Mode seat
 * is a UI feature and is not required for any call made here.
 */

import type { Rect } from '../types.js';

const FIGMA_API_BASE = 'https://api.figma.com/v1';

/** Node ids per request. Keeps the query string well inside URL length limits. */
const CHUNK_SIZE = 50;

/** Retries for 429 and 5xx responses, which Figma returns under load. */
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

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
  /** Stroke paints. Same paint shape as `fills`. */
  strokes?: unknown[];
  /** Uniform stroke weight in px. Figma omits it on a node with no stroke. */
  strokeWeight?: number;
  /** "INSIDE" | "OUTSIDE" | "CENTER". Only INSIDE maps onto a CSS border. */
  strokeAlign?: string;
  /** Per-side stroke weights, set when a node overrides the uniform weight. */
  individualStrokeWeights?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
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

/** The shape of `GET /v1/files/:key` that TOVI reads. */
export interface FigmaFile {
  /** The file's own name, as shown in Figma. */
  name: string;
  /** Root DOCUMENT node; its children are the file's pages (CANVAS nodes). */
  document: RawFigmaNode;
}

/** Client bound to one file key and one token. */
export interface FigmaClient {
  /**
   * Fetch the given node ids in a single logical request.
   *
   * @returns A map keyed by node id. Ids Figma did not return are absent from
   *          the map rather than present-and-null, so callers must check.
   */
  getNodes(nodeIds: string[]): Promise<Map<string, RawFigmaNode>>;

  /**
   * Fetch the file's layer tree, for discovering node ids.
   *
   * @param depth How many levels below the document root to return. Figma
   *              returns the ENTIRE file when this is omitted, which on a real
   *              design file is tens of megabytes — so callers should always
   *              pass one.
   */
  getFile(depth?: number): Promise<FigmaFile>;
}

/**
 * Dev Mode's "Copy link to selection" yields `node-id=1-23`, but the API keys
 * its responses by `1:23`. Accept either spelling from config.
 */
export function normalizeNodeId(nodeId: string): string {
  return nodeId.trim().replace(/-/g, ':');
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

/** Translate an HTTP status into a message that says what to actually do. */
function describeStatus(status: number, fileKey: string, body: string): string {
  switch (status) {
    case 401:
    case 403:
      return (
        'Figma rejected the token (HTTP ' + status + '). Check that FIGMA_TOKEN is set, ' +
        'has not expired, carries the "file_content:read" scope, and that the account ' +
        `can open file "${fileKey}".`
      );
    case 404:
      return `Figma file "${fileKey}" not found. Check FIGMA_FILE_KEY / "figmaFileKey".`;
    case 429:
      return 'Figma rate limit exceeded and retries were exhausted.';
    default:
      return `Figma API returned HTTP ${status}: ${body.slice(0, 200)}`;
  }
}

/** Milliseconds to wait before a retry, honouring Retry-After when present. */
function backoffFor(response: Response, attempt: number): number {
  const header = response.headers.get('retry-after');
  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  return BASE_BACKOFF_MS * 2 ** attempt;
}

/**
 * Construct a Figma client.
 *
 * @param fileKey The Figma file key from the file URL.
 * @param token   Personal access token. Defaults to process.env.FIGMA_TOKEN.
 * @throws {FigmaApiError} when no token is available.
 */
export function createFigmaClient(fileKey: string, token?: string): FigmaClient {
  const resolvedToken = token ?? process.env['FIGMA_TOKEN'];
  if (resolvedToken === undefined || resolvedToken.trim() === '') {
    throw new FigmaApiError(
      'No Figma token. Set FIGMA_TOKEN in your environment (or .env). ' +
        'Create one at Figma → Settings → Security → Personal access tokens, ' +
        'with the "file_content:read" scope.',
    );
  }

  async function request(url: string): Promise<unknown> {
    let lastError: FigmaApiError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'X-Figma-Token': resolvedToken as string },
        });
      } catch (error) {
        // Network-level failure; worth retrying, but keep the reason.
        lastError = new FigmaApiError(
          `Could not reach the Figma API: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (attempt < MAX_RETRIES) {
          await sleep(BASE_BACKOFF_MS * 2 ** attempt);
          continue;
        }
        throw lastError;
      }

      if (response.ok) return response.json();

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < MAX_RETRIES) {
        await sleep(backoffFor(response, attempt));
        continue;
      }

      const body = await response.text().catch(() => '');
      throw new FigmaApiError(describeStatus(response.status, fileKey, body), response.status);
    }

    throw lastError ?? new FigmaApiError('Figma request failed after retries.');
  }

  return {
    async getFile(depth?: number): Promise<FigmaFile> {
      const query = depth === undefined ? '' : `?depth=${encodeURIComponent(String(depth))}`;
      const payload = await request(`${FIGMA_API_BASE}/files/${encodeURIComponent(fileKey)}${query}`);

      const file = payload as { name?: unknown; document?: RawFigmaNode } | null;
      if (file?.document === undefined || file.document === null) {
        throw new FigmaApiError('Figma response did not contain a "document" node.');
      }
      return {
        name: typeof file.name === 'string' ? file.name : fileKey,
        document: file.document,
      };
    },

    async getNodes(nodeIds: string[]): Promise<Map<string, RawFigmaNode>> {
      const result = new Map<string, RawFigmaNode>();
      if (nodeIds.length === 0) return result;

      const normalized = [...new Set(nodeIds.map(normalizeNodeId))];

      for (const batch of chunk(normalized, CHUNK_SIZE)) {
        const ids = encodeURIComponent(batch.join(','));
        const payload = await request(
          `${FIGMA_API_BASE}/files/${encodeURIComponent(fileKey)}/nodes?ids=${ids}`,
        );

        const nodes = (payload as { nodes?: Record<string, unknown> } | null)?.nodes;
        if (nodes === undefined || nodes === null) {
          throw new FigmaApiError('Figma response did not contain a "nodes" object.');
        }

        // Unwrap `{ nodes: { "1:23": { document: {...} } } }` down to the node.
        // Figma returns null for an id that does not exist in the file; leave
        // those out of the map so the caller reports them as missing.
        for (const [id, entry] of Object.entries(nodes)) {
          const document = (entry as { document?: RawFigmaNode } | null)?.document;
          if (document !== undefined && document !== null) {
            result.set(id, document);
          }
        }
      }

      return result;
    },
  };
}
