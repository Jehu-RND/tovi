# Handoff

_Written 2026-09-14. Updated the same day, after the first triage. On `main`._

Read this first if you are picking TOVI up. It covers where the project actually
stands, what changed recently and why, and what to do next. It does not repeat
[AGENTS.md](AGENTS.md) (how to work in the codebase), [TASKS.md](TASKS.md) (the
full task list), or [docs/](docs/) (the reference).

---

## Where this stands in one paragraph

TOVI compares a Figma design against a live page and reports where the build
drifted. The engine is finished, covered by 162 tests, has been **run end to
end against the real target**, and — as of
[docs/triage-001-mens-basketball.md](docs/triage-001-mens-basketball.md) — has
been **triaged finding by finding**. The verdict: the findings are trustworthy.
The section container passed clean; of 35 findings **19 are genuine** and the
other 16 fall into four classes of noise, none of them a miscomparison. What is
left is not a question any more, it is work: four scoped tasks that remove those
four classes, none of which requires weakening a check.

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
| Comparison engine, both passes | 162 unit tests |
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

The UI still pre-fills that selector form, so a first run against a freshly
picked layer fails with `missingInLive` and looks like a broken tool. It is not
— nothing was compared, because nothing was found. Replace the pre-filled
selector with a real one (T-32 removes the trap).

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

**The triage session (latest).** No source changed — the deliverable is
[docs/triage-001-mens-basketball.md](docs/triage-001-mens-basketball.md), plus
the board and docs catching up to it: P-02 closed, T-01/T-02/T-06 answered and
struck, T-27–T-31 added, and `PROGRESS.md` moved from ~65% to ~80%. The stale
"borders are not compared at all" line in
[`/triage`](.claude/commands/triage.md) was corrected and the three gaps the
triage found were added to it.

**The session before it.** Six commits, 49 files, +3493/−103.

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

**The UI hides the config format.** The first version exposed it directly — a
JSON textarea, a free-text "section (figmaId)" box — and it was unusable by
anyone who did not already know the data model. Worse, the section and the
element slugs were independent strings, so they could drift apart. The section
is now a dropdown over the elements that exist and cannot name something absent.
The design rules are written at the top of [src/ui/page.ts](src/ui/page.ts);
adding a control that takes a raw config value as free text is a regression.

---

## What to do next

The triage is done, so the board is worth working on now. In order:

**1. Remove the four noise classes — T-27 to T-30.** Each has a written verdict
in the triage doc and none requires weakening a check.

- **T-27** — warn when a text node's box is not a layout box. Biggest single
  win: part of the 8-finding box-shape class. `textAutoResize` is already in
  the API response, so
  this is an authoring guard, not a comparison change.
- **T-28** — prefer `fontStyle` over the raw numeric `fontWeight`. A fixed
  CSS weight-name table (Thin 100 … Black 900), not fuzzy matching, so it stays
  inside invariant 7. **Do not fix this by raising the tolerance** — that would
  hide the genuine Bold-700-vs-600 finding on another node.
- **T-29** — stop comparing box borders on a TEXT node. Downgrade to `info`
  **with a reason**; invariant 3 means it must not become silence.
- **T-30** — declared font-family aliases. `Gotham` vs `"Hco Gotham"` is the
  same typeface under a foundry-prefixed name, and it fires on every text
  element on every run. Must be an explicit user-declared map, never a fuzzy
  match.

**2. Write down the pairing traps — T-31.** Two of the four noise classes are
mistakes the tool lets an author make in silence.

**3. Take the letter-spacing defect to whoever owns the theme.** It is the first
genuine defect TOVI has found. Worth confirming the tool's output survives
contact with the person who has to act on it.

### Then the rest of the board

- **T-25** — click a live element to pair it with a layer. The probe already
  proposes candidates; this closes the loop. Worth more after the triage than
  before, since authoring is now the weak spot.
- **T-09 follow-on** — the 8293-layer file makes layer discovery the bottleneck.
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
