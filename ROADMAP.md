# Roadmap

Status markers: `[ ]` Planned · `[~]` In progress · `[x]` Complete · `[!]` Blocked.
A feature is only marked `[x]` once it has a passing test or a real, verified check behind
it — not just because code exists. See [docs/testing.md](docs/testing.md) for what
"verified" means at each layer.

## Foundation phase (pre-Session-1)

Repository, architecture, and documentation groundwork (product spec §35), ahead of the
four implementation sessions below.

- [x] pnpm + Cargo workspace, Biome lint/format
- [x] Eight foundation crates (`draft-core`, `draft-security`, `draft-platform`,
  `draft-events`, `draft-graph`, `draft-media`, `draft-project`, `draft-mcp`), each with
  real minimal content and passing tests
- [x] `@draft/shared`, `@draft/ui`, `@draft/canvas` (camera math), `@draft/project-client`
- [x] Tauri 2 + React desktop shell, booting and round-tripping one IPC call
- [x] Minimal web shell (`apps/web`)
- [x] Root + `docs/` documentation set, ADR-001 through ADR-012
- [x] `security-review` pass on the foundation-stage code (no findings — no real attack
  surface exists yet at this stage)
- [~] CI workflow (Windows/Linux/macOS matrix)
- [ ] Full local verification pass (build + test + lint, Rust and TS, all green together)
- [ ] Visual confirmation the Tauri window boots (via the `run` skill)
- [ ] `code-review` pass over the complete foundation diff
- [ ] `CLAUDE.md` generated from the real repository structure

## V1

### Session 1 — Foundation + Canvas

- [ ] Freehand drawing, shapes, text, arrows/connections (on top of the camera engine
  already built — see [ADR-004](docs/decisions/adr-004-custom-canvas-engine.md))
- [ ] Selection, multi-select, grouping
- [ ] Zoom, pan (camera math exists; needs a driving React component + tool state machine)
- [ ] Undo/redo, built on the operation log ([docs/events.md](docs/events.md))
- [ ] Copy/paste
- [ ] Image/video import onto the canvas
- [ ] Pages actually persisted through `draft-project` (today only an empty page list
  round-trips)
- [ ] Exit test: create a project, draw across multiple tools, import media, save, close,
  reopen, verify identical state

Scoped heavier than the original product spec assumed, because the canvas is being built
from scratch rather than adopting tldraw (see ADR-004) — expect this session to take
longer than "foundation + canvas" sounds like it should.

### Session 2 — Project Intelligence + MCP

- [ ] The real object/shape taxonomy in `draft-graph` (replacing today's untyped JSON
  payloads)
- [ ] Annotations, requirements, relationships, media references, regions
- [ ] `rmcp` added to `draft-mcp`; the local-socket listener actually implemented
- [ ] Read-only MCP resources/tools (`project`, `pages`, `objects`, `selection`, `assets`,
  `annotations`, `recent_changes`, ...) — see [docs/mcp.md](docs/mcp.md)
- [ ] Exit test: an MCP-compatible agent connects, queries the workspace, and correctly
  describes a real visual design back

### Session 3 — Agent Collaboration + Project Workflow

- [ ] Watch mode, agent observation of live changes
- [ ] Agent write permissions (`Build` mode) wired to real MCP write tools, gated through
  `PermissionGrant::check_write()`
- [ ] Permission UI (grant/revoke, visible connection indicator)
- [ ] `apps/web` gains `@draft/canvas` and reaches feature parity with desktop
- [ ] Existing repository/project filesystem integration
- [ ] `draft-platform`'s browser/WASM implementation
- [ ] Exit test: create a real design, connect an agent, have it work on a real project,
  change the design, confirm the agent picks up the change

### Session 4 — Hardening + Audit + Ship

No new features. Security (MCP, permissions, path safety, malformed/malicious input,
resource exhaustion), reliability (crash/corruption recovery, large assets/canvases),
performance, and cross-platform validation (actually running the Linux/macOS CI legs, not
just assuming parity — see [docs/cross-platform.md](docs/cross-platform.md)). Finalized
docs, changelog, and the first real release.

## V2 (not scheduled)

- [ ] Full plugin ecosystem (foundation is plugin-ready per the crate/package boundaries in
  [ARCHITECTURE.md](ARCHITECTURE.md), but no plugin API exists yet)
- [ ] Real-time collaboration
- [ ] Advanced media (PSD/AI import, video regions/timelines)
- [ ] Cloud sync (opt-in, without compromising the local-first default — see
  [ADR-008](docs/decisions/adr-008-local-first-architecture.md))
- [ ] Additional agent-platform integrations beyond the MCP-compatible ones already covered
- [ ] Advanced AI interpretation (freeform sketches auto-recognized as semantic objects)

## Priority if time runs short

Canvas > project format > Project Graph > MCP > agent understanding > agent permissions >
media > existing-project integration. The Project Graph and MCP architecture are never
sacrificed for visual polish (product spec §24).
