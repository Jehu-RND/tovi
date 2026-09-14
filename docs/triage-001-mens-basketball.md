# Triage 001 — Men's Basketball

_2026-09-14. First triage of a real run. Closes P-02._

This is the record of the thing the project had never done: taking a run against
the real site and deciding, finding by finding, whether it is trustworthy.

The headline is that **the tool is trustworthy and the noise is explainable**.
Of 35 findings, **19 are genuine** and the other 16 fall into four classes of
noise — none of which is a miscomparison, and none of which needs a tolerance
widened to fix.

| Cause | Findings | Kind |
| --- | --- | --- |
| Box-shape mismatch (`width`, `offsetX`) | 8 | Authoring mistake |
| Stroke on a TEXT node read as a CSS border | 4 | Tool gap |
| Font family under a foundry-prefixed name | 3 | Tool gap |
| Figma's `fontWeight: 350` | 1 | Tool gap |
| **Real build defects** | **19** | Genuine |

The largest noise class is a pairing mistake made by whoever writes the config —
including the pairing in the previous handoff.

---

## What was run

Figma file `Sport-Specific Landing Page`, frame `11350:4869` ("Men's
Basketball", 1728×6537) against `prolook.com/sports/mens-basketball/` at a
1728×1000 viewport.

Five elements, with the hero as the section container:

| `figmaId` | Figma node | Live selector | Passes |
| --- | --- | --- | --- |
| `hero` (section) | `12576:8114` FRAME 1728×972 | `.wrap > div:nth-child(3)` | geometry |
| `select-your-level-of-play` | `12576:8122` TEXT 742×60 | `.level-of-play h1.t-zero` | text, geometry |
| `built-for-every-player-heading` | `12576:8124` TEXT 1604×40 | `h1.t-two.spl` | text, geometry |
| `shop-by-level-of-play` | `12576:8137` TEXT 1604×48 | `.wrap > h1.t-zero.text-center` | text, geometry |
| `showcase-hs-college` | `12576:8116` INSTANCE 1604×776 | `.lop-showcase-wrapper.is-active` | geometry |

Result: `1/5 elements passed, 35 error(s), 0 warning(s)`.

**The hero passed clean.** A real Figma FRAME and a real live `div`, both
1728×972, compared on size, position, fill, border and radius with nothing
raised. That is the whole pipeline — coordinate normalization, extraction,
Figma fetch, comparison — working correctly against production data.

---

## The 526px height gap, answered

Open question 1 from the handoff. The previous run paired frame `11350:4869`
against `.wrap` and reported `height design 6537 live 6011, delta -526`.

**Verdict: mostly a pairing artifact. Roughly 397px of the 526 is not drift at
all, and the genuine figure is about 104px.**

`.wrap` is not the page. The site header sits outside it and so does the footer:

| | px |
| --- | --- |
| `#main-header`, above `.wrap` | 72 |
| `.wrap` | 6011 |
| `footer.content-info`, below `.wrap` | 325 |
| misc margin | 25 |
| **`document.scrollHeight`** | **6433** |

The Figma frame describes all of that — its first child `12576:8144` is a
1728×301 block containing the navigation instance, and its last child
`12576:8159` is a 1738×1185 group that includes the footer. So the frame was
being compared against a live element missing 397px of what the frame draws.

Against the whole document the gap is **6537 vs 6433 = 104px**, and it is
distributed rather than concentrated — no section is missing. Measured relative
to the hero, the live page runs slightly *low* at the top and progressively
*high* through the middle before regaining height in the footer:

| Anchor | design offsetY | live offsetY | delta |
| --- | --- | --- | --- |
| `select-your-level-of-play` | 1119 | 1148.8 | **+29.8** |
| `built-for-every-player-heading` | 1336 | 1288.9 | **−47.1** |
| `shop-by-level-of-play` | 3181 | 3051.4 | **−129.6** |
| `showcase-hs-college` | 3384 | 3241.4 | **−142.6** |

Much of that middle-of-page shortfall is downstream of the type being smaller
than the design specifies (see below) — shorter headings make shorter sections.
It is a real difference, but it is a *consequence* of the font findings rather
than an independent spacing defect.

The same root cause explains the previous run's second finding,
`backgroundColor design #fff live transparent`: `.wrap` has no background of its
own. Both findings came from one bad pairing, not two problems.

---

## The four classes of noise

### 1. Box-shape mismatch — 8 findings

Every `width` and `offsetX` error is this, and it has two flavours.

**A hug-width text node** (2 findings). A Figma TEXT node's bounding box hugs
its glyphs when `textAutoResize` is `WIDTH_AND_HEIGHT`. `12576:8122` is 742px —
the width of the words, not of a column. The live counterpart is a block-level
`h1` filling 1470px with its text centred inside. Nothing is visually wrong; the
two boxes describe different things. The arithmetic confirms it exactly:
`(1470 − 742) / 2 = 364`, the reported `offsetX` delta to the pixel.

**The content column against a full-bleed element** (6 findings). The other
three elements are 1604 wide in Figma — the design's content column — against
live headings and wrappers that span the full 1728. Again exact:
`(1728 − 1604) / 2 = 62`, the reported `offsetX` delta for all three.

**Verdict: artifact of the pairing, not the tool.** A centred element inside a
narrower design column should not have its box compared to a full-width block.

**Action:** this is an authoring trap, not a code defect — but it is one the
tool can warn about, because `textAutoResize` is in the API response and the
tool already fetches it. See T-27 below. The content-column flavour is harder to
detect automatically and is mostly a documentation problem (T-31).

### 2. Figma's `fontWeight: 350` is not a CSS weight — 1 finding

This is T-02, and it now has an answer.

`12576:8124` reports `fontWeight: 350`, and the live element is `500`. But the
same node also reports `fontPostScriptName: "Gotham-Medium"` and
`fontStyle: "Medium"` — and Medium *is* 500 in CSS. The build is correct; the
`350` is Figma reporting a variable-font axis value rather than a CSS weight.

**Verdict: false positive, and a tool gap.**

Critically, this does not mean the weight check should be loosened. On
`12576:8122` Figma reports `fontWeight: 700` with `fontStyle: "Bold"`, the live
value is `600`, and that one is a **real finding**. Raising the tolerance to
absorb the 350 case would hide it.

**Action:** map `fontStyle` through the standard CSS weight-name table
(Thin 100 … Black 900) and prefer it over the raw numeric weight. That is a
fixed lookup, not fuzzy matching, so it stays inside invariant 7. See T-28.

### 3. A stroke on a TEXT node is not a CSS border — 4 findings

`12576:8122` carries a real 1px black stroke with `strokeAlign: OUTSIDE`. TOVI
reports four `border.*.width expected 1px actual 0px` errors plus the correct
`info` note about the alignment.

But a stroke on a *text* layer is a glyph outline. Its CSS equivalent is
`-webkit-text-stroke`, not `border` — a live element can never satisfy it with a
border, so the check can only ever fail.

The border code is otherwise behaving correctly: `12576:8124` and `12576:8137`
both report `strokeWeight: 1, strokeAlign: OUTSIDE` from the API while having
`strokes: []`, and the normalizer correctly raised nothing for them. The gate on
an empty stroke array works.

**Verdict: tool gap, narrow.** Comparing box borders on a TEXT node is a
category error.

**Action:** see T-29. Note this should stay *visible* — invariant 3 means it
must not become silence. Downgrading to `info` with a reason is the fix;
dropping it is not.

### 4. Font family under a foundry-prefixed name — 3 findings

Figma reports `Gotham`; the theme declares `"Hco Gotham"`. Same typeface —
Hoefler&Co Gotham — under the foundry-prefixed CSS name.

The comparison is not wrong to flag it. `normalizeFontFamily` already strips
quotes, takes the first family in the stack and lowercases, so it is comparing
`gotham` against `hco gotham`, which genuinely differ. But it will fire on
every text element on every run, which is exactly the noise that gets a tool
ignored.

**Verdict: tool gap.** It needs a declared alias, not a fuzzy match — a
user-supplied map keeps this deterministic and inside invariant 7. See T-30.

---

## The 19 real findings

What is left is genuine, and it is consistent enough to look deliberate
somewhere in the theme.

**Every heading is missing its negative tracking.** Three for three:

| Element | design | live |
| --- | --- | --- |
| `select-your-level-of-play` | −0.48px | 0 |
| `built-for-every-player-heading` | −0.32px | 0 |
| `shop-by-level-of-play` | −0.4px | 0 |

The design applies −1% letter-spacing to headings and the build applies none.
This is the clearest real finding in the run and the easiest to fix.

**Headings are one step small.** `48 → 40` and `32 → 24`, both −8px, with
`lineHeight` following. `shop-by-level-of-play` matches at 40px, so this is not
a global scale factor — two of three headings are simply built smaller than
specified.

**`select-your-level-of-play` is 600 where the design is Bold/700.** Real, as
established above.

**`showcase-hs-college` has `padding.bottom` 16 vs 0**, and heights differ by
8–18px on two elements. Small, plausible, low priority.

**Heights and vertical offsets follow the type** (8 findings — 4 `height`,
4 `offsetY`). These are real differences, but mostly *consequences* of the
findings above rather than independent spacing defects: smaller headings with
shorter line-heights make shorter sections, and the shortfall accumulates down
the page. Fix the type and re-run before treating them as separate defects.

### Count

| Property | Findings |
| --- | --- |
| `height`, `offsetY` | 8 |
| `letterSpacing` | 3 |
| `lineHeight` | 3 |
| `fontWeight` (the genuine 700-vs-600 pair) | 2 |
| `fontSize` | 2 |
| `padding.bottom` | 1 |
| **Total** | **19** |

---

## What this changes

**The engine is not the problem.** Nothing here is a miscomparison. The hero
passed, the border gate worked, the `strokeAlign` info note fired correctly, and
every delta's arithmetic checks out against independently measured values.

**Config authoring is the problem.** The largest noise class (8 findings) and
the single most misleading finding in the project's history (the 526px gap) are
both pairing mistakes. The tool cannot currently tell you that pairing a
hug-width text node to a full-bleed block is meaningless, and it should.

**The frame this run used is flat, and it was the wrong one to pick.** Frame
`11350:4869` has 64 children and almost no section containers — loose
rectangles, text and instances positioned absolutely, with no node
corresponding to `.level-of-play`, `.superior-customization` or
`.built-for-every-player`. Pairing against it has to be text-to-text and
instance-to-wrapper, which is what this run did, and that is the direct cause
of the largest noise class.

Two of its children are also pasted screenshots of the existing site
(`Screenshot 2026-01-22…` 1728×105 at the top, `Screenshot 2026-01-08…`
1738×354 in the footer group) — designer scaffolding, not specification. They
should never be paired against anything.

**But the file contains a properly structured alternative**, found after this
run while diagnosing an unrelated `missingInLive`. There are at least three
nodes named "Men's Basketball":

| Node | Type | Size | Shape |
| --- | --- | --- | --- |
| `11609:7477` | CANVAS | — | The page. No bounding box; unusable |
| `11350:4869` | FRAME | 1728×6537 | 64 loose children. **What this run used** |
| `13020:20866` | FRAME | 1728×5962 | 2 children, properly nested: a 276px header block and a 5614px content frame holding six real section frames |

The 575px height difference means these are **different revisions**, not two
views of one design. Which is authoritative cannot be determined from the API
and needs whoever owns the design file.

If `13020:20866` is current, most of this triage's noise disappears at the
source: its sections are real frames with real boxes, so the box-shape
mismatch class (8 of 35 findings) largely stops arising. A spot check against
it paired `13020:21252` (hero, 1728×972) to `.wrap > div:nth-child(3)` — passed
clean — and `13020:21026` (nav, 1728×72) to `#main-header`, which matched on
both dimensions and produced seven substantive findings on padding, background
and shadow rather than geometry noise.

**This does not invalidate the triage above.** Every verdict in it is about
findings that were genuinely produced and correctly reasoned, and the four noise
classes are all real tool or authoring gaps regardless of which frame is used.
What changes is the priority: picking the right frame may be worth more than
T-27, and neither of those was on the board before.

---

## What the fixes actually removed

T-28, T-29 and T-30 are built. Re-running the exact config above, with a
`fontAliases` entry for Gotham:

| | errors |
| --- | --- |
| Original run | **35** |
| − 4 border widths on a TEXT node (T-29) | 31 |
| − 1 `fontWeight` 350-vs-500 (T-28) | 30 |
| − 3 `fontFamily` Gotham-vs-Hco Gotham (T-30) | **27** |

27 is exactly the 19 genuine findings plus the 8 box-shape errors, which is the
one noise class still outstanding (T-27). The categorisation above predicted
that number before any of it was written, which is the useful part.

Every genuine finding survived. Both real `fontWeight` errors — design Bold/700
against a live 600 — still report, and a test now pins that specifically,
because a mapping that silenced them would have traded a false positive for a
false negative.

## Still open

- **Which "Men's Basketball" frame is authoritative** — `11350:4869` (flat,
  6537) or `13020:20866` (structured, 5962). This is now the highest-value
  open question, because it changes what a run is even comparing against.
- **Which viewport is the source of truth**, 1728 or 1440. Unchanged from the
  handoff; this run used 1728 and the widths behaved.
- **Whether the −8px heading sizes are intentional.** They are real, but "real"
  and "wrong" are not the same thing — a build may legitimately have overridden
  the design. Needs whoever owns the theme.
- **Lazy-loaded images.** Not exercised by this run; no element in it was
  below-the-fold imagery. T-04 stands untested.
