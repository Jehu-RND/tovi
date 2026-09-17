# Architecture

TOVI is a four-stage pipeline with plain-data contracts between every stage.
There is no AI, no heuristics, and no hidden state: a run is a pure function of
`(FigmaSpec, LiveStyles, Tolerances) -> Issue[]`.

```
   config/            figma/                compare/           report/
 ┌──────────┐   ┌──────────────────┐   ┌───────────────┐   ┌──────────────┐
 │ load +   │──▶│ REST client      │──▶│ Pass B (text) │──▶│ merge/group  │
 │ validate │   │ + normalize      │   │ Pass A (geom) │   │ + counters   │
 └──────────┘   └──────────────────┘   └───────────────┘   └──────────────┘
      │            FigmaSpec  ─────────────▶    ▲                  │
      │                                          │                  ▼
      │         ┌──────────────────┐             │           HTML / JSON
      └────────▶│ live/ Playwright │─────────────┘           + exit code
                │ extract          │  LiveStyles
                └──────────────────┘
```

Shared domain types live in [src/types.ts](../src/types.ts); report types in
[src/report/types.ts](../src/report/types.ts).

## Module map

| Path | LOC | Responsibility |
| --- | --- | --- |
| [index.ts](../src/index.ts) | 532 | CLI (commander), `executeRun()`, `runCheck()`, `compareAll()` |
| [types.ts](../src/types.ts) | 234 | Shared domain types — the contract between stages |
| [config/schema.ts](../src/config/schema.ts) | 142 | Config types, `DEFAULT_TOLERANCES`, font aliases |
| [config/loadConfig.ts](../src/config/loadConfig.ts) | 318 | Strict validation; every error names its path |
| [figma/client.ts](../src/figma/client.ts) | 250 | REST client: auth, chunking, retries, typed errors |
| [figma/normalize.ts](../src/figma/normalize.ts) | 414 | `RawFigmaNode -> FigmaSpec`; owns every Figma quirk |
| [figma/layers.ts](../src/figma/layers.ts) | 192 | Layer discovery: flatten the tree, select pages by word tokens |
| [live/extract.ts](../src/live/extract.ts) | 464 | Playwright extraction; owns every browser quirk |
| [live/probe.ts](../src/live/probe.ts) | 194 | Selector probe — an authoring aid, never in the comparison path |
| [compare/color.ts](../src/compare/color.ts) | 133 | Color normalization and CIEDE2000 distance |
| [compare/issues.ts](../src/compare/issues.ts) | 179 | Shared `Issue` construction, rounding, formatting |
| [compare/textPass.ts](../src/compare/textPass.ts) | 211 | Pass B — five text properties |
| [compare/geometryPass.ts](../src/compare/geometryPass.ts) | 442 | Pass A — section-relative normalization |
| [report/merge.ts](../src/report/merge.ts) | 194 | Grouping, counters, deterministic ordering |
| [report/types.ts](../src/report/types.ts) | 154 | `Issue`, `ElementReport`, `RunReport` |
| [report/html.ts](../src/report/html.ts) | 342 | Self-contained HTML + text summary |
| [ui/server.ts](../src/ui/server.ts) | 373 | Local UI server; loopback only, token stays server-side |
| [ui/page.ts](../src/ui/page.ts) | 1195 | The UI's single page, as a string (tsc copies no assets) |

## The stage contracts

Everything crossing a stage boundary is plain data — no classes with behaviour,
no lazy getters, no references back to the previous stage.

```ts
figma/   -> FigmaSpec    // design intent, from the REST API
live/    -> LiveStyles   // observed reality, from Playwright
compare/ -> Issue[]      // deltas that exceeded tolerance
report/  -> RunReport    // grouped, counted, rendered
```

`FigmaSpec` and `LiveStyles` are deliberately near-identical in shape. The
difference is **optionality**: on the Figma side an absent field means the
design genuinely does not set that property, and the comparison passes skip any
property missing on either side.

### Where the quirks live

Each boundary module owns the messiness of its own source, so the comparison
passes only ever see clean, CSS-comparable numbers in the same units.

| Quirk | Owned by |
| --- | --- |
| 0–1 float RGBA → `Rgba` | `figma/normalize.ts` via `compare/color.ts` |
| Line height as a percentage → px | `figma/normalize.ts` |
| One `cornerRadius` → four corners | `figma/normalize.ts` |
| `node-id=1-23` vs `1:23` | `figma/client.ts` |
| `rgb()` / `rgba()` / `color()` strings → `Rgba` | `live/extract.ts` via `compare/color.ts` |
| `box-shadow` string parsing | `live/extract.ts` |
| Percentage `border-radius` → px | `live/extract.ts` |
| `line-height: normal` → `NaN` | `live/extract.ts`, skipped by Pass B |

If you find yourself writing `if (isFigma)` inside a comparison pass, the fix
belongs in a normalizer instead.

## Run flow

`runCheck()` in [index.ts](../src/index.ts) is the whole orchestration:

1. **Load config.** `loadConfig()` reads, parses, and strictly validates. `--url`
   overrides the config's URL after validation.
2. **Fetch the design side.** `createFigmaClient()` reads `FIGMA_TOKEN` from the
   environment and `getNodes()` fetches every configured `nodeId`. Each raw node
   is passed through `normalizeFigmaNode()`; a node that cannot be expressed as
   a `FigmaSpec` becomes a `missingInFigma` issue rather than crashing the run.
3. **Extract the live side.** `extractLiveStyles()` launches Chromium, navigates,
   settles, and measures every element in **one** `page.evaluate()`. Returns
   `styles`, `missing`, and `ambiguous`.
4. **Compare.** `compareAll()` walks the config in order, resolves each element's
   effective tolerances, and dispatches to the configured passes.
5. **Report.** `buildRunReport()` groups issues by element and computes counters;
   `renderHtmlReport()` / `renderTextSummary()` render. Exit code comes from
   `report.status`.

### One pipeline, two front ends

`executeRun()` is the whole comparison — fetch, extract, compare, group — with
none of the CLI's output handling. `runCheck()` wraps it for the terminal and
the UI server calls it directly, so a run started from either produces
byte-identical results.

Any new surface that wants to run a check goes through `executeRun()`. A
parallel copy would give two answers to the same question, which is the one
thing this tool exists not to do.

### Structural short-circuiting

`compareAll()` reports a structural problem **once**, not once per pass, and
stops there for that element. Two passes both saying "this element is missing"
is the same fact twice, and comparing against a side that is not there would
emit a dozen property failures that all restate it.

Order of checks per element: ambiguous → missing in Figma → missing live → run
the passes.

### The section, and honest skipping

Pass A needs a `SectionContext` — the container rect on **both** sides. When
either side is unavailable, the element gets an `info`-severity `skipped` issue
naming the container, and no geometry comparison runs.

This is the single most important invariant in the codebase: **an absent check
must never look like a passing check.** Any change that makes a comparison
quietly not run needs to emit something.

## Determinism

Two runs over an unchanged page must produce byte-identical reports. Diffing
reports across builds is the main reason the JSON output exists, and it stops
working the moment ordering wobbles.

What enforces it:

| Mechanism | Where |
| --- | --- |
| Animations and transitions zeroed, `scroll-behavior: auto` | `live/extract.ts` |
| `load` + `document.fonts.ready` + a fixed settle before measuring — never network-idle, whose timing depends on third parties | `live/extract.ts` |
| Viewport pinned; the page is never scrolled | `live/extract.ts` |
| Elements sorted by config order | `report/merge.ts` |
| Issues sorted by severity, then a fixed property order, then `detail` | `report/merge.ts` |
| Deltas rounded to 3 decimals before comparison | `compare/issues.ts` |

If you add a new `IssueProperty`, add it to `PROPERTY_ORDER` in
[report/merge.ts](../src/report/merge.ts) too — an unlisted property sorts last
and its position becomes insertion-dependent.

## Error handling

Each stage has one typed error, thrown with a message that says what to actually
do rather than what went wrong internally:

| Error | Thrown by | For |
| --- | --- | --- |
| `ConfigError` | `config/loadConfig.ts` | Unreadable, malformed, or invalid config. Carries the offending path |
| `FigmaApiError` | `figma/client.ts` | Transport, auth, and unknown-file failures. Carries the HTTP status |
| `FigmaNormalizeError` | `figma/normalize.ts` | A node that cannot become a `FigmaSpec` |
| `ExtractionError` | `live/extract.ts` | Navigation and browser-level failures |

HTTP failures are translated into actionable text: a `401` says to check the
token's scope and the account's access to that file, not just "unauthorized".

### Network resilience

The Figma client chunks requests at **50 node ids** to stay inside URL length
limits, and retries `429` and `5xx` responses up to **3 times** with exponential
backoff from 500ms, honouring `Retry-After` when Figma sends it.

Node ids Figma does not return are **absent** from the result map rather than
present-and-null, so callers must check — which `runCheck()` does, turning a
missing node into a reportable issue.

## Security posture

| Concern | Handling |
| --- | --- |
| Figma token | `FIGMA_TOKEN` env var only. Never read from config, never logged, never written to a report |
| `.env` vs CI | `process.loadEnvFile` does not overwrite existing variables, so CI-injected values always win |
| Report XSS | Every interpolated value is escaped. Layer names come from a design file and text from a live page — both untrusted |
| Color swatches | `isColorValue()` constrains a value to digits and commas before it can reach a `style` attribute |
| Report offline | Self-contained HTML: inline CSS, no external assets, no CDN scripts |

## Tests

181 tests across 11 files, one per module boundary.

| File | Covers |
| --- | --- |
| `loadConfig.test.ts` | Validation rules and tolerance merging |
| `normalize.test.ts` | Figma quirks: fills, radii, padding, shadows, text |
| `extract.test.ts` | Pure helpers: shadow parsing, selectors, live normalization |
| `extract.integration.test.ts` | **Real Chromium** against `tests/fixtures/page.html` |
| `textPass.test.ts` | Pass B, including skip behaviour |
| `geometryPass.test.ts` | Pass A, including the coordinate-space guard |
| `compareAll.test.ts` | Comparison wiring without network or browser |
| `html.test.ts` | Escaping, swatch safety, rendering |
| `layers.test.ts` | Layer flattening, page selection by word tokens |
| `uiServer.test.ts` | UI routing, config validation, the token boundary |
| `probe.integration.test.ts` | **Real Chromium** — selector matching and candidates |

Both integration suites **skip themselves** when Chromium has not been
downloaded, so a green run without `npx playwright install chromium` covers
less than it looks.

`compareAll()` is exported from `index.ts` specifically so tests can exercise
the full comparison wiring by passing specs and styles in directly — no network,
no browser. Prefer extending that over mocking.

## Conventions

- **ES modules, `NodeNext`.** Relative imports carry a `.js` extension even in
  TypeScript source.
- **Strict TypeScript**, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Optional fields are spread conditionally
  (`...(x !== undefined ? { x } : {})`) rather than assigned `undefined`.
- **Comments explain why, not what.** The coordinate-space note in
  `geometryPass.ts` is the model: it exists because the obvious implementation
  is wrong, and a future reader needs to know that before editing.
