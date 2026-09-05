# Project Format

Implemented in `crates/draft-project`. See [ADR-006](decisions/adr-006-draft-project-format.md)
for why this shape was chosen over a single-file format.

## Layout

```
My Game.draft/
    project.json     — manifest: schemaVersion, id, name, timestamps, page order
    pages/            — one JSON file per page (empty today; populated in Session 1/2)
    assets/           — imported media, content-addressed (crates/draft-media)
    thumbnails/
    metadata/
```

`project.json` is the only file `draft-project` reads to open a project; everything else is
addressed relative to the bundle directory.

## `project.json`

```json
{
  "schema_version": 1,
  "id": "project://0190f1e4-...",
  "name": "My Game",
  "created_at": "2026-09-05T12:00:00Z",
  "modified_at": "2026-09-05T12:34:00Z",
  "pages": ["page://...", "page://..."]
}
```

`pages` is the source of truth for page order — filenames under `pages/` are not, since
filenames are a poor place to encode ordering that can change.

## Why a directory bundle, not a single file

Media assets need to exist as real, individually addressable files (so they can be streamed,
content-hashed once and reused, and inspected outside DRAFT if needed) rather than embedded
as base64 blobs inside one JSON document. A directory bundle also means a corrupted or
oversized asset doesn't risk making the whole project file unparseable — `project.json`
itself stays small.

## Schema versioning

`CURRENT_SCHEMA_VERSION` (currently `1`) is checked on every `open_project`. If a project's
`schema_version` is *newer* than what this build supports, opening fails with a clear
"update DRAFT" error rather than misreading the file — see the
`opening_a_future_schema_version_fails_clearly_instead_of_misreading` test in
`crates/draft-project/src/lib.rs`. Handling *older* versions by migrating forward is Session
2+ work, once there's been an actual schema change to migrate from. This is intentionally
built to scale across many future major versions rather than needing a rewrite the first
time the format changes (see the versioning discipline referenced from ADR-006).

## Path safety

Any path derived from project data (an asset reference, eventually an agent-supplied path)
must be resolved through `draft_project::resolve_asset_path`, which rejects anything that
would escape the project directory via `draft_security::is_path_within_project`. Project
files are portable and shared between machines — their contents are not trusted input. See
[docs/privacy.md](privacy.md) and [SECURITY.md](../SECURITY.md).

## What's deferred

- Actual page content (`pages/*.json` files) — Session 1/2, once the canvas produces real
  objects to serialize.
- Migrations *from* an older schema version to a newer one (today only the "reject a future
  version" direction is implemented, since version 1 is all that exists so far).
- Thumbnail generation.
