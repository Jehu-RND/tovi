# The local UI

```bash
npm run build
npm run ui
```

```
TOVI UI  http://127.0.0.1:4479
  config: tovi.config.json
  Ctrl-C to stop.
```

Open the URL. The UI exists because the config is the wall between this tool and
the people most likely to use it daily: a QA tester will not hand-author a
`figmaId` → `nodeId` map, and should not have to.

| Flag | Meaning |
| --- | --- |
| `-p, --port <port>` | Port to listen on. Default `4479` |
| `-c, --config <path>` | Config to start from. Default `tovi.config.json` |

If the config file is absent the UI starts empty rather than erroring — a
first-time user is not expected to have one yet.

## What it does

Three steps, in order:

1. **The page** — the URL and a screen size, chosen from presets. The Figma file
   is resolved in the background from `FIGMA_FILE_KEY`; you only supply a key if
   you want a different file.
2. **Pick the layers** — the Figma page is a dropdown populated from the file.
   Click the layers you want checked. Layers Figma cannot measure (pages, hidden
   and detached nodes) are not selectable and say why.
3. **What gets checked** — one row per layer, with **how to find it on the live
   page** and what to compare. The section container is a dropdown over the
   layers you picked, so it cannot name something absent.

Results render per element: property, design value, live value, and the delta
against the tolerance it was tested against.

## Picking a layer picks what is inside it

A screen is a container plus the things in it, and clicking sixteen rows to say
so is the tedium the layer list exists to remove. **Click one layer and its
whole subtree comes with it**, as far down as the depth you are viewing.

The children are then matched against the page, and the ones that are not
really there are dropped:

```
Added 11 layers from Play-first episode, and skipped 5 that are not on the page.
```

That filtering matters. A design carries plenty of layers that are not elements
— text runs, vectors, spacing frames — and adding them all would replace the
tedium with a wall of `no match`. The layer you actually clicked is always kept
even when it does not resolve, because a silent no-op is worse than a visible
error.

## You do not have to tag the page first

**TOVI finds each layer on the page itself.** When you pick a layer it loads the
page once and tries, in order:

1. `[data-figma-id="<layer-name>"]` — the most durable pairing
2. `.<layer-name>` — the layer name as a class
3. `#<layer-name>` — the layer name as an id

Whichever matches *exactly one* element is adopted and written into the config.
Two matches is as unusable as none, so an ambiguous selector is never adopted.

The layer name is slugified first, so a layer called `Play-first episode`
resolves against `.play-first-episode`. A page built from the design usually
carries those names already, which means a first run often needs no selector
work at all.

Whatever it settles on is shown in the table and goes into the config, so the
run stays reproducible and you can always overrule it. **Edit a selector and
TOVI stops rewriting it** — your answer wins even when its own would have
matched. Any selector works:

```
.hero__title
main .lop-column
#main-header .logo-wrapper
```

That matters on an existing site. Adding `data-figma-id` to a theme means a
deploy, and until it lands there is nothing to compare — so the first run would
otherwise have to wait on a code change. Pointing at classes the markup already
has gets you a real comparison immediately.

### When a layer will not resolve

Auto-resolution is a deterministic derivation of the layer name, not a guess at
intent. A layer named `Description` against markup that says
`class="episode-description"` will not resolve, and the row shows **no match** —
type the real selector and it stops trying.

`missingInLive` in a report means the same thing: **nothing was compared.** It is
not a statement that the build differs from the design, and a run full of them
says nothing about drift yet.

### Test selectors before running

**Test selectors** loads the page once and reports, per row, whether the
selector found exactly one element and what that element actually is:

```
.level-of-play            1 match    div.grid-container.level-of-play · 1440×151
.superior-customization   1 match    div.superior-customization · 1440×668
.mega-menu-item           25 matches li#mega-menu-item-92… · 62×70
[data-figma-id="hero"]    no match
```

Rows TOVI resolved on its own are already filled in by the time you look, so
this is mostly for confirming a selector you typed yourself.

It costs one page load and no Figma call, so it is a fast loop — unlike a full
check, which launches a browser *and* fetches every node before it can tell you
the same thing.

It also reads the page's own structure and offers the sections it finds as
completions on each selector field, so a container can be picked rather than
guessed at. Only classes and ids that are unique on the page are proposed; an
ambiguous one would be a config error waiting to happen.

The trade is stability: a class can be renamed in a redesign without anyone
thinking about TOVI, and then the check reports `missingInLive` for a reason
that is not a design defect. Use selectors to get started and to find out
whether the findings are worth trusting; move to `data-figma-id` for the checks
you intend to keep.

## Watching a run

A run launches a browser and calls the Figma API, so ten seconds is normal. The
results panel shows the stages as they happen rather than going quiet:

```
✓ Fetch the design from Figma
✓ Read the design nodes
◐ Load the page in Chromium
· Measure the live elements
· Compare design against live
· Build the report
```

All six are listed from the start, so a run that stalls points at the step it
stalled on. The two that actually take time are the Figma fetch and the page
load; the comparison itself is milliseconds.

This rides on `POST /api/check/stream`, which is server-sent events — one-way
traffic, a plain HTTP response, no dependency. Its final frame carries the same
payload `/api/check` returns, so the two cannot drift apart. Progress is
observational: the run produces an identical report whether or not anything is
listening.

## Why it is a server

A run drives Playwright and calls the Figma REST API. Neither is possible from a
browser — there is no Node in the page, and the Figma API sends no CORS headers
— so `tovi ui` starts a local HTTP server and the page is a client for it.

Two consequences worth knowing:

- **The Figma token never reaches the browser.** It is read by the server, used
  by the server, and no endpoint echoes it. `/api/health` reports only whether
  one is set, so the UI can say "no token" up front instead of letting you fill
  in a form and fail on submit.
- **It binds to `127.0.0.1` only.** This is a local authoring tool, not a
  service. Nothing about it is designed to be exposed.

## It is the same run

The UI calls `executeRun()` — the same function [`tovi check`](../README.md)
uses — and validates configs through the same `validateConfig()`. A run started
from the UI and a run started from the CLI with the same config produce
byte-identical results, and a config authored in the UI is a config that runs in
CI.

That is deliberate. A UI that drifted from the CLI would give two answers to the
same question, and the whole value of this tool is that there is one.

## What it is not

- **Not a replacement for the HTML report.** `--report` still writes a
  self-contained file to archive or attach to a PR; the UI is a live surface for
  authoring and exploring.
- **Not for CI.** CI runs the CLI. The UI has no auth and no multi-user story
  because it needs neither.

## Endpoints

Useful if you want to script against it.

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/` | The UI |
| `GET` | `/api/health` | `hasToken`, file key from env, config path, default tolerances |
| `GET` | `/api/config` | The loaded config, or `null` with the reason |
| `GET` | `/api/layers?file=&page=&search=&depth=` | `fileName`, `pages`, `rows` |
| `POST` | `/api/probe` | `{ matches, candidates }` for a posted `{ url, viewport, selectors }` |
| `POST` | `/api/check` | `{ report, summary }` for a posted `{ config }` |

Every failure comes back as `{ error }` with the same message the CLI would have
printed — a `ConfigError` names its path, a Figma 401 explains the token scope.
A failed run is a normal outcome here, reported as data rather than a crash.
