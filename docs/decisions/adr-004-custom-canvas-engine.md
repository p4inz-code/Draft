# ADR-004: Custom Canvas Engine (Superseding tldraw)

**Status:** Accepted
**Date:** 2026-09-05
**Deciders:** P4inz (Atharva Patil)

## Context

The original product spec called for tldraw as the initial canvas foundation, explicitly
treating it as an implementation detail rather than DRAFT's source of truth. During
foundation planning, research surfaced that **tldraw's SDK license changed in September
2025**: production use now requires either a paid commercial license key or displays a
"made with tldraw" watermark, enforced via a domain-locked license check. This directly
conflicts with DRAFT's product identity — free forever, no revenue model to fund a
commercial key, and explicitly "don't clutter the UI with branding" (product spec §20) —
which becomes worse, not better, when the branding in question is a *third party's*.

This was raised to the user directly, with four options (accept the tldraw watermark on a
free tier, vendor the last MIT-licensed tldraw release, build a custom canvas, or pay for a
commercial key). The user chose to build a custom canvas engine, explicitly wanting DRAFT to
give away, for free, capabilities that competing tools paywall.

## Decision

Build the canvas engine from scratch in `packages/canvas`: DOM/SVG shapes positioned via a
CSS-transform viewport (camera x/y/zoom), not a pixel-drawn `<canvas>` surface. Freehand
stroke outlines use `perfect-freehand` (MIT-licensed, a standalone package by the same
author as tldraw, independently verified as not covered by tldraw's SDK license change).

## Options Considered

### Option A: tldraw with the free "hobby" watermark

**Pros:** Fastest path; full feature set immediately.
**Cons:** Permanent third-party watermark conflicts with the free-forever, unbranded
positioning; license-key domain-locking is an odd fit for a desktop app.

### Option B: Vendor the last MIT-licensed tldraw release

**Pros:** No watermark, no license key, no recurring cost.
**Cons:** Frozen on old code; DRAFT would own security/bug patching for a large,
not-originally-ours codebase indefinitely.

### Option C: Custom canvas engine (chosen)

**Pros:** Zero third-party licensing risk or branding; total control over the feature set
DRAFT gives away for free; fits "the canvas is not the source of truth" even more cleanly,
since there's no external document model to keep at arm's length in the first place.
**Cons:** Substantially more Session 1 implementation work than adopting an existing SDK —
accepted knowingly by the user.

### Option D: Pay for a tldraw commercial license

**Pros:** Removes the watermark immediately.
**Cons:** Recurring cost with no revenue model under the free-forever policy.

## Trade-off Analysis

Option C was chosen deliberately over the faster Option A specifically because DRAFT's
identity depends on being unbranded and free-forever — a third-party watermark or a paid
dependency both undermine that in ways a slower Session 1 timeline doesn't.

## Consequences

- Session 1's scope is heavier than the original spec assumed — freehand drawing, shapes,
  text, arrows, selection, grouping, zoom/pan, undo/redo, copy/paste, and media import all
  need to be built rather than adopted. Flagged explicitly in [ROADMAP.md](../../ROADMAP.md)
  so the four-session timeline expectation is accurate.
- `packages/canvas` is a first-class, longer-lived part of the codebase, not a thin wrapper.
- The canvas-is-not-source-of-truth principle ([docs/project-graph.md](../project-graph.md))
  is unaffected either way — this ADR only changes *how* the view is rendered, which is
  exactly the boundary that principle exists to protect.

## Action Items

1. [x] Verify `perfect-freehand` is MIT-licensed and independent of tldraw's SDK license.
2. [x] Build camera/viewport math (`packages/canvas/src/camera.ts`) as the engine's first
   real piece.
3. [ ] Session 1: shapes, tools, selection, undo/redo, on top of the camera.
