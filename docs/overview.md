# TOVI — Project Documentation

**True-to-Figma Output Validation Inspector**
_Status: ~90% to MVP · Last updated 18 September 2026_

> Written for engineering leads, QA, and designers deciding what TOVI is for and
> how far to trust it. For working inside the codebase, read
> [AGENTS.md](../AGENTS.md) and [HANDOFF.md](../HANDOFF.md) instead.

## 1. What TOVI is

TOVI compares a Figma design against a live web page and reports where the build
drifted from the design. It reads the design through the Figma REST API,
measures the live page in a real headless browser, and produces a list of
findings: *this heading is 8px smaller than the design says, this container is
124px wider, this text is missing its negative letter-spacing.*

The core commitment is that **a run is a pure function of
`(design, live page, tolerances) → findings`**. There is no AI, no fuzzy
matching, and no heuristic anywhere in the comparison path. The same design and
the same page produce the same report, every time. Determinism is not a
performance characteristic here — it is the product. A tool that says something
slightly different each run cannot be used to decide whether a build regressed.

## 2. Scope

### In scope

- **Visual-spec drift on a page that already exists.** Size, position, spacing,
  colour, borders, shadows, and type metrics.
- **A named, deliberate set of elements.** You choose what gets checked; TOVI
  does not crawl a page and form opinions about it.
- **One page, one viewport, per run.**
- **Both a human and a CI workflow.** A local web UI for authoring and
  exploring; a CLI with a machine-readable exit code for pipelines.

### Explicitly out of scope

- **Pixel-diffing or screenshot comparison.** TOVI compares *measured values*,
  not images. It will never tell you "these look different"; it tells you which
  property differs and by how much.
- **Deciding whether a difference is acceptable.** It reports that the heading
  is 8px smaller. Whether the build legitimately overrode the design is a human
  judgement.
- **Accessibility, performance, functional, or cross-browser testing.** It
  measures one Chromium instance at one viewport.
- **Authoring or changing the design or the build.** It is strictly read-only on
  both sides.

## 3. How a run works

Four stages, in order:

1. **Design side** — fetch the configured Figma nodes over the REST API and
   normalise them (colours, radii, padding, text metrics) into a common shape.
2. **Live side** — launch Chromium at a pinned viewport, load the page, and
   measure every configured element.
3. **Compare** — two passes produce a flat list of findings.
4. **Report** — group by element, apply a fixed ordering, render.

Pairing a design node to a live element is done either by a `data-figma-id`
attribute in the markup or by a CSS selector. Selector pairing needs no code
deploy and is what the pilot used.

## 4. Features

### What is compared

**Pass A — geometry and spec**

| Property | Notes |
| --- | --- |
| width, height | Compared directly |
| offsetX, offsetY | **Section-relative**, never absolute |
| padding | Per side |
| cornerRadius | Per corner, clamped as a browser would |
| border | Per side; colour only where a border is actually drawn |
| backgroundColor, color | Perceptual colour distance |
| shadow | Offset, blur, spread, colour |

**Pass B — text**

Font family, size, weight, line-height, letter-spacing. Deliberately
position-blind, so it stays stable when layout reflows. Copy differences are
reported as a warning, never an error.

### Tolerances

Every check is a threshold, not an exact-match assertion. Defaults are
calibrated rather than guessed — for example, the colour tolerance sits between
a difference of 0.34 (invisible to the eye) and 3.49 (clearly visible), and the
border tolerance is deliberately below 1px because a 1px border built as 2px is
plainly visible. Tolerances can be overridden per run and per element.

### Surfaces

- **Local web UI** — pick Figma layers from a browsable list, test selectors
  against the page, run a check, read results grouped by element with live
  progress. Loopback-only; the Figma token stays server-side and never reaches
  the browser.
- **CLI** — `tovi check`, plus `tovi layers` for discovering node ids before a
  config exists.
- **Reports** — a single self-contained HTML file (inline CSS, no network,
  screenshot embedded) suitable for attaching to a PR, and a JSON report for
  tooling.
- **CI** — GitHub Actions workflows: a standard typecheck/test/build gate, and a
  scheduled design check that currently runs report-only.

### Reporting honesty

Three features exist specifically so a report cannot mislead:

- **Verified checks.** A passing run lists what it actually verified, with both
  values and the tolerance. "0 errors over 80 comparisons" and "0 errors over
  none" are the same sentence and opposite facts.
- **Measurement advisories.** Where the tool knows something that changes what a
  number *means* — a design text box shrink-wrapped to its glyphs, an element
  occupying no space, a viewport-anchored sticky element — it says so beside the
  finding. It never replaces the finding.
- **Run notes.** Anything done to the page before measuring it (overlays hidden,
  images loaded) is stated at the top of the report.

## 5. Design trade-offs

These are the decisions that a newcomer is most likely to think are mistakes.

**Positions are compared relative to a section container, never absolutely.**
Figma canvas coordinates and browser viewport coordinates are unrelated spaces —
a designer dragging a frame changes every x-value in the file without changing
the design. *Cost:* every run needs a section container configured and found on
both sides, and a run without one cannot do position checks at all. It fails
loudly rather than falling back.

**Every element is measured in a single browser call, and the page is never
scrolled.** Scrolling would read each element against a different origin and
corrupt the comparison. *Cost:* anything that only exists after scrolling cannot
be measured; lazy images are handled by making them load in place instead.

**The page is waited on with `load`, not "network idle".** Network-idle looks
more careful and is less reproducible — it resolves whenever analytics and chat
widgets happen to go quiet, which is a different moment each run and on some
real pages never arrives. *Cost:* a fixed settle interval instead of a
guarantee.

**Font weight is resolved from the style name, not Figma's number.** For a
variable font, Figma reports an axis value that is not a CSS weight — a
correctly built "Medium" reports as 350 against a correct 500. A closed lookup
table maps the name. *Cost:* a name outside the CSS standard falls back to the
number. The alternative — widening the tolerance — would hide genuine weight
defects, which is the worse trade.

**Configuration is declared, never detected.** Font aliases (the same typeface
under two names) and page furniture (cookie banners, promo bars) must be named
in the config. *Cost:* a mechanism nobody declares removes nothing. The pilot
demonstrated exactly this. But guessing which parts of a page are "not really
the design" is the kind of heuristic that would make the whole tool unreliable.

**Advisories never suppress the finding they explain.** It would be easy to
silence a width comparison on a shrink-wrapped text box. That would also silence
a text element genuinely built at the wrong width. Trading a false positive for
a false negative is the worse trade.

**Uncomparable properties are reported, not dropped.** Where no honest
comparison exists, the tool emits a note saying so. Silence would be
indistinguishable from a pass, which is the one output the tool must never
produce.

## 6. Limitations

### By design — not planned to change

- **A wrong pairing is indistinguishable from a wrong build.** This is the
  single most important limitation. If you pair a design frame that draws the
  header and footer against a content wrapper that excludes them, TOVI will
  correctly report a large height difference that means nothing. Seven known
  pairing traps are documented, and the tooling flags two of them, but the
  author remains responsible for the claim that two things are the same thing.
- **Page furniture must be declared** to be excluded. There is no built-in list
  of cookie-banner class names.
- **Sticky and fixed elements are measured at scroll position 0** and nowhere
  else. The tool says when this applies rather than correcting it; there is no
  other scroll position that is more correct.
- **No verdict on intent.** "Real" and "wrong" are not the same thing. A build
  may legitimately have overridden the design.

### Known gaps — not built yet

- **One viewport per run.** Mobile requires a second config and a second
  invocation.
- **Only flat gradients compare.** A gradient flattened to one colour is
  compared as that colour; a genuine multi-stop gradient is skipped and reported
  as skipped.
- **Text compares per element, not per text run.** A paragraph with mixed
  styling is compared against the design node's dominant style.
- **`line-height: normal` cannot be compared** — it is font-dependent, so no
  honest number exists. Reported as a skip.
- **No baseline diffing.** Reports are byte-identical between runs, so
  committing a baseline and diffing it would show *new* drift rather than total
  drift. The capability is not built.
- **No AI explanation layer.** Designed and specified — it would group findings
  by root cause and flag likely environmental artifacts — but deliberately
  fenced outside the comparison path and not yet implemented.

### Operational

- **Requires a Figma personal access token** in the environment. It is never
  read from the config file and never written to a report.
- **Requires Chromium** to be installed for Playwright. The test suite skips its
  browser-driven tests when it is absent, so a green test run is not by itself
  proof the browser side works — CI installs Chromium explicitly for this
  reason.
- **One documented exception to byte-identical output.** Images are waited on
  for a fixed five-second budget. An image that arrives at 4.9 seconds on one
  run and 5.1 on the next changes that element's measurement. This is a
  deliberate trade — previously such an image was *reliably* measured at zero
  size, which is deterministic and wrong — and the difference is always
  reported, never silent.
- **Currently unlicensed and private.** Distribution has not been decided.

## 7. Status and evidence

| What | Verified against |
| --- | --- |
| Comparison engine | 247 automated tests across 12 suites |
| Browser measurement | Real Chromium against two controlled fixtures |
| Figma normalisation | The real API, real nodes |
| Full pipeline | **A real production page and the real design file** |
| Whether findings are trustworthy | **Two finding-by-finding triages** |
| Reproducibility | **Two runs of the live page, byte-identical output** |

The engine is complete. It has been run end to end against a real production
marketing page and triaged twice.

The first triage examined all 35 findings individually and re-derived every
delta from independently measured values. All held. Nineteen were genuine build
defects; the other sixteen fell into four explainable classes of noise, **none
of which was a miscomparison**. All four classes were then closed at source
without widening a single tolerance or deleting a single comparison.

The second triage re-ran the identical configuration to check the output had
actually moved. Findings dropped from 35 to 27 — exactly the predicted figure —
and running twice produced identical reports.

The most valuable thing the second run produced was a bug it found in the tool
itself: a newly added advisory was reading a Figma field from the wrong place
and could never have fired on a real file, despite six passing unit tests whose
fixtures had been invented rather than copied from a real API response. That is
the standing argument for periodically running against reality rather than
against fixtures.

## 8. Open questions

1. **Which design frame is authoritative?** The design file contains at least
   three nodes sharing the page's name, two of them different revisions 575px
   apart. Every measurement taken so far is against one of them, and nobody has
   established that it is the one the team is building to. This outranks all
   remaining engineering work and is a question for whoever owns the design
   file.
2. **Which viewport is the source of truth** — the one the design frame is drawn
   at, or the one most visitors use?
3. **Does the output survive contact with the person who has to act on it?**
   TOVI has found its first genuine defect: three headings missing their
   negative letter-spacing, consistent and cheap to fix. Handing that to whoever
   owns the theme is the last untested link in the chain.
