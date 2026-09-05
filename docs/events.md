# Operations and Events

Implemented in `crates/draft-events` (Rust) and mirrored in `@draft/shared` (TS). See
[ADR-012](decisions/adr-012-operation-log-sync.md) for why this exists as one mechanism
instead of a separate "sync" system and a separate "events for agents" system.

## Vocabulary

Four operations today, matching the product spec's `user.*` event names one-to-one:

| Operation | Spec event | Fields |
|---|---|---|
| `CreateObject` | `user.created_object` | `page`, `object`, `payload` |
| `UpdateObject` | (part of `user.modified_object`) | `page`, `object`, `payload` |
| `MoveObject` | `user.moved_object` | `page`, `object`, `x`, `y` |
| `DeleteObject` | `user.deleted_object` | `page`, `object` |

More will be added as the canvas grows (`user.connected_objects`, `user.added_annotation`,
`user.imported_asset`, `user.changed_selection`, `user.changed_page`,
`user.added_instruction` from the product spec) — each is a straightforward new
`Operation` variant plus a `Graph::apply` arm, following the same pattern.

## Actor tagging

Every recorded operation (`OperationRecord`) carries an `Actor`: `User` or `Agent`. This
means an agent's changes are always distinguishable from the human's — required by the
permission model (see [docs/agent-permissions.md](agent-permissions.md)) and useful for
showing the user "the agent moved this" in the UI later.

## The log

`OperationLog` is an append-only, in-memory sequence right now (`OperationLog::append`
stamps each record with a monotonic `sequence` and returns it). It is *not* persisted or
replayed across sessions yet — that's Session 1/2, once:

- undo/redo needs a backing structure to replay/invert, and
- MCP's `recent_changes` resource needs something to read from.

## Why operations instead of whole-graph diffs

A `MoveObject { object, x, y }` is a few dozen bytes regardless of how large the project is.
A whole-graph snapshot diff grows with the project. Since every meaningful frontend commit
crosses the Tauri IPC boundary, keeping payloads small and shaped like "what actually
happened" (rather than "here's the new state, figure out what changed") matters as projects
grow past a handful of objects.

## What's deferred

- Persisting the log (`draft-project` doesn't write it anywhere yet).
- Undo/redo built on replaying/inverting the log.
- The MCP `recent_changes` resource reading from it.
- Compaction/snapshotting once logs get long.
