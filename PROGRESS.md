# TOVI — Progress

**Status: ~90% to MVP.**
_Last updated: 2026-09-18_

> Task-level breakdown lives in [TASKS.md](TASKS.md) — 66 tasks across todo,
> in progress, and done. This file carries the reasoning; that one carries the list.

The engine is finished and has now **survived contact with a real page**. The
first real run was triaged on 2026-09-14
([docs/triage-001-mens-basketball.md](docs/triage-001-mens-basketball.md)) and
the verdict is that the findings are trustworthy: the section container passed
clean, 19 of the 35 findings are genuine defects, and the other 16 fall into
four classes of noise, none of which is a miscomparison.

**All four noise classes are now closed at the source**, and so are the three
real-site risks that were catalogued before the first run but never exercised —
cookie banners, lazy images, sticky headers. None of it widened a tolerance or
deleted a comparison. What remains is a re-run of triage 001 to confirm the
findings actually drop where the arithmetic says they should, the frame-choice
question (P-03), and making the config bearable to author.

---

## What "MVP" means here

> We can point TOVI at a real Aeneas page, get a report, and **trust it** —
> meaning a red line is a genuine build defect and a green run genuinely means
> the page matches the design.

The second half of that sentence is the expensive half. A tool that produces
findings is ~90% built. A tool whose findings you act on without double-checking
is the actual goal.

As of triage 001 the first half is demonstrated, and as of triage 002 the second
half is most of the way there: the findings were checked one by one against
independently measured values, they held, and the noise they were buried in has
since been removed — 35 findings down to 27, which is the 19 real ones plus the
8 that come from one authoring mistake. Those 8 still report, because
suppressing them would hide a text element genuinely built at the wrong width,
but they now carry a line saying which kind they are. What is left is not
accuracy and no longer really volume; it is that nobody has yet handed the
report to the person who has to act on it.

---

## Where the 90% comes from

| Area | Weight | Done | Contribution |
| --- | --- | --- | --- |
| Comparison engine (types, config, passes, report) | 45% | 99% | 45% |
| Figma + browser I/O | 20% | 100% | 20% |
| Config authoring ergonomics | 15% | 55% | 8% |
| Real-site hardening | 20% | 85% | 17% |
| **Total** | **100%** | | **~90%** |

Real-site hardening moved 55% → 85%. The four noise classes are gone, the three
catalogued environmental risks are handled and covered against real Chromium,
and — the part that was missing last time — **triage 001 has been re-run and the
findings landed on exactly the predicted number**, 35 → 27
([docs/triage-002-rerun.md](docs/triage-002-rerun.md)). Determinism is no longer
a fixture claim either: two runs against the live page produced byte-identical
JSON.

The remaining 15% is P-03. Every number above is measured against frame
`11350:4869`, and nobody has established that it is the frame anyone is
building to.

Figma + browser I/O reached 100%: the extractor now prepares the page as well
as measuring it, and says what it did.

Config authoring ergonomics moved 40% → 55% on the pairing traps being written
down and two of them being surfaced where the pairing is chosen — `hugs text`
in the layer list, and selector resolution from T-32. The visual builder
(T-25) is the rest.

---

## Built and verified

**247 tests passing**, including two integration suites that run against real
Chromium.

| Module | LOC | State |
| --- | --- | --- |
| `types.ts` | 273 | Done |
| `report/types.ts` | 184 | Done |
| `config/schema.ts` | 164 | Done |
| `config/loadConfig.ts` | 351 | Done — strict validation, every error names its path |
| `compare/color.ts` | 133 | Done — CIEDE2000 via culori, separate alpha check |
| `compare/issues.ts` | 179 | Done — shared Issue construction |
| `compare/textPass.ts` | 211 | Done — Pass B, five properties |
| `compare/geometryPass.ts` | 546 | Done — Pass A, section-relative normalization |
| `figma/client.ts` | 255 | Done — retries, chunking, typed errors |
| `figma/normalize.ts` | 434 | Done — verified against the real file |
| `live/extract.ts` | 612 | Done — verified against two browser fixtures |
| `report/merge.ts` | 201 | Done — deterministic ordering |
| `report/html.ts` | 376 | Done — self-contained, offline, embeds the capture |
| `index.ts` | 587 | Done — full `runCheck()` wiring |

### The first green run

On 2026-09-14 TOVI passed a real page for the first time: a React app built from
a Figma frame (`3:634`, 390×844), six elements, **6/6 passed, 0 errors**. Every
element reported `paired: true`, and re-running with every tolerance forced to
`0` produced sub-pixel deltas (0.078px, 0.141px, 0.781px) — so the pass is a
real measurement agreeing, not a check that quietly did nothing.

That matters more than the count. Until now every run had produced findings, and
a tool that only ever says "no" is indistinguishable from a broken one. This is
the first evidence that a green run means what it claims.

### Verified against real systems, not just unit tests

- **Figma REST API** — fetched real nodes from `Sport-Specific Landing Page`.
  Fill extraction, text metrics, padding, and the TEXT-vs-frame fill
  distinction all confirmed correct on live data.
- **Real Chromium** — `live/extract.ts` measured a fixture page. Percentage
  border-radius, computed `box-shadow` parsing, and NaN survival across the
  Playwright bridge all confirmed.
- **Full pipeline against a fixture** — real Figma nodes vs. a local fixture,
  with three defects planted. All three were caught, plus a missing element,
  with **zero false positives**.
- **Full pipeline against the real site** — `prolook.com/sports/mens-basketball/`
  against frame `11350:4869`, triaged finding by finding on 2026-09-14. The
  hero section container passed clean on size, position, fill, border and
  radius. Every delta's arithmetic was checked against independently measured
  values and every one held.

### The two hard problems, both solved

**Coordinate spaces.** The real Figma frame sits at canvas `(-94257, -63049)`.
A browser reports the same element at viewport `(120, 176)`. These are never
compared directly — each side is normalized against its own section container
first, so what gets compared is "how far into its section does this start."
Locked in by a test that fails loudly if anyone reintroduces absolute
comparison.

**Color.** Per-channel RGB difference is the wrong metric. Colors are compared
as CIEDE2000 perceptual distance, where the tolerance of `2` sits between
`#0066FF` vs `#0067FF` (0.34, invisible) and `#0066FF` vs `#0070FF` (3.49,
visible). deltaE ignores alpha, so opacity is checked separately.

---

## Not built

| Gap | Impact | Est. |
| --- | --- | --- |
| **Nobody has acted on the 19 genuine defects** | The findings are trustworthy and reproducible. Whether a report survives contact with the person who has to fix the theme is the last untested link in the chain, and it is not a code task. | — |
| **Single viewport per run** | No responsive checking; mobile needs a second config. | 0.5 day |
| **Which frame is authoritative is still unguarded** | Selector resolution (T-32) and the `hugs text` marker closed two authoring traps; frame choice (P-03) is not a guard the tool can supply — it is a question for whoever owns the design file. | — |

### Known limitations (documented, not necessarily worth fixing)

- `line-height: normal` cannot be compared — it is font-dependent, so there is
  no honest number. Now surfaced as an info-severity skip rather than dropped
  silently, so an uncompared property never reads as a passing one.
- Only flat gradients compare. A gradient whose stops are all one color is
  compared as that color; a real gradient is skipped.
- Text is compared per element, not per text run. A paragraph with mixed
  styling compares against the Figma node's dominant style.
- Page furniture must be **declared**, not detected. A cookie banner is hidden
  only if the config names it in `overlays`. This is a limitation on purpose:
  guessing which parts of a page are "not the design" is the heuristic
  invariant 7 keeps out of a run.
- A `fixed` or `sticky` element's rect is viewport-anchored, so its
  section-relative offset holds at scroll 0 and nowhere else. Reported as a
  `positioning` advisory rather than corrected — there is no scroll position
  that is more correct, and scrolling to find one is forbidden by invariant 2.
- An image that has not arrived within the 5s budget still measures short. The
  run says how many, so a wrong number is never a silent one.

---

## Risks predicted for the first real run, and what actually happened

Kept as a scorecard, because the value of the list was always whether it
anticipated the right things. It mostly did — three of five were real, and the
two biggest sources of noise were not on it at all.

| Predicted | Outcome |
| --- | --- |
| A cookie banner or promo bar shifts the whole page | **Did not occur.** No banner on this page — so it was never disproved, only unexercised. Now handled by a declared `overlays` list and exercised by a fixture that puts a 64px bar inside the section (T-03) |
| Lazy-loaded images measure `0×0` | **Did not occur in the run, and is real.** No below-the-fold imagery on that page, but a fixture reproduces it exactly: Chromium defers an image 10,000px down and it measures 0×0. Lazy loading is now switched off before measuring (T-04) |
| Gotham reports `fontWeight: 350` | **Occurred, and was a false positive.** The cause was not the `@font-face` declaration but Figma reporting a variable-font axis value. The fix is a name lookup, not a tolerance (T-28) |
| Sticky headers change height on scroll | **Not an issue on this page.** `#main-header` measured 72px at scroll 0, matching the design's nav instance exactly. A viewport-anchored rect is still worth naming, so it now reports a `positioning` advisory (T-05) |
| Frame width must match the viewport | **Confirmed important, and correct.** Run at 1728 against a 1728 frame; the hero matched 1728×972 to the pixel |

**Not predicted, and the two largest problems:**

1. **Box-shape mismatch.** 8 of 35 findings. Nothing in the risk list
   anticipated that a Figma TEXT node's bounding box hugs its glyphs, nor that
   a 1604px design column would be paired with full-bleed 1728px elements.
2. **A whole-page frame does not pair with a content wrapper.** This produced
   the single most misleading finding in the project's history — a 526px height
   gap that was ~397px pairing error.

Both are authoring traps rather than engine defects, which is why config
authoring is now the weakest part of the tool.

---

## Next steps, in order

1. **Take the findings to whoever owns the theme.** The missing heading
   letter-spacing is real, consistent across all three headings, and cheap to
   fix — the first genuine defect TOVI has found. Whether the output survives
   contact with the person who has to act on it is the last untested link.
2. **Settle P-03.** Everything measured so far is against frame `11350:4869`.
   If the structured frame is current, most of the box-shape class disappears
   at the source. Not a code task — a question for whoever owns the file.
3. ~~**Re-run triage 001 and diff it.**~~ Done — 35 → exactly the 27 predicted,
   and it caught two bugs no unit test could. See
   [docs/triage-002-rerun.md](docs/triage-002-rerun.md).
4. ~~**Remove the four noise classes.**~~ Done — T-27 through T-30. No
   tolerance was widened and no comparison was deleted.
5. ~~**Write down the pairing traps.**~~ Done — seven of them, in
   [docs/tagging.md](docs/tagging.md#pairing-traps).
6. ~~**Tag the theme.**~~ Now optional. Selector pairing works, needs no
   deploy, and is what triage 001 ran on.
7. ~~**First real run.**~~ Done and triaged.
8. ~~**Build the layer-discovery command.**~~ Done — `tovi layers` dumps node
   ids and names, filterable by page, name, type and depth.
9. ~~**Decide on borders.**~~ Done — Pass A now compares per-side stroke width
   and colour, and flags a non-INSIDE `strokeAlign` as info.

---

## Design decision worth re-reading

**Your Figma layer names do not need to match anything.**

The original spec said `data-figma-id` should match the Figma layer name. The
real file made that impossible: it contains `Frame 31306`, `Rectangle 451`, and
six separate layers all named `Button`. Name-based pairing could never resolve
those.

Instead, the config maps each `figmaId` to an explicit Figma `nodeId`. The
Figma side is located by node id; the HTML side by attribute. `figmaId` is just
a label you pick. **No renaming in Figma is required** — which also means the
design file can be reorganized without breaking TOVI, as long as node ids hold.

---

## Blocked on

Nothing. Both original blockers are cleared — the live URL is known and
`data-figma-id` turned out not to be required, because selector pairing works.

Two questions still want a human answer, but neither blocks the work:

- **Which viewport is the source of truth**, 1728 (matching the frame) or 1440
  (what most visitors see).
- **Whether the −8px heading sizes are intentional.** They are real; "real" and
  "wrong" are not the same thing.

Everything else can proceed without input.
