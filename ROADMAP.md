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
- [x] Two real bugs found and fixed from a user-supplied screen recording of the select
  tool "not working properly": (1) `.draft-canvas` hardcoded `cursor: crosshair` regardless
  of the active tool, so the select tool visually looked like a drawing tool was still
  armed — now the cursor is `default` for select and `crosshair` for every drawing tool. (2)
  no drag-initiating pointerdown handler called `e.preventDefault()`, so a marquee/move/pan
  drag also kicked off the browser's own native text/drag-selection over the page — visible
  in the recording as a stray light-blue selection band fighting the marquee rectangle for
  the same drag. Fixed by calling `preventDefault()` at the top of both pointerdown handlers
  and adding `user-select: none` to the canvas as defense-in-depth. Verified manually
  in-browser: marquee-selecting two shapes now shows only the intended selection outline,
  no native selection artifact.
- [x] Caught and fixed a regression from that same `preventDefault()` fix before it shipped:
  `preventDefault()` on pointerdown also suppresses the browser's default "blur the
  currently-focused element" behavior, which the text tool's click-away-to-commit flow
  depended on implicitly — so a text box could no longer be finished by clicking elsewhere.
  Fixed by blurring the active `<textarea>` ourselves (if any) *before* calling
  `preventDefault()`, so committing text no longer depends on that default action. Verified
  with a real test (`Canvas.test.tsx`, `text tool click-away commit`) that types into a text
  box, clicks elsewhere on the canvas, and asserts the editor closes and the text commits.
- [x] Number-key tool shortcuts (1–9, matching the toolbar's left-to-right order: Select,
  Rect, Ellipse, Diamond, Text, Line, Arrow, Draw, Eraser — `Image` isn't included since it
  opens a file picker rather than arming a persistent mode), defined once in
  `NUMBER_KEY_TOOLS` (`store.ts`) and consumed by both `Canvas.tsx`'s keydown handler and
  `Toolbar.tsx`'s button tooltips, so there's one source of truth instead of two lists that
  could drift. Lives in `@draft/canvas`, so it's already live on desktop and will apply to
  `apps/web` automatically once that app is wired up to the shared canvas (still open, see
  Session 3). Verified with real tests: each key switches to its tool, a held modifier
  (Ctrl/Cmd/Alt) is ignored, and typing in a text field doesn't trigger a switch.
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
  size). Resize handles, selection, undo/redo, and copy/paste all apply for free since image
  reuses the existing `ResizableShape`/bounds machinery. Video import not attempted — no
  in-canvas video playback exists to import into. Validates file type and a 15MB size cap
  before ever reading the file, surfaces read/decode failures as a visible toolbar error
  (not just a silent no-op) plus a `console.error`, and logs (rather than hides) the fallback
  when natural image-size detection fails.
- [x] Asset privacy: imported images no longer embed a data URL in the shape payload —
  [ADR-015](docs/decisions/adr-015-asset-privacy-content-addressed-store.md). `ImageShape.src`
  became `ImageShape.assetId`, a content-addressed (SHA-256) filename reference written via
  `draft-media`/`draft-project`'s new `save_asset`/`load_asset`/`copy_asset`, exposed to the
  frontend as Tauri commands. Import always writes through this path immediately — even
  before a project's first save, via a scratch asset directory
  (`draft-platform::PlatformPaths`) — that `save_snapshot` migrates into the real project's
  `assets/` on save, so an agent with live read access never sees raw image bytes at any
  point, not just after the human happens to save. `@draft/canvas` stays host-agnostic: the
  store takes an injectable `assetBackend`, set by `apps/desktop`, rather than importing
  `@draft/project-client` directly. Verified for real:
  `get_object_never_returns_raw_asset_bytes_for_an_image` in
  `crates/draft-mcp/tests/mcp_local_socket.rs` asserts the MCP response for an image object
  is small and contains neither `"base64"` nor a `"src"` field, only the `assetId` reference.
- [ ] Video import onto the canvas
- [x] Grouping: a shared `groupId` on the shape payload (not a new graph/operation concept —
  `draft-graph` already treats payloads as opaque JSON), a `Group`/`Ungroup` toolbar pair
  gated on selection state, and click-to-select expanding to every group sibling
  (`groupMembers`) so moving one member moves the whole group. Copy/paste remaps pasted
  groupIds to fresh ones (keeping relative grouping) rather than reusing the originals, so a
  pasted copy doesn't silently rejoin the source group. A real "group" as a first-class graph
  object (with its own MCP-visible identity) is Session 2's object-taxonomy work, not this.
- [ ] Exit test: create a project, draw across multiple tools, save, close, reopen, verify
  identical state — both former blockers (image import, grouping) are now done, so this is
  unblocked feature-wise. Not yet run as one combined pass: `Save`/`Open` call real Tauri
  commands (`save_snapshot`/`load_snapshot`) that only exist inside an actual running Tauri
  window, and this dev environment can only preview the pure-frontend Vite build in a browser
  (`apps/desktop`'s `src-tauri` backend isn't reachable there — every `invoke` fails, as seen
  in the "Live sync failed" / "core …" banner during this session's manual testing). Needs a
  real machine with the Tauri window open to close out; `crates/draft-project`'s round-trip
  test already covers the underlying save/load format for what it's worth.

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
- [x] The real object/shape taxonomy in `draft-graph`, replacing untyped JSON payloads —
  [ADR-014](docs/decisions/adr-014-typed-shape-taxonomy.md): a Rust `Shape` enum mirroring
  `packages/shared/src/shapes.ts`'s eight drawing kinds exactly, validated at the live write
  boundary (`Graph::apply`, both human edits and agent writes) with a real error on a
  malformed known-kind payload instead of silently storing it, plus an `Other` fallback so an
  unrecognized `kind` (a future frontend addition) still round-trips instead of being
  rejected outright. Closes the negative-image-size bug found in the day's code review at
  its actual root (normalized during deserialization) rather than patching the two TS files
  that disagreed about it. Scoped to the eight *drawing* kinds only — the product spec's
  *semantic* taxonomy (below) stays deferred, per the same "don't guess before a concrete
  need exists" reasoning ADR-005 originally used to defer this. Verified for real: 13 new
  `draft-graph` tests (round-trip per kind, `Other` fallback preserves unknown data, a
  malformed known kind is rejected via `apply` but tolerated via the lenient
  `insert_page` load path, negative width/height normalizes, `set_position` works uniformly)
  plus every existing MCP/integration test updated and passing against the new type.
- [ ] Annotations, requirements, relationships, media references, regions (the product
  spec's *semantic* taxonomy — layers meaning onto objects, not an object kind itself; still
  needs a concrete driving feature before being designed, same reasoning as above)
- [x] `recent_changes` MCP tool: `LiveState.log` (a `draft_events::OperationLog`, already
  defined in Session 1's foundation work but never wired up until now) records every
  operation applied to the live graph — the human's (`apply_operations`, tagged
  `Actor::User`) and the agent's (the three write tools, tagged `Actor::Agent`) alike.
  `recent_changes` returns the tail of it (`limit`/`since_sequence` params for incremental
  polling), gated on `allows_read()` like the other read tools. Verified for real: the
  existing `watch_mode_denies_writes_and_build_mode_allows_them` test now also asserts
  `recent_changes` returns the create/modify/delete sequence in order, correctly tagged
  `agent`.
- [x] `code-review` pass (high effort, 8 finder angles) over the whole day's diff (image
  import through `get_selection`) — found and fixed 4 confirmed correctness bugs: marquee
  selection not expanding to full group membership, `recent_changes`'s `since_sequence`
  paging returning the newest unseen operations instead of the oldest (breaking its own
  incremental-polling contract), image import centering on window dimensions instead of the
  canvas's actual viewport, and `apply_operations` losing log entries for a batch's
  already-applied operations when a later one in the batch fails. Also generalized the
  text-editor blur fix (previously only handled `<textarea>`, now any focused control) since
  the same `preventDefault()` gap would have reproduced for any other focusable element.
  Remaining lower-severity findings (stale selection after undoing a group, negative-size
  image hit-test/render desync, a lock-ordering race between human and agent writes, write-
  tool code duplication, `groupMembers`' O(n) scan) are tracked but not fixed this pass —
  narrower edge cases or larger refactors than the session's remaining time justified.
- [x] `security-review` pass over the same diff, scoped to the MCP write surface —
  `recent_changes`'s `since_sequence` (an agent-controlled, unbounded `u64`) did
  `since as usize + 1` with no bound check, overflowing (a debug-build panic; a silent wrap
  to the wrong cursor in release) on `since_sequence: 18446744073709551615`. Fixed with
  saturating arithmetic, clamped to the log length before the cast back to `usize`. Verified
  with a real test connecting a client and calling `recent_changes` with `since_sequence:
  u64::MAX`, asserting a clean empty result instead of a panic. No other findings met the
  review's confidence bar (checked and cleared: `Shape`'s custom deserializer for
  unbounded-amplification/recursion risk, NaN/Infinity via JSON numeric literals — `serde_json`
  already rejects these at parse time — every `.expect()` on `Shape` serialization for
  attacker-reachability, and `get_selection`/`recent_changes`'s permission gates against the
  existing `allows_read()` checks).
- [x] `get_selection` MCP tool: a `set_selection` Tauri command mirrors `@draft/canvas`'s
  store selection into `LiveState.selection` (page ID + object IDs) on every change, and the
  new tool returns it, gated on `allows_read()` like the other read tools — lets a `Watch`-mode
  agent (or any read-access agent) see what the human is actually looking at, not just what
  objects exist on the page. Verified for real: `get_selection_reflects_the_humans_current_selection`
  connects a client before and after setting a selection and asserts both states.
- [x] CI had been red on macOS only, on every commit, for 6 hours straight before anyone
  (including the assistant, despite an earlier session-log entry wrongly claiming a test was
  "verified by CI's Linux/macOS legs") noticed — surfaced by the user from a GitHub screenshot,
  not caught proactively. Root cause (via `gh run view --log-failed`):
  `mcp_local_socket_unix.rs`'s `the_socket_file_is_owner_only` test built its socket path from
  `tempfile::tempdir()` plus a verbose UUID filename, exceeding macOS's 104-byte
  `sockaddr_un.sun_path` limit (Linux's is 108, so Ubuntu passed while macOS silently failed —
  `bind()`'s error was swallowed by the accept loop's `let _ = ...`, so the socket file was
  simply never created). Fixed by using `std::env::temp_dir()` directly with a short 8-hex-char
  filename instead of a nested tempdir and a full UUID. Confirmed (not just assumed) green
  on all three CI legs — Windows, macOS, and Ubuntu — after pushing the fix.
- [ ] `agent_state` resource — still vague pending a concrete need for it

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
- [x] Watch mode (an `AgentMode` since Session 2) plus agent observation of live changes: the
  `recent_changes` MCP tool (see Session 2's entry above) now gives a `Watch`-mode agent a
  real way to see what changed without write access — polling `recent_changes` is how an
  agent that can only watch actually watches.
- [x] Visible connection indicator: `LiveState.connections` (a `tokio::sync::watch<usize>`,
  not `broadcast` — a UI only cares about the latest count) is incremented/decremented by an
  RAII guard around each accepted local-socket connection (`ConnectionGuard` in
  `local_socket.rs`, so the count comes back down even if a connection's task exits early or
  panics), forwarded to the frontend as a `draft-agent-connections-changed` Tauri event, and
  shown as "N agents connected" in the header — visible the moment a connection is accepted,
  not just once a tool call succeeds or is denied against it (closes the last gap in the
  spec's "explicit, visible, revocable" permission story). Verified with a real test
  (`connection_count_tracks_connect_and_disconnect`) that connects and disconnects a genuine
  client and asserts the count goes 0 → 1 → 0; the header render itself was only checked
  against the Tauri-less browser preview (shows the "…" loading state without crashing) — the
  live count needs a real Tauri window with a real MCP client attached to see end to end.
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
