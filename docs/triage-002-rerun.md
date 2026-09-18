# Triage 002 — re-running triage 001 against the same five elements

_2026-09-18. Same file, same frame, same five node ids, same selectors, same
1728 viewport as [triage 001](triage-001-mens-basketball.md)._

Triage 001 sorted 35 findings into 19 genuine defects and 16 noise, in four
classes. Four tasks then closed those classes at the source. This is the run
that checks whether the findings actually moved where the arithmetic said they
would — because until someone does that, "the noise is gone" is a claim about
code, not about output.

## The result

| | Triage 001 | Triage 002 |
| --- | --- | --- |
| Elements passed | 1 / 5 | 1 / 5 |
| Errors | **35** | **27** |
| Advisories (`info`) | 0 | 4 |
| Properties compared | not recorded | 47 |

**27 is exactly the predicted number**, and it is worth doing the arithmetic in
public rather than declaring a win:

```
35  triage 001
−1  fontWeight 350, a variable-font axis value        T-28
−4  a stroke on a TEXT node compared as a CSS border  T-29
−3  Gotham vs "Hco Gotham"                            T-30
───
27  = 19 genuine defects + 8 box-shape findings
```

The 8 box-shape findings were never going to disappear. T-27 **names** that
class, it does not remove it: a TEXT node that shrink-wraps to its glyphs still
produces a real width delta against a laid-out element, and suppressing it
would hide a text element genuinely built at the wrong width. Three
`boxShape` advisories now sit beside those deltas saying which kind they are.

The 19 genuine defects are unchanged and still stand: three headings missing
their negative tracking, two built 8px small, two at weight 600 against a
design Bold, and the height/offsetY consequences of the type being smaller.

## What a run against the real file caught that the tests did not

Two things, and both are the argument for doing this at all.

### `textAutoResize` is not where the Plugin API puts it

T-27 shipped with six passing unit tests and **could never have fired on a real
file.** The Figma *Plugin* API exposes `node.textAutoResize`; the *REST* API
this tool uses puts it inside the node's `style` block, next to `fontFamily`
and `letterSpacing`. The code read the node level, found `undefined` on every
TEXT node, and emitted nothing.

Nothing failed. That is the shape of the bug: an advisory that never fires
looks exactly like a design with no shrink-wrapped text in it. The tests passed
because their fixtures were invented rather than copied from a real response —
they asserted that the code read the field from where the code read it.

The first run of this triage produced **zero** `boxShape` advisories on a node
whose findings were `width 742 → 1470` and `offsetX −364`, which is the
signature of the thing verbatim. That is what prompted the check.

Fixed, and pinned: `normalizeFigmaNode` and `flattenLayers` both read
`style.textAutoResize`, and both suites now carry a test asserting that a
node-level `textAutoResize` is *ignored*, with the fixtures rewritten from real
API responses.

### A mechanism nobody declared is a mechanism that does nothing

`fontAliases` shipped in T-30 and the three `Gotham` vs `"Hco Gotham"` findings
were still there, because `tovi.config.json` never declared an alias. One line
removed all three:

```json
"fontAliases": { "Gotham": "Hco Gotham" }
```

Working as designed — the map is declared, never inferred, and that is the
whole point of it. But "the class is closed" was true of the code and false of
the output, and only a run could tell the difference.

## Determinism, verified against a real page

The run was executed twice and the two `report.json` files compared:

```
reports identical apart from the timestamp: True
```

Invariant 4 has been asserted by unit tests since the beginning. This is the
first time it has been measured against a live production page — one with
fonts, third-party scripts and real network timing — rather than a fixture.

## What this does and does not settle

**Settled.** The four noise classes are closed in output, not just in code. The
findings dropped to exactly the predicted count. The reports are reproducible
against a real page.

**Not settled.** This still runs against frame `11350:4869`. If the structured
frame `13020:20866` is the authoritative one, most of the box-shape class
disappears at the source and the pairing changes — P-03 is still the highest-
value open question and nothing here touches it.

Nor has anyone acted on the 19 genuine defects. The letter-spacing finding is
still the one to take to whoever owns the theme, and whether the report survives
contact with the person who has to act on it remains the last untested link.
