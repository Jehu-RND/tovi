# TOVI — Tasks

Three statuses only: **Todo** · **In Progress** · **Done**.

_Last updated: 2026-09-17_

| Status | Count |
| --- | --- |
| Done | 53 |
| In Progress | 2 |
| Todo | 14 |

Narrative status, estimates, and the reasoning behind the remaining work live in
[PROGRESS.md](PROGRESS.md); [HANDOFF.md](HANDOFF.md) is the read-first summary
of where things actually stand. This file is the task list.

---

## In Progress

Two items, both **blocked on external input**, not mid-implementation. Nothing
in the codebase is currently half-written — the engine is at a clean stopping
point.

| ID | Task | Blocked on |
| --- | --- | --- |
| P-03 | **Decide which "Men's Basketball" frame is authoritative.** The file holds at least three nodes with that name: `11609:7477` (CANVAS, no bounding box, unusable), `11350:4869` (FRAME 1728×6537, 64 loose children) and `13020:20866` (FRAME 1728×5962, properly nested with six real section frames). The 575px difference means these are different revisions. **This blocks meaningful checking of this page** — a run against the wrong frame compares against a design nobody is building to | Whoever owns the design file |
| P-01 | **Tag the WordPress theme.** Add `data-figma-id` to the hero elements in the theme templates. Slugs are chosen freely — they do not need to match Figma layer names. | You. Requires theme template access. Note this is now *optional*: selector pairing works and needs no deploy (see T-31) |

P-02 is **done** — see [docs/triage-001-mens-basketball.md](docs/triage-001-mens-basketball.md).
The engine survived contact with a real page: the hero passed clean and all 35
findings sort cleanly: 19 genuine defects and four explainable classes of
noise, none of them a miscomparison. The
project's biggest risk is retired.

---

## Todo

### Real-site hardening — 1–2 days

Unblocked by P-02. Each is a specific risk that is easier to anticipate than to
debug, catalogued in [docs/troubleshooting.md](docs/troubleshooting.md).

| ID | Task | Notes |
| --- | --- | --- |
| ~~T-01~~ | ~~Confirm the Figma frame width matches `viewport.width`~~ | **Done in triage 001.** Ran at 1728; the hero matched 1728×972 exactly and no width drift was attributable to the viewport |
| ~~T-02~~ | ~~Decide the `fontWeight` tolerance for Gotham~~ | **Answered in triage 001: do not change the tolerance.** The `350` is a variable-font axis value; the same node reports `fontStyle: "Medium"`, which is 500 in CSS, and the build is correct. Loosening the tolerance would hide the genuine Bold-700-vs-600 finding on another node. Superseded by T-28 |
| ~~T-03~~ | ~~Handle cookie banner / promo bar offset~~ | **Done.** A declared `overlays` list of CSS selectors, hidden before anything is measured. The run reports what each hid, *including the ones that hid nothing* — a stale selector is how a config silently stops working. Declared, never detected: there is no list of known banner class names and there must not be one |
| ~~T-04~~ | ~~Handle lazy-loaded images measuring `0×0`~~ | **Done.** Every `<img loading="lazy">` is switched to eager before measuring, with a 5s budget; the run says how many were promoted and how many never arrived. An element that still measures 0×0 gets a `zeroSize` advisory naming the cause. Nothing scrolls — invariant 2 holds. An integration test measures the image at 0×0 *without* the fix, so the trap is proved rather than described |
| ~~T-05~~ | ~~Confirm sticky-header behaviour at scroll 0~~ | **Done, and it is a real risk rather than a real problem.** `#main-header` measured 72px at scroll 0 and matched the design exactly. A `fixed` or `sticky` element's rect is still viewport-anchored, so it now reports a `positioning` advisory — louder when the *section container* is the sticky one, since every offset in the run then rests on a rect that slides |
| ~~T-06~~ | ~~Triage false positives and tune tolerances~~ | **Done in triage 001.** Verdict: no tolerance needs tuning. The noise is four specific causes, addressed by T-27–T-30, not by widening thresholds |
| T-39 | **Re-run triage 001 and diff it** | Four noise classes are gone and three environmental risks are handled, and nobody has confirmed the 35 findings actually drop to the predicted ~19. Reports are byte-identical between runs, so this is a real check rather than a formality. Everything claimed above is arithmetic until it is a measurement |

### From triage 001 — the noise has four causes

**All four are closed.** Each removed a class of false positive **without
weakening a check**: no tolerance was raised and no comparison was deleted.
Full reasoning in
[docs/triage-001-mens-basketball.md](docs/triage-001-mens-basketball.md).

| ID | Task | Notes |
| --- | --- | --- |
| ~~T-27~~ | ~~Warn when a text node's box is not a layout box~~ | **Done, at both ends.** `tovi layers` and the UI's layer list mark the row `hugs text`, so the pairing can be reconsidered before it is made; a run reports an `info` `boxShape` finding beside the deltas it explains. The comparison is untouched — a text element genuinely built at the wrong width still has to fail |
| ~~T-28~~ | ~~Prefer `fontStyle` over the raw numeric `fontWeight`~~ | **Done.** A closed CSS Fonts Level 4 name table; slant, spacing and case ignored; a name outside it (a foundry's `Book`) falls back to Figma's number. Killed the Gotham `350` false positive and left the genuine Bold-700-vs-600 finding standing, pinned by a test |
| ~~T-29~~ | ~~Do not compare box borders on a TEXT node~~ | **Done.** Widths are no longer compared on a TEXT node; the stroke is reported as `info` naming `-webkit-text-stroke`, so it never becomes silence. Borders on every other node type compare exactly as before, pinned by a test |
| ~~T-30~~ | ~~Declared font-family aliases in the config~~ | **Done.** `fontAliases` in the config, read in both directions, normalized the same way the comparison is. Only makes two *names* equal — it cannot mask a size or weight difference, and unrelated fonts still report |
| ~~T-31~~ | ~~Document the pairing traps in `docs/tagging.md`~~ | **Done.** Seven traps, each one that has actually happened: the two node ids in a Figma URL, the container that is not the page (the 526px gap and the `backgroundColor` finding were one bad pairing), pasted screenshots of the live site as layers, a text box that is its glyphs, a design column against a full-bleed element, a selector matching twenty-five things, and page furniture the design does not draw |

### Config authoring ergonomics

| ID | Task | Notes |
| --- | --- | --- |
| T-08 | Scaffold a whole config from discovered layers | `tovi layers` now lists ids; generating element stubs from a selection is the remaining half. **Superseded by T-25** if the UI is built — do not build both |

### AI-assisted suggestions (end-user facing)

Ships **with the tool**, for whoever runs a check — not a dev-time helper. After
the deterministic passes finish, an opt-in layer explains the findings: which
look like real build defects, which look environmental, grouped by root cause,
with a suggested fix. The end user reads it in the report.

Input is the **report plus TOVI's own semantics** — tolerances, coordinate
normalization, the environmental-artifact catalogue in
[troubleshooting.md](docs/troubleshooting.md). Nothing of the user's leaves the
machine except the report: no theme source, no screenshot.

**The boundary that makes this safe:** it runs *after* the comparison, consumes
its output, and can never alter an `Issue`, `RunReport.status`, or the exit
code. The verdict stays a pure function of
`(FigmaSpec, LiveStyles, Tolerances)`.

| ID | Task | Notes |
| --- | --- | --- |
| T-21 | **`--explain` — AI suggestions in the report** | Per finding: real defect vs environmental artifact, and a suggested fix. Groups by root cause, so "every element off by the same `offsetY`" reads as one banner problem rather than N failures. Can also **flag what the passes did not** — a `0×0` element, a suspicious pattern — as clearly-marked observations, never as issues |
| T-22 | **Credentials** | `ANTHROPIC_API_KEY`, or an `ant auth login` OAuth profile the SDK resolves automatically. Needed because this ships to end users; a Pro/Max subscription cannot be used by a third-party CLI. With no credential the feature is simply off and the run proceeds normally |
| T-23 | **Guard the determinism boundary** | Tests asserting the layer cannot alter `Issue[]`, `status`, or the exit code. Off unless `--explain` is passed. A run with the network unplugged must produce an identical verdict and an identical `report.json` |

**Design notes for whoever builds it**

- **`report.json` stays pure.** AI output goes to its own file and its own report
  section. Putting it in `report.json` breaks the byte-identical guarantee that
  baseline diffing (T-14) depends on.
- **A reader must never mistake a suggestion for a measurement.** The report
  section needs to be visually distinct and labelled as generated — TOVI's whole
  credibility is that a red line is a measured fact.
- **Cache the semantics brief.** It is identical across runs, so it belongs
  behind a `cache_control` breakpoint with the volatile report after it.
- Model default `claude-opus-5`, adaptive thinking.
- **When this ships, README's opening line — "There is **no AI** in this tool" —
  stops being true as written** and needs rewording to say the *comparison* has
  no AI in it.

### User interface — developers and QA testers

Today TOVI is a CLI whose config is hand-authored JSON. That is fine for CI and
for a developer, and it is a wall for a QA tester. A local UI to enter a URL,
pick elements, run a check, and read the results opens the tool to the people
most likely to use it daily.

**It has to be a local server, not a static page.** A run drives Playwright and
calls the Figma API — neither is possible from a browser. `tovi ui` starts a
local HTTP server and serves a small front end that calls it. The Figma token
stays server-side and never reaches the browser.

**The UI is a front end to the same `runCheck()`.** A run started from the UI
and a run started from the CLI with the same config must produce byte-identical
output. The UI is for authoring and exploring; CI stays on the CLI.

| ID | Task | Notes |
| --- | --- | --- |
| T-25 | **Visual config builder** | The real unlock. Pick a Figma layer from the `tovi layers` list, pick the matching element on the page, and the UI writes the `figmaId` → `nodeId` mapping. Removes the hand-typed JSON entirely — **supersedes T-08** |
| T-26 | **Results view** | Findings grouped by element with the screenshot alongside, re-run without restarting, and the T-21 suggestions surfaced inline. This is where a QA tester actually lives |

**Design notes**

- **Scope creep is the risk here.** A config builder and a results viewer are
  each a real project. T-24 alone — a form that runs a check and shows the
  existing HTML report — is worth shipping on its own.
- The existing HTML report is a self-contained artifact and should stay one; the
  UI is a separate surface, not a replacement for it.
- No framework is needed for T-24. Reach for one only if T-25/T-26 demand it.

### Comparison coverage

| ID | Task | Est. | Notes |
| --- | --- | --- | --- |
| T-10 | Compare real gradients | — | Only flat gradients compare today; a multi-stop gradient is skipped |
| T-11 | Compare text per run, not per element | — | A paragraph with mixed styling compares against the node's dominant style |

### Reporting

| ID | Task | Est. | Notes |
| --- | --- | --- | --- |
| T-14 | Baseline JSON + drift-diff command | — | Reports are byte-identical between runs, so diffing a committed baseline shows *new* drift rather than total drift |

### Responsive

| ID | Task | Est. | Notes |
| --- | --- | --- | --- |
| T-15 | Multiple viewports in one run | 0.5 day | One viewport per run today; mobile needs a second config and a second invocation |

### CI and automation

| ID | Task | Notes |
| --- | --- | --- |
| T-17 | Add the `FIGMA_TOKEN` secret and commit a `tovi.ci.json` | The two prerequisites `design-check.yml` checks for. Both need repo settings and a real URL |
| T-18 | Flip `fail_on_drift` on once findings are trusted | The workflow ships report-only. All four noise classes are now closed at the source, so the remaining question is a re-run of triage 001 to confirm the 35 findings actually drop to the predicted ~19 |

### Project

| ID | Task | Notes |
| --- | --- | --- |
| T-19 | Decide licence and distribution | Currently `UNLICENSED` / `private: true` |
| ~~T-20~~ | ~~Update PROGRESS.md percentage after P-02~~ | **Done.** ~65% → ~80%; real-site hardening 0% → 55%, config ergonomics 0% → 40% |
| ~~T-40~~ | ~~Update PROGRESS.md after the hardening work~~ | **Done.** ~80% → ~88%; real-site hardening 55% → 75%, and the four triage noise classes closed |

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
| D-16 | 100 tests across 8 suites, one per module boundary (244 across 12 today) |
| D-17 | Verified against the **real Figma REST API** — fills, text metrics, padding, and the TEXT-vs-frame fill distinction all confirmed on live data |
| D-18 | Verified against **real Chromium** — percentage border-radius, computed `box-shadow` parsing, NaN survival across the Playwright bridge |
| D-19 | **Full pipeline validated** — real Figma nodes vs a local fixture with three planted defects. All three caught, plus a missing element, with zero false positives |
| D-25 | **First green run against a real app** — a React app built from a Figma frame: 11 elements, 66 properties compared, `PASS`. Re-running with every tolerance forced to 0 surfaced sub-pixel deltas (0.078px, 0.141px), confirming the pass is a real measurement agreeing rather than a check that did nothing |
| D-26 | **Real-site hardening verified against real Chromium** — `tests/fixtures/hardening.html` puts a 64px promo bar inside the section, a `loading="lazy"` image 10,000px down, and a sticky header on one page. The lazy-image suite measures the image at `0×0` through a plain browser load *before* asserting the fix, so the trap is proved rather than described. `report/merge.ts` also got its first direct suite: `PROPERTY_ORDER` is the only thing keeping two runs byte-identical and rested on code inspection. Test count 181 → 244 |

### Documentation and repo setup

| ID | Task |
| --- | --- |
| D-20 | `docs/` — nine guides: getting started, tagging, configuration, comparison, reports, architecture, CI, troubleshooting, index |
| D-21 | `AGENTS.md` — single source of truth for agents and humans, built around eight named invariants |
| D-22 | Assistant pointers — `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/` |
| D-23 | `.claude/` — six slash commands, three subagents (`determinism-auditor`, `test-auditor`, `figma-mapper`), permission settings |
| D-24 | `CONTRIBUTING.md`, `.editorconfig`, and gitignore hardening for `tovi.config.json` and `.claude/settings.local.json` |

### This session's tickets

| ID | Task |
| --- | --- |
| T-09 | **Borders and strokes compared.** Per-side width and colour, colour only where a border is actually drawn. A non-`INSIDE` `strokeAlign` is flagged as info, since CSS borders are always drawn inside the box. Verified against real Chromium |
| T-12 | **`line-height: normal` decided.** Any text property that cannot be compared now emits an info-severity skip naming the property and why, instead of being dropped — silence was indistinguishable from a pass |
| T-13 | **Screenshot embedded** as a `data:` URI, so the report is a genuine single file. Over 4MB it falls back to a link and the CLI says so |
| T-07 | **`tovi layers` discovery command.** Lists node ids and names, filterable by page, name, type and depth. Needs no config |
| T-16 | **CI workflows shipped** — `ci.yml` (typecheck/test/build, installs Chromium) and `design-check.yml` (manual + weekly, report-only by default) |
| T-32 | **Selectors resolve against the page.** Picking a layer tries a `data-figma-id` attribute, then a class, then an id named after the layer, and adopts whichever matches exactly one element. An edited selector is never rewritten. Removed the guaranteed `missingInLive` on a first run |
| T-33 | **Picking a layer picks its subtree.** One click takes the whole frame, matched against the page so layers that are not real elements are dropped rather than becoming a wall of `no match`. Verified: one click, 11 elements, `PASS` |
| T-34 | **A passing run shows what it verified.** New `Check` records every property compared, with both values, delta and tolerance, surfaced in the UI, the HTML report and the terminal summary. Invariant 3 applied to green runs, not just red ones |
| T-35 | **Live progress during a run.** Six stages streamed over SSE (`POST /api/check/stream`), all listed from the start so a stall points at the step it stalled on. Observational only — the report is byte-identical whether or not anything listens |
| T-36 | **Regression tests for the served UI script.** The page's JS lives in a template literal; two escaping bugs shipped a page whose script died on parse, and nothing caught either. Two tests now compile every inline script from the served page |
| T-37 | **Findings name the element they are about.** The extractor records what the selector actually matched (`section.more-content · 342×122`), carried on every `ElementReport` and shown in the UI, the HTML report and the terminal. A delta is not actionable until the reader knows which `div` it concerns |
| T-38 | **Result tabs — all, passed, failed, errors, warnings.** Filters the report already in hand: no browser, no Figma call, nothing re-measured. Passed/failed are element-level, errors/warnings are finding-level; `properties compared` stays a number, since there is nothing to filter down to |
| T-24 | **`tovi ui` — local web UI.** Loopback-only server, token never reaches the browser. Click a Figma layer to add an element. Calls the same `executeRun()` the CLI does, via a refactor that gave both surfaces one pipeline |

---

## Notes

**Test count is now 244** across 12 suites, up from 100. `npm test` still passes
without Chromium because the integration suite skips itself — install it before
trusting a green run.

**CI needs its own config.** `tovi.config.json` is gitignored because it can name
a client URL, so `design-check.yml` reads a committed `tovi.ci.json`. Copy
[tovi.ci.example.json](tovi.ci.example.json) to start.

**What is left is mostly blocked.** Of the 20 remaining todos, 6 are real-site
hardening that cannot start until P-02 unblocks. The unblocked ones are T-08
(config scaffolding), T-10/T-11 (gradient and per-run text comparison), T-14
(baseline diffing), T-15 (multi-viewport), and T-17/T-18 (wiring the CI secrets).
T-21/T-22/T-23 are the AI suggestion layer; T-25/T-26 extend the UI whose shell
(T-24) now exists.

**Running against the real Figma file found a bug the fixtures could not.** Page
names in the file carry emoji — `Men's Basketball 🏀` — so exact matching never
fired, and the substring fallback selected *both* basketball pages, because
"Women's Basketball" contains the characters of "Men's Basketball". Page
selection now matches on whole word tokens. It is a small reminder that P-02 is
still the biggest risk on this board: fixtures agree with you, real files do
not.

## On credentials

Two different things get confused here, and they have different answers.

**Suggestions for the end user (T-21) need an API key.** The feature ships with
the tool and runs on someone else's machine, so TOVI has to carry its own
credential: `ANTHROPIC_API_KEY`, or an `ant auth login` OAuth profile that the
SDK resolves with a zero-arg client. A third-party CLI **cannot** authenticate a
Claude Pro/Max subscription — there is no public OAuth flow for that — so this
is billed per token, per run, to whoever runs it.

**Helping develop TOVI needs nothing.** That is interactive, development-time
work: Claude Code on an ordinary subscription, using the `.claude/` scaffolding
already in the repo — [`AGENTS.md`](AGENTS.md), six commands, three subagents.
No key, no dependency, no per-run cost.

The deciding factor is *where the AI runs*, not what it reads:

| Where | Auth | Needs an API key |
| --- | --- | --- |
| Interactive, on your machine | Claude Code owns it | **No** — subscription covers it |
| Inside a `tovi` run, on a user's machine | TOVI's own credential | **Yes** |
| Unattended in CI | A token the runner can use | **Yes** |
