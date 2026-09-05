# Privacy

DRAFT is local-first (see [ADR-008](decisions/adr-008-local-first-architecture.md)).

## What that means concretely

- The canvas, save/load, and media import all work fully offline — no AI provider
  connection is required to use DRAFT as a drawing/design tool.
- Project files live on disk, in a project directory you choose (see
  [docs/project-format.md](project-format.md)). DRAFT does not upload project content
  anywhere on its own.
- An AI agent only sees a workspace's contents after an explicit connection is accepted
  *and* the agent mode grants at least read access (`Manual` mode, the default, grants
  none — see [docs/agent-permissions.md](agent-permissions.md)). There is no background or
  silent agent access.
- The planned MCP local-socket transport binds loopback-only (see [docs/mcp.md](mcp.md)) —
  it is not reachable from the network.

## Path safety

Because project files are portable (you might open a project someone else made, or a
project synced from another machine), their contents are not treated as trusted input.
Any path derived from project data — an asset reference today, potentially an agent-
supplied path later — is checked by `draft_security::is_path_within_project` before use,
which rejects anything that would resolve outside the project directory. See
`crates/draft-security/src/path_safety.rs` and [SECURITY.md](../SECURITY.md).

## What's deferred

- Cloud sync/backup (spec explicitly allows this *later*, without compromising the
  local-first default).
- Any telemetry — none exists today; if added later, it will be opt-in and documented here,
  not silent.
