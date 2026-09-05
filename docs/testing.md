# Testing

## Strategy

```
        /  E2E  \         none yet — Playwright is Session 4 scope
       / Integration \     project round-trip, path-safety, schema-version (today)
      /    Unit Tests  \   per-crate Rust tests, per-package Vitest tests (today)
```

Foundation stage prioritizes: business-critical correctness (the project format round-trips
identically, security boundaries hold), not exhaustive coverage of code that doesn't exist
yet.

## What's covered today

**Rust** (`cargo test --workspace`):

- `draft-core`: ID display/parse round-trip, scheme mismatch rejection, serde round-trip.
- `draft-security`: agent-mode write-gating, and the path-traversal test that matters most —
  `is_path_within_project` rejecting a `..`-laden path that resolves outside the project dir
  (not just rejecting on string content, on the *canonicalized* result).
- `draft-events`: sequence numbering, actor tagging survive a round trip through the log.
- `draft-graph`: create/update/move/delete apply correctly; unknown page/object and duplicate
  creation are rejected rather than silently accepted.
- `draft-media`: content hashing is deterministic and content-sensitive.
- `draft-project`: the product spec's own "important test" —
  create → save → reload → assert identical semantic state — plus a future-schema-version
  rejection test and a malformed-JSON test (fails with a clear error, doesn't panic).
- `draft-mcp`: a new agent connection starts with no access.

**TypeScript** (`pnpm test`, Vitest):

- `@draft/shared`: ID parsing accepts well-formed URIs, rejects wrong scheme/malformed UUID.
- `@draft/canvas`: camera screen↔world round-trip, pan direction, zoom-to-cursor keeps the
  focal point fixed, zoom clamps to bounds.
- `@draft/ui`: `Button` renders (React Testing Library, jsdom environment).

## What to cover as each layer grows

- **New `Operation` variants**: an `apply` test proving the graph state changes correctly,
  plus rejecting it against a missing page/object.
- **MCP tools/resources** (Session 2+): a "known workspace -> MCP query -> verify structure"
  test per the product spec, and an explicit "agent requests unauthorized write -> permission
  denied" test — this one is not optional; it's the whole point of the permission model.
- **Canvas tools** (Session 1): interaction tests (React Testing Library / jsdom) for
  selection and tool state, not just pure-function tests like `camera.test.ts`.
- **Cross-platform**: once CI actually runs the Linux/macOS legs, treat a red build there the
  same as a red build on Windows — don't let "works on my machine" stand for the other two
  targets.

## What's explicitly skipped for now

E2E (Playwright), load/performance testing, visual regression — all Session 4 scope per the
product spec's session priority ordering. Don't add these early; they'd be testing UI that
doesn't exist yet.
