# CI integration

TOVI is built for CI: a run is deterministic, self-contained, and communicates
through an exit code. Same inputs, same output — which is what makes a red build
meaningful.

## What CI needs

| Requirement | Why |
| --- | --- |
| Node 20.12+ | `process.loadEnvFile` |
| A committed `package-lock.json` | `npm ci` installs exactly what it pins, and `cache: npm` fails outright without it |
| `FIGMA_TOKEN` as a secret | Never commit it; never put it in the config |
| Chromium | `npx playwright install --with-deps chromium` |
| A reachable URL | The live or staging page to inspect |

## What ships in this repo

Two workflows are committed:

| Workflow | Runs on | Needs secrets |
| --- | --- | --- |
| [`ci.yml`](../.github/workflows/ci.yml) | push, PR | no |
| [`design-check.yml`](../.github/workflows/design-check.yml) | manual, weekly cron | yes |

`ci.yml` is the repository's own gate — typecheck, test, build. It installs
Chromium explicitly, because the integration suite skips itself when the browser
is absent and a green run without it covers less than it appears to.

`design-check.yml` is the design comparison. Two prerequisites, both checked up
front so the run fails with a clear message rather than dying later:

1. **A committed `tovi.ci.json`.** `tovi.config.json` is gitignored because it
   can hold client URLs, so CI reads a separate committed config.
2. **A `FIGMA_TOKEN` secret** with the `file_content:read` scope, on an account
   that can open the file.

It starts in **report-only mode** — the `fail_on_drift` input defaults to false,
which passes `--no-fail`. Triage findings on a real page before turning that on.

## Writing your own

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
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm

      # npm ci, not npm install: it installs exactly what package-lock.json
      # pins, so CI tests the dependency tree you tested. It also requires the
      # lockfile to be committed -- as does `cache: npm` above, which fails
      # outright without one.
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

The HTML report is self-contained — inline CSS, no external assets, and the
screenshot embedded as a `data:` URI — so it opens straight from the downloaded
artifact with no network. The whole `out/` directory is still uploaded because
the JSON is what you diff across builds, and because a capture over 4MB is
linked rather than embedded.

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
