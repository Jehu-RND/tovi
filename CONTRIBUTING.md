# Contributing

Working with an AI assistant? Read [AGENTS.md](AGENTS.md) — it is the same
guidance, written for agents, and it is the single source of truth.

## Setup

```bash
npm install
npx playwright install chromium
npm run build
```

Node 20.12+ is required (`process.loadEnvFile`).

## The gate

```bash
npm run typecheck && npm test
```

Both must pass before a change is done. The baseline is **247 tests across 12
files**.

`npm test` **passes without Chromium** — `tests/extract.integration.test.ts`
skips itself when the browser is absent. If you touched
[src/live/extract.ts](src/live/extract.ts), confirm the integration suite
actually ran.

## The invariants

Full explanations in [AGENTS.md](AGENTS.md#invariants--do-not-break-these). Each
exists because the obvious implementation is wrong; each is guarded by a test.

1. **Never compare Figma canvas coordinates to browser viewport coordinates.**
   Positions normalize against a section container on each side independently.
2. **Measure every element in a single `page.evaluate()`, and never scroll.**
   A correctness requirement, not an optimization.
3. **An absent check must never look like a passing check.**
4. **Output must be byte-identical between runs.**
5. **The Figma token comes from `FIGMA_TOKEN` only.**
6. **Colors compare perceptually (CIEDE2000), never per channel.**
7. **Escape every value interpolated into a report.**

## Conventions

- ES modules, `NodeNext` — relative imports carry a `.js` extension in TypeScript
  source.
- Strict TypeScript with `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Spread optional fields conditionally
  (`...(x !== undefined ? { x } : {})`); never assign `undefined`.
- Build issues through the helpers in
  [src/compare/issues.ts](src/compare/issues.ts), never inline.
- Boundary modules own their source's quirks. An `if (isFigma)` inside a
  comparison pass means the fix belongs in a normalizer.
- **Comments explain why, not what.** Read the header of
  [src/compare/geometryPass.ts](src/compare/geometryPass.ts) before writing
  comments near it — that is the standard.

## Tests

Extend the existing suites rather than adding parallel ones. `compareAll()` is
exported from [src/index.ts](src/index.ts) so the full comparison wiring can be
tested with specs and styles passed in directly — no network, no browser. Prefer
that over mocking.

A new comparison needs four tests: within tolerance, past tolerance, absent on
one side (skipped), and correct `delta` sign.

## Adding a compared property

Seven places, all of them:

1. `src/types.ts` — the field on `FigmaSpec` and `LiveStyles`
2. `src/figma/normalize.ts` — extraction and unit normalization
3. `src/live/extract.ts` — extraction and unit normalization
4. `src/config/schema.ts` — tolerance key and calibrated default
5. `src/report/types.ts` — the `IssueProperty`, **and** `PROPERTY_ORDER` in
   `src/report/merge.ts`
6. The pass itself
7. Tests, plus `docs/comparison.md` and `docs/configuration.md`

## Judgement

- **Don't weaken a check to make a run pass.** Fix the normalizer or document the
  tolerance; deleting a comparison is not a fix.
- **Don't raise default tolerances** without a measured justification. They are
  calibrated — `color: 2` sits between a deltaE of 0.34 (invisible) and 3.49
  (visible); `fontWeight: 0` is exact because weight normally is.
- **Keep [PROGRESS.md](PROGRESS.md) honest**, including about what has not been
  done.

## Never commit

`.env` · `tovi.config.json` (may contain client URLs — commit
`tovi.config.example.json` instead) · anything under `out/`

All three are gitignored.

## Docs

[docs/](docs/) is the reference. If you change behaviour, update the matching
page — `/sync-docs` audits docs against code if you want a checklist.
