# Getting started

## Requirements

- **Node 20.12 or newer.** TOVI uses `process.loadEnvFile`, which landed in
  20.12. `engines` in [package.json](../package.json) enforces this.
- **A Figma personal access token** with the `file_content:read` scope.
- **Chromium**, downloaded by Playwright (~150 MB on first install).

## Install

```bash
npm install
npx playwright install chromium
```

## Configure credentials

```bash
cp .env.example .env
```

Then fill in `.env`:

```dotenv
FIGMA_TOKEN=figd_xxxxxxxxxxxxxxxxxxxxxxxx
FIGMA_FILE_KEY=AbCdEf123456GhIjKl
```

Create the token at **Figma → Settings → Security → Personal access tokens**.

The file key is the segment after `/design/` or `/file/` in the file URL:

```
https://www.figma.com/design/AbCdEf123456GhIjKl/My-Design
                             ^^^^^^^^^^^^^^^^^^
```

Two things worth knowing about the token:

- It is read from the `FIGMA_TOKEN` environment variable **only**. It is never
  read from the config file, never logged, and never written into a report.
- `process.loadEnvFile` does not overwrite variables that are already set, so a
  real environment always wins over `.env`. A stray local file can never clobber
  a token injected by CI.

You do **not** need a Dev Mode seat. Node properties come from the ordinary REST
API; Dev Mode is a UI feature.

## Tag your page

Every element you want checked needs a `data-figma-id` attribute:

```html
<section data-figma-id="hero">
  <h1 data-figma-id="hero-heading">Ship faster</h1>
  <p data-figma-id="hero-subheading">Without shipping regressions.</p>
</section>
```

The value is a label **you choose**. It does not have to match your Figma layer
names — see [tagging.md](tagging.md) for why that matters and how to pick good
slugs.

## Write a config

```bash
cp tovi.config.example.json tovi.config.json
```

The minimum viable config maps each tag to a Figma node id:

```json
{
  "figmaFileKey": "AbCdEf123456GhIjKl",
  "url": "https://example.com/",
  "section": "hero",
  "viewport": { "width": 1440, "height": 900 },
  "elements": [
    { "figmaId": "hero",         "nodeId": "1:20", "passes": ["geometry"] },
    { "figmaId": "hero-heading", "nodeId": "1:23" }
  ]
}
```

To get a node id: select the layer in Figma and use **Copy link to selection**.
The URL ends in `node-id=1-23`. TOVI accepts either `1-23` or `1:23`.

To get all of them at once:

```bash
node dist/index.js layers --page "Men's Basketball" --depth 3
```

See [tagging.md](tagging.md#or-list-them-all-at-once).

Two fields decide whether a run works at all:

- **`section`** — the `figmaId` of the container every element's position is
  measured against. Pass A cannot run without it on both sides.
- **`viewport.width`** — should match your Figma frame width, or width
  comparisons will drift for reasons that are not build defects.

Full reference: [configuration.md](configuration.md).

## Run

```bash
npm run build
npm run check -- --config tovi.config.json --report out/report.html
```

Or, once built, via the binary name:

```bash
node dist/index.js check -c tovi.config.json -r out/report.html -j out/report.json
```

### Options

| Flag | Meaning |
| --- | --- |
| `-c, --config <path>` | Config file. Default `tovi.config.json` |
| `-r, --report <path>` | Write a standalone HTML report |
| `-j, --json <path>` | Write the raw `RunReport` JSON |
| `-u, --url <url>` | Override the config's `url` |
| `-s, --screenshot <path>` | Capture a full-page screenshot |
| `--no-fail` | Exit `0` even when mismatches are found |

Exit code is `1` when any error-severity issue is found, `0` otherwise.
Warnings alone never fail a run. See [reports.md](reports.md).

## Or skip the JSON

```bash
npm run build
npm run ui
```

Serves a local UI for the same run, where elements are added by clicking Figma
layers rather than typing node ids. See [ui.md](ui.md).

## Verify your setup

```bash
npm run typecheck   # tsc --noEmit over src + tests
npm test            # 244 tests
```

The integration suite drives real Chromium against
[tests/fixtures/page.html](../tests/fixtures/page.html) and **skips itself** if
the browser has not been downloaded — so a green `npm test` without
`playwright install` means less than it appears to.

## First run, realistically

Expect the first run against a real page to surface findings that are not build
defects: a cookie banner shifting layout, lazy-loaded images measuring `0×0`,
or a font whose Figma weight (`350`) has no `@font-face` counterpart. These are
anticipated and catalogued in [troubleshooting.md](troubleshooting.md). Triage
them before tightening tolerances.
