# Configuration

`tovi.config.json` is the entire input surface of a run: which Figma file, which
live URL, which elements, and how much drift is acceptable.

Secrets are **not** part of it. The Figma token comes from `FIGMA_TOKEN` only.

`tovi.config.json` is **gitignored**, because a real config names a client URL.
For CI, commit a separate config — the shipped workflow reads `tovi.ci.json`.
See [ci.md](ci.md).

The schema lives in [src/config/schema.ts](../src/config/schema.ts); validation
in [src/config/loadConfig.ts](../src/config/loadConfig.ts). A worked example is
[tovi.config.example.json](../tovi.config.example.json).

## Top level

```json
{
  "figmaFileKey": "AbCdEf123456GhIjKl",
  "url": "https://example.com/",
  "section": "hero",
  "viewport": { "width": 1440, "height": 900, "deviceScaleFactor": 1 },
  "tolerances": { },
  "elements": [ ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `fontAliases` | no | Font names that mean the same typeface on each side. See below |
| `figmaFileKey` | no | Figma file key. Falls back to `FIGMA_FILE_KEY` when omitted; the config value takes precedence when both are set |
| `url` | **yes** | Live page to inspect |
| `section` | **yes** | `figmaId` of the container every element's position is measured against |
| `viewport` | **yes** | Browser viewport for the Playwright run |
| `timeout` | no | Navigation timeout in ms. Default `30000` |
| `tolerances` | no | Run-level thresholds; defaults are merged in |
| `overlays` | no | Selectors for page furniture to hide before measuring. See below |
| `elements` | **yes** | The elements to check. Must be non-empty |

Validation is strict and eager: wrong types, negative tolerances, unknown
*tolerance* keys, and unresolvable references all raise a `ConfigError` naming
the exact path that is wrong. This is deliberate — a run that starts with a
half-valid config produces mismatches that look like design drift but are really
typos, which is the most expensive kind of false positive the tool can emit.

Unknown keys at the **top level and on elements are ignored**, which is what
lets the example config carry a `"$comment"` field. Only tolerance blocks reject
unknown keys, because a misspelled tolerance would silently fall back to the
default and quietly weaken a check.

### `section`

The `figmaId` of the container both sides are normalized against. Pass A
subtracts this rect from each element's position to get section-relative
offsets, which cancels out canvas origin, page scroll, and global centering.

**It must itself be listed in `elements`** — its node id has to be known so
its rect can be fetched. Validation rejects a `section` that names no configured
element.

If the section is configured but turns out to be missing on one side *at run
time* — the Figma node did not come back, or the selector matched nothing — Pass
A does not silently fall back to absolute coordinates. It emits an
`info`-severity `skipped` issue for each affected element saying which container
was unavailable. An absent check that looks like a passing check is the worst
output this tool can produce.

### `viewport`

```json
{ "width": 1440, "height": 900, "deviceScaleFactor": 1 }
```

`width` and `height` are required **positive integers**; `deviceScaleFactor` is
an optional positive number.

**Your Figma frame width should match `viewport.width`.** If it does not,
section-relative offsets are still valid, but a responsive layout may
legitimately differ at that width — which is a config problem to fix, not a
per-element diff to report.

TOVI runs one viewport per run. Responsive checking means a second config file
and a second run.

## Tolerances

Every comparison is a deliberate threshold, not an exact-match assertion. A
difference is reported only when it **exceeds** its tolerance (`>`, not `>=`).

| Key | Pass | Unit | Default | Notes |
| --- | --- | --- | --- | --- |
| `size` | A | px | `1` | width and height |
| `position` | A | px | `2` | section-relative x/y offset |
| `padding` | A | px | `1` | per side |
| `cornerRadius` | A | px | `1` | per corner |
| `border` | A | px | `0.5` | per side, width only — colour uses `color` |
| `color` | A | deltaE | `2` | CIEDE2000 perceptual distance, **not** per-channel |
| `shadow` | A | px | `1` | offset, blur, spread |
| `fontSize` | B | px | `0.5` | |
| `fontWeight` | B | unitless | `0` | `0` means exact match required |
| `lineHeight` | B | px | `1` | |
| `letterSpacing` | B | px | `0.2` | |

The defaults assume sub-pixel rounding, font hinting, and Figma's own rounding
make an exact-match policy pure noise.

`border` is the deliberate exception at `0.5`. A 1px border built as 2px is
plainly visible, so a 1px floor would hide the most common border defect there
is.

### Why `color` is a deltaE

Per-channel RGB difference is the wrong metric — it treats a 5-point shift in
blue the same as a 5-point shift in green, which the eye does not. The default
of `2` sits between two real measurements:

| Comparison | deltaE | Visible? |
| --- | --- | --- |
| `#0066FF` vs `#0067FF` | 0.34 | no |
| `#0066FF` vs `#0070FF` | 3.49 | yes |

deltaE ignores alpha entirely, so opacity is checked separately with a fixed
epsilon of `0.01`. See [comparison.md](comparison.md#color).

### Resolution order

Tolerances merge three ways, later winning:

```
DEFAULT_TOLERANCES  ->  config.tolerances  ->  element.tolerances
```

The first two are folded together at validation time; `resolveTolerances()`
completes the merge per element. Any key you omit inherits from the level above.

```json
{
  "tolerances": { "position": 2 },
  "elements": [
    {
      "figmaId": "hero-cta",
      "nodeId": "1:45",
      "tolerances": { "position": 4 }
    }
  ]
}
```

`hero-cta` gets `position: 4` and the defaults for everything else.

## Elements

```json
{
  "figmaId": "hero-heading",
  "nodeId": "1:23",
  "selector": ".hero h1",
  "relativeTo": "hero",
  "passes": ["text", "geometry"],
  "tolerances": { "fontSize": 0.25 }
}
```

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| `figmaId` | **yes** | — | Pairing key. Matches `data-figma-id` in the DOM. Must be unique across the config |
| `nodeId` | **yes** | — | Figma node id. `1:23` and `1-23` are both accepted |
| `selector` | no | `[data-figma-id="<figmaId>"]` | CSS selector override |
| `relativeTo` | no | the run-level `section` | `figmaId` of the container this element's position is measured against |
| `passes` | no | `["text", "geometry"]` | Which passes to run |
| `tolerances` | no | inherited | Per-element overrides |

### `figmaId` is a label you choose

It does **not** need to match your Figma layer name. Real design files are full
of `Frame 31306`, `Rectangle 451`, and six separate layers all called `Button` —
name-based pairing could never resolve those. The Figma side is located by
`nodeId`; the HTML side by attribute. Nothing needs renaming in Figma, and the
file can be reorganized freely as long as node ids hold.

### `selector`

Use it when the attribute alone is ambiguous, or when you cannot add an
attribute to the element you want (a wrapper you do not control, an image inside
a plugin's markup):

```json
{ "selector": ".hero__media img[data-figma-id=\"hero-image\"]" }
```

A selector matching **more than one** element is reported as
`ambiguousInLive` rather than resolved by picking the first — see
[reports.md](reports.md#structural-issues).

### `relativeTo`

By default every element is measured against the run-level `section`. Override
it when an element belongs to a different container — a card inside a grid, say,
where offsets from the page section are meaningless but offsets from the card
are exactly what you want to check.

`relativeTo` must name a configured `figmaId`; validation rejects a dangling
reference.

An element whose container resolves to itself (including the `section` element
itself) has its `offsetX`/`offsetY` checks dropped, since comparing a container
against itself is always zero. Its size and spec properties are still compared.

### `passes`

- `["text"]` — type only. Position-blind, so it stays stable across reflow.
- `["geometry"]` — box, spec, and color only. Right for frames, images, and
  anything with no text.
- Both (the default) — everything.

Use `["geometry"]` for the section container itself and for images; `["text"]`
for copy whose layout is expected to differ from the design.

## Validation errors

Every `ConfigError` names the path it failed on:

```
"width" must be a positive number
"elements[2].nodeId" must be a non-empty string
"tolerances.colour" is not a known tolerance
```

Rules worth knowing before you hit them:

- `elements` must be non-empty and every `figmaId` must be unique.
- Tolerance keys must be known and every value finite and `>= 0`.
- `passes` accepts only `"text"` and `"geometry"`, and must be non-empty.
- `viewport.width` / `viewport.height` must be positive integers.
- `timeout`, when present, must be a positive number of milliseconds.
- `url` must parse as an absolute URL.
- `section` must name one of the configured elements.
- Every `relativeTo` must name one of the configured elements.
- A file key must resolve from either `figmaFileKey` or `FIGMA_FILE_KEY`.
- Strings are rejected when empty or whitespace-only, not just when absent.


## `fontAliases`

Figma names a typeface the way the foundry did — `Gotham` — while the CSS that
ships it may say `"Hco Gotham"`. Same font, different string, and without this
it is a `fontFamily` mismatch on **every text element of every run**.

```json
{
  "fontAliases": {
    "Gotham": "Hco Gotham"
  }
}
```

Both sides are normalized the same way the comparison is (first family in the
stack, unquoted, lowercased), so `"Hco Gotham"` and `Hco Gotham` are the same
key. The map is read in both directions, so it does not matter which name you
put on the left.

**An alias only makes two names equal.** It cannot mask a size, weight or
spacing difference, and it cannot make unrelated fonts match — declaring
`Gotham` → `Hco Gotham` still reports `Gotham` against `Comic Sans MS`. Writing
one is a deliberate statement by whoever authors the config, which is what keeps
it outside the fuzzy matching invariant 7 forbids.


## `overlays`

Selectors for things on the page that the design does not draw — a cookie
banner, a promo strip, a chat bubble, a notification bar. Each is hidden with
`display: none` before a single element is measured.

```json
{
  "overlays": [".cookie-banner", "#promo-bar"]
}
```

**Whether you need this depends on where the thing sits.** A bar *outside* the
section container costs nothing: the section and everything inside it move down
together, and section-relative normalization cancels the shift exactly. A bar
*inside* the section shifts every element below it by its own height, and
nothing cancels that — every `offsetY` in the run is wrong by 64px, or however
tall the bar happens to be that week.

`display: none`, not `visibility: hidden`: an invisible promo bar still occupies
its strip of layout, and occupying layout is the entire problem.

### The run says what each one hid

```
TOVI FAIL  https://example.com/  (1728x1080)
  note    overlay ".cookie-banner" hid 1 element before measuring
  note    overlay "#promo-bar" matched nothing — it hid no part of the page
```

The second line is the useful one. A selector that hides nothing is how a config
stops doing what its author thinks it does — the consent vendor renames a class,
the banner comes back, and every offset moves 64px without anything in the
config changing. Silence there would be indistinguishable from success, which
is what [invariant 3](../AGENTS.md#invariants--do-not-break-these) forbids.

A selector the browser cannot parse is reported as such rather than throwing:
one bad entry must not cost the run its other five.

### Declared, never detected

There is no list of known cookie-banner class names in this codebase and there
must not be one. Deciding which parts of a page are "not really the design" is a
judgement call, and a judgement call made by the tool is the heuristic
[invariant 7](../AGENTS.md#invariants--do-not-break-these) keeps out of a run.
Writing an overlay selector is a deliberate statement by whoever authors the
config.

### Lazy images need no configuration

A related problem needs no declaring. The extractor never scrolls — that is
[invariant 2](../AGENTS.md#invariants--do-not-break-these), and scrolling would
corrupt the shared coordinate origin every position is measured against. A
`loading="lazy"` image below the fold is therefore never fetched, measures
`0×0`, and reports a size delta the size of the whole image plus a wrong offset
on everything beneath it.

So every `<img loading="lazy">` is switched to `eager` before measuring, and the
run waits up to five seconds for the images to arrive. There is nothing to
decide: the answer to "which images should load" is all of them. The run says
how many were promoted, and how many had still not arrived when the budget ran
out.
