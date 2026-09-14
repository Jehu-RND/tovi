# Tagging elements

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
