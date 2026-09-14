# TOVI documentation

**True-to-Figma Output Validation Inspector** — a deterministic CLI that compares a
Figma design against a live page and reports where the build drifted.

A run is a pure function of `(Figma spec, live styles, tolerances) -> issues`.
No AI, no heuristics, no fuzzy matching. Same inputs, same output, every time —
which is what makes it usable in CI.

## Start here

| Guide | Read it when |
| --- | --- |
| [Getting started](getting-started.md) | Installing TOVI and getting a first report out |
| [The local UI](ui.md) | Running checks without hand-editing JSON |
| [Tagging elements](tagging.md) | Adding `data-figma-id` to a theme or template |
| [Configuration](configuration.md) | Authoring or tuning `tovi.config.json` |
| [Comparison passes](comparison.md) | Understanding what is compared and how |
| [Reports and exit codes](reports.md) | Reading output, or consuming the JSON |
| [Architecture](architecture.md) | Changing the code |
| [CI integration](ci.md) | Running TOVI on deploy |
| [Troubleshooting](troubleshooting.md) | A finding looks wrong, or a run behaves oddly |

Working on the codebase with an AI assistant? Start at [AGENTS.md](../AGENTS.md).

## The idea in sixty seconds

1. You tag elements in your HTML with `data-figma-id="hero-heading"`.
2. You map each of those labels to a Figma `nodeId` in `tovi.config.json`.
3. TOVI fetches those nodes from the Figma REST API and measures the same
   elements in a real Chromium via Playwright.
4. Two passes compare the sides against per-property tolerances:
   **Pass B (text)** for how type is set, **Pass A (geometry)** for size,
   position, padding, radius, color, and shadow.
5. Anything past tolerance becomes an `Issue`. Errors exit `1`; warnings do not.

The one non-obvious part is **coordinate normalization**: Figma canvas space and
browser viewport space are never compared directly. Both sides are measured
relative to a shared section container first. See
[comparison.md](comparison.md#coordinate-normalization) — it is the design
decision the whole tool rests on.

## Project status

The engine is feature-complete and covered by 100 passing tests, including an
integration suite that drives real Chromium. It has **not yet been run against a
real production page** — see [PROGRESS.md](../PROGRESS.md) for the honest state
of things, known gaps, and what is blocked on whom.
