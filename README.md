# DRAFT

**If you can't explain it to AI, show it to AI.**

DRAFT is a cross-platform visual workspace where you sketch, draw, annotate, and organize
ideas — and an MCP-compatible AI agent reads that workspace directly instead of you
re-explaining it in text or re-uploading screenshots. It's built especially for game and
level design, but works for any visual planning: software architecture, UI mockups,
storyboards, diagrams.

DRAFT is **not** a drawing app, an AI image generator, a whiteboard clone, or an
Anthropic/Claude-specific plugin. It's the visual context layer that sits between a human's
intent and an AI agent's understanding of it. See [docs/product.md](docs/product.md) for the
full picture.

## Status

DRAFT is early: the repository foundation (workspace layout, project format, core crates,
docs, CI) is in place, but the real canvas — drawing tools, shapes, selection, the actual
"workspace" a human would use day to day — has not been built yet. See
[ROADMAP.md](ROADMAP.md) for what's done and what's next. Nothing here is ready to use for
real work yet.

## Repository layout

```
apps/
  desktop/     Tauri 2 + React desktop shell
  web/         Vite + React web shell (minimal — see ROADMAP.md)
crates/
  draft-core/      shared IDs, error types
  draft-project/   project format (read/write/migrate)
  draft-graph/     the Project Graph (applies operations to build state)
  draft-events/    the operation/event log
  draft-media/     asset metadata + content hashing
  draft-mcp/       MCP server (foundation-stage skeleton)
  draft-security/  permission model + path-safety helpers
  draft-platform/  OS abstraction trait
packages/
  ui/              shared React components + design tokens
  canvas/          the custom canvas engine
  project-client/  typed wrapper around Tauri IPC calls
  shared/          TS types shared between frontend and the Rust core's JSON boundary
docs/              architecture, product, and process documentation
docs/decisions/    Architecture Decision Records (ADRs)
```

For *why* it's shaped this way, start with [ARCHITECTURE.md](ARCHITECTURE.md).

## Getting started

Prerequisites: Rust (stable, via [rustup](https://rustup.rs)), Node 22.13+, and
[pnpm](https://pnpm.io).

```bash
pnpm install
pnpm build
cargo build --workspace
```

Run the desktop app in development:

```bash
pnpm dev
```

Run tests:

```bash
pnpm test              # TypeScript packages (Vitest)
cargo test --workspace # Rust crates
```

Lint/format:

```bash
pnpm lint
cargo clippy --workspace --all-targets
cargo fmt --all
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — high-level system design
- [docs/product.md](docs/product.md) — what DRAFT is and isn't, and who it's for
- [docs/project-format.md](docs/project-format.md) — the `.draft` project bundle format
- [docs/project-graph.md](docs/project-graph.md) — the Project Graph model
- [docs/mcp.md](docs/mcp.md) — the MCP server design
- [docs/agent-permissions.md](docs/agent-permissions.md) — the agent permission model
- [docs/decisions/](docs/decisions/) — ADRs for the significant technical decisions
- [ROADMAP.md](ROADMAP.md) — what's built, what's next
- [CONTRIBUTING.md](CONTRIBUTING.md) — development workflow
- [SECURITY.md](SECURITY.md) — reporting a vulnerability

## License

DRAFT is **free forever** but **not open source** — the source is available in this
repository for transparency, but it's proprietary. See [LICENSE.md](LICENSE.md) for the
exact terms.

Created by **P4inz** (Atharva Patil).
