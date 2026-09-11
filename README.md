# TOVI

**True-to-Figma Output Validation Inspector.**

TOVI is a deterministic CLI that compares a Figma design against a live
WordPress page and reports where the build drifted from the design.

There is **no AI in this tool.** A run is a pure function of
`(Figma spec, live styles, tolerances) -> issues`. Same inputs, same output,
every time — which is what makes it usable in CI.

## How elements are paired

Every element you want checked carries a `data-figma-id` attribute in the HTML
whose value is exactly the **Figma layer name**:

```html
<h1 data-figma-id="hero-heading">Ship faster</h1>
```

```
Figma layer:  hero-heading
```

That shared key is the only link between the two sides. No fuzzy matching, no
position-based guessing — if the attribute is missing or misspelled, TOVI
reports the element as unpaired rather than trying to figure it out.

## The two passes

Both passes are pure numeric/logic comparisons against per-property tolerances.

### Pass B — text

Compares how the type is set:

| Property | Source |
| --- | --- |
| `font-family` | exact match on the first family in the stack |
| `font-size` | px |
| `font-weight` | numeric 100–900 |
| `line-height` | px (Figma percentages resolved during normalization) |
| `letter-spacing` | px |

Pass B is deliberately position-blind. It never looks at where text sits, only
at how it is set, so it stays stable across layout reflow.

### Pass A — geometry & spec

Compares Figma Dev Mode spec values against the live element's
`getBoundingClientRect()` + `getComputedStyle()`:

- size (width, height)
- relative position / spacing
- padding (per side)
- corner radius (per corner)
- color (background and text, compared perceptually)
- shadow (offset, blur, spread, color)

**Coordinate normalization.** Figma canvas coordinates and browser viewport
coordinates are unrelated spaces and are never compared directly. Figma's
origin moves whenever a designer drags the frame; the browser's shifts with
scroll and page chrome. So positions are normalized against the section
container first — on each side independently:

```
offsetX = element.x - section.x
offsetY = element.y - section.y
```

Those relative offsets are what gets compared. Sizes need no such treatment.
See the full note at the top of [geometryPass.ts](src/compare/geometryPass.ts).

## Setup

```bash
npm install
npx playwright install chromium

cp .env.example .env          # add your FIGMA_TOKEN
cp tovi.config.example.json tovi.config.json
```

The Figma personal access token is read from the `FIGMA_TOKEN` environment
variable only. It is never stored in the config file and never written to a
report.

## Running

```bash
npm run build
npm run check -- --config tovi.config.json --report out/report.html
```

Options:

| Flag | Meaning |
| --- | --- |
| `-c, --config <path>` | config file (default `tovi.config.json`) |
| `-r, --report <path>` | write a standalone HTML report |
| `-j, --json <path>` | write the raw `RunReport` JSON |
| `-u, --url <url>` | override the config's URL |
| `-s, --screenshot <path>` | capture a full-page screenshot |
| `--no-fail` | exit 0 even when mismatches are found |

Exit code is `1` when any error-severity issue is found, `0` otherwise.
Warnings alone do not fail a run.

## Configuration

See [tovi.config.example.json](tovi.config.example.json). The two things worth
understanding:

- **`section`** — the `figmaId` of the container every element's position is
  measured against. Pass A cannot run without it.
- **`tolerances`** — per-property thresholds, overridable per element. The
  defaults in [schema.ts](src/config/schema.ts) assume sub-pixel rounding and
  font hinting make an exact-match policy pure noise. `color` is a CIEDE2000
  deltaE, not a per-channel difference.

Your Figma frame width should match the configured `viewport.width`.

## Project status

**Scaffolding.** The types and function signatures are in place; the
implementations are stubs marked with `TODO`. Tests are written but skipped
until the code they cover exists.

## Layout

```
src/
  index.ts            CLI entry (commander)
  types.ts            shared domain types
  config/             config schema + loading
  figma/              REST client + node normalization
  live/               Playwright extraction
  compare/            the two passes + color normalization
  report/             issue grouping + HTML rendering
tests/                one placeholder suite per pass
```

## Stack

Node 20+ / TypeScript (ES modules) · Figma REST API · Playwright (Chromium) ·
[culori](https://culorijs.org/) for all color math · commander · vitest
