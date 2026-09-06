# ADR-007: MCP Architecture and Transport

**Status:** Accepted
**Date:** 2026-09-05
**Deciders:** P4inz (Atharva Patil)

## Context

DRAFT must expose the Project Graph to MCP-compatible agents (Claude, Codex, others — never
built Claude-specific). The initial foundation plan assumed pure stdio transport (the
typical MCP pattern: the agent host spawns the server as a subprocess). A self-audit of that
plan (running it through the `engineering:architecture` skill) caught that this is wrong for
DRAFT specifically: **the thing an agent needs to read is the live state of an
already-running desktop app a human is actively editing**, and a freshly spawned subprocess
has no access to that in-memory session.

## Decision

The official Rust MCP SDK, [`rmcp`](https://github.com/modelcontextprotocol/rust-sdk), with
two transports:

- **Primary:** a loopback-only local socket (named pipe on Windows, Unix domain socket on
  Linux/macOS) hosted by the running desktop app, giving an agent access to the live editing
  session.
- **Secondary:** stdio, via a separate `draft-mcp` CLI binary operating directly on a project
  directory on disk, for headless/CI use with no desktop instance required.

Every agent connection — either transport — requires explicit, visible user approval before
any access is granted (see [ADR-010](adr-010-agent-permission-model.md)).

## Options Considered

### Option A: Pure stdio (original plan)

**Pros:** Simplest, most conventional MCP pattern; no listener/socket security surface.
**Cons:** Fundamentally can't give an agent access to an already-running human editing
session — the core use case. Rejected once this was recognized.

### Option B: Local socket only, no CLI binary

**Pros:** Simpler than maintaining two transports.
**Cons:** No way to use DRAFT's data headlessly (CI, scripting, an agent working against a
project with no desktop app open) — spec explicitly wants DRAFT usable alongside existing
projects/repos without requiring a full IDE-like presence.

### Option C: Local socket (live sessions) + stdio CLI (headless) — chosen

**Pros:** Covers both the live-editing case and the headless/CI case with the transport each
is actually suited for.
**Cons:** Two transports to implement and keep behaviorally consistent (same
resources/tools/permission model on both).

## Trade-off Analysis

The added complexity of a second transport is small relative to the alternative of simply
not supporting a real, spec'd use case (headless/CI access). Both transports share the same
`rmcp`-based server logic; only the binding differs.

## Consequences

- The desktop app becomes a long-lived local server, which is new attack surface — mitigated
  by binding loopback-only and gating every read behind `AgentMode::allows_read()` (`Manual`
  by default; see [docs/agent-permissions.md](../agent-permissions.md),
  [SECURITY.md](../../SECURITY.md)).
- `rmcp` v3 is a real dependency of `draft-mcp` as of Session 2, backing both transports.
- The MCP resource/tool list from the product spec (`project`, `pages`, `objects`,
  `recent_changes`, etc., and write tools gated to `Build` mode) is documented in
  [docs/mcp.md](../mcp.md); `get_project`/`get_page`/`get_object` are implemented on both
  transports, the rest remain Session 2/3 work as detailed there.

## Action Items

1. [x] Define `Transport` (`LocalSocket`/`Stdio`) and `AgentConnection` (defaults to
   `AgentMode::Manual`) types.
2. [x] Session 2: added `rmcp`, implemented the local-socket listener (Windows named pipe,
   tested; Unix domain socket, implemented but not yet tested on Linux/macOS), implemented
   `get_project`/`get_page`/`get_object` as read-only tools gated on `AgentMode::allows_read()`.
3. [x] Session 2: implemented the `draft-mcp` stdio CLI binary, same three tools, reading a
   saved `.draft` project directory.
