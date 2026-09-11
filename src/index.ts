#!/usr/bin/env node
/**
 * TOVI — CLI entry point.
 *
 * STUB: the command is wired up, but `runCheck` is not implemented.
 *
 * Usage:
 *   tovi check --config tovi.config.json --report out/report.html
 */

import { Command } from 'commander';

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
  /** Exit 0 even when issues are found. Useful in report-only CI jobs. */
  noFail?: boolean;
}

/**
 * Run one check: load config -> fetch Figma -> extract live -> diff -> report.
 *
 * @returns The process exit code: 0 when the run passes, 1 when it fails.
 */
export async function runCheck(_options: CheckOptions): Promise<number> {
  // TODO: loadConfig(options.config), applying the --url override.
  // TODO: createFigmaClient(fileKey) and fetch every configured node id,
  //       including the section container's node.
  // TODO: normalizeFigmaNode() each raw node into a FigmaSpec.
  // TODO: extractLiveStyles() for the same figmaIds at the configured viewport.
  // TODO: build the SectionContext from both sides' section rects — Pass A
  //       cannot run without it.
  // TODO: pair by figmaId, then run diffText and diffGeometry per element
  //       according to its `passes` setting.
  // TODO: buildRunReport(), write the HTML/JSON outputs, print the text
  //       summary, and return report.status === 'fail' && !noFail ? 1 : 0.
  throw new Error('TODO: runCheck is not implemented');
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
