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

- **Run a check** — URL, file key, viewport, section container, and the element
  list. Results render as a table per element: property, design value, live
  value, and the delta against the tolerance it was tested against.
- **Browse layers** — the same discovery as [`tovi layers`](tagging.md#or-list-them-all-at-once),
  filtered by page, name and depth. **Click a row to add it to the element
  list**, with a slug derived from the layer name. This is the part that
  replaces hand-authoring.

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
| `POST` | `/api/check` | `{ report, summary }` for a posted `{ config }` |

Every failure comes back as `{ error }` with the same message the CLI would have
printed — a `ConfigError` names its path, a Figma 401 explains the token scope.
A failed run is a normal outcome here, reported as data rather than a crash.
