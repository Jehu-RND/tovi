# Comparison passes

Both passes reduce to one primitive: measure a delta, compare it to a tolerance,
emit an [`Issue`](reports.md#the-issue) when it is exceeded. That primitive lives
in [src/compare/issues.ts](../src/compare/issues.ts) so the passes stay
consistent about rounding, formatting, and severity.

Deltas are rounded to **3 decimals before** they are tested, so a value that
differs only in float noise (`24` vs `24.0000000001`) can never trip a zero
tolerance.

A property is **skipped** whenever it is absent on either side. An unset design
value is not an assertion that the live value must be zero.

---

## Coordinate normalization

*Read this before changing anything in
[geometryPass.ts](../src/compare/geometryPass.ts).*

Figma canvas coordinates and browser viewport coordinates **must not** be
compared directly. They are unrelated spaces:

- `FigmaSpec.absoluteBoundingBox` is in Figma **canvas** space. Its origin is
  wherever the frame happens to sit on an infinite canvas. A designer dragging
  the frame 500px right changes every `x` in the file without changing the
  design at all. In the real file this was developed against, the hero frame
  sits at `(-94257, -63049)`.
- `LiveStyles.boundingRect` comes from `getBoundingClientRect()`, in **viewport**
  space. It shifts with scroll position, with the height of anything above the
  section, and with any horizontal centering applied at the current width.

Comparing those absolute numbers would report a failure on every element for
reasons that have nothing to do with the design.

So positions are normalized against a section container first — on each side
**independently**, using that side's own section rect:

```
offsetX = element.x - section.x
offsetY = element.y - section.y
```

Those relative offsets are what gets compared. Both sides then measure the same
thing — *how far into its section does this element start* — which is the actual
design intent, and which is invariant to canvas origin, scroll position, and
page chrome.

```
        FIGMA CANVAS                          BROWSER VIEWPORT
   (-94257, -63049) origin                     (0, 0) origin
   ┌─────────────────────────┐            ┌─────────────────────────┐
   │  section  (x=-94257)    │            │  section  (x=120)       │
   │  ┌───────────────────┐  │            │  ┌───────────────────┐  │
   │  │ heading           │  │            │  │ heading           │  │
   │  │ (x=-94193)        │  │            │  │ (x=184)           │  │
   │  └───────────────────┘  │            │  └───────────────────┘  │
   └─────────────────────────┘            └─────────────────────────┘

        offsetX = 64                            offsetX = 64
        └──────────────────── compared ─────────────────┘
```

Sizes need no such treatment: width and height are already relative quantities
and compare directly.

Two consequences worth remembering:

- The section rect must be measured on **both** sides. A run without a live
  section rect cannot do Pass A position checks at all — it fails loudly with a
  `skipped` issue rather than silently falling back to absolute coordinates.
- The Figma frame width should match the configured viewport width. If it does
  not, relative offsets are still valid, but a responsive layout may
  legitimately differ — a config problem to surface, not a per-element diff.

This is locked in by a test that fails if anyone reintroduces absolute
comparison. Do not remove it.

### Why a single `page.evaluate`

Every element is measured in **one** `page.evaluate()` call. This is not an
optimization — it is a correctness requirement.

`getBoundingClientRect()` is viewport-relative, and Playwright's locator helpers
scroll elements into view. Measuring elements one at a time would read each
against a different scroll origin. Pass A subtracts the section rect from the
element rect, which only cancels scroll out if both were measured at the **same**
scroll position.

The extractor also never scrolls, for the same reason. The cost is real and
documented: lazy-loaded images below the fold may measure `0×0`.

---

## Pass B — text

Compares how the type is set. Five properties:

| Property | Compared as | Tolerance key |
| --- | --- | --- |
| `fontFamily` | exact match on the first family in the stack | — (no tolerance) |
| `fontSize` | px | `fontSize` |
| `fontWeight` | numeric 100–900 | `fontWeight` |
| `lineHeight` | px | `lineHeight` |
| `letterSpacing` | px | `letterSpacing` |

Pass B is deliberately **position-blind**. It never looks at where text sits,
only at how it is set, which keeps it stable across layout reflow and lets it
run on elements whose geometry is expected to differ.

Units are already px by the time specs reach this pass — Figma percentages and
CSS keywords are resolved during normalization, not during comparison.

### Font family

Only the **first** family in a CSS stack is compared; the rest are fallbacks the
design never claimed anything about. Normalization strips quotes, trims, and
lowercases:

```
'"Gotham", Helvetica, sans-serif'  ->  gotham
"Gotham"                           ->  gotham
```

There is no meaningful numeric delta for a family name, so no tolerance applies.
It either matches or it does not.

### Skipped properties

A property is compared only when it is **usable on both sides** — a non-empty
string, or a finite number. This is what keeps `line-height: normal` from
surfacing as a confident-looking failure: the browser reports it as `NaN`, so it
cannot be compared against a number.

But a skipped property is **reported, not dropped**. Each one emits an
`info`-severity `skipped` issue whose `detail` says which property and why:

```
info  hero-heading  skipped  expected lineHeight compared  actual lineHeight skipped
      detail: line-height is `normal` on the live element — font-dependent,
              so there is no honest number to compare
```

Silence would be indistinguishable from a pass, which is the one thing this tool
must never do. The skip never fails a run; it is context for reading the rest.

Set an explicit `line-height` in CSS if you want it actually compared.

### Copy drift

When the Figma node carries `characters`, its text is compared against the live
`textContent` — both whitespace-collapsed and trimmed.

A mismatch is a **warning**, never an error. Content legitimately differs between
a design file and a live CMS, and when it does not, the drift usually explains a
wrapping or height difference reported elsewhere.

### Non-text nodes

A node with no `text` spec produces no Pass B issues at all. Running `["text"]`
against a frame is a no-op, not a failure.

---

## Pass A — geometry & spec

Compares Figma spec values against `getBoundingClientRect()` +
`getComputedStyle()`.

| Property | Issues emitted | Tolerance key |
| --- | --- | --- |
| size | `width`, `height` | `size` |
| position | `offsetX`, `offsetY` | `position` |
| padding | one `padding` per drifting side | `padding` |
| corner radius | one `cornerRadius` per drifting corner | `cornerRadius` |
| border | one `border` per drifting side, width and colour | `border`, `color` |
| background fill | `backgroundColor` | `color` |
| text color | `color` | `color` |
| shadows | one `shadow` per drifting layer | `shadow`, `color` |

Each spec property is skipped when the design does not set it.

### Padding and corner radius

Compared **per side** and **per corner**, so a drifting `padding-left` reports as
one issue whose `detail` is `left`, rather than as a whole-box failure. Figma's
single `cornerRadius` is expanded to four corners during normalization, and CSS
percentage radii are resolved against the live element's box.

The **expected** radius is clamped before comparison. CSS caps `border-radius`
so adjacent corners cannot overlap — at half the shorter side — so a 40px radius
specified on a 48px-tall pill renders as 24px. That is the browser agreeing with
the design, not drifting from it, so TOVI clamps the design value the same way
rather than reporting a 16px failure on every pill.

### Borders

Figma models a stroke as **paints plus a weight**, where the paints apply to the
whole node and only the weight may vary per side (`individualStrokeWeights`).
CSS varies both. Both normalize into a per-side `{ width, color }`, with Figma's
single stroke colour repeated across all four sides.

Width is compared on every side, against the `border` tolerance. Colour is
compared against the `color` tolerance, but **only where a border is actually
drawn on both sides** — CSS reports a colour for a zero-width border (usually
`currentColor` resolved against the text), and flagging that would report a
mismatch on an element with no visible border at all.

Issues carry a `detail` of `<side>.width` or `<side>.color`.

A stroke with no explicit weight is read as **1px**, which is how Figma draws it.
A stroke whose every side is zero-width is treated as no stroke at all.

#### `strokeAlign` has no full CSS equivalent

CSS borders are always drawn **inside** the border box. Figma's `strokeAlign`
has three values, and only one of them matches:

| `strokeAlign` | CSS equivalent |
| --- | --- |
| `INSIDE` | `border` — the widths and the box both correspond |
| `CENTER` | none — half the stroke is painted outside the node's bounds |
| `OUTSIDE` | none — the whole stroke is painted outside |

Widths still compare under `CENTER` and `OUTSIDE`, but the box they imply does
not. Rather than let a matching width read as a matching design, Pass A emits an
`info`-severity issue with a `detail` of `strokeAlign` naming the alignment. It
never fails a run — it is context for reading the other numbers.

### Shadows

Shadows are ordered lists, compared index by index.

A **count mismatch** short-circuits: it reports `2 shadows` vs `1 shadow` with a
`detail` of `count` and compares nothing further. Pairing stacks of different
lengths heuristically would attribute a delta to the wrong layer and send
someone editing the wrong rule.

When the counts match, each layer compares:

- `offsetX`, `offsetY`, `blur`, `spread` against the `shadow` tolerance
- its color against the `color` tolerance, as a deltaE
- `inset` vs outset, which short-circuits that layer — a flip makes the
  remaining numbers incomparable

Each issue carries a `detail` of `<index>.<metric>`, e.g. `0.blur`.

### Colors

See below — colors never compare per channel.

---

## Color

Figma and CSS describe the same color in incompatible ways, so both sides are
converted to a shared `Rgba` form (`0–255` channels, `0–1` alpha) before
anything is compared. All actual color math — parsing, space conversion,
perceptual distance — is delegated to [culori](https://culorijs.org/). TOVI does
not implement its own.

| Source | Form | Converted by |
| --- | --- | --- |
| Figma | `{ r, g, b, a }` as 0–1 floats, plus a paint `opacity` | `fromFigmaColor()` |
| CSS | `rgb()`, `rgba()`, `color()`, named, hex | `fromCssColor()` |

### Perceptual distance, not per-channel

Colors are compared as **CIEDE2000 deltaE**. Per-channel RGB difference treats a
5-point shift in blue the same as a 5-point shift in green, which the eye does
not.

The default tolerance of `2` sits between two measured comparisons:

| Comparison | deltaE | Visible? |
| --- | --- | --- |
| `#0066FF` vs `#0067FF` | 0.34 | no |
| `#0066FF` vs `#0070FF` | 3.49 | yes |

### Alpha is checked separately

deltaE operates on hue, chroma, and lightness — it **ignores alpha entirely**.
So opacity is compared on its own, against a fixed epsilon of `0.01`. Figma
stores alpha as a float and browsers round it to 2–3 decimals on the way out of
`getComputedStyle`, so an exact comparison would report noise.

Below an alpha of `0.005` a color is treated as invisible and its channels stop
mattering — two fully transparent colors match regardless of their RGB values.

### Gradients

Only **flat** gradients compare. A gradient whose stops are all one color is
compared as that color; a real multi-stop gradient is skipped. Gradient
comparison is out of scope for v1.

---

## What is not compared

These are known, documented gaps — not bugs.

| Gap | Why it matters |
| --- | --- |
| **`line-height: normal`** | Cannot be compared — font-dependent, so no honest number exists. Reported as an info skip rather than silently dropped |
| **Real gradients** | Only flat ones compare |
| **Per-run text styling** | Text compares per element against the node's dominant style, so a paragraph with mixed styling compares against one of them |
| **Responsive behaviour** | One viewport per run; a second breakpoint needs a second config |


## Two comparisons that are deliberately not made

Both come from triage 001, and both replace a check that could only ever fail
with a note that says why — never with silence, which invariant 3 forbids.

### A stroke on a TEXT node

A stroke on a text layer is a glyph outline. Its CSS equivalent is
`-webkit-text-stroke`; `border` on the same element draws a rectangle around the
text instead. Comparing the two is a category error, so the widths are not
compared and the stroke is reported as `info`:

```
info  heading  border.textStroke  expected 1px text outline (-webkit-text-stroke)
                                  actual not compared — CSS border draws a box…
```

Borders on every other node type compare exactly as before.

### `fontWeight` when the style has a name

Figma reports `fontWeight` as the font's own weight-axis value, which for a
variable font is not a CSS weight: Gotham Medium comes back as `350` against a
correct CSS `500`. The same node also reports `fontStyle: "Medium"`, and Medium
*is* 500 — so the **name wins when CSS defines it**, and the number is the
fallback.

| `fontStyle` | CSS weight |
| --- | --- |
| Thin, Hairline | 100 |
| ExtraLight, UltraLight | 200 |
| Light | 300 |
| Regular, Normal | 400 |
| Medium | 500 |
| SemiBold, DemiBold | 600 |
| Bold | 700 |
| ExtraBold, UltraBold | 800 |
| Black, Heavy | 900 |

Slant words are dropped, and spacing and case are ignored, so `SemiBold Italic`,
`semi bold` and `SemiBold` all resolve to 600. A name outside the table — a
foundry's own `Book` or `Roman` — falls back to Figma's number rather than being
guessed at.

This narrows nothing else: a node whose style is `Bold` still resolves to 700
and still fails against a live `600`. That is the finding the mapping must not
hide, and a test pins it.
