# Troubleshooting

Ordered by how likely you are to hit it on a first real run.

## Setup and credentials

### `No Figma token`

`FIGMA_TOKEN` is unset or empty. It is read from the environment **only** —
never from `tovi.config.json`. Create one at Figma → Settings → Security →
Personal access tokens, with the `file_content:read` scope.

If you have a `.env`, remember that real environment variables take precedence:
`process.loadEnvFile` does not overwrite what is already set. An exported empty
`FIGMA_TOKEN=` in your shell will beat a correct value in `.env`.

### `Figma rejected the token (HTTP 401/403)`

Three separate things to check, in order:

1. The token has not expired.
2. It carries the `file_content:read` scope.
3. The **account that owns the token** can open that file. A token is
   account-scoped; being able to open the file in a browser where you are
   logged in as someone else proves nothing.

### `Figma file ... not found` (404)

The file key is wrong. It is the segment after `/design/` or `/file/`:

```
https://www.figma.com/design/AbCdEf123456GhIjKl/My-Design
                             ^^^^^^^^^^^^^^^^^^
```

A 404 also appears if the file was moved to a team the token's account cannot
reach.

### `Figma rate limit exceeded and retries were exhausted`

The client already retries `429` three times with exponential backoff, honouring
`Retry-After`. Hitting this means sustained rate limiting — wait, or reduce how
often the check runs.

### `No .env` but variables are missing

`loadDotEnv()` swallows a missing `.env` silently, because the variables may
legitimately come from the real environment. If nothing is set, the failure
surfaces later as a token or file-key error, not as a missing-file error.

## Config errors

Every `ConfigError` names the path it failed on. The less obvious ones:

| Message | Cause |
| --- | --- |
| `"section" is "x" but no element with that figmaId is configured` | The section must itself be listed in `elements`, so its node id is known |
| `Element "x" has relativeTo "y", which is not a configured figmaId` | `relativeTo` must name another configured element |
| `Duplicate figmaId "x" in elements` | Two entries would claim the same DOM element |
| `"tolerances" has unknown key "colour"` | Tolerance keys are strictly checked — a misspelling would silently fall back to the default |
| `"url" must be an absolute URL` | Include the scheme: `https://example.com/`, not `example.com` |
| `"viewport.width" and "viewport.height" must be integers` | Fractional viewports are rejected |

Unknown keys at the top level and on elements are **ignored** — that is how the
example config carries a `"$comment"` field. Only tolerance blocks reject them.

## Findings that are not build defects

These are the ones worth anticipating, because each looks like a real defect the
first time.

### Everything drifted by the same vertical offset

A cookie banner, promo bar, or admin bar is pushing the page down.

Section-relative normalization absorbs this **when the banner sits outside the
section** — if it pushes the section itself, both the section and its children
move together and the offsets stay correct.

It does *not* absorb a banner **inside** the section, which pushes the children
but not the section origin. Dismiss the banner, or exclude it, or point `section`
at a container below it.

### An image measures `0×0`

Lazy loading. The image has no intrinsic height until it is scrolled into view,
and **the extractor deliberately never scrolls** — scrolling would corrupt the
shared coordinate origin that Pass A depends on. See
[comparison.md](comparison.md#why-a-single-pageevaluate).

Options, best first:

1. Set explicit `width`/`height` or an `aspect-ratio` on the image, which is
   good practice anyway — it prevents layout shift for real users too.
2. Add `loading="eager"` to above-the-fold images.
3. Exclude the element from the config.

### Every heading fails on `fontWeight`

Figma reports weights that no `@font-face` declares. Gotham, for instance,
reports `fontWeight: 350` in Figma; if the theme declares `300` or `400`, the
default `fontWeight` tolerance of `0` flags every heading.

Decide which it is:

- **A real finding** — the theme is loading the wrong cut of the font. Fix the
  `@font-face`.
- **A Figma artifact** — the design uses a weight the web font does not have.
  Raise the tolerance: `"tolerances": { "fontWeight": 50 }`.

Do not raise it globally without checking. A `fontWeight` tolerance of `0` is
the default precisely because weight is normally exact.

### Every width is off by a constant

Your Figma frame width does not match `viewport.width`. If the frame is 1728px
and you run at 1440, a responsive layout legitimately renders differently —
that is a config problem, not per-element drift.

Set `viewport.width` to the frame width, or compare against a frame drawn at the
viewport you actually want to validate.

### A sticky header measures the wrong height

Measurements are taken at scroll position 0, which is the right choice for
determinism. A header that shrinks on scroll is measured in its expanded state.
Compare it against the Figma frame's expanded state.

### `line-height: normal` is never flagged

Deliberate. The browser reports it as `NaN`, and Pass B skips any property that
is not usable on both sides.

`normal` is font-dependent — roughly 1.2× but actually determined by font
metrics — so there is no honest number to compare against. Set an explicit
`line-height` in CSS if you want it checked.

### An outline button passes but looks wrong

Borders and strokes are **not compared**. A button with no fill and all `stroke`
has its box, radius, and text checked, but not the border that makes it look
like a button.

This is a known gap, not a bug. See [PROGRESS.md](../PROGRESS.md).

### A gradient is not compared

Only flat gradients compare — one whose stops are all the same color is compared
as that color. A real multi-stop gradient is skipped.

### A paragraph with mixed styling compares oddly

Text is compared **per element**, not per text run. A paragraph containing a bold
span compares against the Figma node's dominant style. Split it into separately
tagged elements if the distinction matters.

## Structural issues

### `missingInLive`

The selector matched nothing. In order of likelihood:

1. The `data-figma-id` attribute is not in the deployed markup. Check the live
   page, not your local template.
2. A page cache or CDN is serving markup from before you added it. Purge.
3. The content is conditionally rendered and did not render for an anonymous
   visitor.
4. A typo — the config slug and the attribute value must match exactly, and both
   are case-sensitive.

Verify from the browser console on the live page:

```js
[...document.querySelectorAll('[data-figma-id]')].map(el => el.dataset.figmaId)
```

### `ambiguousInLive`

The selector matched more than one element — usually the same tag applied to a
repeated component. TOVI will not pick one; guessing would attribute a delta to
an element you did not mean.

Add a `selector` that narrows to exactly one:

```json
{ "selector": ".pricing__card--pro [data-figma-id=\"card-heading\"]" }
```

Find the duplicates:

```js
const ids = [...document.querySelectorAll('[data-figma-id]')].map(el => el.dataset.figmaId);
ids.filter((id, i) => ids.indexOf(id) !== i);
```

### `missingInFigma`

Either the node id returned nothing, or the node could not be normalized.

- **Wrong node id.** Re-copy the link to selection. Both `1-23` and `1:23` are
  accepted, so the separator is not the problem.
- **The layer was deleted and recreated,** which gives it a new id.
- **The node has no `absoluteBoundingBox`** — it cannot be measured, so it cannot
  be compared. Point at the visible layer rather than a group or a mask.

### `skipped` (info severity)

Geometry did not run because the section container was unavailable on one side.
The `detail` names which container.

Fix whatever is wrong with the section element itself — usually it is
`missingInLive`, and you will see that issue too. This issue exists so a
comparison that did not run never looks like one that passed.

## Runs and environment

### Playwright cannot find Chromium

```bash
npx playwright install chromium
```

Note that `npm test` **passes without it** — the integration suite skips itself
when the browser is absent. A green test run is not proof the browser side works.

### Two runs give different numbers

Determinism is enforced by pinning the viewport, zeroing animations and
transitions, waiting for fonts and network, and never scrolling. If results
still wobble, the page itself is nondeterministic — A/B tests, rotating hero
content, randomized ordering, or a carousel that autoplays despite
`animation-duration: 0s`.

Check by loading the page twice and comparing the JSON reports.

### Navigation times out

The default navigation timeout is 30s. A page that never reaches network-idle —
long-polling, analytics beacons, an open websocket — will hit it. Try the URL in
a plain browser first to see whether it ever settles.

### The report shows no screenshot

The screenshot is **linked by path, not embedded**. Keep the `.png` next to the
`.html` when archiving or moving the report.
