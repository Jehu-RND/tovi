---
description: Check docs and PROGRESS.md against the current code
allowed-tools: Read, Grep, Glob, Edit, Bash(wc -l:*), Bash(npm test), Bash(git log:*), Bash(git diff:*)
---

Audit the documentation against what the code actually does, then fix the drift.

## Check

1. **`DEFAULT_TOLERANCES`** in `src/config/schema.ts` vs the tolerance tables in
   `docs/configuration.md` and `docs/comparison.md`.

2. **`IssueProperty`** in `src/report/types.ts` vs the property table in
   `docs/reports.md` — and confirm every value also appears in `PROPERTY_ORDER`
   in `src/report/merge.ts`. A missing entry there is a determinism bug, not a
   docs bug; report it as such.

3. **CLI flags** in `src/index.ts` (`buildProgram()`) vs the options tables in
   `README.md` and `docs/getting-started.md`.

4. **Config fields** in `src/config/schema.ts` and the validation rules in
   `loadConfig.ts` vs `docs/configuration.md`.

5. **Module LOC and the module table** in `docs/architecture.md` and
   `PROGRESS.md` — `wc -l src/**/*.ts`.

6. **Test count.** Run `npm test`. The docs claim 100 tests across 8 files in
   `README.md`, `PROGRESS.md`, and `docs/architecture.md`.

7. **Known gaps.** The lists in `README.md`, `PROGRESS.md`, and
   `docs/comparison.md` must agree. If a gap was closed, remove it from all
   three; if one was discovered, add it to all three.

8. **`tovi.config.example.json`** should exercise every documented field.

## Rules

- **Fix the docs to match the code**, not the reverse — unless the code is
  wrong, in which case say so rather than documenting a bug.
- **Keep `PROGRESS.md` honest.** It currently states the tool has never been run
  against a real production page. That stays until it is untrue. Do not inflate
  the percentage; if you change it, show the arithmetic in the table.
- **Do not invent verification.** If a claim ("verified against the real Figma
  file") cannot be confirmed from the repo, leave it and note that it is
  unverifiable from here.

Report what you changed and what you found but did not change.
