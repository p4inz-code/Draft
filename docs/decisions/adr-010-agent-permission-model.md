# ADR-010: Agent Permission Model

**Status:** Accepted
**Date:** 2026-09-05
**Deciders:** P4inz (Atharva Patil)

## Context

DRAFT's MCP server ([ADR-007](adr-007-mcp-architecture.md)) gives AI agents access to a
human's live workspace, potentially including write access. Agent access must default to
off, be explicit and visible when granted, and be revocable — this can't be an
afterthought bolted on once MCP has write tools; the security-review self-audit during
foundation planning confirmed a bare local socket is not itself a permission boundary.

## Decision

Five agent modes (`crates/draft-security::AgentMode`): `Manual` (default, no access), `Ask`,
`Watch`, `Assist` (all read-only), and `Build` (the only mode allowing writes). Every new
agent connection starts at `Manual` regardless of transport
(`AgentConnection::new` in `crates/draft-mcp`). Every write-capable MCP tool must call
`PermissionGrant::check_write()` — the single choke point — before mutating the graph.

## Options Considered

### Option A: Five explicit modes, write-gated to one mode (chosen)

**Pros:** Matches the product spec exactly; a single, hard-to-bypass enforcement point;
mirrors the mental model users already have from spec §13 (Manual/Ask/Watch/Assist/Build).
**Cons:** Coarser than per-action permission scoping (e.g. "can move objects but not delete
them") — accepted for V1, with scoping explicitly deferred (spec: "scoped where practical").

### Option B: A single boolean "agent can write" flag

**Pros:** Simpler to implement.
**Cons:** Loses the useful distinction between "agent can look" and "agent can suggest" and
"agent can act" that the product spec's modes are built around, and gives users less
granular control over what they're comfortable with.

## Trade-off Analysis

The five-mode model costs a small amount of extra enum-matching complexity in exchange for
matching user expectations and the product spec directly — not a close call.

## Consequences

- `draft-mcp` and any future write tool must route through `PermissionGrant::check_write()` —
  a new tool that mutates the graph without this check would be a bug, not a feature choice.
- The desktop app needs a visible "Agent connected" indicator and a way to change modes —
  not built yet (Session 3), but the types exist so that UI has something real to bind to.
- Scoping grants to specific pages/objects, rather than the whole project, is deferred to
  Session 3.

## Action Items

1. [x] Implement `AgentMode`, `PermissionGrant`, `PermissionDecision`, with tests proving
   only `Build` allows writes.
2. [ ] Session 3: build the permission UI and per-scope grants.
