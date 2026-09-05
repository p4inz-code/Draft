# Cross-Platform

DRAFT targets Windows, Linux, and macOS via Tauri 2 (see
[ADR-001](decisions/adr-001-tauri-2.md)).

## Current verification status (honest as of the foundation phase)

Everything so far has been built and tested on **Windows only**, in this session's
development environment. The workspace, crates, and packages don't contain anything
platform-specific by design (`draft-platform`'s trait abstraction exists precisely so
platform differences are isolated — see [docs/architecture.md](architecture.md)), but that's
an architectural intent, not a tested guarantee, until CI actually runs the matrix build on
Linux and macOS. [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs on all three
once pushed — check its status badge/runs for the current real answer, not this document.

## What isolates platform differences today

- `draft-platform::PlatformPaths` — app-data/documents directory resolution goes through
  this trait, backed by the `dirs` crate (which itself handles the three OSes' conventions).
- Tauri 2 itself abstracts window management, IPC, and packaging across the three targets.

## Known platform-specific work not yet done

- Linux and macOS bundle/build validation (icons, installers, code signing/notarization on
  macOS) — Session 4 hardening scope per the product spec, not foundation stage.
- Any OS-specific file dialog or native menu behavior — not yet built at all.

## Web (fourth surface, different tier)

See [docs/web.md](web.md) — the web build is architecturally planned for but intentionally
behind desktop in features right now.
