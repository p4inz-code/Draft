# ADR-012: Operation/Event Log as the Frontend↔Core Sync Mechanism

**Status:** Accepted
**Date:** 2026-09-05
**Deciders:** P4inz (Atharva Patil)

## Context

The canvas needs a fast, local, 60fps-capable interaction store (drag, draw, pan) that is
*not* the source of truth, and that store needs to reach the Rust-owned Project Graph
somehow. Separately, the product spec calls for an event system (`user.created_object`,
`user.moved_object`, etc.) so MCP can expose `recent_changes` and so undo/history has
something to work from. The original foundation plan treated "sync the frontend to the core"
and "the event system for agents" as two different things; a self-audit
(`engineering:architecture` skill) noted this was needlessly duplicative — both are "a
record of what changed."

## Decision

One mechanism: the frontend's live-edit store commits changes to the Rust core as typed
**operations** (`crates/draft-events::Operation`: `CreateObject`, `UpdateObject`,
`MoveObject`, `DeleteObject`, mirrored in `@draft/shared`), and those operations *are* the
event vocabulary MCP will surface. `draft-graph` applies them to build current state;
`draft-events::OperationLog` is the append-only record of what happened and who did it
(`Actor::User` / `Actor::Agent`).

## Options Considered

### Option A: One operation/event vocabulary, used for both sync and agent-visible events (chosen)

**Pros:** No duplicate concepts to keep consistent; undo/redo, MCP's `recent_changes`, and
frontend→core sync all read from the same log; an agent's changes are automatically
distinguishable from the user's via `Actor`.
**Cons:** The vocabulary has to satisfy both purposes — a sync-only design might have used
simpler whole-object snapshots per commit, which the event-system requirement rules out.

### Option B: Whole-graph snapshot diffs for sync, a separate event log for agents

**Pros:** Sync logic could be simpler (send the new state, compute the diff).
**Cons:** Two systems to keep behaviorally consistent; snapshot diffs grow with project size
regardless of how small the actual change was; duplicates work the operation vocabulary
already does.

## Trade-off Analysis

Building the operation vocabulary to serve both purposes costs a bit more upfront design
(each operation needs to make sense both as "what to apply" and "what an agent should see
happened") but eliminates an entire duplicate subsystem and its consistency burden.

## Consequences

- Every new user-facing action (Session 1's shapes, later annotations, etc.) needs a
  corresponding `Operation` variant — there's no separate "just for sync" path to take a
  shortcut through.
- `@draft/shared`'s TS `Operation` type must stay in sync with the Rust
  `draft-events::Operation` enum by hand for now (see [docs/development.md](../development.md)).
- Undo/redo (Session 1+) and MCP's `recent_changes` resource (Session 2+) both build on
  `OperationLog` rather than needing their own storage.

## Action Items

1. [x] Implement `Operation`, `OperationRecord`, `OperationLog` (Rust) and the mirrored TS
   types in `@draft/shared`.
2. [x] Implement `Graph::apply` consuming `Operation` values.
3. [ ] Persist the log via `draft-project` and build undo/redo on top of it (Session 1/2).
