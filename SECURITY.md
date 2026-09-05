# Security Policy

## Reporting a vulnerability

If you find a security issue in DRAFT, please report it privately rather than opening a
public issue: open a [GitHub Security Advisory](https://github.com/p4inz-code/Draft/security/advisories/new)
on this repository, or contact the maintainer directly through the repository owner's
GitHub profile if the advisory route isn't available to you.

Please include:

- What you found and why it's a security issue.
- Steps to reproduce, or a proof of concept if you have one.
- The version/commit you tested against.

We'll acknowledge reports as quickly as we can and work with you on a fix and disclosure
timeline before any public write-up.

## Scope

DRAFT is local-first (see [docs/privacy.md](docs/privacy.md)) and, once the MCP server is
built, will accept connections from AI agents to read and (with explicit permission) write
to a project. Security-relevant areas most worth scrutiny:

- **Path handling** — anything that resolves a path from project data or an asset reference
  (`draft-security::is_path_within_project`, used by `draft-project`/`draft-media`) must not
  allow escaping the project directory.
- **The agent permission model** — every agent connection should require explicit,
  visible user approval, and only `Build` mode should ever allow writes. See
  [docs/agent-permissions.md](docs/agent-permissions.md).
- **The MCP transport** — once built, the local-socket listener the desktop app hosts must
  bind loopback-only and not become a general-purpose local RPC surface for any process on
  the machine.

## Supported versions

DRAFT hasn't had a first release yet — see [ROADMAP.md](ROADMAP.md). Once it does, this
section will list which versions receive security fixes.
