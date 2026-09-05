# ADR-009: Free-Forever, Proprietary (Not Open-Source) License

**Status:** Accepted
**Date:** 2026-09-05
**Deciders:** P4inz (Atharva Patil)

## Context

DRAFT's product policy is: free forever, no subscription, no paid tier — but the source
should remain proprietary, not open source. Standard permissive licenses (MIT, Apache-2.0)
would allow unrestricted redistribution and competing derivative products; copyleft licenses
(GPL/LGPL) don't match "proprietary" either, and both categories would make it inaccurate to
call DRAFT anything other than open source.

## Decision

A custom source-available license ([LICENSE.md](../../LICENSE.md)): free to run the
application for any purpose, forever, at no cost — but no redistribution of the source, no
building a competing product from it, and no removing DRAFT's branding — with contributions
accepted under terms that let them be merged in without the contributor losing ownership of
their own work. Explicitly documented as not open source, so it's never mislabeled.

## Options Considered

### Option A: Custom free-forever/source-available license (chosen)

**Pros:** Matches the actual policy exactly — free product, proprietary source, no
subscription; source stays visible for trust/contribution without giving up control over
derivative use.
**Cons:** Not a recognized OSI license, so it needs its own clear documentation (done in
[LICENSE.md](../../LICENSE.md)) rather than being instantly understood the way "MIT" is; not
a substitute for professional legal review before wide distribution.

### Option B: MIT / Apache-2.0

**Pros:** Instantly recognized, zero drafting effort, maximizes contribution/adoption.
**Cons:** Permits unrestricted redistribution and competing forks — directly contradicts
"proprietary."

### Option C: GPL / LGPL

**Pros:** Keeps derivative works open, recognized copyleft model.
**Cons:** Still open source by definition, and its copyleft obligations don't map onto "the
compiled app is free, the source is not freely redistributable" — the wrong shape of
restriction for this policy.

## Trade-off Analysis

Neither a standard permissive nor copyleft license expresses "free application, closed/
non-redistributable source" — only a custom license does, at the cost of needing to write
and (eventually) have it reviewed rather than reusing a known template.

## Consequences

- [LICENSE.md](../../LICENSE.md) is explicitly flagged as a starting draft, not
  lawyer-reviewed — must be revisited before any serious commercial dispute or wide public
  distribution.
- Marketing/docs must never call DRAFT "open source" — it's free and source-available, a
  distinct claim (see [README.md](../../README.md)).
- Contributions need [CONTRIBUTING.md](../../CONTRIBUTING.md)'s terms to be clear about what
  rights a contributor grants back.

## Action Items

1. [x] Draft [LICENSE.md](../../LICENSE.md) with the free-forever/source-available terms.
2. [ ] Have it reviewed by a lawyer before any wide public release or commercial dispute.
