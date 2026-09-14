/**
 * TOVI — local UI server.
 *
 * `tovi ui` serves a small front end for running checks without hand-editing
 * JSON. It exists because the config is the wall between this tool and the
 * people most likely to use it daily: a QA tester will not author a
 * `figmaId` -> `nodeId` map by hand, and should not have to.
 *
 * Why a server and not a static page: a run drives Playwright and calls the
 * Figma REST API. Neither is possible from a browser — no Node, and the Figma
 * API sends no CORS headers — so the browser half is a client for this process.
 *
 * Two rules shape this module:
 *
 *   1. The FIGMA_TOKEN never reaches the browser. It is read here, used here,
 *      and no endpoint echoes it. /api/health reports only whether one is set.
 *
 *   2. Runs go through executeRun(), the same function the CLI uses. A run
 *      started from the UI and a run started from `tovi check` with the same
 *      config must produce byte-identical results, so there is exactly one
 *      pipeline and this module never reimplements a step of it.
 *
 * Bound to loopback only. This is a local authoring tool, not a service.
 */

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { executeRun } from '../index.js';
import { loadConfig, validateConfig } from '../config/loadConfig.js';
import { ConfigError } from '../config/loadConfig.js';
import type { ToviConfig } from '../config/schema.js';
import { DEFAULT_TOLERANCES } from '../config/schema.js';
import { createFigmaClient } from '../figma/client.js';
import { flattenLayers, pageNames } from '../figma/layers.js';
import { probeSelectors } from '../live/probe.js';
import { renderTextSummary } from '../report/html.js';
import { UI_HTML } from './page.js';

/** Loopback only — this is an authoring tool, not a service. */
const HOST = '127.0.0.1';

/** Cap on a request body. Configs are small; anything larger is a mistake. */
const MAX_BODY_BYTES = 1_000_000;

export interface UiOptions {
  port: number;
  /** Config file offered as the starting point, when one exists. */
  configPath?: string;
}

/** Read a JSON request body, refusing anything implausibly large. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large');
    chunks.push(buffer);
  }

  if (size === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    // Nothing here is cacheable: every response reflects live state.
    'cache-control': 'no-store',
  });
  res.end(text);
}

/**
 * Turn any thrown value into a message worth showing in the UI.
 *
 * The CLI's errors already say what to do — a 401 explains the token scope, a
 * ConfigError names its path — so the useful thing is to pass that text
 * through rather than replace it with a status code.
 */
function describeError(error: unknown): string {
  if (error instanceof ConfigError) {
    return error.path === undefined ? error.message : `${error.message} (${error.path})`;
  }
  return error instanceof Error ? error.message : String(error);
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

/**
 * Report what the environment provides, without disclosing any of it.
 *
 * The UI uses this to say "no Figma token" up front instead of letting someone
 * fill in a whole form and then fail on submit.
 */
function handleHealth(options: UiOptions): Record<string, unknown> {
  const token = process.env['FIGMA_TOKEN'];
  return {
    hasToken: typeof token === 'string' && token.trim() !== '',
    fileKeyFromEnv: process.env['FIGMA_FILE_KEY'] ?? null,
    configPath: options.configPath ?? null,
    defaultTolerances: DEFAULT_TOLERANCES,
  };
}

/** Load the config file the server was pointed at, if it is readable. */
async function handleConfig(options: UiOptions): Promise<Record<string, unknown>> {
  if (options.configPath === undefined) return { config: null, error: null };
  try {
    const config = await loadConfig(options.configPath);
    return { config, error: null, path: options.configPath };
  } catch (error) {
    // Not fatal: someone may be about to build a config from scratch.
    return { config: null, error: describeError(error), path: options.configPath };
  }
}

/** List a Figma file's layers, so node ids can be picked rather than typed. */
async function handleLayers(url: URL): Promise<Record<string, unknown>> {
  const fileKey = url.searchParams.get('file') ?? process.env['FIGMA_FILE_KEY'];
  if (fileKey === null || fileKey === undefined || fileKey.trim() === '') {
    throw new Error('No Figma file key. Pass ?file=<key> or set FIGMA_FILE_KEY.');
  }

  const depthParam = url.searchParams.get('depth');
  const depth = depthParam === null ? 4 : Number(depthParam);
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error(`depth must be a positive integer, got "${depthParam}"`);
  }

  const page = url.searchParams.get('page') ?? undefined;
  const search = url.searchParams.get('search') ?? undefined;

  const client = createFigmaClient(fileKey);
  // Figma returns the entire file when no depth is given, which on a real
  // design file is tens of megabytes. A page is one level in, so add one.
  const file = await client.getFile(depth + 1);

  const rows = flattenLayers(file, {
    ...(page !== undefined && page !== '' ? { page } : {}),
    ...(search !== undefined && search !== '' ? { search } : {}),
    maxDepth: depth,
  });

  return { fileName: file.name, pages: pageNames(file), rows };
}

/**
 * Run a check against a config posted from the browser.
 *
 * The config is validated with the same validateConfig() the CLI uses, so the
 * UI cannot submit something the CLI would reject — a config authored here is
 * a config that runs in CI.
 */
async function handleCheck(body: unknown): Promise<Record<string, unknown>> {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Expected a JSON body containing a config');
  }

  const config: ToviConfig = validateConfig((body as { config?: unknown }).config);
  const { report } = await executeRun(config);

  return { report, summary: renderTextSummary(report) };
}

/**
 * Test selectors against the live page without running a check.
 *
 * Authoring a config is otherwise a guessing loop: type a selector, run a full
 * check, read missingInLive, guess again. This answers from the page alone, so
 * it costs one page load and no Figma call.
 */
async function handleProbe(body: unknown): Promise<Record<string, unknown>> {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Expected a JSON body with a url and selectors');
  }
  const input = body as { url?: unknown; selectors?: unknown; viewport?: unknown };

  if (typeof input.url !== 'string' || input.url.trim() === '') {
    throw new Error('A url is required to test selectors against.');
  }
  const selectors = Array.isArray(input.selectors)
    ? input.selectors.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
    : [];

  const viewport = isRecord(input.viewport) ? input.viewport : {};
  const width = typeof viewport['width'] === 'number' ? viewport['width'] : 1440;
  const height = typeof viewport['height'] === 'number' ? viewport['height'] : 900;

  return probeSelectors({
    url: input.url,
    viewport: { width, height },
    selectors,
  }) as unknown as Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Server
 * ------------------------------------------------------------------ */

/**
 * Build the UI server without listening, so tests can drive it directly.
 */
export function createUiServer(options: UiOptions): Server {
  return createServer((req, res) => {
    void handle(req, res, options);
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  options: UiOptions,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  const path = url.pathname;

  try {
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(UI_HTML);
      return;
    }

    if (req.method === 'GET' && path === '/api/health') {
      sendJson(res, 200, handleHealth(options));
      return;
    }

    if (req.method === 'GET' && path === '/api/config') {
      sendJson(res, 200, await handleConfig(options));
      return;
    }

    if (req.method === 'GET' && path === '/api/layers') {
      sendJson(res, 200, await handleLayers(url));
      return;
    }

    if (req.method === 'POST' && path === '/api/probe') {
      sendJson(res, 200, await handleProbe(await readJsonBody(req)));
      return;
    }

    if (req.method === 'POST' && path === '/api/check') {
      sendJson(res, 200, await handleCheck(await readJsonBody(req)));
      return;
    }

    sendJson(res, 404, { error: `No route for ${req.method} ${path}` });
  } catch (error) {
    // A failed run is a normal outcome here, not a crash: report it as data so
    // the UI can show the same message the CLI would have printed.
    sendJson(res, 400, { error: describeError(error) });
  }
}

/**
 * Start the UI server.
 *
 * @returns The URL it is listening on.
 */
export async function startUiServer(options: UiOptions): Promise<{ server: Server; url: string }> {
  const server = createUiServer(options);

  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      // The raw "EADDRINUSE" is the single most likely failure here and says
      // nothing about what to do, so translate it. Usually it is a UI left
      // running in another terminal.
      if (error.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${options.port} is already in use — most likely another tovi ui. ` +
            'Stop it, or pass --port to pick a different one.',
        ));
        return;
      }
      if (error.code === 'EACCES') {
        reject(new Error(
          `Not allowed to listen on port ${options.port}. Ports below 1024 need ` +
            'elevated privileges; pass --port with something above that.',
        ));
        return;
      }
      reject(error);
    });

    server.listen(options.port, HOST, () => {
      server.removeAllListeners('error');
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : options.port;
  return { server, url: `http://${HOST}:${port}` };
}

/** Read a file if present, for the CLI to detect a default config. */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}
