# Handoff

_Written 2026-09-14. Updated 2026-09-17, after the triage and the work it set off.
On `main`, working tree clean._

Read this first if you are picking TOVI up. It covers where the project actually
stands, what changed recently and why, and what to do next. It does not repeat
[AGENTS.md](AGENTS.md) (how to work in the codebase), [TASKS.md](TASKS.md) (the
full task list), or [docs/](docs/) (the reference).

---

## Where this stands in one paragraph

TOVI compares a Figma design against a live page and reports where the build
drifted. The engine is finished, covered by 181 tests, has been **run end to
end against the real target**, and — as of
[docs/triage-001-mens-basketball.md](docs/triage-001-mens-basketball.md) — has
been **triaged finding by finding**. The verdict: the findings are trustworthy.
The section container passed clean; of 35 findings **19 were genuine** and the
other 16 fell into four classes of noise, none of them a miscomparison.

Since that triage, **three of those four classes have been removed at the
source** — T-28 (`fontWeight` from the style name), T-29 (no box border on a
TEXT node), T-30 (declared font aliases). None of them widened a tolerance. The
fourth, the box-shape class, is T-27 and is the one still standing.

Separately, T-32 closed the authoring trap that made a first run look broken:
the UI no longer pre-fills a `data-figma-id` selector the page does not have.

What remains: **T-27**, one documentation task (**T-31**), and the first genuine
defect the tool found, which is waiting on whoever owns the theme.

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
| Comparison engine, both passes | 181 unit tests |
| Browser extraction | Real Chromium, `tests/fixtures/page.html` |
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
| Box-shape mismatch (`width`, `offsetX`) | 8 | Authoring trap. A `textAutoResize: WIDTH_AND_HEIGHT` node hugs its glyphs; the rest are a 1604 design column against full-bleed 1728 elements. Arithmetic confirms both: `(1470−742)/2 = 364` and `(1728−1604)/2 = 62`, exactly the reported `offsetX` deltas |
| Figma's `fontWeight: 350` | 1 | False positive. It is a variable-font axis value; the node's `fontStyle: "Medium"` is 500 in CSS and the build is right |
| A stroke on a TEXT node compared as a CSS border | 4 | Tool gap. A glyph outline has no `border` equivalent, so the check can only fail |
| Font family under a foundry-prefixed name | 3 | Tool gap. `Gotham` vs `"Hco Gotham"` — same typeface, fires on every text element |
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

**Acting on the triage (latest).** Nine commits. Three of the four noise
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

**The UI hides the config format.** The first version exposed it directly — a
JSON textarea, a free-text "section (figmaId)" box — and it was unusable by
anyone who did not already know the data model. Worse, the section and the
element slugs were independent strings, so they could drift apart. The section
is now a dropdown over the elements that exist and cannot name something absent.
The design rules are written at the top of [src/ui/page.ts](src/ui/page.ts);
adding a control that takes a raw config value as free text is a regression.

---

## What to do next

Most of the triage backlog is closed. What is left is short, and the first item
is not code.

**1. Take the letter-spacing defect to whoever owns the theme.** It is the first
genuine defect TOVI has found: all three headings are missing their negative
tracking, design `−0.48 / −0.32 / −0.4`px against a live `0`. The design applies
−1% to headings and the build applies none. Consistent, unambiguous, cheap.
Worth confirming the tool's output survives contact with the person who has to
act on it — that is the last untested link in the chain.

**2. T-27 — warn when a text node's box is not a layout box.** The one noise
class still standing, and the largest single contributor to triage 001 (part of
8 findings). A `textAutoResize: WIDTH_AND_HEIGHT` node hugs its glyphs, so its
box is not the layout box anyone means to compare. `textAutoResize` is already
in the API response, so this is an authoring guard, not a comparison change.

**3. T-31 — write down the pairing traps in `docs/tagging.md`.** Two of the four
noise classes were mistakes the tool let an author make in silence. The 526px
gap and the `backgroundColor` finding were one bad pairing between them.

**4. Re-run triage 001 and diff it.** Three noise classes are gone; nobody has
confirmed the 35 findings actually drop to the predicted ~19 + T-27's share. The
reports are byte-identical between runs, so this is a real check, not a
formality. Do it before trusting the numbers above.

### Then the rest of the board

- **P-03 — which "Men's Basketball" frame is authoritative?** See below. This
  decides what a run is even comparing against and outranks everything here.
- **T-25** — click a live element to pair it with a layer. T-32 resolves
  selectors automatically now, so this is the remaining half of the loop.
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
