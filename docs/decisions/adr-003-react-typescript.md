# ADR-003: React + TypeScript for the Frontend

**Status:** Accepted
**Date:** 2026-09-05
**Deciders:** P4inz (Atharva Patil)

## Context

DRAFT needs a UI layer for the canvas, panels, toolbars, property inspectors, and (later)
permissions/MCP status views, running inside Tauri's webview on desktop and, eventually, in
a real browser for the web build (ADR-008/[docs/web.md](../web.md)).

## Decision

React + TypeScript for all UI code, shared between `apps/desktop` and `apps/web` via
`packages/ui`, `packages/canvas`, and `packages/shared`.

## Options Considered

### Option A: React + TypeScript

**Pros:** Runs identically in a Tauri webview and a real browser (needed for the web build);
huge ecosystem for canvas/interaction primitives; TypeScript gives a typed IPC boundary
against the Rust core's JSON contract (see [docs/development.md](../development.md)).
**Cons:** React's re-render model needs care for a 60fps canvas — mitigated by keeping
interactive state in a dedicated fast store (Zustand) rather than plain React state, per
[docs/project-graph.md](../project-graph.md)'s live-edit-store design.

### Option B: A native/Rust-native UI toolkit (e.g. egui, iced)

**Pros:** Single-language stack with the core; potentially better raw performance.
**Cons:** No path to a web build at all (rules out ADR-008's web-capable architecture
requirement outright); smaller ecosystem for the kind of rich 2D interaction DRAFT's canvas
needs; would still need a plan for text editing, accessibility, etc. that the DOM gives for
free.

## Trade-off Analysis

The web-capable-architecture requirement (spec §5/§17) rules out a desktop-only native UI
toolkit outright — only a web-technology UI runs in both a Tauri webview and a real browser
without a second UI implementation.

## Consequences

- Canvas rendering uses DOM/SVG, not a native/WebGL surface (see
  [ADR-004](adr-004-custom-canvas-engine.md)).
- Zustand is the frontend state tool for anything that needs to be fast/local before it's
  committed to the Rust core as an operation (spec: avoid unnecessary global state — used
  narrowly, not as a general app-state framework).
- Component code is shared via `packages/ui`/`packages/canvas`, not duplicated between
  `apps/desktop` and `apps/web`.

## Action Items

1. [x] Scaffold `apps/desktop` (Vite + React + TS via Tauri's own template) and `apps/web`
   (plain Vite + React + TS).
2. [x] Extract shared components/tokens into `packages/ui`.
