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

- **Everything drifted by the same vertical offset** → a cookie banner or promo
  bar *inside* the section. (One outside the section is absorbed by
  normalization.)
- **An image measures `0×0`** → lazy loading. The extractor never scrolls, by
  design.
- **Every heading fails on `fontWeight`** → Figma reports a weight with no
  `@font-face` counterpart (Gotham reports `350`). Could be either a real
  finding or an artifact — check what the theme actually loads.
- **Every width off by a constant** → Figma frame width ≠ `viewport.width`.
- **A sticky header's height** → measured at scroll 0, deliberately.

### 3. Is it a documented tool gap?

Not bugs. Listed in `docs/comparison.md` and `PROGRESS.md`:

- Borders/strokes are not compared at all
- `line-height: normal` is skipped, not flagged
- Only flat gradients compare
- Text compares per element, not per text run

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
