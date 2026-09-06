# MCP

Implemented in `crates/draft-mcp`. See [ADR-007](decisions/adr-007-mcp-architecture.md) for
the full reasoning, including the mid-foundation correction to the transport design.

## Why not just stdio

Most MCP servers are spawned by the agent host as a subprocess and talk over stdio — that
works when the server has no state beyond what it can load fresh each time. DRAFT's MCP
server needs to expose the state of an **already-running desktop app a human is actively
editing**. A freshly spawned subprocess has no access to that in-memory session, so stdio
alone is the wrong default here.

## Transport (two modes, both real)

- **Local socket** — a Windows named pipe (`\\.\pipe\draft-mcp`) or Unix domain socket,
  **loopback-only**, hosted *inside* the running desktop app (`crates/draft-mcp/src/
  local_socket.rs`, spawned from `apps/desktop/src-tauri`'s `setup` hook). This is the live
  path: the server reads and writes the same `Arc<Mutex<Graph>>` the canvas writes to via the
  `apply_operations` Tauri command, so an agent sees edits as they happen — and, since an
  agent can write too (Build mode), the human sees the agent's edits back: a successful write
  fires `LiveState.changes`, forwarded as a `draft-graph-changed` Tauri event that the
  frontend uses to refetch and merge the affected page. The Unix path exists and compiles
  (`#[cfg(unix)]`) but hasn't been exercised on Linux/macOS yet — this has been built and
  tested on Windows only so far.
  - **Owner-only access control.** "Loopback-only" describes a TCP socket's binding, not a
    Unix-socket-file's or named-pipe's ACL — those default to something more permissive than
    "just this user" (a socket file in the shared temp dir inherits the umask and is commonly
    group/world-readable; an unsecured Windows named pipe's default DACL grants the `Everyone`
    group read access, per `CreateNamedPipe`'s own documentation). A security-review pass
    caught this as a real gap on a shared/multi-user machine, so both platforms now
    explicitly restrict the socket to its creator: Windows gets a `D:P(A;;GA;;;OW)` security
    descriptor (Generic-All to Owner only, no inheritance) passed via
    `create_with_security_attributes_raw`; Unix gets the socket file `chmod`'d to `0600`
    right after `bind`, in the user's own app-data directory (via `draft-platform`) rather
    than the shared temp directory.
- **Stdio**, via the `draft-mcp` CLI binary (`crates/draft-mcp/src/bin/main.rs`) operating
  directly on a saved `.draft` project directory — for headless/CI use where no desktop
  instance is running. Loads the project once at startup; doesn't see later edits.

Both are exercised by real end-to-end tests, not just unit tests of the pieces:
`crates/draft-mcp/tests/mcp_stdio.rs` and `crates/draft-mcp/tests/mcp_local_socket.rs` each
spawn/host a real server and drive it with a genuine `rmcp` client.

## SDK

The official Rust MCP SDK, [`rmcp`](https://github.com/modelcontextprotocol/rust-sdk) v3, is
a real dependency of `draft-mcp` (not aspirational — both servers above are built on it).

## Connection permission (enforced, not just typed)

Every read tool call checks `AgentMode::allows_read()`; every write tool call checks
`AgentMode::allows_write()` (`Build` only) — both against the same shared
`Arc<Mutex<AgentMode>>`. `Manual` (the default — every session starts here) gets a clear
`{"error": "no read access", "current_mode": "manual", ...}` (or "no write access") response
instead of data or a mutation. The user raises this via a real "Agent access" dropdown in
`apps/desktop`'s header (`Manual`/`Ask`/`Watch`/`Assist`/`Build`), wired to the
`set_agent_mode` Tauri command — this *is* the spec's "explicit, visible, revocable" grant.
See [docs/agent-permissions.md](agent-permissions.md).

Accepting the socket/pipe handshake itself is not access — `tools/list` (capability
discovery) is unrestricted, but every data-returning tool call re-checks the mode.

A visible "N agents currently connected" indicator now exists too (`LiveState.connections`,
a `watch<usize>` — see `crates/draft-mcp/src/local_socket.rs`'s `ConnectionGuard`), shown in
`apps/desktop`'s header. Still not built: per-connection (rather than whole-app) mode
scoping — deferred to Session 3, per the original plan.

## Resources/tools

Implemented on the **stdio** transport (read-only — a saved file has nothing to write back
to live): `get_project`, `get_page`, `get_object`.

Implemented on the **local-socket** (live) transport, both read and write:
- `get_project` (manifest + page list), `get_page` (one page's objects by ID), `get_object`
  (one object by page + object ID) — gated on `AgentMode::allows_read()`.
- `create_object` (page ID + arbitrary payload -> new object ID), `modify_object` (page +
  object ID + replacement payload), `delete_object` (page + object ID) — gated on
  `AgentMode::allows_write()` (`Build` only). All three go through
  `draft_graph::Graph::apply` — the exact same code path a human's canvas edit takes, so
  there's no separate "agent wrote this" handling to keep in sync.
- `recent_changes` (optional `limit`, default 50/max 200, and `since_sequence` for
  incremental polling) — returns the tail of `LiveState.log`, a rolling
  `draft_events::OperationLog` that both the human's committed canvas operations
  (`apply_operations`, tagged `Actor::User`) and the three write tools above (tagged
  `Actor::Agent`) append to. Gated on `AgentMode::allows_read()`, like the other read tools.

Not implemented yet:
- `selection`, `agent_state` — these only make sense for a live session with real
  selection/history tracking, which doesn't exist on the Rust side yet for selection (still
  frontend-only, in `@draft/canvas`'s Zustand store); `agent_state` is still vague pending a
  concrete need for it.
- `annotations`, `requirements`, `flows`, `assets` — wait on the real object/shape taxonomy
  in `draft-graph` (payloads are still opaque JSON; see docs/architecture.md's trade-off
  note on this).
- `request_user_permission` as an MCP tool an agent can call to ask for elevated access —
  today the user has to notice and change the dropdown themselves.
- Per-connection write scoping (`PermissionGrant`'s richer, timestamped grant type is defined
  and tested but unused — the live gate checks `AgentMode::allows_write()` directly against
  one whole-app mode, not a per-connection grant).
