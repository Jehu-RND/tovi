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
import { diffText } from './compare/textPass.js';
import { diffGeometry } from './compare/geometryPass.js';
import { structuralIssue, valueIssue } from './compare/issues.js';
import { buildRunReport } from './report/merge.js';
import { renderHtmlReport, renderTextSummary } from './report/html.js';
import type { Issue, RunReport } from './report/types.js';
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
      issues.push(...diffText(pair, tolerances));
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
        issues.push(...diffGeometry(pair, section, tolerances));
      } else {
        // The container compared against itself is always a zero offset, so
        // only its size and spec properties are meaningful.
        issues.push(
          ...diffGeometry(pair, section, tolerances).filter(
            (issue) => issue.property !== 'offsetX' && issue.property !== 'offsetY',
          ),
        );
      }
    }
  }

  return issues;
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
  options: { screenshotPath?: string } = {},
): Promise<RunResult> {
  const timestamp = new Date().toISOString();

  // --- Design side ---
  const client = createFigmaClient(config.figmaFileKey as string);
  const rawNodes = await client.getNodes(config.elements.map((element) => element.nodeId));

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

  const extraction = await extractLiveStyles({
    url: config.url,
    viewport: config.viewport,
    figmaIds: config.elements.map((element) => element.figmaId),
    selectors,
    ...(config.timeout !== undefined ? { timeout: config.timeout } : {}),
    ...(options.screenshotPath !== undefined ? { screenshotPath: options.screenshotPath } : {}),
  });

  // --- Compare ---
  const issues = [
    ...normalizeFailures,
    ...compareAll(
      config, figmaSpecs, extraction.styles,
      new Set(extraction.ambiguous), reportedByNormalize,
    ),
  ];

  return {
    report: buildRunReport(config, issues, timestamp),
    ...(extraction.screenshotPath !== undefined
      ? { screenshotPath: extraction.screenshotPath }
      : {}),
  };
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
