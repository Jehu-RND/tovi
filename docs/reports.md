# Reports and exit codes

One run produces three outputs: a text summary on stdout (always), an HTML
report (`--report`), and the raw `RunReport` JSON (`--json`).

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No error-severity issues — or `--no-fail` was passed |
| `1` | At least one error-severity issue, or the run threw |

**Warnings never fail a run.** Copy drift is a warning; so is anything advisory.
`info`-severity issues are context and never affect the verdict.

`--no-fail` still prints and writes everything — it only suppresses the non-zero
exit. Use it when you want a report on every build without blocking the pipeline.

## Severity

Severity is **derived, not judged**:

| Severity | Meaning | Fails the run |
| --- | --- | --- |
| `error` | A measured delta exceeded its tolerance, or an element is missing/ambiguous | yes |
| `warning` | Advisory — copy drift, a missing optional property | no |
| `info` | Context — most notably a `skipped` comparison | no |

## Which element a finding is about

Every element carries `describes` — what the selector actually matched, in the
form devtools shows it:

```json
{ "figmaId": "more-content", "describes": "section.more-content · 342×122" }
```

The selector records what was looked for; this records what was found. It
appears in the HTML report's element header, in the terminal above that
element's findings, and in the UI. Absent when nothing was matched, so a
`missingInLive` element never claims an address it does not have.

## What a passing run shows

A green run lists what it verified, not just that it passed. Each element
carries a `checks` array — every property that was compared, in comparison
order, with both values, the delta and the tolerance it was tested against:

```json
{ "property": "width", "ok": true, "expected": "390px", "actual": "390px",
  "delta": 0, "tolerance": 1 }
```

The terminal summary carries the count:

```
6/6 elements passed, 0 error(s), 0 warning(s), 27 properties compared
```

This exists because of invariant 3. `0 errors` over eighty comparisons and
`0 errors` over none are the same sentence and opposite facts, and without the
count there was no way to tell them apart.

A failing check always has a matching Issue. The reverse does not hold:
`missingInLive`, `skipped` and other structural issues describe a comparison
that could not happen, so they contribute no check — which is exactly why a run
full of them reports few properties compared.

## The `Issue`

The atomic unit of output: one property, on one element, whose delta exceeded
its tolerance. Issues carry the raw numbers so the report shows the arithmetic
rather than just a verdict.

```ts
interface Issue {
  figmaId: string;       // pairing key
  pass: 'text' | 'geometry';
  property: IssueProperty;
  severity: 'error' | 'warning' | 'info';

  expected: string;      // design value, formatted — "24px", "rgb(17, 17, 17)"
  actual: string;        // live value, formatted

  delta?: number;        // signed (actual - expected); a deltaE for colors
  tolerance?: number;    // what the delta was tested against
  detail?: string;       // which side / corner / shadow layer
}
```

`delta` and `tolerance` are absent for non-numeric properties — `fontFamily` and
the structural issues have no meaningful arithmetic to show.

`delta` is **signed**, and the sign is informative: `+4` means the live value is
4px larger than the design, `-4` that it is smaller.

### Properties

| Property | Pass | `detail` carries |
| --- | --- | --- |
| `width`, `height` | geometry | — |
| `offsetX`, `offsetY` | geometry | — |
| `padding` | geometry | `top` / `right` / `bottom` / `left` |
| `cornerRadius` | geometry | `topLeft` / `topRight` / `bottomRight` / `bottomLeft` |
| `backgroundColor`, `color` | geometry | — |
| `shadow` | geometry | `count`, or `<index>.<metric>` e.g. `0.blur` |
| `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing` | text | — |
| `textContent` | text | — (always a warning) |
| `missingInFigma`, `missingInLive`, `ambiguousInLive`, `skipped` | structural | varies |

### Structural issues

Reported **once per element**, not once per pass, and they short-circuit the
rest of that element's comparison.

| Property | Means | Usually |
| --- | --- | --- |
| `missingInFigma` | The node id returned nothing, or could not be normalized | A wrong `nodeId`, or a layer deleted from the file |
| `missingInLive` | The selector matched nothing | A missing `data-figma-id`, or content that did not render |
| `ambiguousInLive` | The selector matched more than one element | The same tag on a repeated component — narrow it with `selector` |
| `skipped` | A comparison did not run | Geometry: the section container was unavailable on one side. Text: a property neither side reports comparably, most often `line-height: normal` |

TOVI never picks one element out of an ambiguous match. Guessing would attribute
a delta to an element you did not mean and send you editing the wrong rule.

## The `RunReport`

What `--json` writes, and what the HTML renderer consumes:

```jsonc
{
  "timestamp": "2026-09-14T12:00:00.000Z",
  "url": "https://example.com/",
  "figmaFileKey": "AbCdEf123456GhIjKl",
  "viewport": { "width": 1440, "height": 900 },
  "summary": {
    "elementsChecked": 6,
    "elementsPassed": 4,
    "elementsFailed": 2,
    "errorCount": 3,
    "warningCount": 1
  },
  "elements": [
    {
      "figmaId": "hero-heading",
      "config": { "figmaId": "hero-heading", "nodeId": "1:23" },
      "paired": true,
      "errorCount": 1,
      "warningCount": 0,
      "issues": [
        {
          "figmaId": "hero-heading",
          "pass": "text",
          "property": "fontSize",
          "severity": "error",
          "expected": "48px",
          "actual": "44px",
          "delta": -4,
          "tolerance": 0.5
        }
      ]
    }
  ],
  "status": "fail"
}
```

The token never appears anywhere in this structure. The file key does.

### Ordering is guaranteed

Two runs over an unchanged page produce **byte-identical** JSON. That is the
point of the format — diffing reports across builds is what makes drift visible
over time.

- Elements follow **config order**.
- Issues within an element follow severity, then a fixed property order, then
  `detail`.

If you add a new `IssueProperty`, add it to `PROPERTY_ORDER` in
[report/merge.ts](../src/report/merge.ts) or it sorts last and its position
becomes insertion-dependent.

## HTML report

```bash
npm run check -- -c tovi.config.json -r out/report.html
```

A single self-contained file: inline CSS, no external assets, no CDN scripts, and
the screenshot embedded as a `data:` URI. It opens from disk with no network,
which is what makes it usable as a CI artifact.

It shows, per element, the property, expected value, actual value, and the delta
alongside the tolerance it was tested against — so a reader can see *why* a line
is red without re-deriving the arithmetic. Color values render with a swatch.

Everything interpolated is escaped. Layer names come from a design file and text
content from a live page; both are treated as untrusted input.

### Screenshots

```bash
npm run check -- -c tovi.config.json -r out/report.html -s out/page.png
```

The capture is **embedded** into the report as a `data:` URI and rendered at the
bottom, so the HTML stays a genuine single file — one artifact to attach to a PR
or archive, with no image to lose alongside it.

Captures over **4MB** are not embedded: base64 inflates a file by about a third,
and a full-page capture of a long page gets there easily, past which the report
becomes something browsers struggle to open. Over the cap the report names the
path instead and the CLI prints a note saying so, so a missing capture is never
silent.

## Text summary

Printed on every run, including in CI logs. It leads with the verdict, lists one
line per issue, and closes with the counters:

```
TOVI FAIL  https://example.com/  (1440x900)
  error   hero-cta  width  expected 180px  actual 200px  delta +20
  error   hero-heading  fontSize  expected 48px  actual 44px  delta -4
  error   hero-card  padding.left  expected 32px  actual 24px  delta -8
  warning hero-heading  textContent  expected Ship faster  actual Ship fast
  4/6 elements passed, 3 error(s), 1 warning(s)
  report: out/report.html
  json:   out/report.json
```

Elements with no issues are omitted entirely — a passing element produces no
lines, only its contribution to the counters. The `report:` and `json:` lines
appear only when those flags were passed.

## Consuming the JSON

The report is plain data with no cycles, so `jq` works directly:

```bash
# Every error, one line each
jq -r '.elements[].issues[] | select(.severity=="error")
       | "\(.figmaId)  \(.property)  \(.expected) -> \(.actual)"' out/report.json

# Which elements failed
jq -r '.elements[] | select(.errorCount > 0) | .figmaId' out/report.json

# Did the run pass
jq -r '.status' out/report.json
```

Types are exported from [src/report/types.ts](../src/report/types.ts) if you
want to consume it from TypeScript.
