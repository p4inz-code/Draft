# ADR-016: `apps/web` Attaches to a Running Desktop Session Over a Local HTTP/WebSocket Bridge

**Status:** Accepted
**Date:** 2026-09-06
**Deciders:** P4inz (Atharva Patil)

## Context

`apps/web` is currently a bare shell — `@draft/ui`'s logo and a tagline, nothing else
(`docs/web.md`). It deliberately never imported `@draft/canvas` before now, because that
package's API was still stabilizing through Session 1. That's done: `@draft/canvas` and
`packages/shared`/`packages/ui` have no Tauri/IPC awareness at all — only
`packages/project-client` and `apps/desktop` do — so nothing architectural blocks wiring the
canvas into `apps/web` today.

What *is* still unresolved, and is exactly what `docs/web.md` flags as open Session 3 design
work: **how does a web build talk to project data at all**, given there's no Rust process
behind a browser tab the way Tauri gives desktop one? `crates/draft-platform`'s
`PlatformPaths` trait has exactly one implementation (`NativePlatform`) and zero WASM
readiness anywhere in the Rust workspace (no `wasm-bindgen`, no `wasm32` target, nothing).

A second, harder constraint: **the live MCP transport cannot run in a browser tab, full
stop.** `crates/draft-mcp/src/local_socket.rs`'s primary transport is a raw OS named pipe
(Windows) or Unix domain socket, secured with an owner-only ACL specifically because a
browser's sandboxed networking stack (fetch/WebSocket only) can't open either directly. This
means any web story that hopes to preserve DRAFT's actual core value — an agent watching a
live session as the human works, not just a saved file — needs *some* native process in the
loop. A pure client-side WASM build could give a browser tab local drawing and persistence,
but could never host live agent access on its own; that would need a second, no-agent
interaction mode alongside it, which the user reviewed and did not want to build first.

## Decision

`apps/web` becomes a real browser UI that attaches to an **already-running desktop
session**, not a standalone offline build. The desktop app (`apps/desktop/src-tauri`) grows a
second, local-only server alongside its existing MCP socket: a plain HTTP + WebSocket server
(loopback-bound, same-machine by default) that mirrors the same command surface
`packages/project-client/src/index.ts` already exposes over Tauri IPC — `save_snapshot`,
`load_snapshot`, `save_asset`, `load_asset`, `apply_operations`, `get_page_snapshot`,
`set_agent_mode`, etc. — plus the two Tauri events (`draft-graph-changed`,
`draft-agent-connections-changed`) pushed over the WebSocket instead.

`packages/project-client` gains a second backend behind its existing exported function
signatures (chosen at build time, not duplicated per call site): the Tauri-IPC backend
`apps/desktop` already uses, and a new HTTP/WebSocket backend `apps/web` uses. Every function
in `project-client/src/index.ts` keeps its exact signature — this is a transport swap behind
an already-stable interface, not a new API.

The result: open `apps/web` in a browser (a phone, a tablet, another machine on the LAN) while
the desktop app is running, and it's the **same live project** — same canvas, same live-graph
state, same connected-agent session. This is real, deliverable cross-platform value without
inventing a browser storage layer or a WASM toolchain this codebase has never touched.

**Explicitly out of scope for now:** a fully standalone browser mode with no desktop
companion (WASM-compiled `draft-graph`/`draft-project` + IndexedDB/File System Access API).
It remains architecturally possible later — nothing in this decision forecloses it, and
`draft-platform`'s `PlatformPaths` trait is still the seam it would plug into — but it's a
materially bigger lift (a real WASM toolchain, a browser persistence layer with no precedent
here) for a mode that could never offer live agent access anyway. Not guessed at further
until there's a concrete reason to build it.

## Options Considered

### Option A: Desktop-hosted bridge (chosen)

**Pros:** reuses everything already built and tested (`draft-graph`, `draft-project`,
`draft-mcp`'s `LiveState`, every Tauri command) — this is a transport addition, not a new
subsystem; preserves live agent access, the thing a pure-WASM web build could never offer;
small, contained surface (one new Rust module, one new `project-client` backend) matching
this project's "working, stable" bar over a feature race.
**Cons:** `apps/web` only works while a desktop instance is reachable — no fully offline,
zero-companion browser mode.

### Option B: Standalone WASM + browser storage

**Pros:** a browser tab works with zero desktop involvement, fully offline.
**Cons:** cannot ever host live MCP access (the named-pipe/socket transport is OS-only by
construction — no browser workaround exists), so this mode would need an entirely separate,
reduced interaction model bolted on anyway; a real new toolchain (wasm-bindgen, a browser
persistence layer) with no precedent in this codebase, for a use case (agent-free local
sketching) nobody has asked for yet.

### Option C: Scoped-down web (view/sketch only, no live data access)

**Pros:** smallest possible lift.
**Cons:** doesn't deliver much beyond what exists today; explicitly rejected by the user in
favor of real parity ("take what's best without sacrificing quality").

## Trade-off Analysis

Option A is the only one of the three that keeps the thing DRAFT is actually for — a human's
visual workspace, live, to an agent — intact across the new surface. Option B trades that
away permanently for a browser tab that can work standalone; Option C doesn't meaningfully
extend cross-platform reach at all. Given the project's explicit priority ("working, stable,
cross-platform... not a feature race"), reusing already-hardened Rust code behind a thin new
transport is the lower-risk, higher-value path — and it doesn't block Option B from being
picked up later if a genuine need for fully-offline browser use ever materializes.

## Consequences

- `apps/desktop/src-tauri` grows a second local server (HTTP + WebSocket) alongside the
  existing MCP local-socket transport — both loopback-only by default, both need the same
  "owner-only access" scrutiny ADR-007's security-review pass already gave the MCP socket.
- `packages/project-client` gets a small internal seam (its current single Tauri-IPC
  implementation becomes one of two backends behind the same exported functions) rather than
  a rewrite — every existing caller (`apps/desktop/src/App.tsx`, `Toolbar.tsx`'s
  `assetBackend` injection) is unaffected.
- `apps/web` finally imports `@draft/canvas`/`Toolbar`, reaching real feature parity with
  desktop for anything that doesn't require the OS-level MCP socket itself (which stays
  desktop-hosted regardless of which UI is driving it).
- A fully standalone (no companion) browser mode stays explicitly deferred — noted here as a
  real, possible future direction, not ruled out, just not started until there's a concrete
  need.

## Action Items

1. [ ] `apps/desktop/src-tauri`: a new local HTTP + WebSocket server (spawned alongside
   `serve_forever` in the `setup` hook, sharing the same `Arc<LiveState>`), exposing the same
   command surface as the existing Tauri `#[tauri::command]`s, plus the two change-notification
   events over the WebSocket.
2. [ ] `packages/project-client`: introduce the backend seam — an interface matching the
   current exported functions, a Tauri-IPC implementation (today's code, unchanged
   behaviorally) and a new HTTP/WebSocket implementation, selected at build time per app.
3. [ ] `apps/web`: import `@draft/canvas`/`Toolbar`, wire the HTTP/WebSocket
   `project-client` backend, reach the same save/load/import/agent-mode functionality
   desktop has.
4. [ ] Security pass on the new local server before it ships, matching ADR-007's local-socket
   scrutiny — loopback binding, and whatever origin/access restriction keeps it from being an
   open door on a shared network.
5. [ ] Exit test: desktop app running, `apps/web` opened in a separate browser (or a second
   device on the LAN), draws on one, confirms the change appears live on the other, and that
   an MCP agent connected to the desktop session sees edits made from either surface.
