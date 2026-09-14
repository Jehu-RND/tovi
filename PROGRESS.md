# TOVI — Progress

**Status: ~80% to MVP.**
_Last updated: 2026-09-14_

> Task-level breakdown lives in [TASKS.md](TASKS.md) — 56 tasks across todo,
> in progress, and done. This file carries the reasoning; that one carries the list.

The engine is finished and has now **survived contact with a real page**. The
first real run was triaged on 2026-09-14
([docs/triage-001-mens-basketball.md](docs/triage-001-mens-basketball.md)) and
the verdict is that the findings are trustworthy: the section container passed
clean, 19 of the 35 findings are genuine defects, and the other 16 fall into
four classes of noise, none of which is a miscomparison. What remains is removing the four classes of noise the triage
identified, and making the config bearable to author — which the triage showed
is now the weakest part of the tool, not the engine.

---

## What "MVP" means here

> We can point TOVI at a real Aeneas page, get a report, and **trust it** —
> meaning a red line is a genuine build defect and a green run genuinely means
> the page matches the design.

The second half of that sentence is the expensive half. A tool that produces
findings is ~90% built. A tool whose findings you act on without double-checking
is the actual goal.

As of triage 001 the first half is demonstrated and the second half is close:
the findings were checked one by one against independently measured values and
they held. What stops a reader trusting the output today is not accuracy but
volume — 8 of 35 findings came from one authoring mistake, and they look exactly
like the 19 real ones.

---

## Where the 80% comes from

| Area | Weight | Done | Contribution |
| --- | --- | --- | --- |
| Comparison engine (types, config, passes, report) | 45% | 98% | 44% |
| Figma + browser I/O | 20% | 95% | 19% |
| Config authoring ergonomics | 15% | 40% | 6% |
| Real-site hardening | 20% | 55% | 11% |
| **Total** | **100%** | | **~80%** |

Real-site hardening moved from 0% to 55% because the run that was supposed to
surface unknown unknowns surfaced only known ones. The remaining 45% is
T-27–T-31: four specific, scoped noise-removal tasks, each with a verdict
already written down.

Config authoring ergonomics moved to 40% on the UI, layer listing and selector
probe — but the triage was blunt about the gap that is left. Two of the four
noise classes are authoring mistakes the tool lets you make silently.

---

## Built and verified

**162 tests passing**, including two integration suites that run against real
Chromium.

| Module | LOC | State |
| --- | --- | --- |
| `types.ts` | 183 | Done |
| `report/types.ts` | 112 | Done |
| `config/schema.ts` | 111 | Done |
| `config/loadConfig.ts` | 275 | Done — strict validation, every error names its path |
| `compare/color.ts` | 133 | Done — CIEDE2000 via culori, separate alpha check |
| `compare/issues.ts` | 118 | Done — shared Issue construction |
| `compare/textPass.ts` | 138 | Done — Pass B, five properties |
| `compare/geometryPass.ts` | 315 | Done — Pass A, section-relative normalization |
| `figma/client.ts` | 206 | Done — retries, chunking, typed errors |
| `figma/normalize.ts` | 289 | Done — verified against the real file |
| `live/extract.ts` | 392 | Done — verified against a browser fixture |
| `report/merge.ts` | 162 | Done — deterministic ordering |
| `report/html.ts` | 246 | Done — self-contained, offline, embeds the capture |
| `index.ts` | 271 | Done — full `runCheck()` wiring |

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
| **Four classes of false positive** | Named and scoped by the triage (T-27–T-31). None requires weakening a check. | 1–2 days |
| **Single viewport per run** | No responsive checking; mobile needs a second config. | 0.5 day |
| **Nothing stops a bad pairing** | The 526px finding was an authoring mistake the tool accepted silently. Selector resolution (T-32) closed the commonest one; frame choice (P-03) is still unguarded. | 0.5 day |

### Known limitations (documented, not necessarily worth fixing)

- `line-height: normal` cannot be compared — it is font-dependent, so there is
  no honest number. Now surfaced as an info-severity skip rather than dropped
  silently, so an uncompared property never reads as a passing one.
- Only flat gradients compare. A gradient whose stops are all one color is
  compared as that color; a real gradient is skipped.
- Text is compared per element, not per text run. A paragraph with mixed
  styling compares against the Figma node's dominant style.
- A stroke on a TEXT node is compared as a CSS border. It is a glyph outline —
  `-webkit-text-stroke`, not `border` — so the comparison can only ever fail
  (T-29).
- `fontWeight` uses Figma's raw number, which for a variable font is an axis
  value rather than a CSS weight (T-28).
- No font-family aliasing, so the same typeface under a foundry-prefixed CSS
  name reports on every text element (T-30).

---

## Risks predicted for the first real run, and what actually happened

Kept as a scorecard, because the value of the list was always whether it
anticipated the right things. It mostly did — three of five were real, and the
two biggest sources of noise were not on it at all.

| Predicted | Outcome |
| --- | --- |
| A cookie banner or promo bar shifts the whole page | **Did not occur.** No banner on this page. Untested, not disproved |
| Lazy-loaded images measure `0×0` | **Not exercised.** No below-the-fold imagery in the run. T-04 still stands |
| Gotham reports `fontWeight: 350` | **Occurred, and was a false positive.** The cause was not the `@font-face` declaration but Figma reporting a variable-font axis value. The fix is a name lookup, not a tolerance (T-28) |
| Sticky headers change height on scroll | **Not an issue.** `#main-header` measured 72px at scroll 0, matching the design's nav instance exactly |
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

1. **Remove the four noise classes** — T-27 through T-30. Each has a written
   verdict and none requires weakening a check. This is what stands between the
   current output and output someone will act on without re-deriving it.
2. **Write down the pairing traps** (T-31). Two of the four noise classes are
   mistakes the tool currently lets an author make in silence.
3. **Take the findings to whoever owns the theme.** The missing heading
   letter-spacing is real, consistent across all three headings, and cheap to
   fix — the first genuine defect TOVI has found.
4. ~~**Tag the theme.**~~ Now optional. Selector pairing works, needs no
   deploy, and is what triage 001 ran on.
5. ~~**First real run.**~~ Done and triaged.
6. ~~**Build the layer-discovery command.**~~ Done — `tovi layers` dumps node
   ids and names, filterable by page, name, type and depth.
7. ~~**Decide on borders.**~~ Done — Pass A now compares per-side stroke width
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
