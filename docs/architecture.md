# Architecture

This is the detailed design doc. For the one-page summary, see
[/ARCHITECTURE.md](../ARCHITECTURE.md).

## Requirements that shaped this

- A human must be able to use DRAFT fully offline, with no AI connection (local-first —
  [docs/privacy.md](privacy.md)).
- An AI agent must be able to read a DRAFT workspace without receiving raw canvas
  pixels/screenshots for everything — it needs structured, addressable data
  ([docs/project-graph.md](project-graph.md), [docs/mcp.md](mcp.md)).
- The canvas implementation must be replaceable without touching the project format or the
  MCP surface (this already happened once — see [ADR-004](decisions/adr-004-custom-canvas-engine.md)).
- The desktop app (Tauri) and a future web app must be able to share the same core logic
  without the core assuming a specific OS API is always available
  ([docs/cross-platform.md](cross-platform.md), [docs/web.md](web.md)).

## High-level design

```
                    DRAFT PROJECT
                         |
                    PROJECT GRAPH   <-- source of truth (Rust, crates/draft-graph)
                         |
        +----------------+----------------+
        |                |                |
      Canvas           Media          Metadata
   (packages/canvas) (draft-media)  (draft-project)
        |                |                |
        +----------------+----------------+
                         |
                      MCP API (draft-mcp)
                         |
          +--------------+--------------+
          |              |              |
        Claude         Codex         Other agents
```

The canvas never writes to the Project Graph directly. It emits **operations**
(`draft-events::Operation` / `@draft/shared`'s TS mirror) describing what happened
(`create_object`, `move_object`, ...), and the graph applies them. This is deliberate: it's
the same vocabulary spec'd for the event system MCP will eventually expose as
`recent_changes`, so there's one mechanism instead of two (see
[ADR-012](decisions/adr-012-operation-log-sync.md) and [docs/events.md](events.md)).

## Data flow: a user drags a shape

1. The canvas engine (`packages/canvas`) updates its own fast, in-memory Zustand store
   immediately — this is what makes dragging feel like 60fps, and it's not persisted yet.
2. On a meaningful boundary (pointer-up, not every mousemove frame), the frontend emits a
   `MoveObject` operation.
3. The operation crosses the Tauri IPC boundary as JSON (typed on both sides —
   `draft-events::Operation` in Rust, `@draft/shared`'s `Operation` in TS, kept in sync by
   hand for now).
4. `draft-graph::Graph::apply` mutates the in-memory graph, or rejects the operation if it
   targets a page/object that doesn't exist.
5. `draft-project` persists the change (Session 1+ — the round-trip exists today via
   `save_project`/`open_project`, but nothing calls it from the UI yet).
6. If an agent is connected with sufficient permission, MCP surfaces the change as a
   `recent_changes` event (Session 2+).

## Crate/package responsibilities

| Component | Responsibility | What exists today |
|---|---|---|
| `draft-core` | Stable typed IDs (`scheme://uuid`), shared error type | Full — `ProjectId`/`PageId`/`ObjectId`/`AssetId`/`AnnotationId`/`RegionId` |
| `draft-security` | Agent permission model, path-safety guard | Full for the types that exist; scoping (per-page/object grants) is Session 3 |
| `draft-platform` | OS abstraction trait so core crates aren't desktop-locked | `PlatformPaths` trait + native (`dirs`-backed) impl; browser/WASM impl is Session 3 |
| `draft-events` | Typed operation vocabulary + append-only log | In-memory log; persisting/replaying it is Session 1/2 |
| `draft-graph` | Applies operations to build current state | Untyped (`serde_json::Value`) object payloads; the real shape schema is Session 1/2 |
| `draft-media` | Asset identity via content hashing | SHA-256 hashing + basic metadata; video timestamps/regions/PSD are later-session scope |
| `draft-project` | Reads/writes the `.draft` bundle, schema versioning | Full create/open/save round-trip; migrations beyond "reject a future version" are Session 2+ |
| `draft-mcp` | Exposes the graph to AI agents | Foundation-stage types only (`Transport`, `AgentConnection`); real `rmcp` integration is Session 2 |
| `packages/canvas` | The drawing surface | Camera/viewport math only; shapes/tools/selection are Session 1 |
| `packages/ui` | Shared components, design tokens | `Button`, `Wordmark`, CSS tokens |
| `packages/project-client` | Typed wrapper over Tauri `invoke` | One call (`getCoreVersion`) — grows with each new command |
| `apps/desktop` | Tauri 2 + React shell | Boots, round-trips one IPC call, consumes `@draft/ui` |
| `apps/web` | Browser shell | Minimal — `@draft/ui` only, no canvas yet (see [docs/web.md](web.md)) |

## Trade-offs made explicit

- **Untyped object payloads in `draft-graph` right now** trade type safety for not having to
  guess the full shape schema (freehand stroke, text, arrow, image, video, ...) before the
  canvas that will produce them exists. Revisit once Session 1 defines real shapes.
- **Operations, not whole-graph snapshots**, keep IPC payloads small as a project grows, at
  the cost of needing every mutation site to go through the operation vocabulary rather than
  mutating state ad hoc.
- **A local-socket MCP transport** (vs. pure stdio) is necessary because an agent needs
  access to an *already-running* human editing session, not a freshly spawned process — but
  it means the desktop app takes on being a long-lived server, which is new attack surface
  or docs/agent-permissions.md is explicit about.

## What to revisit as this grows

- Whether `draft-graph`'s in-memory `HashMap`-per-page model still holds up once projects
  have thousands of objects across many pages (pagination/lazy-loading of pages).
- Whether the operation log needs compaction/snapshotting once projects accumulate a long
  history.
- Whether TS/Rust type drift (`@draft/shared` mirroring `draft-core`/`draft-events` by hand)
  becomes painful enough to justify codegen.
