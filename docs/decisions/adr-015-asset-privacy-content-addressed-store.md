# ADR-015: Assets Cross the Graph/MCP Boundary as References, Never as Bytes

**Status:** Accepted
**Date:** 2026-09-06
**Deciders:** P4inz (Atharva Patil)

## Context

DRAFT states a founding principle in `CLAUDE.md`: an AI agent understands a human's visual
workspace *without receiving raw screenshots* — structured data, not pixels. Image import
(shipped earlier this session) violated the same principle for imported media without
anyone noticing at the time: `ImageShape.src` embeds the imported file as a data URL
directly in the shape payload, and that payload is exactly what `get_page`/`get_object`
(MCP read tools) and `create_object`/`modify_object` (write tools) send verbatim to a
connected agent. In practice, today, any agent with read access that calls `get_page` on a
page containing an imported image receives that image's raw bytes, base64-encoded, over
MCP — the same thing the "no raw screenshots" principle exists to prevent, just for a
different kind of image.

This was flagged as an interim simplification when image import shipped (a comment in
`packages/shared/src/shapes.ts`), deferred because embedding an `asset://`-style reference
needs a project asset directory that a freshly opened, unsaved canvas doesn't have yet. The
user has since clarified DRAFT's actual purpose directly: it's the channel that teaches an
agent a human's design intent, and it must never upload the user's raw assets to that agent.
That reframes this from "a trade-off to revisit later" to "a violation of a stated core
principle, fix it now."

## Decision

Imported media is stored as a real, content-addressed file (SHA-256-hashed, deduplicating
identical re-imports) in an asset directory, and every place that references it — the
canvas's committed operations, `draft-graph::Shape::Image`, MCP's tool responses — carries
only a stable filename reference (`"<hash>.<ext>"`), never the file's bytes. The "no raw
assets to an agent" rule from context applies uniformly: any future imported media kind
(SVG, video) goes through the same reference mechanism from day one, not bytes-first with a
reference bolted on later.

**The "no project yet" blocker is resolved with a scratch asset directory, not by deferring
the reference.** `draft-project::save_asset`/`load_asset`/`copy_asset` operate on *any*
directory containing an `assets/` subfolder — a real project bundle or a plain scratch
directory under the app's own data dir (via the existing `draft-platform::PlatformPaths`).
Import always writes through this path immediately, whether or not the human has saved a
project yet; on first save, `copy_asset` migrates the referenced files from scratch into the
real project's `assets/` directory. The object's reference string doesn't change across that
migration since it's content-addressed — only where the file physically lives changes.

The human still sees their own imported image immediately, same as before — that was never
the privacy concern. What changes is what's synced to `draft-graph` and handed to an agent:
a reference and metadata (kind, position, size), not the file itself.

## Options Considered

### Option A: Content-addressed reference via a (possibly scratch) asset directory (chosen)

**Pros:** closes the principle violation completely and immediately, not just for the next
project a human happens to save; reuses `draft-media`'s already-built (previously unused)
content-hashing instead of adding a second mechanism; the reference format doesn't change
between scratch and saved state, so nothing needs a migration step for the graph/MCP side,
only a file copy.
**Cons:** requires the scratch-directory plumbing (a new concept — asset storage that
outlives a single canvas session but isn't a saved project) and a migration step on first
save that didn't exist before.

### Option B: Defer sending the asset reference to the graph until first save

**Pros:** no scratch-directory concept needed; matches the original deferred design exactly.
**Cons:** an agent with live read/write access (the whole point of the local-socket MCP
transport per ADR-007) couldn't see that an image object exists at all until the human
happened to save — a real regression in "live" visibility for the most common case (a human
sketching before their first save), and doesn't actually fix anything faster than Option A;
it just delays when the fix takes effect.

### Option C: Keep embedding bytes, but gate it behind agent mode (e.g. only in `Build` mode)

**Pros:** smallest possible code change.
**Cons:** doesn't fix the actual problem — a `Build`-mode agent (which today's write tools
already require for any mutation) would still receive raw bytes on every `get_page` call
just by having write access; access level and "should this agent's every read respond with
someone's actual private image" are different axes and conflating them doesn't close the gap
the user actually raised.

## Trade-off Analysis

Option A's extra plumbing (scratch directory, migration-on-save) is a one-time, contained
cost that fully closes the violation from the moment an image is imported, matching what the
user described as the actual bar ("without upload any assets directly to Claude or other
agent" — not "eventually, once saved"). Option B is cheaper but leaves the violation live for
exactly the session state (before first save) that a human is most likely to be showing an
agent in real time. Option C doesn't address the stated concern at all.

## Consequences

- `packages/shared/src/shapes.ts`'s `ImageShape.src: string` becomes `ImageShape.assetId:
  string`; `crates/draft-graph::shape::KnownShape::Image`'s `src` field becomes `asset_id`
  (`#[serde(rename = "assetId")]`) in the same change, per `CLAUDE.md`'s manual-mirror rule
  and ADR-014's precedent for shape-kind changes.
- Any future imported media kind (SVG, animated video/GIF as a reference-level asset) reuses
  this same mechanism from the start — no separate "we'll fix the reference design for this
  one too, later" debt accumulates.
- If an agent ever genuinely needs the actual asset bytes (e.g. to analyze an imported
  reference image), that must be a separate, explicit, opt-in tool call added deliberately —
  not something that happens as a side effect of reading page/object data. Not building that
  tool now; this ADR is about making sure it doesn't happen by accident in the meantime.
- The scratch asset directory needs its own lifecycle question (cleanup of orphaned
  never-saved assets across app restarts) — not solved by this ADR, noted as a follow-up
  once it's clear how big a problem it actually is in practice.

## Action Items

1. [x] `draft-media::hash_bytes` — hash an in-memory buffer (the entry point for bytes
   arriving over Tauri IPC, as opposed to `hash_file`'s already-on-disk case).
2. [x] `draft-project::save_asset`/`load_asset`/`copy_asset` — content-addressed write/read
   against any directory with an `assets/` subfolder, plus migration between two such
   directories.
3. [x] `crates/draft-graph::shape::KnownShape::Image`: `src` → `asset_id`
   (`#[serde(rename = "assetId")]`).
4. [x] Tauri commands (`apps/desktop/src-tauri`) exposing `save_asset`/`load_asset` to the
   frontend, backed by a scratch directory (via `draft-platform::PlatformPaths`) when no
   project has been saved yet, and `copy_asset` migration wired into `save_snapshot`.
5. [x] Frontend (`packages/canvas`): import flow calls the new Tauri command instead of
   embedding a data URL in the committed shape; a local (not graph-synced) asset cache in
   the canvas store maps `assetId -> data URL` purely for the human's own rendering, loaded
   via the new `load_asset` command on page load / project open.
6. [x] Tests proving the actual guarantee: an MCP `get_page`/`get_object` response for an
   image object never contains anything resembling the original file's bytes, regardless of
   the source file's size (`get_object_never_returns_raw_asset_bytes_for_an_image` in
   `crates/draft-mcp/tests/mcp_local_socket.rs`).
