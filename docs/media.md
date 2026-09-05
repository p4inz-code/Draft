# Media

Implemented in `crates/draft-media`. Per the product spec, imported media becomes an
addressable workspace asset — the point is that the agent can reference
`asset://image/123` or a specific `region://.../03` instead of receiving raw bytes for
everything, every time.

## What exists today

- `AssetKind`: `Image | Video | Other`.
- `AssetMetadata`: `id` (`AssetId`), `kind`, `original_filename`, `content_hash`,
  `size_bytes`.
- `hash_file`: streaming SHA-256 (64KB chunks, so a large video doesn't need to be loaded
  into memory at once) — this is what makes re-importing the same file recognizable as the
  same asset rather than a duplicate.

## Why content-addressing

Hashing on import means DRAFT can de-duplicate assets (the same reference image dropped
into two pages is one asset, referenced twice) and gives every asset a stable identity that
doesn't depend on its filename or where it lives on disk.

## Token/media efficiency

An agent should be able to answer most questions from structured context — annotations,
regions, labels — without requesting the raw asset. The raw file stays available for when
the agent genuinely needs to look (see [docs/product.md](product.md)'s framing: this reduces
*repeated* raw-media transmission, it doesn't eliminate media access entirely).

## What's deferred

- Regions (`region://asset/03`) and annotations attached to assets — Session 1/2, once
  there's a UI to create them.
- Video-specific handling: duration, timeline references, extracted frames, user-defined
  timestamps.
- Format-specific support beyond generic image/video (PSD, AI) — explicitly not promised for
  V1; see the product spec's "never sacrifice the Project Graph or MCP for perfect format
  support" priority ordering.
- Thumbnail generation (the `thumbnails/` directory in the project format exists; nothing
  writes to it yet).
