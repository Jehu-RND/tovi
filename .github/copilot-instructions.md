# GitHub Copilot instructions

**Read [AGENTS.md](../AGENTS.md).** It is the single source of truth for this
repository's architecture, invariants, and conventions. This file is a pointer,
not a second set of rules.

## Essentials

TOVI compares a Figma design against a live page and reports drift. A run is a
pure function of `(FigmaSpec, LiveStyles, Tolerances) -> Issue[]`. **No AI, no
heuristics, no fuzzy matching in the comparison path** — determinism is the
product.

- ES modules, `NodeNext`: relative imports carry a `.js` extension in TypeScript
  source.
- Strict TypeScript with `exactOptionalPropertyTypes`: spread optional fields
  conditionally, never assign `undefined`.
- Build issues through the helpers in `src/compare/issues.ts`, never inline.
- Never compare Figma canvas coordinates to browser viewport coordinates —
  positions are normalized against a section container first.
- The Figma token comes from `FIGMA_TOKEN` only; never from config, logs, or
  reports.

Gate before done: `npm run typecheck && npm test`.
