# ADR-008: Local-First Architecture

**Status:** Accepted
**Date:** 2026-09-05
**Deciders:** P4inz (Atharva Patil)

## Context

DRAFT must be fully usable — create, draw, import media, save, reopen, edit — with no AI
provider connection at all, and must not silently upload user content anywhere. It also
needs to eventually support a web build without abandoning this stance.

## Decision

DRAFT is local-first: project files live on disk in a directory the user controls
([ADR-006](adr-006-draft-project-format.md)), the canvas and save/load work fully offline,
and nothing is transmitted off the local machine without an explicit user action. AI/agent
access is additive and opt-in ([ADR-010](adr-010-agent-permission-model.md)), never required.

## Options Considered

### Option A: Local-first, cloud optional later (chosen)

**Pros:** Matches the product's privacy stance; works for users who never want cloud sync;
doesn't block on any backend infrastructure existing yet.
**Cons:** Cross-device sync and real-time collaboration (explicitly out of scope for V1) are
harder to retrofit than if a backend existed from day one — accepted, since the spec
explicitly defers both.

### Option B: Cloud-backed by default (a hosted backend is the source of truth)

**Pros:** Sync/collaboration "just work" from day one.
**Cons:** Requires operating a backend service before there's any revenue model to fund it
(conflicts with [ADR-009](adr-009-free-forever-proprietary-license.md)'s free-forever
policy), and makes "fully usable offline" an afterthought rather than the default.

## Trade-off Analysis

Option B's sync convenience isn't worth taking on hosting costs and an offline-as-afterthought
architecture for a product whose stated policy is free forever with no subscription revenue.

## Consequences

- `draft-platform`'s OS abstraction ([docs/architecture.md](../architecture.md)) exists so
  the web build ([docs/web.md](../web.md)) can eventually plug in a browser-storage
  implementation without the core crates assuming a backend.
- No telemetry exists today; if added later, it must be opt-in and documented in
  [docs/privacy.md](../privacy.md), not silent.
- Collaboration and cloud sync remain explicitly V2 concerns (spec §22/§17) — the data model
  shouldn't be designed to make them impossible, but nothing here builds toward them yet.

## Action Items

1. [x] Ensure `draft-project`'s create/open/save path has no network dependency.
2. [ ] Design the web build's storage story (Session 3) without introducing a required
   backend for desktop.
