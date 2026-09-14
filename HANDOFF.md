# Handoff

_Written 2026-09-14. Branch `feat/ui-borders-layers`, 6 commits ahead of `main`._

Read this first if you are picking TOVI up. It covers where the project actually
stands, what changed recently and why, and what to do next. It does not repeat
[AGENTS.md](AGENTS.md) (how to work in the codebase), [TASKS.md](TASKS.md) (the
full task list), or [docs/](docs/) (the reference).

---

## Where this stands in one paragraph

TOVI compares a Figma design against a live page and reports where the build
drifted. The engine is finished and covered by 162 tests. As of this session it
has been **run end to end against the real target** — `prolook.com` and the real
Figma file — and produces real findings. The one thing still missing is the
thing that has been missing since the start: **nobody has yet triaged a run to
decide whether the findings are trustworthy.** That is the whole remaining
question, and it needs a person, not more code.

---

## Run it

```bash
npm install
npx playwright install chromium    # the integration suites skip themselves without this
npm run build

npm run ui                         # http://127.0.0.1:4479 — start here
npm run check -- -c tovi.config.json -r out/report.html
npm run layers -- --page "Men's Basketball" --depth 3
```

Needs `FIGMA_TOKEN` in the environment or `.env`. The gate before any change is
done: `npm run typecheck && npm test`.

---

## What is verified, and against what

This distinction matters more than the test count.

| | Verified against |
| --- | --- |
| Comparison engine, both passes | 162 unit tests |
| Browser extraction | Real Chromium, `tests/fixtures/page.html` |
| Figma normalization | The real API, real nodes |
| Full pipeline | **The real site and real design file** — this session |
| Whether the findings are *trustworthy* | **Nothing. This is the open question.** |

---

## The last real run

Figma frame `11350:4869` (1728×6537) against `.wrap` on
`prolook.com/sports/mens-basketball/`, at a 1728 viewport:

```
FAIL
  error  height           design 6537px  live 6011px        delta -526
  error  backgroundColor  design #fff    live transparent
```

Read that carefully, because it is the first genuinely informative output the
tool has produced:

- **Width passed.** 1728 design against 1728 live, no issue raised. That is the
  coordinate and measurement pipeline working correctly on real data.
- **The height gap is a real question.** 526px is well past noise. Nobody has
  looked into whether it is a build defect, a design that moved on, or a
  container that is not the right pairing.
- **The background finding is probably noise.** `.wrap` has no background of its
  own; the white comes from `body`. This is the shape of false positive to
  expect — the selector points at *a* real element, just not the one whose
  properties the design describes.

---

## Two things that will bite you

**1. A Figma URL carries two ids, and they are both plausible.**

```
…?node-id=11609-7477&focus-id=11350-4869
   ↑ CANVAS, the page                ↑ FRAME, the design
   no bounding box, unusable           1728×6537, what you want
```

In this file both are named "Men's Basketball". A node with no bounding box
cannot be measured and the normalizer throws on it — the UI now refuses to add
one and says why, but the CLI will accept it and fail at run time.

**2. The live site carries no `data-figma-id` attributes.**

Pairing is by CSS selector instead. That is fully supported and is how the runs
above worked. The theme is unusually selector-friendly:

| Selector | Matches |
| --- | --- |
| `.level-of-play` | 1 — `div.grid-container.level-of-play · 1440×151` |
| `.built-for-every-player` | 1 |
| `.superior-customization` | 1 — `div.superior-customization · 1440×668` |
| `.built-better-footer` | 1 |
| `.wrap` | 1 — the whole content container, 1440×5502 |
| `.mega-menu-item` | **25** — ambiguous, do not use |

Use **Test selectors** in the UI rather than guessing; it costs one page load
and no Figma call.

---

## What changed this session

Six commits, 49 files, +3493/−103.

| Commit | What |
| --- | --- |
| `ffa7454` | Borders/strokes comparison, `tovi layers`, screenshot embedding, CI workflows, docs, `.claude/` scaffolding |
| `6c056e4` | UI validation, env fallback, layer-list size |
| `1192e1c` | UI rebuilt around picking layers rather than editing config |
| `2cbb713` | Wait for `load`, not network-idle; configurable timeout |
| `afab315` | Selector pairing exposed; UI simplified to choices over text inputs |
| `18dc976` | Selector probe |

### Decisions worth knowing about

**Borders compare per side, and colour only where a border is drawn.** CSS
reports a colour for a zero-width border, so comparing it would fire on elements
with no visible border. A non-`INSIDE` `strokeAlign` is flagged as info, because
CSS borders are always drawn inside the box — widths still compare, the box does
not. Default tolerance is `0.5`, deliberately below the 1px floor used
elsewhere: 1px-vs-2px is plainly visible.

**`load`, not `networkidle`.** This reads like a reliability compromise and is
the opposite. `networkidle` resolves when the network goes quiet, so what it
waits for depends on when analytics and chat widgets happen to stop — a
different moment each run, and on `prolook.com` a moment that never arrived
inside 30s. `load` is a defined event; paired with `document.fonts.ready` and a
fixed 500ms settle it is *more* reproducible, not less.

**Uncomparable text properties are reported, not dropped.** `line-height:
normal` has no honest number to compare against, but silence was
indistinguishable from a pass — which is the one thing this tool must never do.
It now emits an `info`-severity skip naming the property and why.

**The UI hides the config format.** The first version exposed it directly — a
JSON textarea, a free-text "section (figmaId)" box — and it was unusable by
anyone who did not already know the data model. Worse, the section and the
element slugs were independent strings, so they could drift apart. The section
is now a dropdown over the elements that exist and cannot name something absent.
The design rules are written at the top of [src/ui/page.ts](src/ui/page.ts);
adding a control that takes a raw config value as free text is a regression.

---

## What to do next

**Triage one section.** Not more features. Pick `.level-of-play` or
`.superior-customization`, pair it with the matching Figma frame, run it, and go
through every finding deciding: real build defect, environmental artifact, or
tool gap. [`/triage`](.claude/commands/triage.md) encodes that checklist and
[docs/troubleshooting.md](docs/troubleshooting.md) catalogues what to expect.

Three findings are near-certain and all are documented:

- **The 1728 / 1440 question.** The Figma frame is 1728 wide. Run at 1728 and
  the widths line up; run at 1440 and a responsive layout legitimately differs.
  Decide which width you are actually validating.
- **Gotham reports `fontWeight: 350` in Figma.** If the theme declares 300 or
  400, the default tolerance of `0` flags every heading. Real finding or Figma
  artifact — unknowable until someone looks.
- **Lazy-loaded images measure `0×0`.** The extractor never scrolls, by design;
  scrolling would corrupt the shared coordinate origin Pass A depends on.

Only after that triage is the rest of the board worth working on. Everything
else is polish on a tool nobody has yet decided to trust.

### If you want to build instead

In rough order of value, from [TASKS.md](TASKS.md):

- **T-25** — click a live element to pair it with a layer. The probe already
  proposes candidates; this closes the loop.
- **T-09 follow-on** — the 8293-layer file makes layer discovery the bottleneck.
- **T-21/T-22/T-23** — the AI suggestion layer. Advisory only, never the
  verdict; see invariant 7 in [AGENTS.md](AGENTS.md).

---

## Open questions for whoever owns this

1. **Is the 526px height gap real?** Nobody has looked.
2. **Which viewport is the source of truth** — 1728 to match the frame, or 1440
   because that is what most visitors see?
3. **Selectors or attributes?** Selectors work now and need no deploy, but a
   class renamed in a redesign breaks a check for a reason that is not a design
   defect. `data-figma-id` is durable but needs theme access (P-01).
4. **Does this branch merge to `main`?** It is 6 commits, all green, nothing
   pushed.

---

## Things not to break

Full explanations in [AGENTS.md](AGENTS.md#invariants--do-not-break-these). The
short version, because these are the ones that look like improvements:

1. Never compare Figma canvas coordinates to browser viewport coordinates.
2. Measure every element in a single `page.evaluate()`; never scroll.
3. An absent check must never look like a passing check.
4. Output must be byte-identical between runs.
5. The Figma token comes from `FIGMA_TOKEN` only.
6. Colours compare perceptually, never per channel.
7. AI never enters the comparison path.
8. Escape every value interpolated into a report.
