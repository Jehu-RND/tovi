---
description: Run the full verification gate — typecheck, tests, build
allowed-tools: Bash(npm run typecheck), Bash(npm test), Bash(npm run build), Bash(npx playwright install chromium), Read, Grep
---

Run the full gate and report results honestly.

1. `npm run typecheck`
2. `npm test`
3. `npm run build`

Then report:

- **Pass/fail for each step.** If anything fails, show the actual output — do not
  summarize a failure into a sentence.
- **Whether the integration suites actually ran.** `extract.integration.test.ts`
  and `probe.integration.test.ts`
  skips itself when Chromium is not installed, so a green `npm test` without it
  covers less than it appears to. If it skipped and the working tree touches
  `src/live/`, say so explicitly and offer to run
  `npx playwright install chromium`.
- **The test count.** The baseline is 181 passing tests across 11 files. If the
  count dropped, find out which suite lost tests before calling this a pass.

Do not fix anything as part of this command unless asked — report first.
