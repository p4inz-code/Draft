# MCP

Implemented in `crates/draft-mcp`. See [ADR-007](decisions/adr-007-mcp-architecture.md) for
the full reasoning, including the mid-foundation correction to the transport design.

## Why not just stdio

Most MCP servers are spawned by the agent host as a subprocess and talk over stdio — that
works when the server has no state beyond what it can load fresh each time. DRAFT's MCP
server needs to expose the state of an **already-running desktop app a human is actively
editing**. A freshly spawned subprocess has no access to that in-memory session, so stdio
alone is the wrong default here.

## Transport (two modes)

- **Local socket** (named pipe on Windows, Unix domain socket on Linux/macOS), **loopback-
  only**, hosted by the running desktop app. This is how an agent gets access to a live,
  human-editing session.
- **Stdio**, via a separate `draft-mcp` CLI binary operating directly on a project directory
  on disk — for headless/CI use where no desktop instance is running.

Both are represented today by the `Transport` enum in `crates/draft-mcp`. Neither is wired
up to an actual listener yet — see "What exists today."

## SDK

The official Rust MCP SDK, [`rmcp`](https://github.com/modelcontextprotocol/rust-sdk), is
the planned dependency (crates.io, actively maintained, implements the current MCP spec).
It is **not yet a dependency of `draft-mcp`** — adding it before there's a real Project Graph
to expose would mean standing up a server with nothing genuine behind it. Session 2 adds the
dependency alongside the first real resources/tools.

## Connection permission (foundation-stage requirement, not deferred)

Every agent connection — regardless of transport — must trigger a visible in-app "Agent
connected" indicator with an explicit accept/deny before any read access is granted, and a
connection defaults to no access at all. `AgentConnection::new` always starts a fresh
connection in `AgentMode::Manual` (see [docs/agent-permissions.md](agent-permissions.md)).
This isn't a "nice to have added later" — a loopback socket that any local process can open
is not itself a permission boundary, so the approval step has to exist from the first real
listener, not be bolted on after.

## Planned resources/tools (Session 2+)

Per the product spec: `project`, `pages`, `canvas`, `objects`, `selection`, `assets`,
`annotations`, `requirements`, `flows`, `recent_changes`, `agent_state` as resources, and
`get_*` (read) tools first, with `create_object`/`modify_object`/`delete_object`/
`request_user_permission` gated behind write permission (`AgentMode::Build` — see
[docs/agent-permissions.md](agent-permissions.md)). These aren't implemented yet; this list
exists so Session 2 starts from an agreed shape instead of re-deriving it.

## What exists today

- `Transport` enum (`LocalSocket`, `Stdio`).
- `AgentConnection` (transport + current `AgentMode`, always starts at `Manual`).

Nothing else — no listener, no `rmcp` dependency, no resources, no tools. This is
intentionally a skeleton: see [ADR-007](decisions/adr-007-mcp-architecture.md) for why
building further now would be premature.
