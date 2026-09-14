---
description: Add a tagged element to tovi.config.json
argument-hint: <figmaId> <nodeId> [--geometry-only|--text-only]
allowed-tools: Read, Edit, Bash(npm run typecheck), Bash(npm test)
---

Add an element to `tovi.config.json` (or `tovi.config.example.json` if no real
config exists — never create one containing a client URL).

Arguments: $ARGUMENTS

## Steps

1. **Read the current config** and confirm the `figmaId` is not already used.
   Duplicates are rejected at validation, since two entries would claim the same
   DOM element.

2. **Normalize the node id.** Both `1-23` (from Figma's *Copy link to selection*)
   and `1:23` (as the API keys it) are accepted — keep whichever the user gave.

3. **Choose the passes:**
   - Containers, images, and anything with no text → `["geometry"]`
   - Copy whose layout is expected to differ from the design → `["text"]`
   - Otherwise omit `passes` — both is the default

4. **Add the entry**, matching the surrounding formatting:
   ```json
   { "figmaId": "<id>", "nodeId": "<node>", "passes": ["text", "geometry"] }
   ```

5. **Only add `selector` if asked.** It defaults to
   `[data-figma-id="<figmaId>"]`, which is right unless the tag is ambiguous or
   sits on markup the user does not control.

6. **Only add `relativeTo` if asked.** It defaults to the run-level `section`.
   Whatever it names must itself be a configured element.

7. **Remind the user to tag the HTML** with `data-figma-id="<figmaId>"` if they
   have not. An untagged element comes back as `missingInLive`.

Do not invent a node id. If the user did not give one, ask — a wrong id produces
a `missingInFigma` that looks like a deleted layer.

Reference: [docs/configuration.md](../../docs/configuration.md),
[docs/tagging.md](../../docs/tagging.md).
