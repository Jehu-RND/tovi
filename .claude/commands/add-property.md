---
description: Add a new compared property, following the full checklist
argument-hint: <property name, e.g. border>
allowed-tools: Read, Edit, Write, Grep, Glob, Bash(npm run typecheck), Bash(npm test)
---

Add a new compared property end to end: $ARGUMENTS

Adding a property touches seven places. Missing any one produces a property that
either never runs, sorts nondeterministically, or cannot be configured. Work
through all of them.

## Checklist

1. **`src/types.ts`** — add the field to `FigmaSpec` (optional: absent means the
   design does not set it) and `LiveStyles` (required: the browser always reports
   something).

2. **`src/figma/normalize.ts`** — extract it from the raw node. This module owns
   every Figma quirk: 0–1 float colors, percentage line heights, single-value
   corner radii. Normalize units here, not in the pass.

3. **`src/live/extract.ts`** — extract it from `getComputedStyle`. Remember the
   split: the browser half returns raw numbers and CSS strings, and parsing that
   needs culori happens on the Node side in `normalizeLiveStyles()`. Do not
   import anything into the `page.evaluate()` half.

4. **`src/config/schema.ts`** — add a tolerance key to `Tolerances` and a
   calibrated value to `DEFAULT_TOLERANCES`. Justify the number; do not copy one.

5. **`src/report/types.ts`** — add the `IssueProperty`.
   **`src/report/merge.ts`** — add it to `PROPERTY_ORDER` in the right position.
   An unlisted property sorts last and its position becomes insertion-dependent,
   which breaks byte-identical output.

6. **The pass** (`geometryPass.ts` or `textPass.ts`) — compare it using the
   helpers in `compare/issues.ts` (`compareNumeric`, `valueIssue`). Never build
   an `Issue` inline. Skip the property when it is absent on either side: an
   unset design value is not an assertion that the live value must be zero.

7. **Tests** — extend the existing suites. Cover all four:
   - within tolerance → no issue
   - past tolerance → one issue, correct `delta` and `tolerance`
   - absent on either side → skipped, not compared against `undefined`/`NaN`
   - `delta` sign correct (`+` means live is larger than design)

8. **Docs** — update `docs/comparison.md` (what is compared, and how) and
   `docs/configuration.md` (the tolerance table). If this closes a known gap,
   remove it from the gap lists in `docs/comparison.md`, `PROGRESS.md`, and
   `README.md`.

## Then

Run `npm run typecheck && npm test`. Report honestly.

## Note on borders

Borders/strokes are the highest-value missing property — outline buttons have no
fill at all, so TOVI currently checks their box but not what makes them look like
buttons. If that is what you are adding, note that Figma expresses them as
`strokes` + `strokeWeight` + `strokeAlign`, and `strokeAlign` has no CSS
equivalent: `INSIDE` matches CSS `border`, `CENTER` and `OUTSIDE` do not.
