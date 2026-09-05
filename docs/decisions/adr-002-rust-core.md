# ADR-002: Rust for the Core Domain Logic

**Status:** Accepted
**Date:** 2026-09-05
**Deciders:** P4inz (Atharva Patil)

## Context

DRAFT's most important architectural rule is that the canvas is not the source of truth —
some layer must own the Project Graph, project format, permissions, and (eventually) the MCP
server, independent of whatever renders the UI. That layer needs to be fast, memory-safe
(it handles untrusted project files and, later, agent-supplied data), and usable both from a
desktop shell and a future headless CLI/MCP binary.

## Decision

Rust owns all core domain logic: the Project Graph (`draft-graph`), project format
(`draft-project`), operation/event log (`draft-events`), media metadata (`draft-media`),
permissions (`draft-security`), platform abstraction (`draft-platform`), and the MCP server
(`draft-mcp`). The frontend (TypeScript/React) is a view layer that talks to this core over
Tauri IPC — it never re-implements core logic.

## Options Considered

### Option A: Rust core

**Pros:** Memory safety without a garbage collector (important for a long-lived desktop
app), first-class Tauri integration (ADR-001), a mature MCP SDK (`rmcp`, ADR-007), one
codebase shareable between the desktop app and a headless CLI binary.
**Cons:** Smaller pool of contributors familiar with Rust than TS/JS; slower iteration speed
for pure UI work than doing everything in TypeScript.

### Option B: All-TypeScript (core logic in Node/the frontend)

**Pros:** One language across the whole stack; faster iteration for contributors who only
know TS.
**Cons:** No natural place to run a memory-safe core outside a browser/Node process; would
require either bundling Node into the desktop app (undermining the Tauri decision) or
duplicating logic between a Node backend and a browser frontend. Also weaker fit for a
headless MCP server binary that should start fast and run with a small footprint.

## Trade-off Analysis

Rust's steeper learning curve is accepted because the core's job — being a trustworthy,
long-lived source of truth that a UI, a CLI, and (eventually) untrusted agent requests all go
through — benefits more from memory safety and performance than from being in the same
language as the UI.

## Consequences

- Every new domain concept gets a real crate boundary with real content (not a placeholder)
  — see `crates/` in [/ARCHITECTURE.md](../../ARCHITECTURE.md).
- The frontend and Rust core must keep their JSON contract in sync by hand for now (see
  [docs/development.md](../development.md)) until/unless codegen is introduced.
- Contributors need a working Rust toolchain, not just Node — documented in
  [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Action Items

1. [x] Establish the Cargo workspace and the eight foundation crates.
2. [ ] Introduce type-sharing codegen (e.g. `ts-rs`/`specta`) if hand-kept sync becomes a
   real source of bugs (see [docs/development.md](../development.md)).
