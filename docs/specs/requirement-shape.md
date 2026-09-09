# Spec: the `Requirement` shape kind (semantic taxonomy, slice 1)

**Status:** Proposed — not started
**Related:** [ADR-014](../decisions/adr-014-typed-shape-taxonomy.md) (deferred the semantic
taxonomy pending "a concrete driving feature"), [ADR-007](../decisions/adr-007-mcp-architecture.md)
(MCP architecture)

## Problem Statement

DRAFT's typed shape taxonomy (ADR-014) covers *drawing* shapes only — a rectangle has no
meaning beyond being a rectangle. The product spec's original vision includes a *semantic*
layer (`Region`, `Requirement`, `Flow`) that would let a sketch carry actual project meaning,
but ADR-014 explicitly deferred it: "these still need a concrete driving feature before being
designed." That driving feature now exists. Spec-driven development (SDD) — specs as the
primary, AI-agent-readable, executable artifact of a project, with code as a regenerable
output — is a major 2026 industry trend, and Gartner projects over 80% of enterprises
pursuing AI initiatives will use knowledge graphs for requirements traceability by end of
2026 (researched 2026-09-09; see chat log for sources). Every AI-diagramming competitor found
in the same research pass (Miro, Whimsical, Eraser, FigJam, Jeda.ai) generates diagrams *from*
a prompt — none offers live, bidirectional, structurally-typed agent access to a
human-edited canvas as the spec artifact itself. That gap is exactly what DRAFT's existing
architecture (a typed operation log + a live MCP server an agent reads/writes in real time)
is positioned to fill, and nothing else in the competitive set can copy it without rebuilding
their whole data model.

Today, a human sketching a system design in DRAFT and an agent implementing it have no shared
vocabulary for "this part is load-bearing" versus "this part is illustrative." An agent
reading the canvas via `get_page`/`get_object` sees a bag of rectangles and arrows with no
way to know which ones matter, and has no way to report back "I've satisfied this part of the
design" in a form the human's canvas can show.

## Goals

1. A human can mark specific drawing shapes (or a whole region) as satisfying a named,
   trackable requirement, without leaving the canvas or maintaining a separate document.
2. An MCP agent can read which requirements exist, what they're linked to, and their current
   status — and update that status as it implements — through the same tool surface it
   already uses for shapes (no new transport, no new permission model).
3. A requirement's status change is visible to the human immediately (reuses the existing
   `LiveState.changes` → `draft-graph-changed` live-sync path), the same way an agent's shape
   edit already is.
4. Ship a genuinely minimal first slice — one shape kind, no new UI paradigm — that proves
   the concept end-to-end (human creates it, agent reads/updates it, human sees the update)
   before any larger semantic-taxonomy work is attempted.

## Non-Goals

- **Full `Region`/`Flow` kinds.** This spec covers `Requirement` only. `Region` (a named area
  grouping other shapes) and `Flow` (an ordered sequence with semantics beyond a drawn arrow)
  are real future work but out of scope here — building all three at once repeats ADR-014's
  own warning against designing speculative infrastructure with no concrete driver each still
  needs its own.
- **Automatic requirement extraction from a sketch.** No "AI reads your diagram and infers
  requirements" — that's the crowded, prompt-to-diagram category this spec is explicitly
  differentiating from. A human (or an agent, through the same typed tool) creates
  requirements deliberately.
- **A dependency graph / requirement-to-requirement relationships** (blocks, satisfies,
  conflicts-with). Real value, but it's a second slice — this one only needs
  requirement-to-drawing-shape links to prove the core loop.
- **A dedicated requirements-list UI panel.** v1 surfaces requirements as an on-canvas shape
  and via MCP tools only; a sidebar/list view is a natural fast-follow once the data model is
  proven, not a blocker to shipping it.
- **Migrating existing projects' rectangles/text into requirements automatically.** Out of
  scope — a `Requirement` is a new, deliberate shape kind, not a reinterpretation of existing
  drawing data.

## User Stories

- As a human sketching a system design, I want to mark a drawn component as a requirement
  with a status, so an agent implementing it knows what "done" means for that piece without
  me writing a separate spec document.
- As a human, I want to see a requirement's status change color/indicator update on my canvas
  the moment an agent marks it satisfied, so I don't have to poll a log to know progress.
- As an MCP agent in Build mode, I want to query "what requirements exist on this page and
  what shapes do they constrain," so I can plan implementation work against the human's
  actual intent, not just guess from shape geometry.
- As an MCP agent, I want to update a requirement's status once I've implemented it, using
  the same typed-write tool surface I already use for shapes, so there's no second API to
  learn.
- As a human in `Ask`/`Watch` mode, I want an agent's requirement-status reads to go through
  the exact same permission gate shape edits already do — no special-cased "requirements are
  always readable" exception that weakens the existing model.

## Requirements

### Must-Have (P0)

**A new `Requirement` variant on `KnownShape`** (`crates/draft-graph/src/shape.rs`), mirrored
in `packages/shared/src/shapes.ts` per `CLAUDE.md`'s manual-mirror rule, in the same commit —
not a follow-up. Minimal fields:
- `status: RequirementStatus` (`open` | `satisfied` — a two-state enum for v1, matching "the
  minimal viable version," not the richer workflow states a real project-management tool
  would eventually want)
- `description: String`
- `linkedObjectIds: Vec<ObjectId>` — the drawing shapes this requirement constrains. An empty
  vec is valid (a requirement not yet tied to specific geometry).
- The usual `ShapeBase` (`x`/`y`/`groupId`/`zIndex`) so it renders and positions like any
  other shape — a `Requirement` is a first-class canvas object, not a hidden metadata blob.

*Acceptance criteria:*
- [ ] `Requirement` round-trips through `serde` identically to every other `KnownShape`
  variant (existing test pattern in `shape.rs`'s `#[cfg(test)] mod tests`).
- [ ] A malformed `Requirement` payload (invalid `status`, non-existent `linkedObjectIds`
  entries) is rejected the same way a malformed `rectangle` is — `Graph::apply` doesn't get a
  silent pass-through for the new kind. (Whether a *dangling* linked ID — referencing an
  object that once existed but was deleted — is a hard validation error or a tolerated,
  cleaned-up-lazily state is an open question below; either way it must not panic or corrupt
  the graph.)

**MCP tools understand the new kind** (`crates/draft-mcp/src/live.rs`): `create_object`/
`modify_object`/`get_object` already accept arbitrary typed payloads and validate them
through `Graph::apply` — `Requirement` needs no *new* tool, just correct validation, matching
this session's own recent work adding `zIndex`/rotation/stroke validation to existing shape
kinds. Gated by the exact same `AgentMode::allows_read()`/`allows_write()` checks every other
object already goes through — no special case.

*Acceptance criteria:*
- [ ] An agent in `Watch` mode can `get_object` a `Requirement` and read its status.
- [ ] An agent in `Build` mode can `modify_object` a `Requirement`'s status; the change fires
  `LiveState.changes` exactly like any other write, so the human's canvas refetches and shows
  it live — reusing the existing mechanism, not a parallel one.
- [ ] An agent in `Manual`/insufficient mode is denied identically to any other read/write —
  verified with a test in the style of `mcp_local_socket.rs`'s existing mode-gate tests.

**Canvas rendering** (`packages/canvas`): a minimal visual representation — a labeled
badge/pin at the shape's position showing status (e.g., a colored dot: open vs. satisfied)
and description on hover/click, per the existing `ShapeView.tsx` per-kind rendering pattern.
No new tool needed to *create* one from the UI in v1 is acceptable (see Open Questions) — the
P0 bar is that a `Requirement` created via MCP renders correctly and is selectable/movable
like any other shape, proving the human side of the loop even if agent-created is the only
creation path at first.

*Acceptance criteria:*
- [ ] A `Requirement` object renders distinctly from drawing shapes (not literally invisible,
  not mistakable for a rectangle).
- [ ] Selecting, moving, and deleting a `Requirement` works through the existing
  select/move/delete tools — it's a shape, not a special mode.

### Nice-to-Have (P1)

- A toolbar affordance to create a `Requirement` directly from the canvas (a new tool
  button), so a human doesn't need an agent connected to use the feature at all.
- Linking UI: drag from a `Requirement` to a drawing shape to populate `linkedObjectIds`
  visually, rather than only via direct MCP writes.
- A `list_requirements` MCP tool (or a `get_page` response that surfaces requirements
  distinctly from drawing shapes) if agents in practice find scanning `get_page`'s full
  object list for `kind: "requirement"` too coarse.

### Future Considerations (P2)

- `Region` and `Flow` shape kinds, once each has its own concrete driver the way this one
  now does.
- Requirement-to-requirement relationships (blocks/satisfies/conflicts-with).
- A dedicated requirements list/sidebar panel.
- Richer status workflow (more than open/satisfied — e.g. in-progress, blocked) once real
  usage shows two states aren't enough.
- Exposing requirement status via the *stdio* (saved-project) MCP transport for
  read-only project audits, not just the live transport.

## Success Metrics

This is a foundation-stage capability, not a growth feature — success here is "does the
core loop work and hold up," not adoption curves, until it's actually shipped and used.

- **Leading:** the round-trip (human creates a `Requirement` → agent reads it → agent updates
  status → human sees it live) completes with zero manual reconciliation, verified via a real
  end-to-end test (extending `mcp_local_socket.rs`'s pattern) and a live-browser check, the
  same verification bar this session held for every other feature.
- **Lagging:** once shipped, whether a real project (the user's own use, or an early adopter)
  actually uses `Requirement` objects instead of falling back to a separate spec doc — the
  actual test of whether this is DRAFT's real differentiator or a nice-sounding idea that
  doesn't match how people actually work.

## Open Questions

- **(Engineering/design)** Should `linkedObjectIds` be validated against the *current* page's
  object set at write time (rejecting a dangling reference outright), or allowed to go stale
  and cleaned up lazily when read? The former matches this session's "validate at the
  boundary" posture everywhere else in `draft-graph`; the latter avoids `Graph::apply` needing
  to know about cross-object referential integrity, a kind of check nothing else in the crate
  does today (every other validation is intra-shape, not inter-shape).
- **(Design)** Does a `Requirement` belong on the same z-ordered layer as drawing shapes, or
  should it render in a distinct overlay layer that's always on top regardless of z-order (so
  it's never visually buried under a shape it's annotating)?
- **(Product)** Two-state `open`/`satisfied` — is that actually sufficient for the target
  use case, or does even v1 need a third "in-progress" state to be useful? Leaning toward
  shipping the narrower version and letting real usage answer this, per the spec's own
  "minimal viable slice" goal, but flagging it as a real risk of being too narrow to be
  useful at all.
- **(Product)** Is agent-only creation (no toolbar button) an acceptable v1, or does that
  make the feature untestable/unusable for a human without an agent connected — undermining
  goal #1 ("without leaving the canvas") if the only way *in* is through MCP? Leans toward
  needing the P1 toolbar affordance pulled into P0, but keeping it P1 here to keep the v0
  slice genuinely minimal, flagged for explicit reconsideration before implementation starts.

## Timeline Considerations

No hard deadline. Sequencing dependency: per [ADR-017](../decisions/adr-017-mcp-ecosystem-reach.md),
agent/MCP *reach* (sidecar bundling, verified client compatibility) should land first — a
differentiated semantic-taxonomy feature is much less valuable if almost nobody can connect
an agent to use it yet. This spec is the next concrete slice of work after that, not before
it.
