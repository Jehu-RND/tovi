# AGENTS.md

Instructions for AI coding agents working in this repository. Human contributors
should read this too — it is the short version of how the codebase thinks.

> This file is the single source of truth for agent guidance.
> [CLAUDE.md](CLAUDE.md), [.github/copilot-instructions.md](.github/copilot-instructions.md),
> and [.cursor/rules/](.cursor/rules/) all point here. Edit this file, not the pointers.

---

## What TOVI is

A deterministic CLI that compares a Figma design against a live page and reports
where the build drifted.

**There is no AI in this tool.** A run is a pure function of
`(FigmaSpec, LiveStyles, Tolerances) -> Issue[]`. Same inputs, same output, every
time. That property is the product — it is what makes the tool usable in CI and
what makes a red line trustworthy.

Do not add inference, fuzzy matching, similarity scoring, ML, or LLM calls to the
comparison path. If a proposed change makes output depend on anything other than
its declared inputs, it is wrong for this codebase.

---

## Commands

```bash
npm install
npx playwright install chromium     # required for the integration suite

npm run build                       # tsc -> dist/
npm run typecheck                   # tsc --noEmit over src + tests
npm test                            # vitest run — 244 tests
npm run test:watch

npm run check -- --config tovi.config.json --report out/report.html
node dist/index.js layers --page "Men's Basketball" --depth 3
node dist/index.js ui                # local UI on 127.0.0.1:4479
```

**Before declaring any change done: `npm run typecheck && npm test`.** Both must
pass. Report failures with their output rather than describing them.

`npm test` **passes without Chromium** — the integration suite skips itself when
the browser is absent. If you touched [src/live/extract.ts](src/live/extract.ts),
confirm the browser is installed and that `extract.integration.test.ts` actually
ran, or your green result means less than it looks.

---

## Invariants — do not break these

These are not style preferences. Each exists because the obvious implementation
is wrong, and each is guarded by a test.

### 1. Never compare Figma canvas coordinates to browser viewport coordinates

`FigmaSpec.absoluteBoundingBox` is in Figma canvas space — its origin is wherever
the frame sits on an infinite canvas. In the real file this was built against,
the hero frame is at `(-94257, -63049)`. `LiveStyles.boundingRect` is in viewport
space, shifting with scroll and page chrome.

Positions are normalized against a section container on each side independently
(`element.x - section.x`) and only those **relative offsets** are compared.

There is a test that fails loudly if absolute comparison is reintroduced. Do not
delete or weaken it. Full rationale: the header comment in
[src/compare/geometryPass.ts](src/compare/geometryPass.ts).

### 2. Measure every element in a single `page.evaluate()`

Not an optimization — a correctness requirement. `getBoundingClientRect()` is
viewport-relative and Playwright's locator helpers scroll elements into view.
Measuring one at a time reads each against a different scroll origin, and the
section subtraction only cancels scroll out if both rects were measured at the
same scroll position.

The extractor also never scrolls. The cost that used to carry — lazy-loaded
images measuring `0×0` — is paid a different way: every `<img loading="lazy">`
is switched to `eager` before measuring, and the run says how many. Scrolling
to an image is still forbidden; making the image load where it stands is not
the same thing.

Anything else the extractor changes about the page before measuring it —
a declared overlay hidden, an image promoted — is reported as a run note. A page
quietly altered is a page whose numbers cannot be trusted.

### 3. An absent check must never look like a passing check

This is the worst output the tool can produce. When a comparison cannot run, say
so: emit an `info`-severity `skipped` issue naming what was unavailable. Never
silently return an empty issue list, and never fall back to a less correct
comparison to avoid reporting a skip.

The same rule governs everything the run knows and could keep to itself. An
overlay selector that hid nothing, an image that never loaded, a design box
shrink-wrapped to its glyphs — each changes what a number means, and each is
reported. A measurement advisory never suppresses the finding it explains:
trading a false positive for a false negative is the worse trade.

### 4. Output must be byte-identical between runs

Elements follow config order; issues follow severity, then a fixed property
order, then `detail`. Diffing reports across builds is why the JSON output
exists.

If you add an `IssueProperty`, add it to `PROPERTY_ORDER` in
[src/report/merge.ts](src/report/merge.ts) — an unlisted property sorts last and
becomes insertion-dependent.

**The one place the page itself can differ between runs, and what is done about
it.** Images are waited on for a fixed 5s budget after lazy loading is switched
off. An image that lands at 4.9s on one run and 5.1s on the next changes that
element's measured box, so the output is not byte-identical — the page was not
in the same state twice.

That is a trade made deliberately, and it is the better half of it: before, a
deferred image was *reliably* measured at `0×0`, which is deterministic and
wrong. Reproducing a wrong number is not the property this invariant is for.

What the invariant still demands, and what the code does: **the difference is
never silent.** The run reports how many images were still pending, and the
affected element gets a `zeroSize` advisory naming the cause. A diff that moves
therefore always comes with the line explaining why. Do not widen the budget to
make a flaky page settle, and do not remove the pending count to make two
reports match.

### 5. The Figma token comes from `FIGMA_TOKEN` only

Never read it from config, never log it, never write it into a report. Do not add
a config field for it. The file key may live in config; the token may not.

### 6. Colors compare perceptually, never per channel

CIEDE2000 deltaE via culori, with alpha checked separately (deltaE ignores it).
Do not implement color math by hand — culori owns parsing, conversion, and
distance.

### 7. AI never enters the comparison path

An AI suggestion layer for end users is planned (T-21). It is **advisory**: it
runs after the deterministic passes, consumes their output, and explains
findings to whoever ran the check.

It must never alter an `Issue`, `RunReport.status`, or the exit code, and it
must stay behind an opt-in flag. Its output goes to its own file — never into
`report.json`, which has to stay byte-identical for baseline diffing. A run with
the network unplugged must produce an identical verdict and an identical
`report.json`.

The comparison itself stays a pure function of
`(FigmaSpec, LiveStyles, Tolerances)`. That is the property the whole tool is
built on; an advisory layer downstream does not weaken it, and nothing upstream
may.

### 8. Report every interpolated value escaped

Layer names come from a design file and text content from a live page. Both are
untrusted input. `isColorValue()` exists specifically so arbitrary page text can
never reach a `style` attribute.

---

## Architecture in brief

Four stages, plain-data contracts between each:

```
config/   load + strictly validate
figma/    REST client -> normalize -> FigmaSpec      (design intent)
live/     Playwright -> normalize  -> LiveStyles     (observed reality)
compare/  two passes               -> Issue[]        (deltas past tolerance)
report/   group + count            -> RunReport      (HTML / JSON / exit code)
```

**Boundary modules own their source's quirks.** `figma/normalize.ts` owns
0–1 float colors, percentage line heights, and single-value corner radii;
`live/extract.ts` owns CSS color strings, `box-shadow` parsing, percentage radii,
and `line-height: normal` → `NaN`.

The comparison passes only ever see clean, CSS-comparable numbers in matching
units. **If you find yourself writing `if (isFigma)` inside a comparison pass,
the fix belongs in a normalizer.**

Full map: [docs/architecture.md](docs/architecture.md).

### The two passes

- **Pass B — text** ([textPass.ts](src/compare/textPass.ts)): font family, size,
  weight, line-height, letter-spacing. Deliberately **position-blind**, so it
  stays stable across layout reflow. Do not add positional checks here.
- **Pass A — geometry** ([geometryPass.ts](src/compare/geometryPass.ts)): size,
  section-relative position, padding, corner radius, color, shadow.

A property is skipped when absent on either side. An unset design value is not an
assertion that the live value must be zero.

---

## Code conventions

- **ES modules, `NodeNext`.** Relative imports carry a `.js` extension in
  TypeScript source: `import { diffText } from './compare/textPass.js'`.
- **Strict TypeScript**, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Optional fields are spread conditionally:
  ```ts
  ...(detail !== undefined ? { detail } : {})
  ```
  Never assign `undefined` to an optional property.
- **Typed errors per stage:** `ConfigError`, `FigmaApiError`,
  `FigmaNormalizeError`, `ExtractionError`. Messages say what to *do*, not what
  failed internally — compare the 401 message in
  [figma/client.ts](src/figma/client.ts).
- **Build issues through the helpers** in
  [compare/issues.ts](src/compare/issues.ts) — `compareNumeric`, `valueIssue`,
  `structuralIssue`. They own rounding (3 decimals, applied *before* the
  tolerance test), formatting, and default severity. Do not construct `Issue`
  objects inline.
- **Comments explain why, not what.** The coordinate-space note in
  `geometryPass.ts` is the model: it exists because the obvious implementation is
  wrong and a future reader needs to know that before editing. Match the existing
  density — this codebase documents decisions, not syntax.
- No dependencies beyond the four already present (`commander`, `culori`,
  `playwright`, plus dev tooling) without asking first.

---

## Testing

244 tests across 12 suites, one per module boundary. Extend the existing suites
rather than
adding parallel ones.

`compareAll()` is exported from [src/index.ts](src/index.ts) specifically so
tests can exercise the full comparison wiring with specs and styles passed in
directly — no network, no browser. **Prefer that over mocking.**

When adding a comparison, test all four of:

1. Values within tolerance produce **no** issue.
2. Values past tolerance produce one issue with the right `delta` and `tolerance`.
3. A property absent on either side is **skipped**, not compared against
   `undefined` or `NaN`.
4. The reported `delta` sign is correct — `+` means live is larger than design.

---

## Common tasks

### Adding a compared property

1. Add the field to `FigmaSpec` and `LiveStyles` in [src/types.ts](src/types.ts).
2. Extract it in `figma/normalize.ts` and `live/extract.ts`, normalizing units on
   each side.
3. Add a tolerance key to `Tolerances` and `DEFAULT_TOLERANCES` in
   [src/config/schema.ts](src/config/schema.ts).
4. Add the `IssueProperty` in [src/report/types.ts](src/report/types.ts) **and**
   to `PROPERTY_ORDER` in [src/report/merge.ts](src/report/merge.ts).
5. Compare it in the relevant pass via the `issues.ts` helpers.
6. Test all four cases above.
7. Update [docs/comparison.md](docs/comparison.md) and
   [docs/configuration.md](docs/configuration.md).

Borders were added this way and are a good worked example — see
`extractBorders` in [figma/normalize.ts](src/figma/normalize.ts) and
`diffBorders` in [compare/geometryPass.ts](src/compare/geometryPass.ts). The
remaining gaps are listed in [PROGRESS.md](PROGRESS.md).

### Adding a config field

Add it to the interface in `schema.ts`, validate it in `loadConfig.ts` with an
error naming its exact path, test the validation, then document it in
[docs/configuration.md](docs/configuration.md) and update
[tovi.config.example.json](tovi.config.example.json).

Note that unknown top-level and element keys are deliberately **ignored** (this
is how `$comment` works); only tolerance blocks reject unknown keys.

---

## Scope and judgement

- **Do not weaken a check to make a run pass.** If a finding is a false positive,
  fix the normalizer or document the tolerance — do not delete the comparison.
- **Do not raise default tolerances** without a measured justification. The
  defaults are calibrated: `color: 2` sits between a deltaE of 0.34 (invisible)
  and 3.49 (visible); `fontWeight: 0` is exact because weight normally is.
- **Known gaps are documented, not hidden.** Real gradients,
  `line-height: normal`, and per-run text styling are listed in
  [PROGRESS.md](PROGRESS.md) and [docs/comparison.md](docs/comparison.md). Do not
  silently paper over one; do not remove a gap from the list without closing it.
- **PROGRESS.md is honest about status.** Keep it that way. If you change what
  is built, update it — including about what has not been done.
- Never commit `.env`, `tovi.config.json` (it may contain client URLs), or
  anything under `out/`.

---

## Where to look

| Question | File |
| --- | --- |
| I am picking this up cold | [HANDOFF.md](HANDOFF.md) |
| What is this tool? | [README.md](README.md) |
| What is actually built, and what isn't? | [PROGRESS.md](PROGRESS.md) |
| What is being worked on right now? | [TASKS.md](TASKS.md) |
| How do the stages fit together? | [docs/architecture.md](docs/architecture.md) |
| What exactly gets compared? | [docs/comparison.md](docs/comparison.md) |
| What can I put in the config? | [docs/configuration.md](docs/configuration.md) |
| How does the UI work? | [docs/ui.md](docs/ui.md) |
| What does the output mean? | [docs/reports.md](docs/reports.md) |
| Why is this finding wrong? | [docs/troubleshooting.md](docs/troubleshooting.md) |
| The coordinate-space rule | header of [src/compare/geometryPass.ts](src/compare/geometryPass.ts) |
| The single-evaluate rule | header of [src/live/extract.ts](src/live/extract.ts) |
