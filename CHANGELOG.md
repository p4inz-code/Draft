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

### Fixed

- CI's Rust toolchain now pinned to match `rust-toolchain.toml` (1.97.1) instead of
  floating on `stable`.

Nothing has shipped as a release yet — this is foundation-stage work ahead of Session 1.
