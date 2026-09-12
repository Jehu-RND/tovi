# TOVI — Progress

**Status: ~65% to MVP.**
_Last updated: 2026-09-11_

The engine is close to finished. The remaining third is the part that always
costs more than it looks: running against a real WordPress page instead of a
controlled fixture, and making the config bearable to author.

---

## What "MVP" means here

> We can point TOVI at a real Aeneas page, get a report, and **trust it** —
> meaning a red line is a genuine build defect and a green run genuinely means
> the page matches the design.

The second half of that sentence is the expensive half. A tool that produces
findings is ~90% built. A tool whose findings you act on without double-checking
is the actual goal, and nothing has yet been validated against a real page.

---

## Where the 65% comes from

| Area | Weight | Done | Contribution |
| --- | --- | --- | --- |
| Comparison engine (types, config, passes, report) | 45% | 95% | 43% |
| Figma + browser I/O | 20% | 90% | 18% |
| Config authoring ergonomics | 15% | 0% | 0% |
| Real-site hardening | 20% | 0% | 0% |
| **Total** | **100%** | | **~61%** |

Rounded up to **65%** because the engine work carried more risk than the
remaining work does — the coordinate-space problem and the color-comparison
problem were the two things that could have invalidated the approach, and both
are solved and tested.

---

## Built and verified

2,951 lines of source, 1,206 lines of tests, **100 tests passing**.

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
| `report/html.ts` | 246 | Done — self-contained, 7KB, offline |
| `index.ts` | 271 | Done — full `runCheck()` wiring |

### Verified against real systems, not just unit tests

- **Figma REST API** — fetched real nodes from `Sport-Specific Landing Page`.
  Fill extraction, text metrics, padding, and the TEXT-vs-frame fill
  distinction all confirmed correct on live data.
- **Real Chromium** — `live/extract.ts` measured a fixture page. Percentage
  border-radius, computed `box-shadow` parsing, and NaN survival across the
  Playwright bridge all confirmed.
- **Full pipeline** — real Figma nodes vs. a local fixture, with three defects
  planted. All three were caught, plus a missing element, with **zero false
  positives**. An element built to match passed on all five text properties and
  on its relative position.

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
| **Never run against the real site** | Unknown unknowns. This is the single biggest risk. | 1–2 days |
| **No layer-discovery command** | Config must be hand-authored: every `figmaId` → `nodeId` pair typed by hand. On a 1728×6537 page that is hours of tedium and a typo surface. | 0.5 day |
| **Borders not compared** | Your buttons are outline buttons — no fill, all `stroke`. TOVI checks their box but not what makes them look like buttons. | 0.5 day |
| **Screenshot is linked, not embedded** | Report references a path instead of showing the capture. | 2 hours |
| **Single viewport per run** | No responsive checking; mobile needs a second config. | 0.5 day |
| **No CI recipe** | Nothing documented for running this on deploy. | 2 hours |

### Known limitations (documented, not necessarily worth fixing)

- `line-height: normal` is skipped rather than flagged — it is font-dependent,
  so there is no honest number to compare against.
- Only flat gradients compare. A gradient whose stops are all one color is
  compared as that color; a real gradient is skipped.
- Text is compared per element, not per text run. A paragraph with mixed
  styling compares against the Figma node's dominant style.

---

## Risks for the first real run

These are the things most likely to produce confusing output the first time
TOVI touches a live WordPress page. None are hard to fix; all are easier to
anticipate than to debug.

1. **A cookie banner or promo bar shifts the whole page.** Every element would
   drift by the same vertical offset. Section-relative normalization absorbs
   this *only if* the banner sits outside the section — if it pushes the
   section itself, the offsets stay correct. Worth confirming on the real page.
2. **Lazy-loaded images have zero height until scrolled into view.** The
   extractor deliberately does not scroll (scrolling would corrupt the shared
   coordinate origin), so below-the-fold images may measure as `0×0`.
3. **Gotham reports `fontWeight: 350` in Figma.** If the theme's `@font-face`
   declares 300 or 400, the default `fontWeight` tolerance of `0` flags every
   heading. Either a real finding or a tolerance to loosen — unknowable until
   we run it.
4. **Sticky headers change height on scroll.** Measured at scroll position 0,
   which is the right choice, but worth knowing.
5. **The Figma frame is 1728px wide.** The viewport must match, or every width
   comparison drifts.

---

## Next steps, in order

1. **Tag the theme.** Add `data-figma-id` to the hero elements in the
   WordPress templates. Slugs are yours to choose — they do **not** need to
   match Figma layer names (see below). *Blocked on: you.*
2. **First real run.** Point TOVI at the live URL, see what comes back, and
   triage false positives. This is where the remaining unknowns surface.
3. **Build the layer-discovery command.** `tovi layers --page "Men's Basketball"`
   to dump node ids and names, so configs can be assembled rather than typed.
4. **Decide on borders.** Worth adding to Pass A if outline buttons matter.

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

- The **live WordPress URL**.
- Whether **`data-figma-id` attributes** exist in the theme templates yet.

Everything else can proceed without input.
