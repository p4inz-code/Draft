# Changelog

All notable changes to DRAFT are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/) once there's a first release.

## [Unreleased]

Nothing yet — this section fills in as work continues past v0.1.0.

## [0.1.0] — 2026-09-09

The first real release: not another `-dev` snapshot. Everything below has real, tested
behavior — no placeholder-only crates or packages — though `apps/web` still has no live
bridge to a running desktop session (ADR-016) and the full V1 spec isn't complete yet, which
is why this is `v0.1.0` and not `v1.0.0`.

### Added

**Foundation**
- Rust (Cargo workspace) + TypeScript (pnpm workspace) monorepo, Biome lint/format, CI across
  Windows/macOS/Linux, real brand kit (logo, icons, JetBrains Mono, color palette).
- Core crates: `draft-core` (typed IDs), `draft-security` (agent permission model,
  path-safety), `draft-platform`, `draft-events` (operation log), `draft-graph` (the typed
  Project Graph, source of truth), `draft-media`, `draft-project` (save/load, content-
  addressed assets), `draft-mcp` (MCP server, both transports).
- TypeScript packages: `@draft/shared`, `@draft/ui`, `@draft/canvas`, `@draft/project-client`.
- Tauri 2 + React desktop shell (`apps/desktop`) with a custom frameless titlebar, and a
  minimal web shell (`apps/web`).

**Canvas**
- A real, interactive drawing canvas: rectangle, ellipse, diamond, text, line, arrow, and
  freehand shapes; select/move/resize/rotate/eraser tools; undo/redo; pan/zoom; inline text
  editing; copy/paste; shape grouping; image and reference-only video import (thumbnail on
  canvas, video bytes kept as an asset, never embedded); numbered and Illustrator-style
  letter tool shortcuts side by side; shape fill color and stroke color/width; shape z-order
  (bring-to-front/send-to-back); Shift-to-constrain proportions while drawing/resizing
  (square/circle, 45° line/arrow angle snap, 45°-snapped rotation).
- Full keyboard accessibility: the canvas is a real focusable widget with arrow-key nudge,
  Tab/Shift+Tab selection cycling, and a keyboard-operable tool-group flyout — not just
  mouse-driven.
- A bottom-floating, auto-hiding icon toolbar with hold-to-open tool-group flyouts
  (Illustrator-style), replacing the earlier always-visible button row.

**Persistence**
- Real page/object persistence through `draft-project`/`draft-graph`'s typed `Shape` union
  (ADR-014), with Save/Open in the desktop app and a proven save→close→reopen round trip.
- Assets cross the graph/MCP boundary as references (a content-addressed hash), never raw
  bytes (ADR-015) — an MCP agent can see that an image exists and its dimensions, never the
  pixels themselves.

**MCP / agent integration**
- A real MCP server built on the official `rmcp` v3 SDK, two transports: a stdio
  `draft-mcp` CLI binary for saved `.draft` projects (works with any spec-conformant MCP
  client — Claude Desktop, Claude Code, Codex CLI, Cursor, and others with local-stdio-server
  support), and a local-socket server hosted inside the running desktop app for *live*
  editing sessions (bidirectional: an agent's write is visible to the human immediately, and
  vice versa) — restricted to the current OS user on both Windows (named-pipe security
  descriptor) and Unix (socket file `chmod 0600`).
- Tools: `get_project`, `get_page`, `get_object`, `create_object`, `modify_object`,
  `delete_object`, `recent_changes` (with incremental polling via `since_sequence`),
  `get_selection`. A visible "N agents connected" indicator.
- A real, enforced five-level agent permission model (Manual/Ask/Watch/Assist/Build) via an
  "Agent access" dropdown — every read and write tool call re-checks the current mode.
  `Ask` requires a fresh, single-use approval for each individual read (an explicit
  "Approve next read" button), not a standing grant.

**Documentation**
- Full ARCHITECTURE.md, docs/ set, 16 Architecture Decision Records, `CLAUDE.md` for future
  agent sessions, and `SESSION_LOG.md` — a dated narrative record of each work session,
  separate from this changelog's release-notes form.

### Fixed

Real, user-facing bugs found and fixed along the way (not an exhaustive list of every
internal cleanup — see `SESSION_LOG.md` for the full narrative):

- The text tool: pointer-capture/focus race deleted a shape before the user could type; a
  missing React key on the text editor caused a second text shape to inherit and corrupt the
  first one's content when created immediately after it.
- An integer-overflow panic in `recent_changes`'s `since_sequence` handling on a maximal
  agent-supplied value.
- The marquee-selection rectangle rendered at the wrong screen position whenever the camera
  was panned or zoomed away from its default — it was rendered outside the pan/zoom
  transform group instead of inside it, so its world coordinates were mistaken for screen
  coordinates.
- Negative-width/height shapes when drawing up/left (now normalized, matching resize).
- Light-mode WCAG contrast failures in several UI colors.
- Titlebar minimize/maximize/close buttons doing nothing when clicked.

### Security

A dedicated security audit preceded this release (see `SESSION_LOG.md`'s 2026-09-09 entry
for the full narrative):

- Fixed 7 dependency vulnerabilities (`pnpm audit`; dev-toolchain only, never shipped) by
  bumping `vitest`. `cargo audit` found no actionable advisories.
- Removed an unused Tauri plugin (`tauri-plugin-opener`) and its capability grant — dead
  attack surface with no corresponding feature.
- Replaced a fully-disabled CSP (`"csp": null`) with a real, strict one.
- Added adversarial MCP-transport tests (path-traversal-shaped IDs, malformed shape
  payloads) alongside a dedicated adversarial re-verification of `draft-project`/
  `draft-security`'s path-safety checks and a full-history secrets scan — no issues found in
  either.
- The local MCP socket was already restricted to the current OS user (an earlier session's
  fix); this audit re-confirmed the mechanism holds.
