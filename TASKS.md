# TOVI — Tasks

Three statuses only: **Todo** · **In Progress** · **Done**.

_Last updated: 2026-09-14_

| Status | Count |
| --- | --- |
| Done | 24 |
| In Progress | 2 |
| Todo | 20 |

Narrative status, estimates, and the reasoning behind the remaining work live in
[PROGRESS.md](PROGRESS.md). This file is the task list.

---

## In Progress

Both items are **blocked on external input**, not mid-implementation. Nothing in
the codebase is currently half-written — the engine is at a clean stopping point.

| ID | Task | Blocked on |
| --- | --- | --- |
| P-01 | **Tag the WordPress theme.** Add `data-figma-id` to the hero elements in the theme templates. Slugs are chosen freely — they do not need to match Figma layer names. | You. Requires theme template access |
| P-02 | **First real run.** Point TOVI at the live URL, triage what comes back, separate real defects from environmental artifacts. | The live URL, and P-01 |

P-02 is the single biggest risk in the project. Everything the tool does has been
verified against a controlled fixture; none of it has been verified against a
real WordPress page.

---

## Todo

### Real-site hardening — 1–2 days

Unblocked by P-02. Each is a specific risk that is easier to anticipate than to
debug, catalogued in [docs/troubleshooting.md](docs/troubleshooting.md).

| ID | Task | Notes |
| --- | --- | --- |
| T-01 | Confirm the Figma frame width matches `viewport.width` | Frame is 1728px. A mismatch drifts every width comparison |
| T-02 | Decide the `fontWeight` tolerance for Gotham | Figma reports `350`; if the theme declares 300/400, the default tolerance of `0` flags every heading. Real finding or artifact — unknowable until P-02 |
| T-03 | Handle cookie banner / promo bar offset | Absorbed by normalization only when the banner sits *outside* the section |
| T-04 | Handle lazy-loaded images measuring `0×0` | The extractor never scrolls, by design. Needs explicit sizing or `loading="eager"` |
| T-05 | Confirm sticky-header behaviour at scroll 0 | Measured expanded; verify that is what the design shows |
| T-06 | Triage false positives and tune tolerances | The output of P-02. A check that cries wolf gets ignored |

### Config authoring ergonomics — 0.5 day

| ID | Task | Notes |
| --- | --- | --- |
| T-07 | Build `tovi layers` discovery command | `tovi layers --page "Men's Basketball"` dumps node ids and names so configs are assembled, not typed |
| T-08 | Scaffold a config from discovered layers | Follows T-07. Removes the hand-typed `figmaId` → `nodeId` typo surface |

### Comparison coverage

| ID | Task | Est. | Notes |
| --- | --- | --- | --- |
| T-09 | **Compare borders / strokes** | 0.5 day | Highest-value gap. Outline buttons have no fill at all — TOVI checks their box but not what makes them look like buttons. Note `strokeAlign`: `INSIDE` maps to CSS `border`, `CENTER`/`OUTSIDE` do not |
| T-10 | Compare real gradients | — | Only flat gradients compare today; a multi-stop gradient is skipped |
| T-11 | Compare text per run, not per element | — | A paragraph with mixed styling compares against the node's dominant style |
| T-12 | Decide on `line-height: normal` | — | Skipped rather than flagged, because it is font-dependent and has no honest comparison value. Decide whether a warning is better than silence |

### Reporting

| ID | Task | Est. | Notes |
| --- | --- | --- | --- |
| T-13 | Embed the screenshot in the report | 2 hours | Currently linked by path, so the report breaks if moved away from the image |
| T-14 | Baseline JSON + drift-diff command | — | Reports are byte-identical between runs, so diffing a committed baseline shows *new* drift rather than total drift |

### Responsive

| ID | Task | Est. | Notes |
| --- | --- | --- | --- |
| T-15 | Multiple viewports in one run | 0.5 day | One viewport per run today; mobile needs a second config and a second invocation |

### CI and automation

| ID | Task | Notes |
| --- | --- | --- |
| T-16 | Add `.github/workflows/design-check.yml` | The recipe is documented in [docs/ci.md](docs/ci.md); no live workflow file exists yet |
| T-17 | Configure `FIGMA_TOKEN` secret and staging URL variable | Prerequisite for T-16 |
| T-18 | Start in report-only mode (`--no-fail`), tighten later | Right setting for the first weeks on a real page |

### Project

| ID | Task | Notes |
| --- | --- | --- |
| T-19 | Decide licence and distribution | Currently `UNLICENSED` / `private: true` |
| T-20 | Update PROGRESS.md percentage after P-02 | Currently ~65%. Real-site hardening is 20% of the total and sits at 0% |

---

## Done

### Comparison engine

| ID | Task |
| --- | --- |
| D-01 | Shared domain types — the contract between all four stages (`types.ts`, `report/types.ts`) |
| D-02 | Config schema and strict validation; every error names the exact path that is wrong (`config/`) |
| D-03 | Color normalization and CIEDE2000 perceptual distance, with alpha checked separately (`compare/color.ts`) |
| D-04 | Shared `Issue` construction — rounding, formatting, severity in one place (`compare/issues.ts`) |
| D-05 | **Pass B — text.** Font family, size, weight, line-height, letter-spacing. Deliberately position-blind |
| D-06 | **Pass A — geometry.** Size, position, padding, corner radius, color, shadow |
| D-07 | **Section-relative coordinate normalization**, locked in by a test that fails if absolute comparison returns |
| D-08 | Figma REST client — auth, 50-id chunking, retries on 429/5xx, typed errors with actionable messages |
| D-09 | Figma node normalization — fills, radii, padding, shadows, text metrics |
| D-10 | Playwright extraction — single `page.evaluate()`, pinned viewport, animations neutralized, never scrolls |
| D-11 | Report merge with fully deterministic ordering |
| D-12 | Self-contained HTML report — inline CSS, no network, every value escaped |
| D-13 | CLI entry and full `runCheck()` wiring |

### The two hard problems

| ID | Task |
| --- | --- |
| D-14 | **Coordinate spaces solved.** The real frame sits at canvas `(-94257, -63049)`; the browser reports `(120, 176)`. Each side normalizes against its own section container, so what compares is "how far into its section does this start" |
| D-15 | **Color comparison solved.** CIEDE2000, with the tolerance of `2` calibrated between `#0066FF` vs `#0067FF` (0.34, invisible) and `#0066FF` vs `#0070FF` (3.49, visible) |

### Verification

| ID | Task |
| --- | --- |
| D-16 | 100 tests across 8 suites, one per module boundary |
| D-17 | Verified against the **real Figma REST API** — fills, text metrics, padding, and the TEXT-vs-frame fill distinction all confirmed on live data |
| D-18 | Verified against **real Chromium** — percentage border-radius, computed `box-shadow` parsing, NaN survival across the Playwright bridge |
| D-19 | **Full pipeline validated** — real Figma nodes vs a local fixture with three planted defects. All three caught, plus a missing element, with zero false positives |

### Documentation and repo setup

| ID | Task |
| --- | --- |
| D-20 | `docs/` — nine guides: getting started, tagging, configuration, comparison, reports, architecture, CI, troubleshooting, index |
| D-21 | `AGENTS.md` — single source of truth for agents and humans, built around seven named invariants |
| D-22 | Assistant pointers — `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/` |
| D-23 | `.claude/` — six slash commands, two subagents, permission settings |
| D-24 | `CONTRIBUTING.md`, `.editorconfig`, and gitignore hardening for `tovi.config.json` and `.claude/settings.local.json` |

---

## Notes

**The CI gap is half closed.** PROGRESS.md listed "No CI recipe" as unbuilt; the
recipe now exists in [docs/ci.md](docs/ci.md) (D-20), but no live workflow file
does. That is T-16.

**Effort estimates** come from PROGRESS.md and are unchanged. The remaining work
is roughly 3–4 days, of which 1–2 days is real-site hardening that cannot start
until P-02 unblocks.
