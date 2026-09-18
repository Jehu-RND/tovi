#!/usr/bin/env node
/**
 * TOVI — CLI entry point.
 *
 * Usage:
 *   tovi check --config tovi.config.json --report out/report.html
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Command } from 'commander';
import { loadConfig, resolveTolerances } from './config/loadConfig.js';
import type { ElementConfig, ToviConfig } from './config/schema.js';
import { createFigmaClient } from './figma/client.js';
import { flattenLayers, pageNames, renderLayers } from './figma/layers.js';
import { fileExists, startUiServer } from './ui/server.js';
import { normalizeFigmaNode } from './figma/normalize.js';
import { extractLiveStyles } from './live/extract.js';
import type { ImageResult, OverlayResult } from './live/extract.js';
import { diffText } from './compare/textPass.js';
import { diffGeometry } from './compare/geometryPass.js';
import { structuralIssue, valueIssue } from './compare/issues.js';
import { buildRunReport } from './report/merge.js';
import { renderHtmlReport, renderTextSummary } from './report/html.js';
import type { Check, Issue, RunNote, RunReport } from './report/types.js';
import type { ElementPair, FigmaSpec, LiveStyles, SectionContext } from './types.js';

/**
 * Load `.env` if one is present.
 *
 * process.loadEnvFile does not overwrite variables that are already set, so a
 * real environment always wins over the file — a stray local .env can never
 * clobber a token injected by CI.
 */
export function loadDotEnv(envPath = '.env'): void {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // No .env is normal: the variables may come from the real environment.
  }
}

export interface CheckOptions {
  config: string;
  /** Path to write the HTML report to. */
  report?: string;
  /** Path to write the raw RunReport JSON to. */
  json?: string;
  /** Override the config's `url`. */
  url?: string;
  /** Capture a full-page screenshot alongside the report. */
  screenshot?: string;
  /**
   * Commander maps `--no-fail` onto this key, defaulting it to true. When
   * false, the run reports issues but still exits 0.
   */
  fail?: boolean;
}

/** Which passes an element runs, defaulting to both. */
function passesFor(element: ElementConfig): { text: boolean; geometry: boolean } {
  const passes = element.passes ?? ['text', 'geometry'];
  return { text: passes.includes('text'), geometry: passes.includes('geometry') };
}

/**
 * Largest screenshot that gets embedded into the report.
 *
 * Base64 inflates a file by about a third, and a full-page capture of a long
 * page is easily several megabytes — past this the report becomes something
 * browsers struggle to open, which is worse than a report that names a path.
 */
const MAX_EMBEDDED_SCREENSHOT_BYTES = 4 * 1024 * 1024;

/**
 * Read a screenshot into a `data:` URI so the report can embed it.
 *
 * Embedding is what makes the HTML report a genuine single file: one artifact
 * to attach to a PR, with no image to lose alongside it.
 *
 * @returns The data URI, or undefined when the file is unreadable or too big
 *          to embed — in which case the report falls back to naming the path.
 */
export async function readScreenshotDataUri(path: string): Promise<string | undefined> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    return undefined;
  }
  if (bytes.byteLength > MAX_EMBEDDED_SCREENSHOT_BYTES) return undefined;
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

/** Write a file, creating its parent directory if needed. */
async function writeOutput(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, 'utf8');
}

/**
 * Build the container context an element's position is measured against.
 *
 * Returns undefined when either side of the container is unavailable — Pass A
 * cannot fall back to absolute coordinates, so it must not run at all.
 */
function sectionContextFor(
  containerId: string,
  figmaSpecs: Map<string, FigmaSpec>,
  liveStyles: Map<string, LiveStyles>,
): SectionContext | undefined {
  const figma = figmaSpecs.get(containerId);
  const live = liveStyles.get(containerId);
  if (figma === undefined || live === undefined) return undefined;
  return { figmaId: containerId, figma: figma.absoluteBoundingBox, live: live.boundingRect };
}

/**
 * Compare every configured element and collect the issues.
 *
 * Exported so tests can exercise the comparison wiring without a network or a
 * browser, by passing in specs and styles directly.
 */
export function compareAll(
  config: ToviConfig,
  figmaSpecs: Map<string, FigmaSpec>,
  liveStyles: Map<string, LiveStyles>,
  ambiguous: Set<string> = new Set(),
  alreadyReported: Set<string> = new Set(),
  checks?: Check[],
): Issue[] {
  const issues: Issue[] = [];

  for (const element of config.elements) {
    const { figmaId } = element;
    const figma = figmaSpecs.get(figmaId);
    const live = liveStyles.get(figmaId);

    // Structural problems are reported once, not once per pass — two passes
    // both saying "this element is missing" is the same fact twice.
    if (ambiguous.has(figmaId)) {
      issues.push(
        valueIssue(figmaId, 'geometry', 'ambiguousInLive', 'exactly one match', 'more than one match', {
          detail: element.selector ?? `[data-figma-id="${figmaId}"]`,
        }),
      );
      continue;
    }
    if (figma === undefined) {
      // A node that failed to normalize already has an issue explaining why,
      // and it says more than "no Figma node found" would. Reporting both
      // states the same fact twice, in descending order of usefulness.
      if (!alreadyReported.has(figmaId)) {
        issues.push(structuralIssue(figmaId, 'geometry', 'missingInFigma'));
      }
      continue;
    }
    if (live === undefined) {
      issues.push(structuralIssue(figmaId, 'geometry', 'missingInLive'));
      continue;
    }

    const pair: ElementPair = { figmaId, figma, live };
    const tolerances = resolveTolerances(config, figmaId);
    const passes = passesFor(element);

    if (passes.text) {
      issues.push(...diffText(pair, tolerances, checks, config.fontAliases));
    }

    if (passes.geometry) {
      const containerId = element.relativeTo ?? config.section;
      const section = sectionContextFor(containerId, figmaSpecs, liveStyles);

      if (section === undefined) {
        // Say so rather than silently returning no geometry findings. An
        // absent check that looks like a passing check is the worst outcome
        // this tool can produce.
        issues.push(
          valueIssue(figmaId, 'geometry', 'skipped', 'geometry compared', 'geometry skipped', {
            severity: 'info',
            detail: `container "${containerId}" unavailable on one side`,
          }),
        );
      } else if (containerId !== figmaId) {
        issues.push(...diffGeometry(pair, section, tolerances, checks));
      } else {
        // The container compared against itself is always a zero offset, so
        // only its size and spec properties are meaningful. The offsets are
        // dropped from the checks too — listing a self-referential 0 vs 0 as
        // something that was verified would overstate what the run did.
        const own: Check[] = [];
        const isOffset = (property: string): boolean =>
          property === 'offsetX' || property === 'offsetY';
        issues.push(
          ...diffGeometry(pair, section, tolerances, own).filter(
            (issue) => !isOffset(issue.property),
          ),
        );
        if (checks !== undefined) {
          for (const check of own) if (!isOffset(check.property)) checks.push(check);
        }
      }
    }
  }

  return issues;
}

/** Which stage of a run a progress event describes. */
export type RunPhase = 'figma' | 'normalize' | 'browser' | 'extract' | 'compare' | 'report';

/**
 * One step of a run, for a caller that wants to show what is happening.
 *
 * Purely observational. The fractions are rough stage weights, not measured
 * timings — honest about being an indication of where the run is rather than
 * a prediction of when it ends.
 */
export interface RunProgress {
  phase: RunPhase;
  message: string;
  /** Rough position through the run, 0 to 1, monotonically increasing. */
  fraction: number;
  done?: number;
  total?: number;
}

/**
 * Run one check: load config -> fetch Figma -> extract live -> diff -> report.
 *
 * @returns The process exit code: 0 when the run passes, 1 when it fails.
 */
export async function runCheck(options: CheckOptions): Promise<number> {
  const loaded = await loadConfig(options.config);
  const config: ToviConfig = options.url !== undefined ? { ...loaded, url: options.url } : loaded;

  const { report, screenshotPath } = await executeRun(config, {
    ...(options.screenshot !== undefined ? { screenshotPath: options.screenshot } : {}),
  });

  // --- Output ---
  let embedded: string | undefined;
  if (options.report !== undefined) {
    if (screenshotPath !== undefined) {
      embedded = await readScreenshotDataUri(screenshotPath);
    }
    await writeOutput(
      options.report,
      renderHtmlReport(report, {
        ...(screenshotPath !== undefined ? { screenshotPath } : {}),
        ...(embedded !== undefined ? { screenshotDataUri: embedded } : {}),
      }),
    );
  }
  if (options.json !== undefined) {
    await writeOutput(options.json, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(renderTextSummary(report));
  if (options.report !== undefined) console.log(`  report: ${options.report}`);
  if (options.json !== undefined) console.log(`  json:   ${options.json}`);
  if (screenshotPath !== undefined && options.report !== undefined && embedded === undefined) {
    // Say why rather than leaving someone wondering where the capture went.
    console.log(
      `  note:   screenshot not embedded (over ${MAX_EMBEDDED_SCREENSHOT_BYTES / 1024 / 1024}MB); ` +
        `report links ${screenshotPath}`,
    );
  }

  const shouldFail = options.fail !== false;
  return report.status === 'fail' && shouldFail ? 1 : 0;
}

export interface RunResult {
  report: RunReport;
  /** Where the screenshot was written, when one was requested. */
  screenshotPath?: string;
}

/**
 * Run the comparison and return the report, touching no files.
 *
 * This is the whole pipeline — fetch, extract, compare, group — with none of
 * the CLI's output handling. Both runCheck() and the UI server go through it,
 * so a run started from either produces byte-identical results. Any new
 * surface that wants to run a check belongs here too, never in a parallel copy.
 */
export async function executeRun(
  config: ToviConfig,
  options: { screenshotPath?: string; onProgress?: (event: RunProgress) => void } = {},
): Promise<RunResult> {
  const timestamp = new Date().toISOString();
  const total = config.elements.length;

  // A no-op default keeps every call site below unconditional. Progress is
  // reporting only: it observes the run and can never alter it, so a caller
  // that ignores it gets a byte-identical report.
  const report = options.onProgress ?? ((): void => {});

  // --- Design side ---
  report({ phase: 'figma', fraction: 0.05, done: 0, total,
    message: `Fetching ${total} node${total === 1 ? '' : 's'} from Figma…` });

  const client = createFigmaClient(config.figmaFileKey as string);
  const rawNodes = await client.getNodes(config.elements.map((element) => element.nodeId));

  report({ phase: 'normalize', fraction: 0.3, done: rawNodes.size, total,
    message: `Reading ${rawNodes.size} design node${rawNodes.size === 1 ? '' : 's'}…` });

  const figmaSpecs = new Map<string, FigmaSpec>();
  const normalizeFailures: Issue[] = [];
  /** Elements whose structural problem normalization already reported. */
  const reportedByNormalize = new Set<string>();
  for (const element of config.elements) {
    const raw = rawNodes.get(element.nodeId.replace(/-/g, ':'));
    if (raw === undefined) continue;
    try {
      figmaSpecs.set(element.figmaId, normalizeFigmaNode(raw, element.figmaId));
    } catch (error) {
      normalizeFailures.push(
        valueIssue(element.figmaId, 'geometry', 'missingInFigma', 'a measurable node',
          error instanceof Error ? error.message : String(error)),
      );
      reportedByNormalize.add(element.figmaId);
    }
  }

  // --- Live side ---
  const selectors: Record<string, string> = {};
  for (const element of config.elements) {
    if (element.selector !== undefined) selectors[element.figmaId] = element.selector;
  }

  report({ phase: 'browser', fraction: 0.4, message: `Loading ${config.url} in Chromium…` });

  const extraction = await extractLiveStyles({
    url: config.url,
    viewport: config.viewport,
    figmaIds: config.elements.map((element) => element.figmaId),
    selectors,
    ...(config.timeout !== undefined ? { timeout: config.timeout } : {}),
    ...(config.overlays !== undefined ? { overlays: config.overlays } : {}),
    ...(options.screenshotPath !== undefined ? { screenshotPath: options.screenshotPath } : {}),
  });

  report({ phase: 'extract', fraction: 0.8, done: extraction.styles.size, total,
    message: `Measured ${extraction.styles.size} of ${total} element${total === 1 ? '' : 's'}.` });

  // --- Compare ---
  report({ phase: 'compare', fraction: 0.9, message: 'Comparing design against live…' });
  const checks: Check[] = [];
  const issues = [
    ...normalizeFailures,
    ...compareAll(
      config, figmaSpecs, extraction.styles,
      new Set(extraction.ambiguous), reportedByNormalize, checks,
    ),
  ];

  const runReport = buildRunReport(
    config, issues, timestamp, checks, extraction.styles, runNotes(extraction),
  );
  report({ phase: 'report', fraction: 1, done: total, total,
    message: `${checks.length} propert${checks.length === 1 ? 'y' : 'ies'} compared.` });

  return {
    report: runReport,
    ...(extraction.screenshotPath !== undefined
      ? { screenshotPath: extraction.screenshotPath }
      : {}),
  };
}

/**
 * Turn what the extractor did to the page into notes the report can carry.
 *
 * Everything that changed the page before it was measured is stated, including
 * the changes that changed nothing. An overlay selector that hid zero elements
 * is the most useful note in the list: it is how an author finds out that the
 * banner they thought they were removing is still sitting in the layout, or
 * that the vendor renamed the class three months ago.
 *
 * Ordering is fixed — overlays in config order, then images — so two runs over
 * an unchanged page produce byte-identical notes (invariant 4).
 */
export function runNotes(extraction: {
  overlays: OverlayResult[];
  images: ImageResult;
}): RunNote[] {
  const notes: RunNote[] = [];

  for (const overlay of extraction.overlays) {
    if (overlay.invalid === true) {
      notes.push({
        kind: 'overlay',
        message: `overlay "${overlay.selector}" is not a selector the browser can parse; nothing was hidden`,
      });
      continue;
    }
    notes.push({
      kind: 'overlay',
      message: overlay.hidden === 0
        ? `overlay "${overlay.selector}" matched nothing — it hid no part of the page`
        : `overlay "${overlay.selector}" hid ${overlay.hidden} element${overlay.hidden === 1 ? '' : 's'} before measuring`,
    });
  }

  const { promoted, pending } = extraction.images;
  if (promoted > 0) {
    notes.push({
      kind: 'lazyImages',
      message: `${promoted} lazy-loaded image${promoted === 1 ? '' : 's'} switched to eager, so they had a size to measure`,
    });
  }
  if (pending > 0) {
    notes.push({
      kind: 'pendingImages',
      message: `${pending} image${pending === 1 ? '' : 's'} had still not loaded when the page was measured; any box relying on one is short`,
    });
  }

  return notes;
}

export interface LayersOptions {
  /** Figma file key. Defaults to FIGMA_FILE_KEY. */
  file?: string;
  /** Restrict to one page, matched case-insensitively. */
  page?: string;
  /** Filter by layer name, matched case-insensitively. */
  search?: string;
  /** Comma-separated node types, e.g. "FRAME,TEXT". */
  type?: string;
  /** How deep to descend below a page. */
  depth?: string;
  /** Write the rows as JSON to this path. */
  json?: string;
}

/**
 * List the layers in a Figma file so a config can be assembled from real ids.
 *
 * Deliberately does NOT read tovi.config.json: discovery is what you do
 * *before* you have a config, so requiring one would be backwards.
 *
 * @returns The process exit code.
 */
export async function runLayers(options: LayersOptions): Promise<number> {
  const fileKey = options.file ?? process.env['FIGMA_FILE_KEY'];
  if (fileKey === undefined || fileKey.trim() === '') {
    throw new Error(
      'No Figma file key. Pass --file <key> or set FIGMA_FILE_KEY. The key is the ' +
        'segment after /design/ or /file/ in the file URL.',
    );
  }

  const depth = options.depth === undefined ? 4 : Number(options.depth);
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error(`--depth must be a positive integer, got "${options.depth}"`);
  }

  const client = createFigmaClient(fileKey);
  // depth is relative to the document root, and a page is already one level
  // in, so add one to make --depth read as "levels below the page".
  const file = await client.getFile(depth + 1);

  const rows = flattenLayers(file, {
    ...(options.page !== undefined ? { page: options.page } : {}),
    ...(options.search !== undefined ? { search: options.search } : {}),
    ...(options.type !== undefined ? { types: options.type.split(',').map((t) => t.trim()) } : {}),
    maxDepth: depth,
  });

  // An unmatched page name is a typo, not an empty file — say which pages
  // exist rather than printing nothing and letting someone guess.
  if (rows.length === 0 && options.page !== undefined) {
    const names = pageNames(file);
    console.log(
      `No page matching "${options.page}". Pages in this file:\n` +
        names.map((name) => `  ${name}`).join('\n'),
    );
    return 1;
  }

  if (options.json !== undefined) {
    await writeOutput(options.json, `${JSON.stringify(rows, null, 2)}\n`);
  }

  console.log(renderLayers(file, rows));
  if (options.json !== undefined) console.log(`\n  json:   ${options.json}`);
  return 0;
}

export interface UiCommandOptions {
  port?: string;
  config?: string;
}

/**
 * Start the local UI server and leave it running.
 *
 * Does not resolve until the process is stopped — the server is the command.
 */
export async function runUi(options: UiCommandOptions): Promise<void> {
  const port = options.port === undefined ? 4479 : Number(options.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`--port must be a port number, got "${options.port}"`);
  }

  // Offer the config only when it is actually there, so a first-time user is
  // not shown an error about a file they were never expected to have.
  const configPath = options.config ?? 'tovi.config.json';
  const hasConfig = await fileExists(configPath);

  const { url } = await startUiServer({
    port,
    ...(hasConfig ? { configPath } : {}),
  });

  console.log(`TOVI UI  ${url}`);
  console.log(hasConfig ? `  config: ${configPath}` : '  config: none — build one in the browser');
  if (process.env['FIGMA_TOKEN'] === undefined || process.env['FIGMA_TOKEN'].trim() === '') {
    console.log('  note:   no FIGMA_TOKEN set; runs will fail until one is');
  }
  console.log('  Ctrl-C to stop.');
}

/** Build the commander program. Exported so tests can parse argv directly. */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name('tovi')
    .description('True-to-Figma Output Validation Inspector — compares a Figma design against a live page')
    .version('0.1.0');

  program
    .command('check')
    .description('Compare the configured elements against the live page')
    .option('-c, --config <path>', 'path to the config file', 'tovi.config.json')
    .option('-r, --report <path>', 'write an HTML report to this path')
    .option('-j, --json <path>', 'write the raw report JSON to this path')
    .option('-u, --url <url>', 'override the URL from the config')
    .option('-s, --screenshot <path>', 'capture a full-page screenshot')
    .option('--no-fail', 'exit 0 even when mismatches are found')
    .action(async (options: CheckOptions) => {
      loadDotEnv();
      const code = await runCheck(options);
      process.exitCode = code;
    });

  program
    .command('layers')
    .description('List a Figma file\'s layers and node ids, for assembling a config')
    .option('-f, --file <key>', 'Figma file key (defaults to FIGMA_FILE_KEY)')
    .option('-p, --page <name>', 'restrict to one page, matched case-insensitively')
    .option('-s, --search <text>', 'only layers whose name contains this')
    .option('-t, --type <types>', 'comma-separated node types, e.g. FRAME,TEXT')
    .option('-d, --depth <n>', 'how deep to descend below a page', '4')
    .option('-j, --json <path>', 'write the rows as JSON to this path')
    .action(async (options: LayersOptions) => {
      loadDotEnv();
      process.exitCode = await runLayers(options);
    });

  program
    .command('ui')
    .description('Serve a local UI for configuring and running checks')
    .option('-p, --port <port>', 'port to listen on', '4479')
    .option('-c, --config <path>', 'config file to start from', 'tovi.config.json')
    .action(async (options: UiCommandOptions) => {
      loadDotEnv();
      await runUi(options);
    });

  return program;
}

// Only parse argv when executed directly, so importing this module in tests
// does not run the CLI.
if (import.meta.url === `file://${process.argv[1]}`) {
  buildProgram().parseAsync(process.argv).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
