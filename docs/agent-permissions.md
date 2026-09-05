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

`AgentMode::default()` is `Manual`. Every new agent connection starts there
(`AgentConnection::new` in `crates/draft-mcp`) — accepting a socket/stdio handshake is not
the same as granting any access, and moving to `Build` is always a deliberate, visible user
action, never a default.

## Enforcement point

`AgentMode::allows_write()` is `true` only for `Build`. `PermissionGrant::check_write()` is
the single choke point every write-capable MCP tool (Session 2+) must call before mutating
the Project Graph — there's exactly one place this check happens, not one per tool, so it
can't be accidentally skipped in a new tool.

## What "visible and revocable" means in practice

- Every agent connection surfaces as an in-app indicator (see [docs/mcp.md](mcp.md)) —
  never a silent background connection.
- A grant (`PermissionGrant`) records *when* it was made (`granted_at_unix`) so the UI can
  show "connected since...".
- Revoking is just dropping back to a lower mode; there's no separate "disconnect" state
  machine to keep in sync with the mode.

## What's deferred

- Scoping a grant to specific pages/objects rather than the whole project (spec mentions
  this as "scoped where practical") — Session 3.
- The actual UI for granting/revoking — Session 3 (draft-security defines the types; the
  desktop app doesn't have a permissions panel yet).
- `request_user_permission` as an MCP tool an agent can call to ask for elevated access —
  Session 2/3.
