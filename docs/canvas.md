# Canvas

Implemented in `packages/canvas`. See [ADR-004](decisions/adr-004-custom-canvas-engine.md)
for why this is a from-scratch engine and not tldraw (tldraw's SDK license changed in
September 2025 to require a paid key or a "made with tldraw" watermark in production, which
conflicted with DRAFT's unbranded, free-forever positioning).

## Approach

DOM/SVG shapes positioned via a CSS-transform viewport, not pixel-drawn `<canvas>` content.
This keeps hit-testing, text editing (native `contentEditable`), and accessibility native to
the DOM instead of reimplemented — the same approach tldraw itself used before its license
change, and one that's proven at the scale DRAFT needs.

Freehand stroke outlines will use [`perfect-freehand`](https://github.com/steveruizok/perfect-freehand)
(MIT-licensed, a standalone package independent of tldraw's SDK license — verified
separately, see ADR-004) once drawing tools exist.

## The camera (what exists today)

`packages/canvas/src/camera.ts` is pure, framework-agnostic coordinate math: a `Camera` is
`{ x, y, zoom }` (world-space origin + scale), with `screenToWorld`/`worldToScreen`
conversions, `panBy`, and `zoomAt` (zoom-to-cursor, keeping the world point under the pointer
visually fixed, clamped to `[0.05, 32]`). No React here — it's unit-tested in isolation
(`camera.test.ts`) and will be wrapped in a React hook once there's a viewport component to
drive.

## The canvas emits operations, it doesn't touch the graph

Per [docs/project-graph.md](project-graph.md), the canvas is a view. Once drawing tools
exist, a completed stroke or a finished drag becomes a `CreateObject`/`MoveObject` operation
sent across the Tauri IPC boundary — the canvas never calls into `draft-graph` directly (it
can't; that's a separate process on the Rust side of Tauri).

## What's deferred (Session 1)

- Shapes: freehand strokes, rectangles, ellipses, text, arrows.
- Selection, multi-select, grouping.
- Tool state machine (select/draw/pan/etc.).
- Undo/redo, wired to the operation log (see [docs/events.md](events.md)).
- Copy/paste, image/video import onto the canvas.
