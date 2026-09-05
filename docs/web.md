# Web

`apps/web` exists as a minimal, buildable Vite + React shell. It is intentionally behind
`apps/desktop` in features.

## Why it's minimal right now

Wiring `apps/web` to `packages/canvas` today, while that package's public API is only a
camera/viewport module and is guaranteed to change heavily once Session 1 adds real drawing
tools, would mean redoing the integration almost immediately. `apps/web` imports
`@draft/ui` only for now — enough to prove the pnpm workspace/build wiring works end to end
— and gains `@draft/canvas` in Session 3, once that package's API has stabilized through
Session 1. See [ROADMAP.md](../ROADMAP.md).

## What "web-capable architecture" means today

- `draft-platform`'s `PlatformPaths` trait (see [docs/architecture.md](architecture.md)) is
  the seam a future browser/WASM implementation plugs into — core crates never call desktop
  OS APIs directly.
- Nothing in `packages/canvas`, `packages/ui`, or `packages/shared` imports Tauri APIs —
  only `packages/project-client` and `apps/desktop` do, and only `apps/desktop` currently
  consumes `project-client`.

## What's not solved yet

- How a web build talks to a project's data at all, without a Rust process to host
  `draft-project`/`draft-graph`/`draft-mcp` locally the way Tauri gives the desktop app. This
  is real, unresolved design work for Session 3 — options include compiling relevant crates
  to WASM, a thin server companion process, or scoping the web build to a different
  interaction model (e.g. viewing/annotating a project synced from desktop, rather than full
  parity). Documented here as an open question rather than guessed at now.
- Browser storage/persistence strategy (spec allows local/browser storage where possible;
  nothing implements this yet).
