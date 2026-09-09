# ADR-017: Expanding agent/MCP ecosystem reach

**Status:** Proposed
**Date:** 2026-09-09
**Deciders:** P4inz / Atharva Patil

## Context

DRAFT's whole differentiation thesis (product spec, ADR-007) is that an MCP-compatible agent
reads and writes the *same live canvas* a human is editing, not a screenshot or an export.
`crates/draft-mcp` already implements this for real — two working transports, both
end-to-end tested against a genuine `rmcp` client (not a mock):

- **stdio** (`crates/draft-mcp/src/bin/main.rs`): a standard MCP server any spec-conformant
  client can spawn via `command`/`args`. Genuinely universal by construction — audited
  against the spec with no deviations found (`docs/mcp.md`). Operates on a saved `.draft`
  project directory; doesn't see live edits.
- **local-socket** (`crates/draft-mcp/src/local_socket.rs`): the *live* transport, hosted
  inside the running desktop app, restricted to the current OS user. Real MCP wire protocol,
  but no mainstream MCP client's configuration surface supports "dial this named pipe/Unix
  socket" — reachable only by DRAFT's own desktop app today.

The gap isn't the protocol implementation — it's reach. Two concrete facts, both confirmed
this session:

1. **The stdio binary isn't in the installer.** `apps/desktop/src-tauri/tauri.conf.json` has
   no `externalBin` entry for `draft-mcp`; a user who just installed DRAFT from the GitHub
   release has no way to point Claude Desktop/Code, Codex CLI, or Cursor at it without
   cloning the repo and running `cargo build --release -p draft-mcp` themselves. This was
   raised directly this session ("connecting with agent is ez as for new user" — today it
   isn't, for this path) and is tracked in `ROADMAP.md`'s Known Issues.
2. **The live transport is invisible to every standard client.** Even a user willing to build
   from source only reaches the *saved-project* half of DRAFT's story via stdio; the live,
   bidirectional half — the actual differentiator — has zero standard-client reach at all.

Market context (researched this session, not assumed): MCP has grown from ~2,000 public
server repos at the start of 2025 to 12,000–17,000+ by mid-2026, with 97M+ monthly SDK
downloads and native support in Claude Desktop, Claude Code, VS Code Copilot, Cursor,
Windsurf, Zed, and Continue. Gartner projects 75% of API gateway vendors will support MCP by
end of 2026. This is the fastest-growing AI-integration surface available, and DRAFT already
has real, tested tooling for it that essentially nobody outside this dev session can reach.
Fixing distribution, not building new protocol surface, is the highest-leverage move here.

## Decision

Close the distribution gap first (bundle stdio as a sidecar, verify real client
compatibility), then evaluate a remote transport only once local reach is solved and there's
a concrete driving use case for it — not proactively.

## Options Considered

### Option A: Bundle `draft-mcp` as a Tauri sidecar binary

Add `draft-mcp` to `tauri.conf.json`'s `bundle.externalBin`, matching Tauri's documented
convention: the binary lives at `src-tauri/binaries/draft-mcp-<target-triple>` per platform,
and Tauri strips the suffix and loads the right one at runtime automatically. A CI build step
(the `release-build` job already builds `draft-mcp` as part of `cargo build --workspace`)
copies/renames the compiled binary into that location before `tauri build` bundles it. The
Settings panel's existing "Connect an agent" section (shipped this session) then shows the
*actual* resolved path plus a ready-to-paste JSON config snippet, once a new Tauri command
resolves it (`tauri::api::process::current_binary`-adjacent lookup, or `resource_dir()`).

| Dimension | Assessment |
|---|---|
| Complexity | Low-medium — well-documented Tauri pattern, no new protocol surface |
| Cost | One CI build-step change per platform leg; no new runtime dependency |
| Scalability | N/A (a local binary, not a service) |
| Team familiarity | High — this session already wrote the exact `externalBin`-shaped fix for the unrelated `opener` plugin removal, so the config surface is already understood |

**Pros:** Turns "clone and build from source" into "install and go" for every standard MCP
client at once (stdio is universal by construction, per the existing spec audit). Directly
answers the user's own "ez as for new user" ask. Low risk — doesn't touch the live transport,
the permission model, or anything already working.
**Cons:** Doesn't help the *live* half of the story (see Option B). Needs real testing on
all three OS legs before the next release, not just Windows (this session's own standing
lesson: never claim a release-build change works without verifying it).

### Option B: Verify real third-party client compatibility

Today's stdio compliance claim rests on `tests/mcp_stdio.rs` driving a real `rmcp` client —
correct, but not the same as "Claude Desktop, installed by an actual user, actually
connects." Install and configure Claude Desktop and Claude Code against a built `draft-mcp`
binary + a real saved project, and confirm the full tool list works end to end (not just
`tools/list`, which is unrestricted — every actual read tool call).

| Dimension | Assessment |
|---|---|
| Complexity | Low — no code changes, a manual/scripted verification pass |
| Cost | Time only |
| Scalability | N/A |
| Team familiarity | High — mirrors this session's own standing practice of verifying live in a real environment, not just unit tests |

**Pros:** Converts an assumed claim ("any spec-conformant client can connect") into a
verified one, closing the exact gap `docs/mcp.md` already flags honestly ("the spec
conformance is real; the 'have I personally seen Devin connect to it' claim isn't"). Cheap.
**Cons:** Doesn't scale to every client claimed (Codex, Cursor, Antigravity, Hermes) without
repeating the exercise per client — worth doing for the two most-used ones first (Claude
Desktop/Code) and treating the rest as lower-confidence until tested.

### Option C: Add a remote (HTTP/SSE) MCP transport

A third transport reachable over the network, not just a local process — would let
browser-based or remote agents connect without spawning a local binary at all.

| Dimension | Assessment |
|---|---|
| Complexity | High — new auth story (today's model is "OS-user-only," which has no meaning over a network), new attack surface, a third transport to keep in spec-conformance parity with the other two |
| Cost | Significant — real security review needed (this session's whole Session C was a dedicated audit; a network-reachable transport reopens a class of risk that was just closed) |
| Scalability | Real service concerns (auth, rate limiting) that don't exist for a local-only tool today |
| Team familiarity | Low — nothing like this exists in the codebase yet |

**Pros:** Would open DRAFT to genuinely remote/cloud agent platforms and browser-hosted
clients (relevant to ADR-016's `apps/web` bridge work, which has a similar "how does a
browser reach live desktop state" problem).
**Cons:** Directly contradicts ADR-008's local-first architecture decision unless scoped
very carefully (opt-in, off by default, its own security review). No concrete driving use
case exists yet — this would be speculative infrastructure, the same trap ADR-014 explicitly
avoided for the semantic taxonomy ("needs a concrete driving feature before being designed").

### Option D: Add more MCP tools (resource subscriptions, prompts)

The MCP spec supports richer primitives than the current tool-call-only surface —
`resources/subscribe` for push-based change notification (today's `recent_changes` is
poll-only), and MCP "prompts" (reusable prompt templates a client can surface to its user).

| Dimension | Assessment |
|---|---|
| Complexity | Medium — subscriptions need a new push mechanism on top of the existing `broadcast::channel`; prompts are comparatively simple additive JSON |
| Cost | Moderate engineering, no new external dependency |
| Scalability | N/A |
| Team familiarity | Medium — the existing `LiveState.changes` broadcast channel already does the hard part (notifying on graph mutation); subscriptions would consume it differently, not reinvent it |

**Pros:** A real quality-of-life improvement for a connected agent (no more polling
`recent_changes`), and prompts could ship canned "sketch a login flow," "audit the current
selection" starting points, lowering the bar for a new agent user.
**Cons:** Doesn't fix the *reach* problem (Options A/B) at all — an unreachable server with
more tools is still unreachable. Only worth doing once A/B are done and there's real usage to
learn from.

## Trade-off Analysis

Options A and B are cheap, low-risk, and directly attack the actual bottleneck: DRAFT's MCP
implementation is real and tested, but almost nothing outside this dev session can reach it.
Option C is the most exciting on paper (opens DRAFT to the broadest possible agent
ecosystem) but is speculative infrastructure that contradicts the local-first decision
without a concrete driver, and reopens security surface immediately after a dedicated audit
closed a comparable class of risk. Option D is a real improvement but is additive polish on
top of a server nobody can reach yet — sequencing it before A/B would be solving the wrong
problem first.

## Consequences

- Becomes easier: any new user can point a standard MCP client at DRAFT immediately after
  installing, no source build required — this is the actual "wide and useful for people"
  lever, not a new feature.
- Becomes harder: CI's `release-build` job gains one more moving part (the sidecar copy step)
  per platform leg — must be verified on all three OSes before trusting it, per this
  session's own standing lesson about local-vs-CI build environment differences.
- Needs revisiting: once A/B ship and real usage data exists (which clients, how often, what
  friction), re-evaluate whether Option C's remote transport has an actual driving use case
  (e.g., `apps/web`'s ADR-016 bridge work reaching maturity) rather than building it
  speculatively now.

## Action Items

1. [ ] Add `draft-mcp` to `externalBin` in `tauri.conf.json`; add the CI build step that
   places the compiled binary at the target-triple-suffixed path per platform leg.
2. [ ] Add a Tauri command resolving the sidecar's actual installed path, and wire it into
   the Settings panel's existing "Connect an agent" section as a copy-paste-able config
   snippet (replacing today's "build it yourself" instructions).
3. [ ] Verify on all three OS legs — a sidecar bundling bug caught only on one platform is
   exactly the kind of release-blocking surprise this project has hit before.
4. [ ] Manually verify a real Claude Desktop and a real Claude Code installation against the
   bundled binary + a real saved project — every read tool, not just `tools/list`.
5. [ ] Update `docs/mcp.md`'s "have I personally seen X connect" caveat once verified, naming
   which clients are now confirmed rather than assumed.
6. [ ] Defer Option C (remote transport) and Option D (more tools) until 1–5 are shipped and
   real usage suggests either is worth the cost.
