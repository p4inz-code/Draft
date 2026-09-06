# ADR-014: A Typed Shape Enum in the Project Graph

**Status:** Accepted
**Date:** 2026-09-06
**Deciders:** P4inz (Atharva Patil)

## Context

[ADR-005](adr-005-project-graph.md) deliberately left object payloads as untyped
`serde_json::Value` in `crates/draft-graph`, with its own action item to "define the typed
shape taxonomy once Session 1's canvas needs it." That need has now arrived: `@draft/canvas`
implements eight concrete shape kinds (rectangle, ellipse, diamond, line, text, arrow,
freehand, image) plus a `groupId` field, all specified in `packages/shared/src/shapes.ts` —
but the Rust side still stores and forwards these as opaque JSON with zero validation.

This gap is no longer hypothetical. Today's code review (see `SESSION_LOG.md`, 2026-09-06
end-of-day entry) found a concrete bug that stems directly from it: an MCP agent can write an
`image` object with a negative `width`/`height` via `create_object`'s unchecked
`serde_json::Value` payload, and the canvas's render path (`Math.abs`) and hit-test path
(`min`/`max`) disagree about where the shape actually sits — because nothing between the
agent and the graph ever validates the shape shape is well-formed. The same gap blocks two
other roadmap items from being anything more than "return whatever JSON happens to be
there": `annotations`/`requirements`/`media references` (need to know what a payload *is* to
attach semantics to it) and any MCP resource that wants to reason about shapes rather than
just pass them through (e.g., "list all text objects on this page").

This ADR is scoped to the eight *drawing* shape kinds the canvas produces today, not the full
product-spec taxonomy (`Region`, `Requirement`, `Instruction`, `Flow`, `Component`, `Screen`,
...) — those are semantic/annotation concepts layered *on top of* objects, not object kinds
themselves, and stay deferred per `docs/project-graph.md`'s existing "what's deferred" list.

## Decision

Add a `draft-graph::shape` module defining a Rust `Shape` enum that mirrors
`packages/shared/src/shapes.ts`'s `Shape` union exactly — same `kind` tag values, same field
names, same optional `groupId` — and use it to validate every `CreateObject`/`UpdateObject`
payload inside `Graph::apply`, rejecting a malformed shape (wrong field types, a `kind` that
doesn't match its own field set) before it's stored, rather than accepting anything that
happens to parse as JSON.

`Page`'s storage changes from `HashMap<ObjectId, serde_json::Value>` to
`HashMap<ObjectId, Shape>`. This is not "validate, then store the original JSON" — once the
enum exists, storing the parsed value directly is barely more code than validating and
discarding it, and it's what actually unlocks server-side introspection (counting objects by
kind, listing text objects, computing real bounds for `Region`/`Requirement` attachment
later) instead of leaving the Rust side blind to what it's holding.

**Forward-compatibility mechanism:** a shape `kind` the Rust side doesn't recognize must not
hard-fail the whole write — a future frontend shape kind (added to `shapes.ts` before its
Rust mirror lands, or a deliberate extension point for a later plugin system) still needs
somewhere to go. `Shape` gets an `Other(serde_json::Value)` fallback variant via a custom
two-pass `Deserialize` impl: peek the `kind` field, dispatch to a known variant if it
matches one, otherwise keep the whole object verbatim in `Other`. Known kinds get real
validation and typed access; unknown kinds keep today's "opaque blob" behavior. This is the
same manual-mirror discipline `CLAUDE.md` already states for `Operation`/ID kinds
("if you add or change a Rust operation variant or ID kind, update the TypeScript mirror in
the same change") extended one level deeper to shape kinds — not a new kind of burden, the
same one already accepted, now covering what was its biggest gap.

## Options Considered

### Option A: Full typed `Shape` enum with an `Other` fallback, storage type changes (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Medium — one new module, a hand-written `Deserialize`, `Graph::apply` call-site changes, MCP tool response serialization stays identical (same JSON shape out) |
| Validation | Real — malformed shapes rejected at `Graph::apply`, not just at the canvas's own (bypassable) TypeScript types |
| Forward-compat | Preserved via `Other`, at the cost of no validation for unrecognized kinds |
| Unlocks | Server-side shape introspection; a real foundation for `annotations`/`requirements`/`media references` |

**Pros:** closes the negative-image-size bug at the actual boundary where untrusted (agent)
input enters, not just in the two TS files that happened to disagree; makes today's `docs/mcp.md`
claim that write tools "go through the exact same `Graph::apply` path" actually mean
something for correctness, not just for "no separate code path" bookkeeping; every future
Session 2/3 feature that needs to know what an object *is* (annotations, the `annotations`/
`requirements` MCP resources, richer `get_page` summaries) has something to build on instead
of re-deriving shape structure from raw JSON at each call site.
**Cons:** a second place (Rust) that must track every shape-kind change alongside
`shapes.ts`, formalized as a hard requirement rather than an informal convention; the custom
`Deserialize` impl is a maintenance surface `serde`'s derive macro doesn't hand you for free.

### Option B: Validation-only layer, storage stays `serde_json::Value`

**Pros:** smaller diff — no `Page` storage type change, no MCP response serialization to
re-verify; a "reject bad input" fix without a "change what we store" commitment.
**Cons:** solves only the validation half of the problem and none of the introspection half
— `annotations`/`requirements`/richer resources still have nowhere to get typed shape data
from, so this would need revisiting again the moment those land; validating into a typed
value and then throwing that value away to re-store the original JSON is strictly more code
than just keeping the typed value, for less benefit.

### Option C: Full product-spec taxonomy now (`Region`, `Requirement`, `Instruction`, `Flow`, `Component`, `Screen`, ...)

**Pros:** one taxonomy pass instead of two.
**Cons:** exactly the mistake ADR-005 already flagged and avoided once — guessing a schema
before a concrete consumer exists. None of these semantic kinds have a driving feature yet
(that's Session 2/3's "Annotations, requirements, relationships, media references, regions"
item, still open); designing their fields now means designing them twice once that work
actually starts.

## Trade-off Analysis

Option A's "second place to keep in sync" cost is real but bounded and already the project's
established pattern (Operations and ID kinds already require this); it buys correctness at
the actual trust boundary (agent-supplied JSON) and a real foundation for the next two
roadmap items that are otherwise stuck. Option B defers exactly the part of the problem that
matters for what's next, for a marginally smaller diff today. Option C repeats a mistake this
project has explicitly already decided not to repeat.

## Consequences

- `crates/draft-graph`'s `Page::objects` becomes `HashMap<ObjectId, Shape>` — any code
  reading raw JSON out of a `Page` (persistence in `draft-project`, MCP's `get_page`/
  `get_object`) needs to serialize `Shape` back to JSON at the boundary, which is what serde
  already does for free (the wire format doesn't change).
- Adding a new shape kind to `packages/shared/src/shapes.ts` now means adding the matching
  Rust variant *in the same change*, per `CLAUDE.md`'s existing rule — not a new obligation,
  but now covering shapes, not just operations/IDs.
- `create_object`/`modify_object` MCP tools' error responses gain a real "invalid shape"
  case distinct from "invalid page/object id" — a concrete, user-visible improvement to
  agent-facing error messages, not just an internal validation detail.
- The negative-width/height image bug (found in today's code review, not yet fixed) is
  closed at the root once this lands — normalize `width`/`height` to non-negative during
  `Shape` construction/deserialization instead of leaving render and hit-test to
  independently guess how to handle a negative value.
- Opens the door to real `annotations`/`requirements`/`media references` MCP resources
  (still a separate, later change — this ADR only unblocks it).
- `Other(serde_json::Value)` means a shape kind Rust doesn't know about is stored but not
  understood — anything that wants to reason about "all objects" (not just "all known-shape
  objects") must still handle the possibility of an opaque blob.

## Action Items

1. [x] `crates/draft-graph/src/shape.rs`: `Shape` enum (rectangle/ellipse/diamond/line/text/
   arrow/freehand/image + `groupId`) mirroring `packages/shared/src/shapes.ts`, with a custom
   `Deserialize` impl providing the `Other(serde_json::Value)` fallback for unrecognized
   `kind` values.
2. [x] `Page::objects: HashMap<ObjectId, Shape>`; `Graph::apply`'s `CreateObject`/`UpdateObject`
   handlers parse/validate `payload` into a `Shape` (`GraphError::InvalidShape` on failure)
   instead of storing raw `serde_json::Value`; `MoveObject` uses `Shape::set_position`
   uniformly instead of poking at a JSON object's keys.
3. [x] Negative `width`/`height` (rectangle/ellipse/diamond/image) normalize to non-negative
   during deserialization (`KnownShape::normalized`), closing the render/hit-test desync bug
   at the source.
4. [x] Every call site typed against `serde_json::Value` for object payloads
   (`crates/draft-mcp`'s `live.rs`/`bin/main.rs` tool responses,
   `apps/desktop/src-tauri/src/lib.rs`'s `PageSnapshotOut`) now serializes `Shape` back out.
   `draft-project`'s `PageDocument`/on-disk format deliberately stays `serde_json::Value` —
   it's raw storage, not a live-write boundary; `Graph::insert_page` parses it into `Shape`
   leniently (falling back to `Other` instead of failing to load a whole project over one
   malformed object) when reconstructing a `Graph` from saved pages. Wire JSON is compatible
   (numbers may render as `100.0` instead of `100` since fields are typed `f64` now — harmless
   for JS/TS consumers, which don't distinguish the two).
5. [x] New Rust tests (13 in `draft-graph`, plus updates to existing `draft-mcp` tests): every
   known shape kind round-trips through `Graph::apply`; an unknown `kind` round-trips via
   `Other` without data loss; a malformed known-kind payload is rejected via `apply` (strict)
   but tolerated via `insert_page` (lenient); a negative-width image normalizes correctly;
   `set_position` works uniformly across known and unknown shapes.
6. [x] Updated `docs/project-graph.md`, `docs/architecture.md`, `docs/mcp.md`, `CLAUDE.md`,
   and ADR-005's own action item to reflect the typed taxonomy instead of "untyped JSON."
