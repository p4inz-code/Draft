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
  path: the server reads the same `Arc<Mutex<Graph>>` the canvas writes to via the
  `apply_operations` Tauri command, so an agent sees edits as they happen. The Unix path
  exists and compiles (`#[cfg(unix)]`) but hasn't been exercised on Linux/macOS yet — this
  has been built and tested on Windows only so far.
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

Every local-socket tool call checks `AgentMode::allows_read()` against a shared
`Arc<Mutex<AgentMode>>` before returning anything; `Manual` (the default — every session
starts here) gets a clear `{"error": "no read access", "current_mode": "manual", ...}`
response instead of data. The user raises this via a real "Agent access" dropdown in
`apps/desktop`'s header (`Manual`/`Ask`/`Watch`/`Assist`/`Build`), wired to the
`set_agent_mode` Tauri command — this *is* the spec's "explicit, visible, revocable" grant.
See [docs/agent-permissions.md](agent-permissions.md).

Accepting the socket/pipe handshake itself is not access — `tools/list` (capability
discovery) is unrestricted, but every data-returning tool call re-checks the mode.

What's *not* built yet: a visible "N agents currently connected" indicator (today a
connection is silent until it tries a tool call), and per-connection (rather than
whole-app) mode scoping — deferred to Session 3, per the original plan.

## Resources/tools

Implemented today, both transports: `get_project` (manifest + page list), `get_page` (one
page's objects by ID), `get_object` (one object by page + object ID) — all read-only.

Not implemented yet:
- `selection`, `recent_changes`, `agent_state` — these only make sense for a live session
  with real selection/history tracking, which doesn't exist on the Rust side yet (selection
  is still frontend-only, in `@draft/canvas`'s Zustand store).
- `annotations`, `requirements`, `flows`, `assets` — wait on the real object/shape taxonomy
  in `draft-graph` (payloads are still opaque JSON; see docs/architecture.md's trade-off
  note on this).
- Write tools (`create_object`/`modify_object`/`delete_object`/`request_user_permission`) —
  `AgentMode::Build`/`allows_write()` exist as values but nothing checks for them yet; every
  MCP tool today is read-only regardless of mode. Session 3 work.
