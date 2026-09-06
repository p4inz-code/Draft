# Agent Permissions

Implemented in `crates/draft-security`. See [ADR-010](decisions/adr-010-agent-permission-model.md).

## The five modes

| Mode | Access |
|---|---|
| `Manual` (default) | None at all |
| `Ask` | Read, only when the user explicitly asks the agent to look |
| `Watch` | Read, agent observes changes as they happen |
| `Assist` | Read + suggestions, no writes |
| `Build` | Read + writes, subject to per-action permission checks |

`AgentMode::default()` is `Manual`. `apps/desktop`'s live MCP server (`LiveState` in
`crates/draft-mcp/src/live.rs`) starts every session at `Manual` — accepting a socket
handshake is not the same as granting any access, and moving to `Build` is always a
deliberate, visible user action, never a default.

## Enforcement point (real, for reads; not yet wired for writes)

`AgentMode::allows_read()` is the actual gate every live MCP tool checks today
(`LiveMcpServer::get_project`/`get_page`/`get_object` in `crates/draft-mcp/src/live.rs`) —
`Manual` gets a clear "no access" JSON response instead of data, every other mode reads.
Verified by `crates/draft-mcp/tests/mcp_local_socket.rs`.

`AgentMode::allows_write()` and `PermissionGrant::check_write()` exist and are unit-tested
in isolation, but **nothing calls them yet** — there are no write MCP tools
(`create_object`/`modify_object`/`delete_object`) to gate. `check_write()` is meant to be the
single choke point once those tools exist, so a new write tool can't accidentally skip the
check, but that's a design intent for Session 3, not something enforced today.

## What "visible and revocable" means today vs. planned

**Real today:** the user changes the grant via an actual "Agent access" dropdown in
`apps/desktop`'s header (Manual/Ask/Watch/Assist/Build), which calls `set_agent_mode`. That
is the whole mechanism — visible (it's a control in the UI, not a background toggle) and
revocable (dropping back to `Manual` at any time takes effect on the very next tool call,
since every call re-checks the shared `Arc<Mutex<AgentMode>>`).

**Not built yet:**
- A per-connection "N agents connected" indicator. Today the mode is whole-app, not
  per-connection, and there's no list of active connections in the UI — a connection is
  silent until it makes a tool call that succeeds or is denied.
- `PermissionGrant`'s `granted_at_unix` timestamp isn't populated or surfaced by anything
  live yet — the type exists and is tested, but `LiveState` just tracks the current
  `AgentMode` directly, not a full `PermissionGrant` history.
- Scoping a grant to specific pages/objects rather than the whole project (spec mentions
  this as "scoped where practical") — Session 3.
- `request_user_permission` as an MCP tool an agent can call to ask for elevated access —
  Session 3.
