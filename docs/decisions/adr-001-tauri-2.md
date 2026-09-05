# ADR-001: Tauri 2 as the Desktop Shell

**Status:** Accepted
**Date:** 2026-09-05
**Deciders:** P4inz (Atharva Patil)

## Context

DRAFT V1 targets Windows, Linux, and macOS as a full-power local desktop environment (project
files, filesystem access, offline operation, MCP), with a web build as a secondary,
lower-tier surface. We need a shell that hosts a web-technology UI (React) with native
filesystem/OS access, without committing DRAFT to Electron's resource footprint.

## Decision

Use Tauri 2 as the desktop application shell. Rust owns the backend/core logic; the webview
renders the React frontend; Tauri IPC (`invoke`) is the boundary between them.

## Options Considered

### Option A: Tauri 2

**Pros:** Rust-native backend (matches the Rust-core decision, ADR-002), small binary/
resource footprint (uses the OS's own webview, no bundled Chromium), mature v2 release,
first-class Windows/Linux/macOS support, active MCP-adjacent ecosystem interest.
**Cons:** Smaller ecosystem than Electron; relies on the OS webview (WebView2/WebKitGTK/
WKWebView), which means minor rendering differences across platforms to watch for.

### Option B: Electron

**Pros:** Extremely mature, huge ecosystem, consistent Chromium rendering across platforms.
**Cons:** Ships a full Chromium + Node runtime per app (large installs, higher memory use);
no natural Rust integration, which would mean either a second backend language or an
awkward Rust-via-Node bridge. Explicitly ruled out by the product's own requirements.

## Trade-off Analysis

The Rust-core decision (ADR-002) makes Tauri the natural fit — Electron would require either
duplicating core logic in Node/TS or bridging to Rust awkwardly. Tauri's use of the OS
webview is the main risk (platform rendering differences), mitigated by the plan to validate
all three targets in CI ([docs/cross-platform.md](../cross-platform.md)) rather than assuming
parity.

## Consequences

- Core logic lives in Rust crates, shared between the desktop app and any future headless
  tooling (e.g. the `draft-mcp` CLI binary planned in ADR-007).
- The frontend must go through Tauri's `invoke` IPC for anything touching the filesystem or
  core logic — no direct Node-style `fs` access from the frontend.
- Web parity (ADR-008, [docs/web.md](../web.md)) requires a separate answer, since Tauri
  itself doesn't run in a browser — tracked as open work, not solved by this ADR.

## Action Items

1. [x] Scaffold `apps/desktop` via `create-tauri-app` (React-TS template, Tauri 2).
2. [ ] Validate Linux and macOS builds in CI (Session 4).
