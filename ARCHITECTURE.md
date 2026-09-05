# Architecture

This is a short overview. For the full design (data flow, crate/package responsibilities,
and the reasoning behind each choice) see [docs/architecture.md](docs/architecture.md) and
the ADRs in [docs/decisions/](docs/decisions/).

## The one rule that shapes everything else

**The canvas is not the source of truth.** The Rust-owned **Project Graph** is. The canvas
(and any future frontend — web, a plugin, another client) is a *view* onto it, and the only
way to change it is by emitting an operation that the graph applies.

```
                    DRAFT PROJECT
                         |
                    PROJECT GRAPH   <-- source of truth (Rust)
                         |
        +----------------+----------------+
        |                |                |
      Canvas           Media          Metadata
        |                |                |
        +----------------+----------------+
                         |
                      MCP API
                         |
          +--------------+--------------+
          |              |              |
        Claude         Codex         Other agents
```

This is why a canvas rewrite (dropping tldraw — see [ADR-004](docs/decisions/adr-004-custom-canvas-engine.md))
doesn't threaten the project format or the MCP surface: they don't depend on the canvas
implementation at all.

## Layers

| Layer | Lives in | Responsibility |
|---|---|---|
| Project format | `crates/draft-project` | Read/write/migrate the `.draft` bundle on disk |
| Project Graph | `crates/draft-graph` | The current, structured state — what MCP and agents actually see |
| Operation log | `crates/draft-events` | The typed vocabulary of changes; how the graph gets built and how undo/history work |
| Media | `crates/draft-media` | Content-addressed asset metadata |
| Security | `crates/draft-security` | Agent permission model, path-safety guards |
| Platform | `crates/draft-platform` | OS abstraction so core crates aren't desktop-locked |
| MCP | `crates/draft-mcp` | Exposes the Project Graph to AI agents |
| Canvas engine | `packages/canvas` | The custom DOM/SVG drawing surface (camera, shapes, tools) |
| UI | `packages/ui` | Shared components and design tokens |
| Desktop shell | `apps/desktop` | Tauri 2 + React |
| Web shell | `apps/web` | React, browser-only (behind desktop in features — see [ROADMAP.md](ROADMAP.md)) |

## Key decisions

Each significant, hard-to-reverse choice has an ADR: Tauri 2, the Rust core, React,
the custom canvas engine, the Project Graph, the project format, the MCP architecture,
local-first, the license model, the agent permission model, media handling, and the
operation-log sync mechanism. Full list: [docs/decisions/](docs/decisions/).
