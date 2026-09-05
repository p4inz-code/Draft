# Canvas

Implemented in `packages/canvas`. See [ADR-004](decisions/adr-004-custom-canvas-engine.md)
for why this is a from-scratch engine and not tldraw (tldraw's SDK license changed in
September 2025 to require a paid key or a "made with tldraw" watermark in production, which
conflicted with DRAFT's unbranded, free-forever positioning).

## Approach

DOM/SVG shapes positioned via a CSS-transform viewport, not pixel-drawn `<canvas>` content.
This keeps hit-testing, text editing, and accessibility native to the DOM instead of
reimplemented — the same approach tldraw itself used before its license change, and one
that's proven at the scale DRAFT needs.

Freehand stroke outlines use [`perfect-freehand`](https://github.com/steveruizok/perfect-freehand)
(MIT-licensed, a standalone package independent of tldraw's SDK license — verified
separately, see ADR-004).

## The camera

`packages/canvas/src/camera.ts` is pure, framework-agnostic coordinate math: a `Camera` is
`{ x, y, zoom }` (world-space origin + scale), with `screenToWorld`/`worldToScreen`
conversions, `panBy`, and `zoomAt` (zoom-to-cursor, keeping the world point under the pointer
visually fixed, clamped to `[0.05, 32]`). No React here — unit-tested in isolation
(`camera.test.ts`), consumed by `Canvas.tsx` via `useCanvasStore`.

## Shapes

The concrete shape schema (`@draft/shared`'s `Shape` union: rectangle, ellipse, diamond, text,
arrow, line, freehand) lives in `packages/shared/src/shapes.ts`, not in `packages/canvas` —
it's shared vocabulary since it also describes what `Operation.payload` carries across the IPC
boundary (see docs/architecture.md's trade-off note on untyped `draft-graph` payloads: this
schema now exists, `draft-graph` just doesn't parse it yet). `isResizableShape` picks out the
subset with a `width`/`height` bounding box (rectangle, ellipse, diamond) — that's what resize
handles apply to.

## The store: `useCanvasStore` (`packages/canvas/src/store.ts`)

The fast, in-memory live-edit store (docs/architecture.md's "data flow" step 1): shapes,
selection, active tool, camera, and history all live here, driven by `Canvas.tsx`'s pointer
event handlers. Nothing here has been flushed to the Rust core yet — see the "not yet done"
section below.

## Undo/redo ([ADR-013](decisions/adr-013-undo-redo.md))

`beginAction()` snapshots the shape map before a gesture; `commitAction()` diffs the snapshot
against the post-gesture state (`diff.ts`'s `diffShapeMaps`) and records the resulting
`Operation`s. Undo/redo swap the snapshot stack and *also* diff the transition into a forward
operation — there's no separate "undo" concept anywhere downstream, which is the whole point
of the ADR.

## Tools (`Canvas.tsx`)

One SVG element, one pointer-event state machine keyed on `store.tool`: `select` (click to
select + drag to move, marquee on empty canvas), `eraser` (click or drag over shapes to delete
them), and the drawing tools (`rectangle`/`ellipse`/`diamond`/`text`/`line`/`arrow`/`freehand`).
There's no separate "pan" tool — a middle-mouse-drag pans regardless of which tool is active,
which covers the same need with one less button. A click with no drag on a drawing tool is
discarded rather than committing an invisible zero-size shape.

### Resize handles

Selecting a single resizable shape (`select` tool) shows four corner handles
(`ResizeHandles` in `Canvas.tsx`), sized in screen space (divided by `camera.zoom`) so they
stay a constant visual size regardless of zoom. Dragging a handle keeps the *opposite* corner
fixed as the anchor and recomputes `x`/`y`/`width`/`height` from the anchor and the current
pointer position — same `beginAction`/`commitAction` snapshot flow as every other edit, so it's
undoable like anything else. Non-resizable shapes (text, arrow, line, freehand) don't get
handles; moving them still works via the normal drag-to-move.

Zoom: mouse wheel zooms to cursor; the toolbar also has +/- buttons, a live percentage
(click it to reset the view), and Ctrl+=/Ctrl+-/Ctrl+0.

### Text editing

Text is a real inline `foreignObject`/`textarea` editor (`TextEditor` in `Canvas.tsx`), not a
`window.prompt()` shim — Enter commits, Shift+Enter inserts a newline, Escape discards, blur
commits (or deletes the shape if left empty). Double-clicking an existing text shape in the
`select` tool reopens it for editing.

This had a real bug worth remembering: the text tool's `pointerdown` was calling
`setPointerCapture` on the SVG (inherited from the generic drawing-tool path) and then
synchronously focusing the new textarea in the same tick. That raced the browser's own native
click/focus handling for the *same* pointerdown — the native handling would steal focus back
immediately after, firing the textarea's `onBlur` with empty text, which the "discard empty
text" cleanup then deleted, all before the user could type a single character. Fixed by (1)
not taking pointer capture for the text tool at all (it doesn't drag-track anything) and (2)
deferring the initial `.focus()`/`.select()` to `requestAnimationFrame`, so it runs after the
native event sequence for that click has fully finished.

## What's *not* done yet

- **Nothing persists.** The store is frontend-only; no Tauri command exists yet to apply
  operations to `draft-graph` or save them through `draft-project`. Closing the app loses
  everything. This is the next Session 1 slice.
- Grouping.
- Copy/paste, image/video import.
