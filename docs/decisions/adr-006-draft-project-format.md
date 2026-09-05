# ADR-006: The `.draft` Project Format

**Status:** Accepted
**Date:** 2026-09-05
**Deciders:** P4inz (Atharva Patil)

## Context

DRAFT projects need to be portable, versioned across many future major releases (the user
explicitly wants the foundation to scale to six-plus major versions without a rewrite), and
capable of holding potentially large media assets without that making the format
unparseable or slow to open.

## Decision

A directory bundle: `project.draft/{project.json, pages/, assets/, thumbnails/, metadata/}`,
with `project.json` carrying a `schema_version` integer from the first version. See
[docs/project-format.md](../project-format.md) for the full shape.

## Options Considered

### Option A: Directory bundle (chosen)

**Pros:** Media assets exist as real, individually addressable, streamable files; a
corrupted or huge asset can't make the whole project unreadable, since `project.json` stays
small and separate; matches the product spec's own example structure.
**Cons:** A project is a folder, not a single double-clickable file — slightly less familiar
UX than "one file" formats, though this is mitigated by the desktop app opening/saving the
bundle as a unit.

### Option B: Single `.draft` file (e.g. a zip or SQLite container)

**Pros:** One file to move/share/back up.
**Cons:** Either requires unpacking to disk anyway for large media (undermining the
simplicity), or forces media through a database blob API that fights the "assets are
individually addressable files" requirement from [docs/media.md](../media.md). Corruption
risk is concentrated in one file instead of isolated per-asset.

## Trade-off Analysis

The single-file UX advantage doesn't outweigh the format's need to hold large media
reliably. Nothing prevents the desktop app from presenting the bundle to the user as if it
were one file (open/save dialogs operate on the directory), so most of Option B's UX benefit
is achievable without its downsides.

## Consequences

- `draft-project` must always operate on a directory, and callers (the desktop app) are
  responsible for presenting that naturally to the user.
- Migrations are schema-version-driven from day one ([docs/project-format.md](../project-format.md))
  — opening a project from a newer DRAFT version fails clearly rather than misreading it.
- Asset paths must be validated against directory traversal
  (`draft_security::is_path_within_project`) since project bundles are portable and their
  contents aren't trusted input.

## Action Items

1. [x] Implement `create_project`/`open_project`/`save_project` with schema-version
   validation and a corruption/malformed-JSON test.
2. [ ] Implement actual migrations once a second schema version exists to migrate from.
