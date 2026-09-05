# Release

No release has happened yet — DRAFT is in the foundation phase (see
[ROADMAP.md](../ROADMAP.md)). This doc records the intended process so it's decided once,
ahead of needing it, rather than improvised at the first release.

## Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`) once there's a first `0.x` or `1.0` release. The
Cargo workspace and every `package.json` currently sit at `0.1.0` as a placeholder — they
move together as a single product version rather than each crate/package versioning
independently, since DRAFT ships as one application, not a set of published libraries.

Distinct from product version: `draft-project`'s `CURRENT_SCHEMA_VERSION` (see
[docs/project-format.md](project-format.md)), which only changes when the on-disk format
actually changes, and is designed to migrate forward across many future major versions
without forcing a rewrite.

## Changelog discipline

Every user-visible change gets an entry in [CHANGELOG.md](../CHANGELOG.md) under
`[Unreleased]`, in the same PR as the change — not reconstructed from git history right
before a release.

## What a release will include (once there is one)

- Cross-platform build artifacts: Windows, Linux, macOS (Tauri's bundler targets).
- The relevant `CHANGELOG.md` section cut into a dated, versioned entry.
- Confirmation that [docs/testing.md](testing.md)'s full suite passes on all three CI
  platforms, not just locally.
- A tag and GitHub release referencing the build artifacts.

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) runs the Rust and TS test/lint suites
on Windows, Linux, and macOS on every push/PR. It does not yet produce release artifacts —
that's added when there's an actual first release to cut (Session 4 territory, per the
product spec's "hardening + audit + ship" session).
