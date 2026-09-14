# CI integration

TOVI is built for CI: a run is deterministic, self-contained, and communicates
through an exit code. Same inputs, same output — which is what makes a red build
meaningful.

## What CI needs

| Requirement | Why |
| --- | --- |
| Node 20.12+ | `process.loadEnvFile` |
| `FIGMA_TOKEN` as a secret | Never commit it; never put it in the config |
| Chromium | `npx playwright install --with-deps chromium` |
| A reachable URL | The live or staging page to inspect |

## GitHub Actions

```yaml
name: Design check

on:
  pull_request:
  workflow_dispatch:
  schedule:
    - cron: '0 7 * * 1'   # Monday morning drift report

jobs:
  tovi:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build

      - name: Compare design to live
        env:
          FIGMA_TOKEN: ${{ secrets.FIGMA_TOKEN }}
        run: |
          node dist/index.js check \
            --config tovi.config.json \
            --url "${{ vars.STAGING_URL }}" \
            --report out/report.html \
            --json out/report.json \
            --screenshot out/page.png

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: tovi-report
          path: out/
```

`if: always()` on the upload matters — the report is most useful exactly when
the step before it failed.

The HTML report is self-contained (inline CSS, no external assets), so it opens
straight from the downloaded artifact with no network. The screenshot is
**linked, not embedded**, which is why the whole `out/` directory is uploaded
rather than just the HTML.

## Secrets

The token is read from `FIGMA_TOKEN` only. It is never read from the config,
never logged, and never written into a report — so report artifacts are safe to
attach to a PR.

`process.loadEnvFile` does not overwrite variables that are already set, so a
stray committed `.env` can never shadow a CI-injected token. `.env` is
gitignored regardless.

The **file key** is not a secret and can live in the config or in a repo
variable.

## Staging vs production

`--url` overrides the config's URL, so one config serves both:

```bash
node dist/index.js check -c tovi.config.json -u "$STAGING_URL" -j out/staging.json
node dist/index.js check -c tovi.config.json -u "$PROD_URL"    -j out/prod.json
```

## Multiple viewports

TOVI runs one viewport per run. A second breakpoint is a second config and a
second run — each pointing at a Figma frame drawn at that width.

```yaml
strategy:
  fail-fast: false
  matrix:
    config: [tovi.desktop.json, tovi.mobile.json]
steps:
  - run: node dist/index.js check -c ${{ matrix.config }} -j out/${{ matrix.config }}.json
```

`fail-fast: false` so one failing breakpoint does not hide the other's results.

## Reporting without blocking

While you are still triaging false positives on a new page, `--no-fail` produces
the full report and always exits `0`:

```bash
node dist/index.js check -c tovi.config.json -r out/report.html --no-fail
```

This is the right setting for the **first few weeks** on a real page. Tighten to
a failing check once findings are trustworthy — a check that cries wolf gets
ignored, and an ignored check is worse than no check.

## Tracking drift over time

Reports are byte-identical between runs over an unchanged page — elements follow
config order, issues follow a fixed severity and property order. So they diff
cleanly:

```bash
diff <(jq -S . baseline.json) <(jq -S . out/report.json)
```

Commit a baseline and diff against it to see *new* drift rather than total drift.

## Useful queries

```bash
# Fail the build only on geometry errors, ignoring text warnings
jq -e '[.elements[].issues[]
        | select(.severity=="error" and .pass=="geometry")] | length == 0' out/report.json

# One line per error, for a PR comment
jq -r '.elements[].issues[] | select(.severity=="error")
       | "- `\(.figmaId)` \(.property): expected \(.expected), got \(.actual)"' out/report.json

# Elements that could not be paired at all
jq -r '.elements[] | select(.paired | not) | .figmaId' out/report.json
```

## Before wiring this up

TOVI has not yet been run against a real production page. The
[troubleshooting guide](troubleshooting.md#findings-that-are-not-build-defects)
catalogues the findings most likely to be environmental rather than real —
cookie banners, lazy-loaded images, font weights with no `@font-face`
counterpart.

Run it manually against the target page and triage those **before** making it a
required check.
