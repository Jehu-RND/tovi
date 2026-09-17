# Handoff

_Written 2026-09-14. Updated 2026-09-17, after the triage, the work it set off,
and the real-site hardening that followed. On `main`, working tree clean._

Read this first if you are picking TOVI up. It covers where the project actually
stands, what changed recently and why, and what to do next. It does not repeat
[AGENTS.md](AGENTS.md) (how to work in the codebase), [TASKS.md](TASKS.md) (the
full task list), or [docs/](docs/) (the reference).

---

## Where this stands in one paragraph

TOVI compares a Figma design against a live page and reports where the build
drifted. The engine is finished, covered by 244 tests, has been **run end to
end against the real target**, and — as of
[docs/triage-001-mens-basketball.md](docs/triage-001-mens-basketball.md) — has
been **triaged finding by finding**. The verdict: the findings are trustworthy.
The section container passed clean; of 35 findings **19 were genuine** and the
other 16 fell into four classes of noise, none of them a miscomparison.

**All four noise classes are now closed at the source** — T-28 (`fontWeight`
from the style name), T-29 (no box border on a TEXT node), T-30 (declared font
aliases) and T-27 (a TEXT box that hugs its glyphs). So are the **three
real-site risks** that were catalogued before the first run and never
exercised: T-03 (cookie banners and promo bars), T-04 (lazy images measuring
`0×0`) and T-05 (sticky headers). Not one of them widened a tolerance or
deleted a comparison.

Separately, T-32 closed the authoring trap that made a first run look broken:
the UI no longer pre-fills a `data-figma-id` selector the page does not have,
and T-31 wrote the pairing traps down.

What remains, and it is short: **re-run triage 001 and diff it** — nobody has
confirmed the 35 findings actually drop where the arithmetic says they should —
**P-03**, which is a question for whoever owns the design file, and the first
genuine defect the tool found, which is waiting on whoever owns the theme.

---

## Run it

```bash
npm install
npx playwright install chromium    # the integration suites skip themselves without this
npm run build

npm run ui                         # http://127.0.0.1:4479 — start here
npm run check -- -c tovi.config.json -r out/report.html
npm run layers -- --page "Men's Basketball" --depth 3
```

Needs `FIGMA_TOKEN` in the environment or `.env`. The gate before any change is
done: `npm run typecheck && npm test`.

---

## What is verified, and against what

This distinction matters more than the test count.

| | Verified against |
| --- | --- |
| Comparison engine, both passes | 244 unit tests |
| Browser extraction | Real Chromium, `tests/fixtures/page.html` |
| Cookie banners, lazy images, sticky headers | Real Chromium, `tests/fixtures/hardening.html`. The lazy-image suite measures the image at `0×0` **without** the fix first, so the trap is proved rather than described |
| Figma normalization | The real API, real nodes |
| Full pipeline | **The real site and real design file** |
| Whether the findings are *trustworthy* | **A finding-by-finding triage.** Every delta re-derived from independently measured values; all held |

---

## The last real run

Five elements against frame `11350:4869`, hero as the section container, at a
1728 viewport. `1/5 elements passed, 35 error(s)`.

Do not read that as bad. The element that passed is the **section container** —
a real Figma FRAME and a real live `div`, both 1728×972, clean on size,
position, fill, border and radius. That is the whole pipeline working on
production data.

The 35 findings sort into exactly four causes, and the split is the useful part:

| Cause | Findings | Verdict |
| --- | --- | --- |
| Box-shape mismatch (`width`, `offsetX`) | 8 | Authoring trap. A `textAutoResize: WIDTH_AND_HEIGHT` node hugs its glyphs; the rest are a 1604 design column against full-bleed 1728 elements. Arithmetic confirms both: `(1470−742)/2 = 364` and `(1728−1604)/2 = 62`, exactly the reported `offsetX` deltas. **Now named by T-27** — the deltas still report, with a `boxShape` advisory beside them |
| Figma's `fontWeight: 350` | 1 | False positive. It is a variable-font axis value; the node's `fontStyle: "Medium"` is 500 in CSS and the build is right. **Closed by T-28** |
| A stroke on a TEXT node compared as a CSS border | 4 | Tool gap. A glyph outline has no `border` equivalent, so the check can only fail. **Closed by T-29** |
| Font family under a foundry-prefixed name | 3 | Tool gap. `Gotham` vs `"Hco Gotham"` — same typeface, fires on every text element. **Closed by T-30** |
| **Real build defects** | **19** | Genuine. See below |

**The real defect worth acting on first:** all three headings are missing their
negative tracking — design `−0.48 / −0.32 / −0.4`px, live `0` for every one.
The design applies −1% letter-spacing to headings and the build applies none.
Consistent, unambiguous, cheap to fix.

Also real: two of three headings are built 8px small, and two are weight 600
where the design is Bold/700. The remaining 8 real findings are `height` and
`offsetY` deltas, which are mostly *consequences* of the type being smaller —
fix the type and re-run before treating them as separate defects.

### The 526px height gap — answered

The previous run's headline finding was `height design 6537 live 6011`. It was
**mostly a pairing artifact**. `.wrap` is not the page: `#main-header` (72px)
sits above it and `footer.content-info` (325px) below, and the Figma frame
draws both. Against `document.scrollHeight` (6433) the gap is **104px**, not
526 — distributed, with no section missing.

The same bad pairing produced the `backgroundColor` finding. One mistake, two
scary-looking findings.

## Two things that will bite you

**1. A Figma URL carries two ids, and they are both plausible.**

```
…?node-id=11609-7477&focus-id=11350-4869
   ↑ CANVAS, the page                ↑ FRAME, the design
   no bounding box, unusable           1728×6537, what you want
```

In this file both are named "Men's Basketball". A node with no bounding box
cannot be measured and the normalizer throws on it — the UI now refuses to add
one and says why, but the CLI will accept it and fail at run time.

**2. The live site carries no `data-figma-id` attributes.**

This used to be a trap: the UI pre-filled a `data-figma-id` selector, so a first
run against a freshly picked layer failed with `missingInLive` and looked like a
broken tool. **T-32 fixed that** — picking a layer now resolves its selector
against the page itself, trying the attribute, then a class, then an id named
after the layer, and leaves the field empty rather than guessing when none of
them match.

Pairing is by CSS selector instead. That is fully supported and is how the runs
above worked. The theme is unusually selector-friendly:

| Selector | Matches |
| --- | --- |
| `.level-of-play` | 1 — `div.grid-container.level-of-play · 1440×151` |
| `.built-for-every-player` | 1 |
| `.superior-customization` | 1 — `div.superior-customization · 1440×668` |
| `.built-better-footer` | 1 |
| `.wrap` | 1 — the whole content container, 1440×5502 |
| `.mega-menu-item` | **25** — ambiguous, do not use |

Use **Test selectors** in the UI rather than guessing; it costs one page load
and no Figma call.

Two corrections to that table from triage 001, measured at a 1728 viewport:
`.built-better-footer` is **125×22**, a small text element and not a section —
do not treat it as one. `.level-of-play` is a max-width container, so it
measures 1440×151 at a 1440 viewport and 1500×151 at 1728.

---

## What changed recently

**Real-site hardening (latest).** The three risks catalogued before the first
run and never exercised, plus the last of the four noise classes. Test count
181 → 244.

| Task | What |
| --- | --- |
| **T-03** | A declared `overlays` list of CSS selectors, hidden before anything is measured. The run reports what each one hid — **including the ones that hid nothing**, because a stale selector is how a config silently stops doing its job. Declared, never detected: there is no list of known banner class names in the codebase and there must not be one |
| **T-04** | Every `<img loading="lazy">` is switched to eager before measuring, with a 5s budget. Nothing scrolls — invariant 2 holds; the image is made to load where it stands. An element that still measures `0×0` gets a `zeroSize` advisory naming the cause |
| **T-05** | A `fixed` or `sticky` element reports a `positioning` advisory saying its rect is viewport-anchored and was measured at scroll 0 — louder when the *section container* is the sticky one, since every offset in the run then rests on a rect that slides |
| **T-27** | `tovi layers` and the UI's layer list mark a glyph-hugging TEXT layer `hugs text`, so a pairing can be reconsidered before it is made; a run reports an `info` `boxShape` finding beside the deltas it explains |
| **T-31** | Seven pairing traps written down in [docs/tagging.md](docs/tagging.md#pairing-traps), every one of them a mistake that has actually happened |
| — | `report/merge.ts` got its first direct test suite. It had none, which meant `PROPERTY_ORDER` — the only thing keeping two runs byte-identical — rested on code inspection. The new suite pins the whole order explicitly, so adding a property cannot go unreviewed |

Three things worth knowing about that work:

- **`RunReport` gained `notes`.** Everything the extractor changes about the
  page before measuring it is reported at the top of the report, the JSON and
  the terminal summary. A page quietly altered is a page whose numbers cannot be
  trusted. Notes are emitted in a fixed order, so runs stay byte-identical.
- **Three new `IssueProperty` values**, all `info`: `boxShape`, `zeroSize`,
  `positioning`. None fails a run and none suppresses the finding it explains —
  a text element genuinely built at the wrong width still has to fail. Trading a
  false positive for a false negative is the worse trade.
- **The lazy-image test has a control.** It measures the image at `0×0` through
  a plain Chromium load before asserting that extraction measures it at
  240×160. Without that control the test could be passing because Chromium
  loaded the image anyway — which is exactly what happens at 3,000px of offset
  and stops happening at 10,000px.

**Acting on the triage.** Nine commits. Three of the four noise
classes removed at the source, the authoring trap that caused a fourth closed,
and the results view rebuilt around the questions the triage found it could not
answer. Test count 162 → 181.

| Commit | What |
| --- | --- |
| `305f2bf` | **T-32.** Picking a layer resolves its selector against the page — attribute, then class, then id — instead of pre-filling a `data-figma-id` guess |
| `c54ab34` | Picking a frame adds its subtree, not just the frame |
| `a4c845e` | A passing element says what was verified, not just that it passed |
| `d38d354` | Progress while a run happens, instead of ten silent seconds |
| `b5dbb2c` | **T-28, T-29, T-30.** Three classes of false positive deleted. None widened a tolerance |
| `15b920c` | Findings name the element they are about (`section.more-content · 342×122`); results filter by all / passed / failed / errors / warnings |
| `124c8d3` | The layer list greys every picked row, drawn from state rather than patched at the click |

**The triage session.** No source changed — the deliverable is
[docs/triage-001-mens-basketball.md](docs/triage-001-mens-basketball.md), plus
the board and docs catching up: P-02 closed, T-01/T-02/T-06 answered and struck,
T-27–T-31 added, and `PROGRESS.md` moved from ~65% to ~80%.

**The session before that.** Six commits, 49 files, +3493/−103.

| Commit | What |
| --- | --- |
| `ffa7454` | Borders/strokes comparison, `tovi layers`, screenshot embedding, CI workflows, docs, `.claude/` scaffolding |
| `6c056e4` | UI validation, env fallback, layer-list size |
| `1192e1c` | UI rebuilt around picking layers rather than editing config |
| `2cbb713` | Wait for `load`, not network-idle; configurable timeout |
| `afab315` | Selector pairing exposed; UI simplified to choices over text inputs |
| `18dc976` | Selector probe |

### Decisions worth knowing about

**Borders compare per side, and colour only where a border is drawn.** CSS
reports a colour for a zero-width border, so comparing it would fire on elements
with no visible border. A non-`INSIDE` `strokeAlign` is flagged as info, because
CSS borders are always drawn inside the box — widths still compare, the box does
not. Default tolerance is `0.5`, deliberately below the 1px floor used
elsewhere: 1px-vs-2px is plainly visible.

**`load`, not `networkidle`.** This reads like a reliability compromise and is
the opposite. `networkidle` resolves when the network goes quiet, so what it
waits for depends on when analytics and chat widgets happen to stop — a
different moment each run, and on `prolook.com` a moment that never arrived
inside 30s. `load` is a defined event; paired with `document.fonts.ready` and a
fixed 500ms settle it is *more* reproducible, not less.

**Uncomparable text properties are reported, not dropped.** `line-height:
normal` has no honest number to compare against, but silence was
indistinguishable from a pass — which is the one thing this tool must never do.
It now emits an `info`-severity skip naming the property and why.

**`fontWeight` resolves from the style name, not Figma's number.** Figma
reports the font's own weight-axis value, which for a variable font is not a CSS
weight — Gotham Medium comes back as `350` against a correct `500`. The same
node also says `fontStyle: "Medium"`, and the design stated it in words. A
closed CSS Fonts Level 4 table maps the name; anything outside it falls back to
Figma's number rather than being guessed at. **Do not "simplify" this by raising
the tolerance** — a node whose style is "Bold" still resolves to 700 and still
fails against a live 600, and a test pins that. Trading a false positive for a
false negative is the worse trade.

**A stroke on a TEXT node is not a CSS border.** It is a glyph outline —
`-webkit-text-stroke` — while `border` draws a rectangle around the text. Widths
are no longer compared there, but the stroke is still reported as `info` naming
what it actually is, because invariant 3 means removing a comparison must not
become silence.

**Font aliases are declared, never inferred.** `Gotham` and `"Hco Gotham"` are
the same typeface under a foundry-prefixed name. The config takes an explicit
`fontAliases` map. It is not fuzzy matching and must not become it — invariant 7.

**Page furniture is declared, never detected.** `overlays` takes CSS selectors
for cookie banners and promo bars, which are hidden before anything is
measured. There is no list of known banner class names in this codebase and
there must not be one — deciding which parts of a page are "not really the
design" is a judgement call, and a judgement call made by the tool is the
heuristic invariant 7 keeps out of a run. Same reasoning as `fontAliases`.

**Lazy images are loaded, not scrolled to.** The obvious fix for an image that
measures `0×0` is to scroll it into view, and it is the one fix that is
forbidden: invariant 2 exists because every position in the run is normalized
against a section rect measured at the same scroll origin. Switching
`loading="lazy"` to `eager` makes the image load where it stands. There is
nothing to guess — the answer to "which images should load" is all of them.

**An advisory never suppresses the finding it explains.** `boxShape`,
`zeroSize` and `positioning` are `info` and change no verdict. The tempting
version of T-27 suppresses the width comparison on a glyph-hugging node, and it
is wrong: a text element genuinely built at the wrong width would then pass
silently. Trading a false positive for a false negative is the worse trade —
the same argument that settled T-02 and T-28.

**Everything done to the page before measuring is reported.** Hiding an overlay
and promoting an image both change the numbers, so both appear as run notes.
The note that earns its place is the one about the overlay that hid *nothing*:
that is how an author finds out the consent vendor renamed a class and every
offset moved 64px without the config changing.

**The UI hides the config format.** The first version exposed it directly — a
JSON textarea, a free-text "section (figmaId)" box — and it was unusable by
anyone who did not already know the data model. Worse, the section and the
element slugs were independent strings, so they could drift apart. The section
is now a dropdown over the elements that exist and cannot name something absent.
The design rules are written at the top of [src/ui/page.ts](src/ui/page.ts);
adding a control that takes a raw config value as free text is a regression.

---

## What to do next

The triage backlog and the hardening backlog are both closed. What is left is
short, and neither of the first two items is code.

**1. Re-run triage 001 and diff it.** Four noise classes are gone and three
environmental risks are handled; **nobody has confirmed the 35 findings
actually drop to the predicted ~19.** The reports are byte-identical between
runs, so this is a real check rather than a formality. Do it before trusting a
single number in this file or in `PROGRESS.md` — everything above is arithmetic
until it is a measurement.

**2. Take the letter-spacing defect to whoever owns the theme.** It is the first
genuine defect TOVI has found: all three headings are missing their negative
tracking, design `−0.48 / −0.32 / −0.4`px against a live `0`. The design applies
−1% to headings and the build applies none. Consistent, unambiguous, cheap.
Worth confirming the tool's output survives contact with the person who has to
act on it — that is the last untested link in the chain.

**3. P-03 — which "Men's Basketball" frame is authoritative?** See below. This
decides what a run is even comparing against and outranks everything that is
left. It is not a guard the tool can supply; it is a question for whoever owns
the design file.

### Then the rest of the board

- **T-25** — click a live element to pair it with a layer. T-32 resolves
  selectors automatically now, and the layer list marks the rows worth thinking
  twice about, so this is the remaining half of the loop.
- **T-18** — flip `fail_on_drift` on in CI. It ships report-only. The four noise
  classes are closed, so the only thing standing in the way is item 1 above.
- **T-21/T-22/T-23** — the AI suggestion layer. Advisory only, never the
  verdict; see invariant 7 in [AGENTS.md](AGENTS.md).

## Open questions for whoever owns this

The first and fourth are answered. Two remain, and neither blocks the work.

1. ~~Is the 526px height gap real?~~ **Answered: mostly a pairing artifact.**
   ~397px of it was `.wrap` excluding the header and footer the frame draws.
   The genuine figure is ~104px, distributed.
2. **Which viewport is the source of truth** — 1728 to match the frame, or 1440
   because that is what most visitors see? Triage 001 used 1728 and the widths
   behaved, but that is a demonstration, not a decision.
3. **Are the −8px heading sizes intentional?** They are real. "Real" and "wrong"
   are not the same thing — a build may legitimately have overridden the design.
4. ~~Does this branch merge to `main`?~~ **Merged.** All of it is on `main`.

### The design file has at least three "Men's Basketball" nodes

This is now the biggest open question on the project (P-03), because it decides
what a run is even comparing against:

| Node | Size | Shape |
| --- | --- | --- |
| `11609:7477` | — | CANVAS. No bounding box, unusable |
| `11350:4869` | 1728×6537 | 64 loose children, almost no section containers. **What triage 001 used** |
| `13020:20866` | 1728×5962 | 2 children, properly nested — a header block and a content frame holding six real section frames |

575px apart, so these are **different revisions**, not two views of one design.
If the structured one is current, most of triage 001's noise disappears at the
source. Nobody has established which is authoritative.

Against `11350:4869`, pairing has to be text-to-text and instance-to-wrapper —
there is no node corresponding to `.level-of-play`,
`.superior-customization` or `.built-for-every-player`.

Two of the frame's children are also **pasted screenshots of the existing site**
(`Screenshot 2026-01-22…` 1728×105 at the top, `Screenshot 2026-01-08…`
1738×354 in the footer group). That is designer scaffolding, not specification.
Never pair against them.

## Things not to break

Full explanations in [AGENTS.md](AGENTS.md#invariants--do-not-break-these). The
short version, because these are the ones that look like improvements:

1. Never compare Figma canvas coordinates to browser viewport coordinates.
2. Measure every element in a single `page.evaluate()`; never scroll.
3. An absent check must never look like a passing check.
4. Output must be byte-identical between runs.
5. The Figma token comes from `FIGMA_TOKEN` only.
6. Colours compare perceptually, never per channel.
7. AI never enters the comparison path.
8. Escape every value interpolated into a report.
