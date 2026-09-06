# Changelog

All notable changes to DRAFT are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/) once there's a first release.

## [Unreleased]

### Added

- Repository foundation: pnpm + Cargo workspace, Biome lint/format, CI.
- Core crates: `draft-core`, `draft-security`, `draft-platform`, `draft-events`,
  `draft-graph`, `draft-media`, `draft-project`, `draft-mcp` (foundation-stage skeleton).
- TypeScript packages: `@draft/shared`, `@draft/ui`, `@draft/canvas` (camera/viewport math),
  `@draft/project-client`.
- Tauri 2 + React desktop shell (`apps/desktop`) and a minimal web shell (`apps/web`).
- Project documentation set and Architecture Decision Records.
- Real brand kit (logo, icons, colors, JetBrains Mono typography), replacing the
  foundation-stage placeholders — see `assets/brand/`.
- `CLAUDE.md` for future agent sessions working in this repository.
- A real, interactive canvas (`packages/canvas`): shapes (rectangle/ellipse/diamond/text/
  line/arrow/freehand), select/resize/eraser tools, undo/redo, zoom/pan, inline text editing.
- Real page/object persistence through `draft-project`/`draft-graph`, with Save/Open in the
  desktop app.
- A real MCP server (`rmcp` v3): a stdio `draft-mcp` CLI binary for saved projects, and a
  local-socket server hosted inside the running desktop app for *live* editing sessions,
  both exposing `get_project`/`get_page`/`get_object`, gated by a real "Agent access"
  permission dropdown (Manual/Ask/Watch/Assist/Build).
- `SESSION_LOG.md`: a dated narrative record of each work session.

### Fixed

- CI's Rust toolchain now pinned to match `rust-toolchain.toml` (1.97.1) instead of
  floating on `stable`.
- A real bug in the canvas's text tool: holding SVG pointer capture while focusing the new
  textarea raced the browser's native click/focus handling, causing an instant blur that
  deleted the shape before the user could type.

Nothing has shipped as a release yet — this is pre-Session-3 work.
