# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

DRAFT is a cross-platform visual workspace where a human sketches/draws/annotates ideas and
an MCP-compatible AI agent reads that workspace directly (structured data, not screenshots).
It's still in the foundation phase — see [README.md](README.md) and
[ROADMAP.md](ROADMAP.md) for current status before assuming any feature exists. Don't infer
scope or direction from this file alone; the docs below are the source of truth and this file
just orients you faster.

**Read before making non-trivial changes:**
- [ARCHITECTURE.md](ARCHITECTURE.md) and [docs/architecture.md](docs/architecture.md) — system
  design, data flow, and the crate/package responsibility table (what's real vs. foundation-stage
  skeleton in each one).
- [docs/decisions/](docs/decisions/) — ADRs for anything that looks like it deviates from the
  obvious choice (e.g. why there's no tldraw despite the product spec originally calling for it —
  [ADR-004](docs/decisions/adr-004-custom-canvas-engine.md)).
- [docs/development.md](docs/development.md) — repo-specific conventions (adding a crate/package,
  why operations cross IPC as hand-mirrored JSON, where a given decision belongs).

## Commands

```bash
# Install / build everything
pnpm install
pnpm build                       # TS apps/packages
cargo build --workspace          # Rust crates

# Run the desktop app in dev mode
pnpm dev

# Tests
pnpm test                        # all TS packages (Vitest, run once)
pnpm exec vitest run packages/ui # a single TS package (no per-package "test" script exists —
                                  # root vitest.config.ts covers packages/*/src/**/*.test.*)
pnpm exec vitest run path/to/file.test.ts -t "test name"   # a single test
cargo test --workspace           # all Rust crates
cargo test -p draft-graph        # a single crate
cargo test -p draft-project opening_a_future_schema_version   # a single test, by name substring

# Lint / format
pnpm lint                        # Biome, all TS/JS
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all
```

CI (`.github/workflows/ci.yml`) runs all of the above across Windows/macOS/Linux and is the
authority on what "passing" means — match it locally before assuming green.

## Architecture, in brief

**The canvas is never the source of truth.** The Rust-owned Project Graph
(`crates/draft-graph`) is. The canvas (`packages/canvas`) emits typed **operations**
(`create_object`, `move_object`, `update_object`, `delete_object` —
`crates/draft-events::Operation`, hand-mirrored in `packages/shared/src/operations.ts`) instead
of writing state directly; `draft-graph::Graph::apply` is what actually mutates state, and
rejects operations targeting a page/object that doesn't exist. This is the same vocabulary MCP
will eventually expose as change events, so there's one mechanism instead of two — see
[ADR-012](docs/decisions/adr-012-operation-log-sync.md).

```
Project Graph (Rust, crates/draft-graph)  <-- source of truth
        |
  Canvas | Media | Metadata
(packages/canvas | draft-media | draft-project)
        |
     MCP API (draft-mcp)  -->  Claude / Codex / other agents
```

**Rust core, TypeScript shell.** Domain logic (project format, the graph, permissions, media
identity, the MCP server) lives in `crates/*` and is exposed to the React frontend
(`apps/desktop`, `apps/web`, `packages/*`) through Tauri IPC. `packages/project-client` is the
one place the frontend calls `@tauri-apps/api` — don't call it directly from components.

**Typed IDs cross the language boundary as URI strings**, not raw UUIDs: `object://<uuid>`,
`page://<uuid>`, etc. (`draft-core`'s `ObjectId`/`PageId`/... in Rust, branded string types in
`packages/shared/src/ids.ts`). Each ID kind is a distinct type on both sides so, e.g., a `PageId`
can't be passed where an `ObjectId` is expected.

**Type drift across the IPC boundary is currently manual.** There's no codegen from
`draft-core`/`draft-events` to `@draft/shared` yet — if you add or change a Rust operation
variant or ID kind, update the TypeScript mirror in the same change (see
[docs/development.md](docs/development.md)'s note on this).

For which crate/package owns what, and how much of each is actually implemented today versus
foundation-stage skeleton, see the responsibility table in
[docs/architecture.md](docs/architecture.md) rather than assuming from the directory name alone
— several (`draft-mcp`, `draft-graph`'s object payloads, `packages/canvas`) are intentionally
thin right now pending Session 1/2 work.

## Conventions specific to this repo

- **No placeholder-only crates/packages.** A new crate must have real, tested behavior from the
  start, not just enough to make the workspace tree look complete (product spec rule; see
  `draft-security`/`draft-platform` as examples of "minimal but real").
- **A new Rust crate** goes in the root `Cargo.toml`'s `members` list and, if other crates
  depend on it, in `[workspace.dependencies]` too, so every consumer pins the same path/version.
- **A new TS package** is named `@draft/<name>`, and its `tsconfig.json` extends
  `/tsconfig.base.json`.
- **Design-decision placement:** a one-off choice gets a code comment (only if the *why* isn't
  obvious); a significant/hard-to-reverse/cross-cutting choice gets an ADR in
  `docs/decisions/`; anything else about how a system works goes in the relevant `docs/*.md`,
  linked from `ARCHITECTURE.md`.
- **Brand/design assets** live in `assets/brand/` (see its own README for the color palette,
  typography, and which file to use for what) — not user project assets, which is a separate,
  not-yet-built concept (`*.draft` project bundles, per
  [docs/project-format.md](docs/project-format.md)).
