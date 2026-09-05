# ADR-005: The Project Graph as the Source of Truth

**Status:** Accepted
**Date:** 2026-09-05
**Deciders:** P4inz (Atharva Patil)

## Context

DRAFT's core value proposition — an AI agent understanding a human's visual workspace
without receiving raw screenshots — requires a structured representation of that workspace
that exists independent of any particular canvas/rendering implementation (proven necessary
in practice by [ADR-004](adr-004-custom-canvas-engine.md)'s canvas swap).

## Decision

The Project Graph (`crates/draft-graph`) is the single source of truth for a project's
structured state: pages and their objects, addressed by stable typed IDs
(`crates/draft-core`). It is built exclusively by applying typed operations
(`crates/draft-events`, [ADR-012](adr-012-operation-log-sync.md)) — no component, including
the canvas, mutates it directly.

## Options Considered

### Option A: Project Graph as source of truth, canvas as a view (chosen)

**Pros:** MCP, the project format, and the canvas can all evolve independently (already
validated: the canvas was swapped from tldraw to custom without touching this layer); an
agent's read/write surface is well-defined and doesn't depend on rendering internals.
**Cons:** Every canvas interaction that should persist must be translated into an operation
— more indirection than mutating a shared document directly.

### Option B: The canvas library's own document model as source of truth

**Pros:** Less translation code; whatever the canvas SDK already persists "just works."
**Cons:** Directly couples the project format and MCP surface to a specific canvas
implementation's internal schema — exactly the fragility [ADR-004](adr-004-custom-canvas-engine.md)
demonstrated is a real risk, not a hypothetical one.

## Trade-off Analysis

The translation overhead of Option A is a fixed, one-time cost per operation type; Option
B's coupling risk is open-ended and already materialized once during this project's
foundation phase.

## Consequences

- Object payloads are untyped JSON in the graph today, deliberately, until Session 1/2
  defines the real shape taxonomy (spec §8) — see [docs/project-graph.md](../project-graph.md).
- Every new kind of user action needs a corresponding operation variant
  ([docs/events.md](../events.md)), not a direct graph mutator.
- MCP write tools (Session 2+) are automatically limited to exactly what the canvas itself
  can do, since both go through `Graph::apply`.

## Action Items

1. [x] Implement `Graph::apply` for create/update/move/delete with unknown-page/object and
   duplicate-creation rejection.
2. [ ] Define the typed shape taxonomy once Session 1's canvas needs it.
