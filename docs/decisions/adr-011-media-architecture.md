# ADR-011: Media Architecture

**Status:** Accepted
**Date:** 2026-09-05
**Deciders:** P4inz (Atharva Patil)

## Context

Imported media (images, video, eventually other formats) needs to become an addressable
workspace asset an agent can reference (`asset://...`, `region://...`) without requiring raw
bytes for every question — but DRAFT should not promise perfect support for every creative
format (PSD, AI) at V1.

## Decision

Assets are identified by content hash (streaming SHA-256, `crates/draft-media::hash_file`),
not by filename or path. `AssetMetadata` carries kind, original filename, content hash, and
size. Format-specific handling (video timestamps, PSD layers, extracted frames) is
explicitly deferred; only generic image/video/other categorization exists at foundation
stage.

## Options Considered

### Option A: Content-addressed by hash (chosen)

**Pros:** Re-importing the same file is recognized as the same asset (de-duplication);
identity survives a rename/move; streaming hash means large video files don't need to load
into memory at once.
**Cons:** Requires reading the whole file once at import time (a fixed cost, not a recurring
one).

### Option B: Identify assets by their path within the project bundle

**Pros:** Simpler — no hashing step.
**Cons:** Breaks identity on rename; two different files with the same relative path can't
be distinguished from history; no natural de-duplication.

## Trade-off Analysis

The one-time hashing cost at import is worth paying for stable identity and de-duplication,
especially since imported reference media (screenshots, reference art) is commonly
re-imported across pages in exactly the game-design workflow DRAFT targets.

## Consequences

- `crates/draft-media` has no dependency on format-specific parsing libraries yet — kept
  minimal until Session 1/2 defines concrete needs (video duration/timestamps, PSD layers).
- The product spec's "don't claim unsupported formats work" rule ([docs/media.md](../media.md))
  is upheld structurally: nothing here parses PSD/AI content, so nothing can silently claim
  to.
- Thumbnail generation (the project format's `thumbnails/` directory) has no implementation
  yet — tracked as deferred, not silently skipped.

## Action Items

1. [x] Implement `hash_file` and `AssetMetadata::from_file` with determinism/sensitivity
   tests.
2. [ ] Session 1/2: regions, annotations, video timestamps, thumbnail generation.
