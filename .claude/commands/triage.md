---
description: Decide whether a TOVI finding is a real defect or an artifact
argument-hint: [figmaId or property, or paste the issue]
allowed-tools: Read, Grep, Glob, Bash(jq:*), Bash(cat:*)
---

Triage a finding: $ARGUMENTS

The goal is a verdict, not a survey. **Real build defect**, **environmental
artifact**, or **tool gap** — and what to do about it.

A tool that cries wolf gets ignored, and an ignored check is worse than no
check. But weakening a check to make a run pass is never the answer either.

## Work through these in order

### 1. Is it structural?

| Property | Most likely cause |
| --- | --- |
| `missingInLive` | Attribute not in deployed markup, or a stale cache. Check the live page, not the local template |
| `missingInFigma` | Wrong `nodeId`, or a layer deleted and recreated |
| `ambiguousInLive` | Same tag on a repeated component — needs a narrowing `selector` |
| `skipped` | The section container was unavailable on one side. Fix the section element first; its own issue is the real one |

### 2. Is it a known environmental artifact?

Check these before concluding a build defect. Full detail in
`docs/troubleshooting.md`.

**Read the run notes at the top of the report first.** They say what was done
to the page before it was measured — overlays hidden, lazy images promoted,
images that never arrived — and an overlay that hid *nothing* explains a whole
column of offsets on its own.

- **Everything drifted by the same vertical offset** → a cookie banner or promo
  bar *inside* the section. (One outside it is absorbed by normalization.) Add
  it to `overlays` in the config and re-run; the note will say what it hid.
- **An image measures `0×0`** → lazy loading is already switched off before
  measuring, so this is *not* the cause. Read the `zeroSize` advisory's
  `detail`: either an image did not arrive inside the 5s budget, or the element
  is hidden / has no intrinsic size. The extractor never scrolls, by design.
- **Every heading fails on `fontWeight`** → Figma reports a variable-font axis
  value, not a CSS weight (Gotham reports `350`). Check the node's `fontStyle`:
  `Medium` is 500, `Bold` is 700. If those agree with the live value, it is an
  artifact. **Do not raise the tolerance** — that hides genuine weight defects.
- **A text node's `width`/`offsetX` is far off** → look for a `boxShape`
  advisory on the same element. A `WIDTH_AND_HEIGHT` node's box hugs its
  glyphs, so it is not a layout box and should not be paired with a
  block-level element. `tovi layers` marks these rows `hugs text`.
- **A whole-page frame disagrees with a content wrapper** → the frame usually
  draws the header and footer too. Confirm the live element spans the same
  thing the frame does before believing the delta.
- **Every width off by a constant** → Figma frame width ≠ `viewport.width`.
- **A sticky or fixed element's offset** → look for a `positioning` advisory.
  Everything is measured at scroll 0, deliberately, and a viewport-anchored
  rect only means what it appears to mean there.

### 3. Is it a documented tool gap?

Not bugs. Listed in `docs/comparison.md` and `PROGRESS.md`:

- `line-height: normal` is skipped, not flagged
- Only flat gradients compare
- Text compares per element, not per text run
- Page furniture is hidden only if the config declares it in `overlays` — it is
  never detected

Three gaps that used to live here are closed, and it is worth knowing how, since
the findings they produced are in older reports: a stroke on a TEXT node is now
reported as `-webkit-text-stroke` rather than compared as a border (T-29),
`fontWeight` resolves from the style name before falling back to Figma's number
(T-28), and `fontAliases` declares two names for one typeface (T-30). None of
them raised a tolerance.

### 4. Otherwise, it is probably real

Check the arithmetic before saying so. The issue carries `expected`, `actual`,
`delta`, and `tolerance` — confirm the delta genuinely exceeds the tolerance and
that the sign points the way you think (`+` means live is larger than design).

## Deliver

State the verdict plainly, then the fix:

- **Real defect** → what to change in the build, and where
- **Artifact** → the specific config or page change (a `selector`, an explicit
  image size, a matched `viewport.width`) — a tolerance bump is the last resort,
  not the first
- **Tool gap** → say the check does not exist; do not pretend a passing result
  means the property is correct

Never recommend raising a default tolerance without a measured justification.
The defaults are calibrated: `color: 2` sits between a deltaE of 0.34
(invisible) and 3.49 (visible).
