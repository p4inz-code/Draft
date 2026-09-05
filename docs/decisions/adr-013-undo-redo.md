# ADR-013: Undo/Redo via Snapshot Diffing

**Status:** Accepted
**Date:** 2026-09-06
**Deciders:** P4inz (Atharva Patil)

## Context

`draft-events::Operation` (ADR-012) is a forward-only vocabulary — there's no defined inverse
for `create_object`/`move_object`/etc. Undo/redo must feel instant (no Tauri IPC round-trip per
step) but every applied change, including an undo, still needs to reach `draft-graph`/MCP as a
normal operation — agents shouldn't need to understand a separate "undo" concept.

## Decision

The canvas keeps a stack of full shape-map snapshots, one pushed before each user-facing action.
Undo/redo pop/push the stack and **diff** the before/after snapshots to synthesize the matching
forward operation(s) (a snapshot that lost an object emits `delete_object`; one where an object's
fields changed emits `update_object`/`move_object`). That synthesized operation is what actually
gets applied via `draft-graph`/`draft-project` — undo is not a distinct code path on the Rust
side, just a frontend-computed forward operation like any other.

## Consequences

- Undo/redo is instant (pure in-memory array swap + diff), independent of IPC latency.
- `draft-graph`, `draft-events`, and MCP never need an "undo" concept — history stays a plain
  forward log, matching ADR-012's intent.
- The frontend snapshot stack is not itself persisted; only the resulting operations are. Closing
  and reopening a project loses undo history, which is an acceptable trade-off for V1 (same as
  most editors).

## Action Items

1. [ ] Implement in `packages/canvas`: snapshot stack + diff-to-operation.
