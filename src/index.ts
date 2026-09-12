#!/usr/bin/env node
/**
 * TOVI — CLI entry point.
 *
 * Usage:
 *   tovi check --config tovi.config.json --report out/report.html
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Command } from 'commander';
import { loadConfig, resolveTolerances } from './config/loadConfig.js';
import type { ElementConfig, ToviConfig } from './config/schema.js';
import { createFigmaClient } from './figma/client.js';
import { normalizeFigmaNode } from './figma/normalize.js';
import { extractLiveStyles } from './live/extract.js';
import { diffText } from './compare/textPass.js';
import { diffGeometry } from './compare/geometryPass.js';
import { structuralIssue, valueIssue } from './compare/issues.js';
import { buildRunReport } from './report/merge.js';
import { renderHtmlReport, renderTextSummary } from './report/html.js';
import type { Issue } from './report/types.js';
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
      issues.push(structuralIssue(figmaId, 'geometry', 'missingInFigma'));
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
  const timestamp = new Date().toISOString();
  const loaded = await loadConfig(options.config);
  const config: ToviConfig = options.url !== undefined ? { ...loaded, url: options.url } : loaded;

  // --- Design side ---
  const client = createFigmaClient(config.figmaFileKey as string);
  const rawNodes = await client.getNodes(config.elements.map((element) => element.nodeId));

  const figmaSpecs = new Map<string, FigmaSpec>();
  const normalizeFailures: Issue[] = [];
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
    ...(options.screenshot !== undefined ? { screenshotPath: options.screenshot } : {}),
  });

  // --- Compare ---
  const issues = [
    ...normalizeFailures,
    ...compareAll(config, figmaSpecs, extraction.styles, new Set(extraction.ambiguous)),
  ];

  const report = buildRunReport(config, issues, timestamp);

  // --- Output ---
  if (options.report !== undefined) {
    await writeOutput(
      options.report,
      renderHtmlReport(report, {
        ...(extraction.screenshotPath !== undefined
          ? { screenshotPath: extraction.screenshotPath }
          : {}),
      }),
    );
  }
  if (options.json !== undefined) {
    await writeOutput(options.json, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(renderTextSummary(report));
  if (options.report !== undefined) console.log(`  report: ${options.report}`);
  if (options.json !== undefined) console.log(`  json:   ${options.json}`);

  const shouldFail = options.fail !== false;
  return report.status === 'fail' && shouldFail ? 1 : 0;
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
