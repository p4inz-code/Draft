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
- [x] CI workflow (Windows/Linux/macOS matrix) — all three green
- [x] Full local verification pass (build + test + lint, Rust and TS, all green together)
- [x] The Tauri window boots (`pnpm dev`): clean Rust + Vite build, the process launches,
  runs, responds, and holds a valid, non-minimized window handle. A pixel screenshot of the
  native window wasn't obtainable in this environment (the automation session's screen
  capture shows a different display/session than where the native window renders) — verified
  via process/window-API state instead of a visual capture; worth a human glance on a real
  machine before calling this fully done.
- [x] Real brand kit integrated (logo, icons, colors, JetBrains Mono typography) —
  replaces the placeholder text wordmark and default Tauri icons; see
  `assets/brand/README.md`
- [x] `code-review` pass over the complete foundation diff (one low-severity finding —
  CI's floating Rust toolchain — found and fixed)
- [x] `CLAUDE.md` generated from the real repository structure

## V1

### Session 1 — Foundation + Canvas

- [x] Freehand drawing, shapes (rectangle/ellipse/diamond), text, line, arrow — one SVG
  `Canvas` component in `@draft/canvas` driving the camera engine, tool state machine keyed
  on the active tool
- [x] Selection (click + marquee), move-by-drag, resize handles on resizable shapes
  (rectangle/ellipse/diamond) — grouping not yet implemented
- [x] Eraser tool (click or drag over shapes to delete)
- [x] Zoom (wheel zoom-to-cursor, toolbar +/-/reset with a live %, Ctrl+=/Ctrl+-/Ctrl+0),
  pan (middle-mouse-drag, works regardless of active tool — no separate Pan tool needed)
- [x] Undo/redo via snapshot diffing ([ADR-013](docs/decisions/adr-013-undo-redo.md)), wired to
  toolbar buttons and Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y
- [x] Inline text editing (a real `foreignObject`/`textarea` editor, not a `prompt()` shim) —
  fixed a real bug here: holding SVG pointer capture into the text tool's gesture raced the
  textarea's `focus()` against the browser's native click handling, causing an instant blur
  that (via the "discard empty text" cleanup) deleted the shape before typing could happen;
  fixed by skipping pointer capture for the text tool and deferring focus a frame
- [x] Pages persisted through `draft-project`/`draft-graph`: `PageDocument` +
  `save_page`/`load_page`/`load_all_pages`, Tauri `save_snapshot`/`load_snapshot` commands,
  a Save/Open UI in `apps/desktop` — real round-trip, not just an in-memory store
- [x] Copy/paste: Ctrl+C/Ctrl+V for the current selection, in-memory (not the OS clipboard),
  offsets each successive paste diagonally so repeats don't stack exactly on top of each
  other — verified manually in-browser
- [x] Image import onto the canvas: an "Image" toolbar button opens a native file picker,
  reads the file via `FileReader.readAsDataURL`, and drops an `ImageShape` at the current
  view's center (large images capped at 400px on their long edge, smaller images keep native
  size). `src` is a data URL embedded directly in the shape payload — an interim
  simplification, not the final design (spec §11 wants `asset://`-referenced media so raw
  bytes don't cross the MCP boundary on every `get_page` call), deferred because that needs a
  project directory to store the asset file in, and a fresh unsaved canvas doesn't have one
  yet. Resize handles, selection, undo/redo, and copy/paste all apply for free since image
  reuses the existing `ResizableShape`/bounds machinery. Video import not attempted — no
  in-canvas video playback exists to import into. Validates file type and a 15MB size cap
  before ever reading the file, surfaces read/decode failures as a visible toolbar error
  (not just a silent no-op) plus a `console.error`, and logs (rather than hides) the fallback
  when natural image-size detection fails.
- [ ] Video import onto the canvas
- [ ] Grouping
- [ ] Exit test: create a project, draw across multiple tools, save, close, reopen, verify
  identical state — blocked on import/grouping above for the "full" version, but the
  save/close/reopen core already works (see `crates/draft-project`'s round-trip test)

Scoped heavier than the original product spec assumed, because the canvas is being built
from scratch rather than adopting tldraw (see ADR-004) — expect this session to take
longer than "foundation + canvas" sounds like it should.

### Session 2 — Project Intelligence + MCP

- [x] `rmcp` (v3) added to `draft-mcp`, real server on **both** transports from ADR-007:
  - `draft-mcp` CLI binary (stdio) reads a saved `.draft` project directory — for
    headless/CI use with no desktop instance running
  - a local-socket server (Windows named pipe; Unix domain socket path exists via `#[cfg(unix)]`
    but is untested on this Windows dev machine) hosted **inside the running desktop app**,
    reading the *live* in-memory `Graph` as the human edits — this is the actually-important
    half: an agent reading a live session, not just a stale file
- [x] Local-socket access control: a `security-review` pass caught that the socket wasn't
  actually restricted to the current OS user (Windows named pipes and Unix socket files
  don't get "loopback-only" protection for free the way TCP sockets do). Fixed: an explicit
  owner-only Windows security descriptor (`D:P(A;;GA;;;OW)`), and a `0600`-chmod'd Unix
  socket file in the user's app-data dir instead of the shared temp directory
- [x] Read-only MCP tools: `get_project`, `get_page`, `get_object` (both transports).
  `selection`/`recent_changes`/`agent_state` deliberately not exposed yet — they only make
  sense for a live session with real selection/history tracking, which doesn't exist on the
  Rust side yet (selection is still frontend-only); `annotations`/`requirements`/`assets`
  wait on the real object/shape taxonomy below
- [x] Write MCP tools on the live transport: `create_object`/`modify_object`/`delete_object`,
  gated on `AgentMode::allows_write()` (`Build` only — every other mode gets a clear "no
  write access" response). A successful write fires a change notification
  (`LiveState.changes`, a `tokio::sync::broadcast::Sender<PageId>`) that `apps/desktop`
  forwards as a `draft-graph-changed` Tauri event; the frontend refetches and merges the
  affected page (`getPageSnapshot` + `@draft/canvas`'s new `applyRemoteObjects`) so the human
  actually sees what the agent built, not just that the Rust state changed underneath them
- [x] Agent permission gate wired for real, not just typed: every live-socket tool call
  checks `AgentMode::allows_read()` against a shared `Arc<Mutex<AgentMode>>`; `Manual`
  (default) returns a clear "no access" response instead of data. `apps/desktop` has a
  real "Agent access" dropdown (Manual/Ask/Watch/Assist/Build) wired to `set_agent_mode` —
  this *is* the spec's "explicit, visible, revocable" grant, not a placeholder
- [x] The canvas's committed operations now flow to the live graph for real: `apply_operations`
  (Tauri command) + `ensure_page`, wired from `@draft/canvas`'s store via a subscription in
  `apps/desktop/src/App.tsx` — closes the "operations, not snapshots" loop docs/architecture.md
  already described
- [x] Exit test, both transports, passing for real (spawned server + real client, not
  mocked): `crates/draft-mcp/tests/mcp_stdio.rs` (saved-file path) and
  `crates/draft-mcp/tests/mcp_local_socket.rs` (live path — proves `Manual` denies reads and
  raising the mode allows them)
- [ ] The real object/shape taxonomy in `draft-graph` (replacing today's untyped JSON
  payloads)
- [ ] Annotations, requirements, relationships, media references, regions
- [ ] `selection`/`recent_changes`/`agent_state` resources (need live selection/history
  tracking on the Rust side first — Session 3 territory per the original plan)

### Session 3 — Agent Collaboration + Project Workflow

- [x] Permission UI (grant/revoke): the "Agent access" dropdown shipped in Session 2, ahead
  of schedule, since the live MCP server needed a real gate to test against
- [x] Write MCP tools (`create_object`/`modify_object`/`delete_object`) gated through
  `AgentMode::allows_write()`, shipped in Session 2 alongside the read tools — also ahead of
  schedule. `PermissionGrant::check_write()` (the richer, timestamped grant type) is still
  unused; the live gate checks `AgentMode::allows_write()` directly, which is simpler and
  sufficient for a whole-app (not yet per-connection) grant.
- [x] Human sees agent writes: a successful write fires `LiveState.changes`, forwarded as a
  `draft-graph-changed` Tauri event, refetched and merged into the canvas
  (`applyRemoteObjects`) — this wasn't in the original plan but is necessary for write tools
  to be useful at all (a write nobody sees isn't "collaboration")
- [ ] Watch mode, agent observation of live changes (no `recent_changes` resource yet)
- [ ] Visible connection indicator (today a connection is silent until a tool call succeeds
  or is denied — no "N agents connected" UI)
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
- [ ] Advanced media import: PSD (layers), AI/EPS (vector), video regions/timelines.
  Common raster/vector formats (PNG/JPG/WebP/SVG/GIF) and DRAFT's own project JSON are
  Session 1/2 scope via `draft-media`; PSD/AI specifically need dedicated parsing libraries
  (e.g. `ag-psd` for PSD) and real testing against real files before claiming support —
  not attempted until there's time to do it properly, per product spec §24's own
  "defer if necessary" list.
- [ ] Cloud sync (opt-in, without compromising the local-first default — see
  [ADR-008](docs/decisions/adr-008-local-first-architecture.md))
- [ ] Additional agent-platform integrations beyond the MCP-compatible ones already covered
- [ ] Advanced AI interpretation (freeform sketches auto-recognized as semantic objects)

## Priority if time runs short

Canvas > project format > Project Graph > MCP > agent understanding > agent permissions >
media > existing-project integration. The Project Graph and MCP architecture are never
sacrificed for visual polish (product spec §24).
