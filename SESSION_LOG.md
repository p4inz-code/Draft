# Session Log

A dated, narrative record of what happened in each work session — decisions made, bugs found
and fixed, what got verified and how. [ROADMAP.md](ROADMAP.md) tracks *what's done* (checkbox
state per feature); this file tracks *how we got there and why*, session by session. Don't
duplicate ROADMAP's checklist here — link to it, and to commits/ADRs, instead of restating.

Entries are newest-first. Each one names the commits it covers so it's traceable.

---

## 2026-09-06 (later still) — Security review + fix on the local socket

**Commit:** (pending push at time of writing)

Ran a `security-review` pass on the new MCP write surface (the whole point of the review the
user asked for before continuing). It found one real, concrete finding: the local-socket
transport didn't restrict access to the current OS user. "Loopback-only" (what ADR-007/
docs/mcp.md claimed) describes a TCP socket's *binding*, not a Unix-socket-file's or a
named-pipe's *ACL* — those default to something more permissive on both platforms (a socket
file in the shared temp dir inherits the umask and is commonly group/world-readable; an
unsecured Windows named pipe's default DACL grants the `Everyone` group read access per
`CreateNamedPipe`'s own docs). On a shared/multi-user machine, another local account could
have observed or interacted with a live DRAFT session once the user granted any agent access.

**Fixed on both platforms:**
- Windows: the named pipe now gets an explicit `D:P(A;;GA;;;OW)` security descriptor
  (Generic-All to Owner only) built via `ConvertStringSecurityDescriptorToSecurityDescriptorW`
  and passed through `create_with_security_attributes_raw`.
- Unix: the socket file is `chmod`'d to `0600` immediately after `bind`, and moved from the
  shared temp directory into the user's own app-data directory (via `draft-platform`).

**A real Rust gotcha hit while building this:** the Windows security descriptor type holds a
raw pointer, making it `!Send`. Constructing it inline inside the `async fn` accept loop —
even with an explicit `drop()` right after use — still made the whole future non-`Send`
across the loop's `.await`, because a value with a custom `Drop` impl is considered live for
its full lexical scope, not just to its last use. Fixed by extracting a fully synchronous
helper function (`create_secured_pipe_instance`) that builds the descriptor, creates the
pipe, and lets the descriptor drop — all before returning a plain, `Send` `NamedPipeServer`.
A synchronous function's internal locals never leak into the caller's async state machine;
only the return value does.

**Verified:** all existing MCP tests still pass against the hardened pipe (proving the
owner's own connections still work), plus a new unit test that the security descriptor
builds successfully, plus a new Unix-only integration test
(`mcp_local_socket_unix.rs`, `#![cfg(unix)]`) asserting the socket file is exactly `0600` —
can't be run on this Windows dev machine, so it's verified by CI's Linux/macOS legs instead.

---

## 2026-09-06 (later) — Write MCP tools + bidirectional sync

**Commit:** (pending push at time of writing)

Continued straight from the live-read MCP work: added `create_object`/`modify_object`/
`delete_object` to `LiveMcpServer`, gated on `AgentMode::allows_write()` (`Build` only).
Originally scoped as Session 3 work, but shipped now since read-only access is only half of
"connect human creativity to AI" — an agent that can see a design but never help build it
falls short of the stated goal.

**A real gap caught while building this:** a write nobody sees isn't useful. Added
`LiveState.changes` (a `tokio::sync::broadcast::Sender<PageId>`) that fires on every
successful write; `apps/desktop` forwards it as a `draft-graph-changed` Tauri event, and the
frontend refetches the affected page (`getPageSnapshot`) and merges it into the canvas
(`@draft/canvas`'s new `applyRemoteObjects`, which replaces the shapes map without touching
undo history — an agent's write isn't something the human should be able to "undo" through
their own history stack). This closes the loop in both directions: human edits reach the
agent (Session 2's earlier work), agent edits reach the human (this).

**Verified for real:** `crates/draft-mcp/tests/mcp_local_socket.rs` gained a second test —
`Watch` mode denies `create_object` (names the mode in the response), raising to `Build`
lets the same call through, a change notification fires with the right page ID, and
`modify_object`/`delete_object` are confirmed against actual graph state afterward.

**Still not done** (see ROADMAP.md): `request_user_permission` as a callable MCP tool,
per-connection (rather than whole-app) mode scoping, a visible "N agents connected"
indicator.

---

## 2026-09-06 — Foundation phase

**Commits:** `633a3e3`..`4b238dc` (repo init through CI toolchain pin)

Built the entire foundation phase from an empty repo: pnpm + Cargo workspace, the eight
foundation crates with real minimal content (not placeholders — see `docs/development.md`'s
rule on this), the TS packages, root + `docs/` documentation, ADR-001 through ADR-012,
ROADMAP.md, and CI.

**Key decision made mid-foundation:** the original product spec called for tldraw as the
canvas foundation. Research surfaced that tldraw's SDK license changed in September 2025
(paid key or watermark required in production) — incompatible with DRAFT's free-forever,
unbranded positioning. Given four options, the user chose to build a custom canvas engine
from scratch rather than accept a watermark, vendor an old tldraw release, or pay for a
license. See [ADR-004](docs/decisions/adr-004-custom-canvas-engine.md). This is the single
biggest scope change from the original spec.

Also integrated the real brand kit (logo, icons, JetBrains Mono, color palette) once the
user provided it, replacing the placeholder text wordmark and default Tauri icons.

**Verified:** full `cargo test --workspace` + `pnpm test`/`lint`/`build` green; a
`security-review` and `code-review` pass over the foundation diff (one low-severity CI
toolchain-pinning issue found and fixed); the Tauri window boots.

---

## 2026-09-06 — Session 1: real canvas

**Commit:** `52fc242`

Built the actual drawing canvas in `packages/canvas`: one SVG `Canvas` component, camera-driven
pan/zoom, and tools — rectangle, ellipse, diamond, text, line, arrow, freehand, select
(click + marquee + drag-to-move + 4-corner resize handles), eraser. Undo/redo via snapshot
diffing rather than stored inverse operations — see
[ADR-013](docs/decisions/adr-013-undo-redo.md) for why.

**Real bug found and fixed during manual testing:** the text tool held SVG pointer capture
and focused its textarea synchronously on creation, racing the browser's own native
click/focus handling. The browser would steal focus back immediately, firing the textarea's
blur handler with empty text, which the "discard empty text" cleanup then deleted — before
the user could type a single character. Fixed by not taking pointer capture for the text
tool and deferring the initial focus to `requestAnimationFrame`.

**Verified:** every tool manually exercised in the actual browser preview (not just unit
tests) — drawing, resize handles anchoring correctly, eraser, undo/redo state, zoom controls.
28 Vitest tests green.

---

## 2026-09-06 — Session 2: real MCP server + persistence

**Commit:** `4133fc4`, plus the local-socket work landing today (see below, uncommitted at
time of writing in that entry — now part of the next entry once pushed).

Added real page/object persistence (`draft-project`'s `PageDocument`, `save_page`/
`load_page`/`load_all_pages` — the format previously only persisted the manifest, not actual
content) and a real `rmcp` v3 MCP server: a `draft-mcp` stdio CLI binary that loads a saved
`.draft` project and exposes `get_project`/`get_page`/`get_object` as read-only tools.

**Verified for real, not mocked:** `crates/draft-mcp/tests/mcp_stdio.rs` spawns the actual
`draft-mcp` binary as a subprocess via a genuine `rmcp` client, connects over stdio, lists
tools, and calls them against a real saved project — this is Session 2's exit test from
ROADMAP.md, passing.

---

## 2026-09-06 (continued) — the live MCP path

The user's stated priority: *"the main point of making this tool is the MCP server to
connect human creativity to AI"* — and the stdio server only reads a stale saved file, not
a human's live editing session. This session closed that gap.

**What got built:**
- `draft-graph::Graph::ensure_page` — idempotent page creation under a caller-supplied ID,
  needed because the frontend generates page IDs client-side and the Rust graph needs a
  matching page before operations for it can apply.
- `draft-security::AgentMode::allows_read()` — symmetric with the existing `allows_write()`;
  every mode except `Manual` permits reads.
- `crates/draft-mcp/src/live.rs` — `LiveMcpServer`, the same three tools as the stdio server
  but backed by a shared, mutex-guarded live `Graph`, and gated: every tool call checks
  `AgentMode::allows_read()` first and returns a clear "no access" response if the mode is
  `Manual` (the default).
- `crates/draft-mcp/src/local_socket.rs` — the actual loopback transport from ADR-007: a
  Windows named pipe accept loop (`#[cfg(windows)]`) and a Unix domain socket accept loop
  (`#[cfg(unix)]`, not tested on this Windows machine but the standard, low-risk API).
- `apps/desktop`: a `LiveState` (`Arc<Mutex<Graph>>` + `Arc<Mutex<AgentMode>>`) managed by
  Tauri, spawned local-socket listener at startup, new commands (`ensure_page`,
  `apply_operations`, `set_agent_mode`, `get_agent_mode`), and a real "Agent access" dropdown
  in the header — the spec's "explicit, visible, revocable" grant, not a placeholder.
  `@draft/canvas`'s store is now subscribed to from `App.tsx`, forwarding every committed
  operation to the live graph via `apply_operations` — the "canvas emits operations,
  draft-graph applies them" architecture docs/architecture.md already described, now wired
  end to end instead of frontend-only.

**Verified for real:** `crates/draft-mcp/tests/mcp_local_socket.rs` hosts the accept loop
in-process, connects a genuine `rmcp` client over a real named pipe, confirms a `Manual`-mode
connection is denied with the current mode named in the response, then raises the mode and
confirms the *same* live graph now returns real data — proving the permission gate and the
live-read path both work, not just that the code compiles.

**What's still not done** (tracked in ROADMAP.md, not repeated here): write MCP tools, a
visible "N agents connected" indicator, `selection`/`recent_changes` resources (need live
selection/history tracking on the Rust side first), the real object/shape taxonomy in
`draft-graph` (payloads are still opaque JSON).
