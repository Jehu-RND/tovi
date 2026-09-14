# CLAUDE.md

Guidance for Claude Code in this repository.

**Read [AGENTS.md](AGENTS.md) first.** It is the single source of truth for how
this codebase works, its non-negotiable invariants, and the conventions to
follow. This file only adds Claude Code specifics.

## The one-paragraph version

TOVI compares a Figma design against a live page and reports drift. A run is a
pure function of `(FigmaSpec, LiveStyles, Tolerances) -> Issue[]` — **no AI, no
heuristics, no fuzzy matching in the comparison path.** Determinism is the
product.

## Before saying a change is done

```bash
npm run typecheck && npm test
```

Both must pass. `npm test` passes without Chromium because the integration suite
skips itself — if you touched [src/live/extract.ts](src/live/extract.ts), verify
`npx playwright install chromium` has been run and that the integration suite
actually executed.

## The invariants, in one line each

Full explanations in [AGENTS.md](AGENTS.md#invariants--do-not-break-these).

1. Never compare Figma canvas coordinates to browser viewport coordinates.
2. Measure every element in a single `page.evaluate()`; never scroll.
3. An absent check must never look like a passing check.
4. Output must be byte-identical between runs.
5. The Figma token comes from `FIGMA_TOKEN` only.
6. Colors compare perceptually (CIEDE2000), never per channel.
7. Escape every value interpolated into a report.

## Slash commands

| Command | Does |
| --- | --- |
| `/verify` | Typecheck, test, build — the full gate |
| `/add-element` | Add a tagged element to `tovi.config.json` |
| `/add-property` | Walk the full checklist for a new compared property |
| `/triage` | Decide whether a finding is a real defect or an artifact |
| `/sync-docs` | Check docs and PROGRESS.md against the current code |

## Working here

- **Don't weaken a check to make a run pass.** Fix the normalizer, or document
  the tolerance. Deleting a comparison is not a fix.
- **Don't raise default tolerances** without a measured justification — they are
  calibrated, not guessed.
- **Match the comment density.** This codebase documents *why*, especially where
  the obvious implementation would be wrong. Read the header of
  [src/compare/geometryPass.ts](src/compare/geometryPass.ts) before writing
  comments anywhere near it.
- **Keep [PROGRESS.md](PROGRESS.md) honest**, including about what has not been
  done. The tool has never run against a real production page; that fact belongs
  in the file until it changes.

## Never commit

`.env` · `tovi.config.json` (may contain client URLs) · anything in `out/`
