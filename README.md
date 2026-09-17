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

The config maps each `figmaId` to an explicit Figma `nodeId`, so the Figma side
is located by node id and the HTML side by attribute. **Your Figma layer names
do not have to match anything** — `figmaId` is just a label you choose. That
matters in practice: real files are full of `Frame 31306` and six layers all
called `Button`, which name-based pairing could never resolve.

No fuzzy matching, no position-based guessing. If the attribute is missing,
TOVI reports the element as unpaired; if two elements share one, it reports the
key as ambiguous rather than picking one.

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
- border (per side: width, and colour where one is drawn)
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

## Documentation

Full docs live in [docs/](docs/):

| Guide | |
| --- | --- |
| [Getting started](docs/getting-started.md) | Install, configure, first report |
| [The local UI](docs/ui.md) | Running checks without hand-editing JSON |
| [Tagging elements](docs/tagging.md) | Adding `data-figma-id` to a theme |
| [Configuration](docs/configuration.md) | Full `tovi.config.json` reference |
| [Comparison passes](docs/comparison.md) | What is compared, and how |
| [Reports and exit codes](docs/reports.md) | Reading and consuming the output |
| [Architecture](docs/architecture.md) | Pipeline, contracts, invariants |
| [CI integration](docs/ci.md) | Running TOVI on deploy |
| [Troubleshooting](docs/troubleshooting.md) | When a finding looks wrong |

Picking this up cold? Start at [HANDOFF.md](HANDOFF.md). Current work is tracked
in [TASKS.md](TASKS.md). Contributing — human or AI —
starts at [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

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

### The local UI

```bash
npm run ui
```

Serves a local UI at `http://127.0.0.1:4479` for running checks and building a
config by clicking Figma layers instead of typing node ids. It calls the same
`executeRun()` the CLI does, so a UI run and a CLI run agree exactly. See
[docs/ui.md](docs/ui.md).

### Finding node ids

```bash
node dist/index.js layers --page "Men's Basketball" --depth 3
```

Lists a file's layers with their node ids, so a config can be assembled rather
than typed. Needs only `FIGMA_TOKEN` and a file key — not a config.

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

Feature-complete for a first run: every module is implemented, and the full
pipeline has been exercised end to end against a real Figma file.

`npm test` runs 244 tests. Two integration suites drive real Chromium against
[tests/fixtures/page.html](tests/fixtures/page.html) and
[tests/fixtures/hardening.html](tests/fixtures/hardening.html), and skip
themselves if the browser is not downloaded.

### Known gaps

- **`line-height: normal` cannot be compared.** It is font-dependent, so there
  is no honest number to compare against. It is reported as an info-severity
  skip rather than dropped silently.
- **Gradients only compare when flat.** A gradient whose stops are all one
  colour is compared as that colour; a real gradient is skipped.
- **Text is compared per element, not per text run.** A paragraph with mixed
  styling is compared against the Figma node's dominant style.
- **Page furniture must be declared, not detected.** A cookie banner or promo
  bar is hidden before measuring only if the config names it in `overlays`.
  Guessing which parts of a page are "not the design" is the kind of heuristic
  this tool keeps out of a run.

### Environment

The CLI loads `.env` on startup via `process.loadEnvFile` (Node 20.12+). Real
environment variables take precedence, so a local `.env` can never override a
token injected by CI.

## Layout

```
src/
  index.ts            CLI entry (commander)
  ui/                 local UI server + page
  types.ts            shared domain types
  config/             config schema + loading
  figma/              REST client + node normalization
  live/               Playwright extraction
  compare/            the two passes + color and Issue helpers
  report/             issue grouping + HTML rendering
tests/                one suite per module boundary
```

## Repository

```
HANDOFF.md            read first — state, decisions, what to do next
TASKS.md              task board — todo / in progress / done
.github/workflows/    CI (typecheck/test/build) + design-check
AGENTS.md             instructions for AI coding agents (and humans)
CLAUDE.md             Claude Code pointer -> AGENTS.md
CONTRIBUTING.md       setup, gate, conventions
docs/                 full documentation
.claude/
  settings.json       permissions
  commands/           /verify /add-element /add-property /triage /sync-docs /first-run
  agents/             determinism-auditor, figma-mapper
```

## Stack

Node 20+ / TypeScript (ES modules) · Figma REST API · Playwright (Chromium) ·
[culori](https://culorijs.org/) for all color math · commander · vitest
