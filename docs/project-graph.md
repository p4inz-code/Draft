# Project Graph

Implemented in `crates/draft-graph`. This is DRAFT's one architectural rule made concrete:
**the canvas is not the source of truth — the Project Graph is** (spec's founding principle;
see [/ARCHITECTURE.md](../ARCHITECTURE.md)).

## Model

```
Project
  └── Page (crates/draft-graph::Page)
        └── Object (a typed Shape — see "The shape taxonomy" below)
```

Every entity has a stable, typed ID from `draft-core` (`ProjectId`, `PageId`, `ObjectId`,
`AssetId`, `AnnotationId`, `RegionId`), rendered as a `scheme://uuid` URI
(`object://0190f1e4-...`). IDs are UUIDv7 — time-ordered, so sorting by ID roughly sorts by
creation time without needing a separate timestamp for that purpose.

## How it's built: applying operations, not direct writes

`Graph::apply(&Operation)` is the *only* way state changes. There is no `Graph::set_object`
or equivalent direct mutator exposed — every change is one of the four operations defined in
`draft-events` (`CreateObject`, `UpdateObject`, `MoveObject`, `DeleteObject`). This is what
makes the graph agent-safe: an MCP write tool (Session 2+) can only ever do what the canvas
itself can do, because they go through the identical `apply` path. See
[docs/events.md](events.md) and [ADR-012](decisions/adr-012-operation-log-sync.md).

`apply` rejects operations that target a page or object that doesn't exist
(`GraphError::UnknownPage`/`UnknownObject`) rather than silently creating one — malformed
operations are expected to be caught before they reach the graph (at the layer accepting
frontend commits or agent write requests), not tolerated here.

## Live-edit store vs. the graph

The frontend canvas keeps its own fast, in-memory store (Zustand) for 60fps interaction —
that store is *not* the Project Graph and is not persisted directly. It's the moment-to-
moment view; the graph is the durable, agent-visible truth. The frontend commits to the
graph by emitting operations at meaningful boundaries (pointer-up, tool change, explicit
save), not on every drag frame. See [docs/architecture.md](architecture.md)'s data-flow
walkthrough for the full path from a drag gesture to a persisted change.

## The shape taxonomy

`crates/draft-graph::shape` defines a typed `Shape` enum ([ADR-014](decisions/adr-014-typed-shape-taxonomy.md))
mirroring `packages/shared/src/shapes.ts` exactly: the eight drawing kinds
`@draft/canvas` actually produces (rectangle, ellipse, diamond, line, text, arrow, freehand,
image) plus the optional `groupId`. Every `CreateObject`/`UpdateObject` payload — a human
canvas edit or an MCP agent write — is validated into this enum by `Graph::apply` before
being stored; a recognized `kind` with malformed fields is rejected (`GraphError::InvalidShape`),
not silently stored. A `kind` this build doesn't recognize (a future frontend addition, or a
deliberate extension point) is kept verbatim as `Shape::Other` rather than rejected outright
— see the ADR for the exact mechanism and trade-off.

Adding a new shape kind to `shapes.ts` means adding the matching Rust variant in the same
change, per `CLAUDE.md`'s manual-mirror rule — now covering shapes, not just operations/IDs.

## What's deferred

- The product spec's *semantic* taxonomy (Region, Requirement, Instruction, Flow, Component,
  Screen, ...) — these layer meaning onto objects, they aren't object kinds themselves, and
  still need a concrete driving feature before being designed (the same reasoning ADR-014
  applied to the drawing-shape taxonomy). Session 2/3.
- Video import (no in-canvas video playback exists to import into yet).
- Semantic interpretation (a rough rectangle becoming a recognized "Screen") — later.
- Persisting the graph to `pages/*.json` via `draft-project` — Session 1/2.
- Cross-page relationships/references.
