---
description: Walk through a first TOVI run against a real page
argument-hint: [url]
allowed-tools: Read, Edit, Bash(npm run build), Bash(node dist/index.js check:*), Bash(jq:*), Bash(cat:*), Bash(ls:*)
---

Set up and interpret a first run against a real page: $ARGUMENTS

TOVI has not been run against a real production page. Expect findings that are
not build defects, and triage before tightening anything.

## Before running

1. **Confirm prerequisites** — `FIGMA_TOKEN` set (do not read `.env`; just check
   the variable is present), Chromium installed, `npm run build` done.
2. **Confirm the config** — does `section` name a configured element? Does
   `viewport.width` match the Figma frame width? A mismatch there makes every
   width comparison drift for reasons that are not defects.
3. **Confirm the page is tagged.** Suggest the user run this in their browser
   console on the live page:
   ```js
   [...document.querySelectorAll('[data-figma-id]')].map(el => el.dataset.figmaId)
   ```
   Every slug in the config must appear there, or it comes back `missingInLive`.

## Run

Use `--no-fail` on a first run — the goal is a report to triage, not a verdict:

```bash
node dist/index.js check -c tovi.config.json \
  -r out/report.html -j out/report.json -s out/page.png --no-fail
```

## Interpret

Triage in this order, because each can mask the ones below it:

1. **Structural issues first.** `missingInLive` and `ambiguousInLive` mean the
   config and the page disagree about what exists — fix those before reading any
   numbers.
2. **`skipped` issues.** The section was unavailable on one side, so geometry did
   not run at all for those elements. The section's own issue is the real one.
3. **Systematic patterns.** Every element off by the same `offsetY` is one
   problem (a banner), not N problems. Every heading failing `fontWeight` is one
   problem (a font cut), not N.
4. **Individual findings**, last.

```bash
jq -r '.elements[].issues[] | select(.severity=="error")
       | "\(.figmaId)  \(.property)  \(.expected) -> \(.actual)"' out/report.json
```

## Report

Give the user:

- The counts, and the verdict
- Each **systematic** pattern, with its likely cause
- Which findings look like **real build defects**
- Which look like **environmental artifacts** (see `/triage` and
  `docs/troubleshooting.md`)
- What to change before the next run

Do not recommend loosening tolerances to make the run green. The first run's
purpose is to find out what the tool says about reality.
