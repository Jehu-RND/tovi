# Tagging elements

> **You can start without tagging anything.** Every element accepts a CSS
> `selector` instead, so an existing class will do — see
> [selector](#when-you-cannot-add-an-attribute) below and [the UI](ui.md). The
> attribute is the more durable choice for checks you intend to keep; it is not
> a prerequisite for a first run.

TOVI pairs a design node with a live element through one attribute:

```html
<h1 data-figma-id="hero-heading">Ship faster</h1>
```

```json
{ "figmaId": "hero-heading", "nodeId": "1:23" }
```

The Figma side is located by **node id**, the HTML side by **attribute**. No
fuzzy matching, no position-based guessing, no name similarity.

## Your Figma layer names do not need to match anything

This is worth stating plainly, because the obvious design is the wrong one.

An earlier version of the spec had `data-figma-id` match the Figma layer name
directly. The real design file made that impossible: it contains `Frame 31306`,
`Rectangle 451`, and six separate layers all named `Button`. Name-based pairing
could never resolve those, and renaming hundreds of layers to suit a validation
tool is not a reasonable thing to ask of a designer.

So `figmaId` is just a **label you choose**. Three consequences:

- **No renaming in Figma is required.** Ever.
- **The design file can be reorganized freely** — layers renamed, regrouped,
  moved between frames — as long as node ids hold.
- **The label can be readable.** `hero-heading` rather than `Frame 31306`.

Node ids are stable across renames and moves. They change when a layer is
deleted and recreated, or when a component instance is detached and replaced —
which is exactly when you *want* the check to fail loudly.

## Getting a node id

Select the layer in Figma and use **Copy link to selection** (right-click, or
⌘L). The URL ends in the node id:

```
https://www.figma.com/design/AbCdEf.../Page?node-id=1-23
                                              ^^^^
```

TOVI accepts either spelling — `1-23` from the URL, or `1:23` as the API keys
it. They are normalized to the same thing.

### Or list them all at once

Copying ids one at a time is tedious and a real typo surface. `tovi layers`
dumps them:

```bash
node dist/index.js layers --page "Men's Basketball" --depth 3
```

```
Sport-Specific Landing Page  —  6 layers

  1:1         CANVAS     Men's Basketball                              1728×980
  1:20        FRAME        hero                                        1728×980
  1:21        TEXT           eyebrow                                    240×24
  1:23        TEXT           Ship faster                                960×72
  1:45        INSTANCE       Button                                     180×48
  1:99        FRAME        Frame 31306                                  400×200
```

Indentation mirrors the layers panel, so a row can be found by scrolling to
where the layer sits. The node id comes first because that is what gets copied.

| Flag | Meaning |
| --- | --- |
| `-f, --file <key>` | Figma file key. Defaults to `FIGMA_FILE_KEY` |
| `-p, --page <name>` | Restrict to one page. An exact name wins over a substring |
| `-s, --search <text>` | Only layers whose name contains this |
| `-t, --type <types>` | Comma-separated node types, e.g. `FRAME,TEXT` |
| `-d, --depth <n>` | How deep to descend below a page. Default `4` |
| `-j, --json <path>` | Write the rows as JSON |

It deliberately does **not** read `tovi.config.json` — discovery is what you do
*before* you have a config, so requiring one would be backwards. It only needs
`FIGMA_TOKEN` and a file key.

Two things worth knowing:

- **Always pass a sensible `--depth`.** Figma returns the entire file when no
  depth is given, which on a real design file is tens of megabytes.
- **An exact page name beats a substring.** This matters more than it sounds:
  "Women's Soccer" *contains* "Men's", so a loose match alone would silently
  pull in the wrong page.

## Choosing slugs

Good slugs are stable, readable, and unique.

| Do | Don't |
| --- | --- |
| `hero-heading` | `h1` — breaks when the tag changes |
| `pricing-card-pro` | `card-2` — breaks when order changes |
| `nav-cta` | `blue-button` — breaks when the design changes color |
| `footer-legal` | `Frame 31306` — copies the problem you are avoiding |

Name for **role**, not for appearance, position, or tag. A slug that survives a
redesign is one that describes what the element *is*.

Slugs must be unique across the config — duplicates are rejected at validation,
since two entries would both claim the same DOM element.

## Tag the container too

Every run needs a `section`: the container both sides are measured against. It
must be tagged and configured like any other element.

```html
<section data-figma-id="hero">
  <p  data-figma-id="hero-eyebrow">New</p>
  <h1 data-figma-id="hero-heading">Ship faster</h1>
  <a  data-figma-id="hero-cta" href="/start">Get started</a>
</section>
```

```json
{
  "section": "hero",
  "elements": [
    { "figmaId": "hero",         "nodeId": "1:20", "passes": ["geometry"] },
    { "figmaId": "hero-eyebrow", "nodeId": "1:21" },
    { "figmaId": "hero-heading", "nodeId": "1:23" },
    { "figmaId": "hero-cta",     "nodeId": "1:45" }
  ]
}
```

Without a section rect on **both** sides, Pass A cannot run at all — positions
would be compared across unrelated coordinate spaces. See
[comparison.md](comparison.md#coordinate-normalization).

Give the section `"passes": ["geometry"]`; a container has no type spec of its
own to check.

## Pairing traps

A pairing is a claim: *this design node and this live element are the same
thing.* TOVI takes the claim at face value and measures. It cannot tell a wrong
pairing from a wrong build, so a bad pairing does not fail — it produces
findings that are arithmetically correct and mean nothing.

Sixteen of the thirty-five findings in
[triage 001](triage-001-mens-basketball.md) came from four causes, and two of
them were pairings. This section is the list of the ones that have actually
happened, so the next person can recognise them before spending an afternoon on
them.

### A Figma URL carries two node ids, and both look right

```
…?node-id=11609-7477&focus-id=11350-4869
          ↑ CANVAS, the page   ↑ FRAME, the design
          no bounding box       1728×6537, what you want
```

In the file this tool was built against, **both are named "Men's Basketball"**.
A CANVAS has no `absoluteBoundingBox`, so it cannot be measured and the
normalizer throws on it. The UI refuses to add one and says why; the CLI will
accept it and fail at run time.

`tovi layers` shows the type and the size of every row. A row with no size is a
row you cannot compare.

### The container that is not the page

The most expensive finding in triage 001 was `height design 6537 live 6011` —
a 526px gap that looked like an entire missing section. It was a pairing.

`.wrap` is the content container. The Figma frame draws the whole page: a 72px
`#main-header` sits above `.wrap` and a 325px `footer.content-info` below it,
and the frame includes both. Measured against `document.scrollHeight` the gap
is **104px**, not 526.

The same bad pairing produced a `backgroundColor` finding, because `.wrap` has
no background and the frame does. One mistake, two frightening findings.

**Before pairing a container, ask what the design node actually encloses.** If
the frame draws the header, the live counterpart has to be something that
contains the header too.

### Screenshots of the live site, pasted into the design

The real design file has two of them — `Screenshot 2026-01-22…` at 1728×105 at
the top of the frame and `Screenshot 2026-01-08…` at 1738×354 in the footer
group. They are ordinary layers with ordinary node ids and they list exactly
like anything else.

They are designer scaffolding, not specification. Pairing against one compares
the build against a picture of the build. **Never pair a layer whose name
begins with `Screenshot`.**

### A text layer whose box is its glyphs

A Figma TEXT node with `textAutoResize: WIDTH_AND_HEIGHT` shrink-wraps to the
words it contains, so its box is the ink and not the column the text was laid
out in. Paired against a block-level element that spans its container, the
width delta is arithmetic on the difference and the `offsetX` delta is half of
it — `(1470 − 742) / 2 = 364`, exactly what triage 001 reported.

`tovi layers` marks these rows **`hugs text`**, and the UI's layer list says
`· hugs text`. A run reports it as an `info`-severity `boxShape` finding
alongside the deltas it explains.

Neither suppresses the comparison, because a text element genuinely built at
the wrong width has to keep failing. The fix is in the design file — give the
node a fixed size — or in the pairing: pair the live element against the frame
that holds the text, not against the text.

### A design column against a full-bleed element

A 1604px-wide design column paired against an element that spans the full
1728px viewport reports `offsetX −62` on every element in it:
`(1728 − 1604) / 2 = 62`. The build is centred and correct; the two things
being compared are different boxes.

### A selector that matches twenty-five things

```
.level-of-play           1 match
.superior-customization  1 match
.wrap                    1 match
.mega-menu-item          25 matches  ← ambiguous, never usable
```

A selector matching more than one element is reported as `ambiguousInLive` and
nothing is measured. Use **Test selectors** in the UI: it costs one page load
and no Figma call.

### Page furniture the design does not draw

Cookie banners, promo strips and chat bubbles are added by something other than
the build. One *outside* the section container costs nothing — the section and
everything in it move down together, and section-relative normalization cancels
it exactly. One *inside* the section shifts every element below it by its own
height, and nothing cancels that.

Declare them and they are hidden before anything is measured:

```json
{ "overlays": [".cookie-banner", "#promo-bar"] }
```

The run reports how many elements each selector hid, **including the ones that
hid nothing** — which is how you find out the vendor renamed the class. See
[configuration.md](configuration.md#overlays).

## When you cannot add an attribute

Sometimes the element you want is inside markup you do not control — a plugin's
output, a wrapper injected by the theme. Tag the nearest ancestor you *can*
control and narrow with a `selector`:

```json
{
  "figmaId": "hero-image",
  "nodeId": "1:52",
  "selector": ".hero__media img[data-figma-id=\"hero-image\"]",
  "passes": ["geometry"]
}
```

A selector matching more than one element is reported as `ambiguousInLive` —
TOVI never picks one. Narrow the selector until it matches exactly one.

## WordPress

Add attributes in the theme templates, not in the rendered output.

```php
<!-- template-parts/hero.php -->
<section class="hero" data-figma-id="hero">
  <h1 class="hero__heading" data-figma-id="hero-heading">
    <?php echo esc_html( get_field( 'hero_heading' ) ); ?>
  </h1>
</section>
```

For Gutenberg blocks, add the attribute in the block's `save`/`render` output or
via an `additionalClassName`-style attribute. For ACF flexible content, add it to
the layout's template part.

Two WordPress-specific things to watch:

- **Caching.** A page cache or a CDN can serve you markup from before you added
  the attributes. Purge before concluding an element is `missingInLive`.
- **Editor-inserted wrappers.** Block themes wrap content in extra divs, so the
  element carrying your attribute may not be the one carrying the padding you
  want to check. Check what `getComputedStyle` actually reports before assuming
  a padding mismatch is a build defect.

## Verifying tags before a full run

The cheapest check is in the browser console on the live page:

```js
// Every tagged element, and its slug
[...document.querySelectorAll('[data-figma-id]')]
  .map(el => el.dataset.figmaId)

// Duplicates — these become ambiguousInLive
const ids = [...document.querySelectorAll('[data-figma-id]')]
  .map(el => el.dataset.figmaId);
ids.filter((id, i) => ids.indexOf(id) !== i);
```

Any slug in your config that does not appear in the first list will come back as
`missingInLive`. Anything in the second list will come back as `ambiguousInLive`.
