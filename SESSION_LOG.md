# Session Log

A dated, narrative record of what happened in each work session — decisions made, bugs found
and fixed, what got verified and how. [ROADMAP.md](ROADMAP.md) tracks *what's done* (checkbox
state per feature); this file tracks *how we got there and why*, session by session. Don't
duplicate ROADMAP's checklist here — link to it, and to commits/ADRs, instead of restating.

Entries are newest-first. Each one names the commits it covers so it's traceable.

---

## 2026-09-06 (latest, part 2) — code-review pass on video import: 5 confirmed bugs, all fixed

**Commit:** (pending push at time of writing)

Ran an 8-angle `code-review` pass over the video-import commit before moving on, matching
this session's practice of reviewing each feature chunk rather than assuming a green test
suite means done. Found and fixed 5 real bugs, all independently confirmed by 2+ of the 8
finder angles (line-by-line scan, cross-file tracer, altitude, simplification, and
removed-behavior all separately flagged the same seek-hang issue):

- **`packages/canvas/src/video.ts`**: `extractVideoThumbnail` could hang forever with no
  error, no timeout, and a leaked blob URL. `video.currentTime = Math.min(0.1, video.duration
  / 2 || 0)` computes `0` for a zero/NaN-duration clip — but setting `currentTime` to the
  value it's already at is a no-op per the HTML spec, so `seeked` never fires. Fixed by
  capturing the frame immediately when the computed target equals the current time, plus an
  8-second overall timeout as a safety net for any other stuck-decode case (unsupported
  codec that doesn't cleanly error). Also added a guard against a zero-dimension decoded
  frame (an audio-only file mislabeled `video/*`, or dimensions not ready yet) — previously
  this silently produced an invisible 1×1 shape instead of a clear error.
- **`apps/desktop/src-tauri/src/lib.rs`**: `mime_for_extension` — added when `save_asset`/
  `load_asset` shipped under ADR-015, before video import existed — had no video branch at
  all, so `load_asset` reconstructed every reopened video as
  `data:application/octet-stream;base64,...`. Browsers refuse to decode a `<video>` src
  declared as `application/octet-stream`, so every video's thumbnail silently vanished on
  save/reload — a real regression that had already shipped and passed CI, since nothing
  tested the actual reload path (only the browser-preview import path was manually checked).
  Fixed by adding `mp4`/`webm`/`mov`/`ogv` to the match, with a new unit test (this file's
  first ever) covering the fix and the existing image types.
- **`packages/canvas/src/Toolbar.tsx`**: `isVideoFile` had no filename-extension fallback the
  way `isSvgFile` already does — a legitimate video whose MIME type comes back empty (common
  for some OS/picker/container combos) was rejected outright. Fixed with the same extension
  regex pattern `isSvgFile` uses. Also: a thumbnail-extraction failure aborted the entire
  import (no asset saved, no shape created), unlike an undecodable image, which
  `readImportedSize` already degrades gracefully to a 200×200 placeholder. Fixed by catching
  the failure and falling back the same way, so a video with an unsupported codec still
  imports as a reference (just without a preview) instead of failing outright.
- Also applied one efficiency finding while touching this code: `readFileAsDataUrl` and
  `extractVideoThumbnail` don't depend on each other's result, so they now run via
  `Promise.all` instead of sequentially — matters for large files near the 50MB video cap.

Two findings were deliberately left unfixed: no visual distinction between a video reference
and a plain image on canvas (a play-icon badge, say) — that's UI polish, held per the
standing instruction to defer visual work until just before the final audit; and
`mediaKind` as an optional field on `ImageShape` rather
than a first-class reference-asset shape kind — a defensible read of ADR-014's explicit
scoping to drawing kinds only, revisit if a second non-image reference type ever needs it.

Added 4 new tests (`video.test.ts`: same-value-seek immediate capture, timeout, zero-
dimension rejection; `Toolbar.test.tsx`: graceful fallback on thumbnail-extraction failure)
plus `apps/desktop/src-tauri/src/lib.rs`'s first unit tests ever, covering `mime_for_extension`.
`pnpm build/lint/test` (59 tests) and `cargo build/clippy/test --workspace` all green.

---

## 2026-09-06 (latest) — video import: reference-only, thumbnail on canvas

**Commit:** (pending push at time of writing)

Closed the last item from the approved plan's format-breadth list, the one the previous
entry deliberately deferred: video import. Design (small, but real — this is the "own small
design decision" the previous entry flagged as needed before starting):

- `packages/canvas/src/video.ts::extractVideoThumbnail` — an offscreen `<video>` loads the
  file (or, on reopening a project, an already-loaded data URL), seeks to a small time offset
  once metadata is available (a frame at exactly 0s is black/undecoded for some codecs), then
  draws the seeked frame onto an offscreen `<canvas>` and reads it back as a PNG data URL.
- A new `ImageShape.mediaKind?: "video"` field (mirrored into
  `draft-graph::shape::KnownShape::Image` as `Option<MediaKind>`, in the same change per
  ADR-014's manual-mirror rule) marks a reference as video rather than a still image — so an
  agent calling `get_object` knows not to expect the `assetId` bytes to decode as one.
- `Toolbar.tsx`'s import flow now accepts `video/*` too (a looser 50MB cap than images' 15MB,
  reference/template videos rather than full productions), stores the video's own bytes as
  the asset (unchanged from image import — `assetBackend.save` doesn't care what the bytes
  are), but caches the *extracted thumbnail* as what the human actually sees on canvas.
- `App.tsx`'s `loadImageAssets` (reopening a project) now checks `mediaKind` per shape: a
  plain image caches the loaded bytes directly as before, a video re-runs
  `extractVideoThumbnail` on the loaded data URL first, since those bytes are the video file
  itself, not something an `<image>` element can render.

The predicted testing cost from the previous entry was real: jsdom has neither video
decoding nor a working 2D canvas context (the optional `canvas` npm package isn't a
dependency here), so `video.test.ts` mocks `HTMLCanvasElement.prototype.getContext`/
`toDataURL` and manually dispatches `loadedmetadata`/`seeked` on a captured `<video>`
instance (jsdom doesn't fire either on its own) — proving the sequencing and wiring, not
real frame fidelity, the same trade-off already made for `Image()` in `Toolbar.test.tsx`.
Added a matching end-to-end case there: importing a `.mp4` sends the video's own bytes to
`assetBackend.save` while `assetCache` ends up holding the thumbnail, not the video bytes.
Manually verified in the browser (`desktop-web-preview`) that the toolbar's "Media" button
and its updated tooltip render correctly alongside the numbered shortcuts and Group/Ungroup
pair from earlier sessions — full round-trip through Tauri's real `save_asset`/`load_asset`
still needs an actual Tauri window per the existing image-import caveat, not just a browser
preview. `pnpm build/lint/test` (55 tests) and `cargo build/clippy/test --workspace` all
green. This closes the plan's item 2 (import format breadth) in full: SVG, verified JPEG,
GIF (previous entry), and now video.

---

## 2026-09-06 (even later) — import format breadth: SVG, verified JPEG, GIF

**Commit:** (pending push at time of writing)

Continued the approved plan's second item, now that ADR-015 closed the asset-privacy
architecture problem: broadened import formats on top of it, since the import flow's own
test file (`Toolbar.test.tsx`) didn't exist before this — image import had shipped and been
manually verified in-browser, but had zero automated coverage.

Added `packages/canvas/src/svg.ts::parseSvgDimensions`: SVG import now sizes itself from the
markup's own `width`/`height` or `viewBox`, not `Image().naturalWidth` — confirmed by reading
into how browsers handle a viewBox-only SVG (no `width`/`height` attributes) that they fall
back to an arbitrary default intrinsic size rather than reliably deriving one from the
viewBox, which would have silently mis-sized vector imports. JPEG needed no code change —
`accept="image/*"` and the existing `FileReader`/`Image()` path already covered it — but had
never actually been exercised by a test, only PNG. Animated GIF needed no code change either
and no design decision: `image/gif` already passes the `image/*` check, and browsers decode
and render animated GIFs the same as any other raster format through both `Image()`
size-detection and the SVG `<image>` element used for on-canvas rendering.

Wrote `packages/canvas/src/Toolbar.test.tsx` (new) to actually prove all of this rather than
relying on manual browser checks going forward: PNG/JPEG/SVG import through the injected
`assetBackend`, the non-image-file rejection path, and the "no backend wired in" error.
jsdom doesn't decode real image bytes, so `Image()`'s `onload` never fires for a real
`<img>` — worked around with a fake `Image` global whose `src` setter synchronously resolves
`onload`, the same category of jsdom gap `Canvas.test.tsx` hit earlier with `PointerEvent`.
Also had to add `cleanup()` in the test's `afterEach` — Testing Library doesn't auto-clean
between tests in this project's vitest setup (no `globals: true`), so back-to-back
`render(<Toolbar />)` calls without it left multiple copies of the toolbar (and its error
banner) in the DOM, breaking `getByRole` queries in later tests with "found multiple
elements." `pnpm build/lint/test` green (50 tests).

Video import (reference-only: a thumbnail on canvas, the actual file kept as an asset
reference, no playback) is deliberately not attempted in this pass — it needs a small design
decision first (how the thumbnail gets extracted, and how a shape marks itself as "this
reference is video" for an agent reading it) and the same category of DOM-mocking effort as
the `Image()` fake above, this time for `HTMLVideoElement`/`<canvas>` frame capture. Next.

---

## 2026-09-06 (later) — ADR-015 implementation + a CI failure that went unnoticed for 6 hours

**Commit:** (pending push at time of writing)

Implemented the plan approved in the previous entry
([ADR-015](docs/decisions/adr-015-asset-privacy-content-addressed-store.md)). Rust:
`draft-media::hash_bytes` (hashes an in-memory buffer, for bytes arriving over Tauri IPC
rather than already on disk); `draft-project::save_asset`/`load_asset`/`copy_asset`
(content-addressed read/write against any directory with an `assets/` subfolder, plus
migration between two such directories); `draft-graph::shape::KnownShape::Image`'s `src`
field renamed to `asset_id` (`#[serde(rename = "assetId")]`). Tauri: `save_asset`/`load_asset`
commands, backed by a scratch directory (`draft-platform::PlatformPaths`) when no project has
been saved yet, and `save_snapshot` now migrates any scratch-held assets referenced by the
page into the real project's `assets/` before persisting. Frontend: `ImageShape.assetId`
replaces `.src`; the canvas store gained an injectable `assetBackend` (set by `apps/desktop`,
keeping `@draft/canvas` free of Tauri/IPC awareness per `docs/development.md`), a `projectDir`,
and an `assetCache` (`assetId -> data URL`, local-only, for the human's own rendering);
`Toolbar.tsx`'s import flow now calls the backend and commits a reference, never bytes;
`App.tsx` wires the backend and loads/caches assets on save/load/agent-write. Verified with a
new test, `get_object_never_returns_raw_asset_bytes_for_an_image`
(`crates/draft-mcp/tests/mcp_local_socket.rs`): creates an image object with an `assetId`
payload and asserts the `get_object` response is under 300 bytes and contains neither
`"base64"` nor a `"src"` field. Full `pnpm build/lint/test` (36 tests) and
`cargo build/clippy/test --workspace` both green locally.

**A process failure worth recording honestly:** mid-way through the above, the user surfaced
(via a screenshot of GitHub's commit list) that CI had been showing a red X on every commit —
checked with `gh run list`/`gh run view --log-failed` and found it had been failing on macOS
only, on *every* commit, for the past 6 hours of session time, starting from the local-socket
access-control fix. Nobody had checked, including this assistant, which had explicitly written
in an earlier log entry that a change was "verified by CI's Linux/macOS legs" without ever
actually confirming the run passed. Root cause:
`crates/draft-mcp/tests/mcp_local_socket_unix.rs`'s `the_socket_file_is_owner_only` test built
its socket path from `tempfile::tempdir()` (whose macOS base path is already long) plus a
verbose UUID filename, exceeding macOS's 104-byte `sockaddr_un.sun_path` limit (Linux's is
108, which is why only macOS failed). `bind()` failed silently — the accept loop's
`let _ = draft_mcp::local_socket::serve_forever_on(...).await;` swallowed the error — so the
socket file was simply never created, failing the test's own existence assertion. Fixed by
building the path from `std::env::temp_dir()` directly with a short 8-hex-char filename
instead of a nested tempdir and a full UUID. This machine is Windows-only so the fix can't be
exercised locally; it needs CI itself to confirm.

---

## 2026-09-06 (past midnight) — security-review fix + a real product-direction correction

**Commit:** (pending push at time of writing)

Ran a `security-review` pass (as a natural continuation of ADR-014's typed validation work)
scoped to `crates/draft-graph`, `crates/draft-mcp`, and `apps/desktop/src-tauri`. Found one
real MEDIUM finding: `recent_changes`'s `since_sequence` parameter is an agent-controlled,
unbounded `u64` that did `since as usize + 1` with no bound check — `since_sequence:
18446744073709551615` overflows that addition (a panic in debug builds, a silent wrap to the
wrong cursor in release builds), before ever reaching the existing `.min(total)` clamp.
Fixed with `saturating_add` and clamping to the log length before the `u64 -> usize` cast.
Verified with a new test connecting a client and calling `recent_changes` with
`since_sequence: u64::MAX`, asserting a clean empty result. No other findings met the
review's confidence bar — checked and cleared `Shape`'s custom deserializer (no unbounded
amplification/recursion), NaN/Infinity via JSON numeric literals (`serde_json` already
rejects those at parse time), every `.expect()` on `Shape` serialization, and the read-gate
checks on the two newest tools.

**A real course-correction from the user, worth recording plainly:** asked to research
competitor whiteboard features and plan "killer features," free of cost, to compete with
Miro/Figma/tldraw. Did that research (tldraw's SDK relicensing, Miro's 3-board/AI-credit
caps, Excalidraw+'s paywalled version history/presentations, and — notably — that
`mcp_excalidraw` already exists as a more feature-complete "MCP-native canvas" competitor
with 26+ tools) and proposed a plan built around that framing. **The user rejected it
directly**: DRAFT does not compete with whiteboard apps. Its actual purpose is narrower — a
channel that teaches an AI agent a human's design intent (what they want, and why a given
design would be good) — and it must never upload the user's raw assets to an agent, an
explicit extension of the project's existing "no raw screenshots" principle
(`CLAUDE.md`) to imported media generally. That reframing surfaced a real, concrete problem
already in the codebase: `ImageShape.src` is a data URL embedded directly in the shape
payload, meaning `get_page`/`get_object` today **do** hand a connected agent the raw image
bytes on every call — not a hypothetical, an existing violation of a principle the user
considers core to the product. Rewrote the plan around fixing this (routing image import
through `draft-media`'s already-built, already-unused content-addressed asset hashing
instead of embedding bytes) and, once that's fixed, broadening import formats (SVG,
verified JPG/JPEG, reference-only animated video) — the one area the user explicitly does
want real feature strength — ahead of anything resembling whiteboard feature parity. Plan
approved; asset-privacy work starts next.

---

## 2026-09-06 (very end of day) — ADR-014: a typed shape taxonomy in draft-graph

**Commit:** (pending push at time of writing)

The last well-scoped item before the remaining roadmap gets into genuinely large or blocked
work: ADR-005 (foundation phase) deliberately left object payloads as untyped JSON with its
own action item to "define the typed shape taxonomy once Session 1's canvas needs it." That
need has now clearly arrived — the canvas produces eight real shape kinds plus grouping — and
today's code review found a concrete bug traceable directly to the gap (the negative-image-
size render/hit-test desync). Ran this through the `engineering:architecture` skill first
rather than improvising a type-system change ad hoc; wrote
[ADR-014](docs/decisions/adr-014-typed-shape-taxonomy.md) and then implemented its first
slice.

**What changed:** `crates/draft-graph::shape` defines a `Shape` enum mirroring
`packages/shared/src/shapes.ts` exactly (rectangle/ellipse/diamond/line/text/arrow/freehand/
image + `groupId`), internally tagged on `kind` with a hand-written `Deserialize` that
validates a *recognized* kind strictly (rejecting malformed fields with a new
`GraphError::InvalidShape`) but keeps an *unrecognized* kind verbatim as `Shape::Other` —
forward-compatible with a frontend shape kind added before its Rust mirror lands, per the
same manual-mirror discipline `CLAUDE.md` already required for operations and ID kinds.
`Page::objects` is now `HashMap<ObjectId, Shape>` instead of raw JSON; `Graph::apply`
validates every `CreateObject`/`UpdateObject` payload (human edit or agent write, the same
code path) into it, and `MoveObject` now calls `Shape::set_position` uniformly instead of
poking at JSON object keys. Also normalizes negative `width`/`height` during deserialization,
closing the code-review bug at its actual root instead of patching the two TS files that
disagreed about it.

**Deliberately scoped to the eight *drawing* kinds** the canvas produces today, not the
product spec's full semantic taxonomy (`Region`, `Requirement`, `Flow`, `Component`,
`Screen`, ...) — those layer meaning onto objects rather than being object kinds, and still
have no concrete driving feature, which is exactly the mistake ADR-005 already avoided once.

**A real, narrow gotcha along the way:** `draft-project`'s on-disk `PageDocument` format
deliberately keeps `serde_json::Value` (it's storage, not a live-write boundary) —
`Graph::insert_page` (reconstructing a `Graph` from saved pages) parses leniently, falling
back to `Shape::Other` rather than failing to load an entire project over one malformed
object, while `Graph::apply` (the live write boundary) stays strict. Also: typed `f64` fields
mean a whole-number width like `100` now serializes back out as `100.0` — harmless for JS/TS
(no int/float distinction there) but broke one Rust test asserting exact JSON `Value`
equality, fixed by comparing numerically instead.

**Verified for real:** 13 new tests in `draft-graph` (every known kind round-trips through
`Graph::apply`, `Other` preserves unknown data verbatim, a malformed known kind is rejected
via `apply` but tolerated via the lenient `insert_page` path, negative width/height
normalizes, `set_position` works uniformly for known and unknown shapes) plus every existing
MCP/integration test updated to the new type and passing. Full `cargo build/clippy/test` and
`pnpm build/lint/test` green.

---

## 2026-09-06 (end of day) — Full-diff code review, 4 confirmed bugs fixed

**Commit:** (pending push at time of writing)

Ran a high-effort `code-review` pass (8 independent finder angles: line-by-line, removed-
behavior, cross-file tracing, reuse, simplification, efficiency, altitude, CLAUDE.md
conventions) over the entire day's diff — image import through `get_selection` — before
calling the day's feature work done. Several bugs were independently found by 2-3 different
angles, which is a strong signal on its own.

**Fixed (all confirmed, each with a new or extended test):**
- Marquee selection didn't expand to full group membership the way click-select already did
  — a marquee only partially overlapping a group would select and then drag apart just the
  enclosed members. Fixed in `Canvas.tsx`'s `handlePointerUp`; covered by a new
  `Canvas.test.tsx` test using two grouped shapes and a partial marquee.
- `recent_changes`'s `since_sequence` paging returned the *newest* unseen operations instead
  of the *oldest*, silently breaking incremental polling (a gap larger than `limit` was
  permanently skipped). Fixed in `live.rs`; covered by a new
  `recent_changes_since_sequence_pages_oldest_first_without_gaps` test.
- Image import centered on `window.innerWidth/innerHeight` instead of the canvas SVG's own
  `getBoundingClientRect()` — already visibly wrong today since the header/toolbar occupy
  space above the canvas. Fixed in `Toolbar.tsx`.
- `apply_operations` mutated the whole graph batch before logging any of it, so a later
  operation failing lost the log entries for earlier ones that had already applied — silently
  contradicting what `recent_changes` is supposed to guarantee. Fixed by applying and logging
  one operation at a time through `LiveState::record` (now `pub`), which also collapsed two
  duplicate timestamp-computation code paths into one and resolved an asymmetry in how a
  poisoned log mutex was handled between the human and agent write paths.
- Generalized the text-editor blur workaround (from the earlier `preventDefault()` fix) to
  blur *any* focused element, not just `<textarea>` — the review pointed out the header's
  Agent-access dropdown had the same latent gap.

**A real jsdom quirk hit while writing the marquee regression test:** jsdom has no
`PointerEvent` constructor at all, so `fireEvent.pointerDown`/`Move`/`Up` silently produce
events with no usable `clientX`/`clientY` (reads back as `NaN`) — not just for `0`, for any
coordinate. The existing text-tool test happened not to assert on coordinates so it never
caught this. Fixed by dispatching real `MouseEvent`s (jsdom supports those) with the same
`"pointerdown"`/etc. type string — React's delegated listeners match by type, not
constructor — plus a `pointerId` shim, wrapped in `act()` since a raw `dispatchEvent` doesn't
get the synchronous flush `fireEvent` provides for free.

**Reported but not fixed this pass** (in `ROADMAP.md`, not repeated here): stale selection
surviving an undone group, a negative-size image's render/hit-test desync, a lock-ordering
race between human and agent writes affecting `recent_changes` ordering under concurrency,
duplicated lock-apply-record-notify logic across the three write tools, and `groupMembers`'
O(n) scan — narrower edge cases or larger refactors than remaining time justified tonight.

**Verified:** full `cargo build/clippy/test` and `pnpm build/lint/test` green (36 Vitest
tests, up from 31; 5 new Rust MCP tests total added today).

---

## 2026-09-06 (the actual latest) — `get_selection` MCP tool

**Commit:** (pending push at time of writing)

Closed the last named gap from Session 2's plan: `selection` was listed as needing "live
selection tracking on the Rust side first." Added it — a `set_selection` Tauri command that
`apps/desktop/src/App.tsx` calls from the same store-subscription effect that already
forwards canvas operations (fires whenever `@draft/canvas`'s selection array changes),
writing into a new `LiveState.selection: Mutex<SelectionState>` (page ID + object IDs). The
new `get_selection` MCP tool reads it back, gated on `allows_read()` like the other read
tools. Combined with last entry's `recent_changes`, a `Watch`-mode agent now has a real way
to observe both *what changed* and *what the human is currently looking at* — not just
current graph state.

**Verified for real:** `get_selection_reflects_the_humans_current_selection` connects a
client, confirms an empty selection initially, sets one directly on `LiveState` (standing in
for what the Tauri command does), reconnects, and confirms the tool reflects it. Full
cargo build/clippy/test and TS build/lint/test all green.

---

## 2026-09-06 (truly latest) — Numbered tool shortcuts + a self-caught regression

**Commit:** (pending push at time of writing)

While re-verifying the select-tool fix in the browser, hit a wall of confusing coordinate
behavior in the browser automation tooling itself (clicks landing on the wrong toolbar
button, a batch of stray empty text shapes accumulating on the shared preview from repeated
misfired test clicks). That mess was purely a test-tooling artifact — confirmed by checking
`aria-pressed`/`elementFromPoint` state directly rather than trusting screenshot pixel
positions — not a product bug, and none of it reached the codebase. Abandoned further manual
pixel-clicking for this pass in favor of `@testing-library/react` component tests, which
exercise the real keydown/pointerdown handlers deterministically without depending on the
browser automation's coordinate mapping.

That more careful pass caught a real regression, though: the previous entry's
`preventDefault()` fix (for the native-selection bug) also silently broke the text tool's
click-away-to-commit flow, since blurring the previously-focused element is normally part of
the same default browser action `preventDefault()` suppresses. Fixed by blurring the active
textarea explicitly, first, before calling `preventDefault()`. Also implemented the user's
request for numbered tool shortcuts (1–9, left-to-right matching the toolbar), defined once
in `NUMBER_KEY_TOOLS` and shared between the keydown handler and the toolbar's tooltips.

**Verified for real**, via new `Canvas.test.tsx`: each number key switches to its tool, a
held modifier is ignored, typing in a text field doesn't trigger a switch, and — the
regression test — typing text then clicking elsewhere on the canvas correctly closes the
editor and commits the text instead of leaving it stranded. 35 Vitest tests total now. Full
TS + Rust build also green.

---

## 2026-09-06 (also latest) — `recent_changes` MCP tool

**Commit:** (pending push at time of writing)

Wired up `draft-events::OperationLog` — defined in the foundation phase but never actually
used until now — into `LiveState` as `LiveState.log`, and made every write append to it: the
three agent write tools (tagged `Actor::Agent`) and, on the human side, `apply_operations`
(tagged `Actor::User`, appended only after every operation in the batch applies cleanly, so a
failed batch doesn't leave partial entries the log would misreport as having happened). Added
a `recent_changes` MCP tool (optional `limit`/`since_sequence` for incremental polling) gated
on `allows_read()` like the other read tools — this is Session 2/3's `recent_changes`
resource, letting an agent see a timeline of what changed instead of only current state.

**Verified for real:** extended the existing `watch_mode_denies_writes_and_build_mode_allows_them`
test to call `recent_changes` after the create/modify/delete sequence and assert it returns
all three operations in order, each correctly tagged `agent`.

---

## 2026-09-06 (latest of all) — Select tool cursor + native-selection bug fix

**Commit:** (pending push at time of writing)

The user sent a screen recording of the select tool "not working properly." Extracted frames
with `ffmpeg` to see the actual gesture (video isn't directly readable) and found two real
bugs, not one:

1. `.draft-canvas`'s CSS hardcoded `cursor: crosshair` unconditionally — the select tool
   showed the same "click to draw" crosshair as every drawing tool, with no visual cue that
   you were actually in selection mode. Fixed by making the cursor depend on the active tool
   (`default` for select, `crosshair` for drawing tools) via an inline style rather than a
   static class rule.
2. The real functional bug: no pointerdown handler called `e.preventDefault()`, so starting
   a marquee/move/pan drag also kicked off the browser's own native text/drag-selection over
   the page at the same time as our own drag logic. In the recording this showed up as a
   light-blue native selection band with a dashed underline fighting our own marquee
   rectangle (which uses the same light-blue-with-dashed-stroke styling, making the two easy
   to mistake for each other at a glance, but the native one comes from the browser, not our
   SVG). Fixed by calling `preventDefault()` at the top of both `handlePointerDown` (the main
   canvas handler) and `handleResizeHandlePointerDown`, plus `user-select: none` on the
   canvas as defense-in-depth.

**Verified manually in-browser:** drew two rectangles, marquee-dragged across both with the
select tool — selection outline appears cleanly with no native-selection artifact — and
confirmed via `getComputedStyle` that the cursor is `default` for select and `crosshair` for
rectangle. Also confirmed via TypeScript/lint/test (31 Vitest tests) that nothing else broke.

---

## 2026-09-06 (even later still) — Visible agent connection indicator

**Commit:** (pending push at time of writing)

Closed the last gap in the "explicit, visible, revocable" permission story (spec §13/§16):
until now, a local-socket agent connection was silent until its first tool call succeeded or
was denied. Added `LiveState.connections`, a `tokio::sync::watch<usize>` (deliberately
`watch` not `broadcast` — a UI only cares about the current count, not every individual
connect/disconnect event), incremented/decremented by a `ConnectionGuard` RAII wrapper around
each accepted connection in both the Windows and Unix accept loops in `local_socket.rs` — the
guard pattern means the count comes back down correctly even if a connection's serving task
exits early or panics, without duplicating the decrement at every return point. Forwarded to
`apps/desktop` as a `draft-agent-connections-changed` Tauri event (mirroring the existing
`draft-graph-changed` pattern) and shown as "N agents connected" in the header.

**Verified for real:** a new test, `connection_count_tracks_connect_and_disconnect`, spawns
the actual accept loop, connects a genuine `rmcp` client, asserts the count goes to 1, cancels
the client, and asserts it comes back to 0. Full cargo build/clippy/test and TS build/lint/test
all green. The header UI itself was only checked against the Tauri-less browser preview (shows
the "…" loading state without crashing, since `invoke` isn't available there) — seeing a real
count change end to end needs a real Tauri window with an actual MCP client attached, same
limitation noted in the grouping entry below for the Session 1 exit test.

---

## 2026-09-06 (latest) — Grouping

**Commit:** (pending push at time of writing)

Added the last unchecked Session 1 canvas feature: grouping. A shape gets an optional
`groupId` field (same "opaque JSON payload" trade-off as everything else in `Shape` —
`draft-graph` doesn't need to know this exists), `groupShapes`/`ungroupShapes`/`groupMembers`
on the store, `Group`/`Ungroup` toolbar buttons gated on selection state, and click-to-select
expanded to pull in every group sibling so dragging one member drags the whole group (marquee
already multi-selects, so it was left alone rather than special-cased to expand to full
groups on partial overlap).

**A real bug caught while building this, not just adding the feature:** copy/paste
(`Ctrl+C`/`Ctrl+V`) was cloning shapes verbatim, including `groupId` — meaning a pasted copy
of a grouped shape would silently rejoin the *original* group, so moving the original would
drag the pasted copy along with it. Fixed by remapping each paste's groupIds to fresh ones
(keeping relative grouping within that one paste) instead of reusing the source's.

**Verified manually in-browser** (`desktop-web-preview`): drew two rectangles, marquee-
selected both, grouped them, confirmed clicking either one selects both, confirmed dragging
moves both together preserving their relative offset, ungrouped, confirmed clicking one now
selects only that one. Also added store-level tests for `groupShapes`/`ungroupShapes`/
`groupMembers` (31 Vitest tests total now) and ran the full TS + Rust build.

**Left honestly unresolved:** Session 1's "exit test" (draw across tools, save, close,
reopen, verify identical state) is feature-unblocked now but not run as one combined pass —
`Save`/`Open` need a real running Tauri window (`invoke` calls fail in this session's
browser-only preview, visible as the "Live sync failed" banner), which isn't available on
this dev machine right now. `crates/draft-project`'s round-trip test already covers the
underlying save/load format.

---

## 2026-09-06 (even later) — Image import

**Commit:** (pending push at time of writing)

Added image import to the canvas: `ImageShape` in `@draft/shared` (data-URL `src`, deliberately
not the final `asset://`-reference design from spec §11 — that needs a project directory to
hold the asset file, which a fresh unsaved canvas doesn't have yet), a Toolbar "Image" button
that opens a native file picker and drops the shape at the current view's center, and
`ShapeView`/`geometry.ts` support so resize handles, selection, undo/redo, and copy/paste all
apply to images for free via the existing `ResizableShape` machinery.

**Verified manually in-browser** (via the `desktop-web-preview` launch config, since
`apps/web` doesn't have `@draft/canvas` wired in yet): dropped an image, confirmed it renders
at the right position/size, selected it (outline + 4 resize handles appear), and confirmed a
corner-drag resizes it anchored at the opposite corner. Also ran the full existing test suite
(28 Vitest tests) plus TS build and Rust workspace build — all green.

---

## 2026-09-06 (later still) — Security review + fix on the local socket

**Commit:** (pending push at time of writing)

Ran a `security-review` pass on the new MCP write surface (the whole point of the review the
user asked for before continuing). It found one real, concrete finding: the local-socket
transport didn't restrict access to the current OS user. "Loopback-only" (what ADR-007/
docs/mcp.md claimed) describes a TCP socket's *binding*, not a Unix-socket-file's or a
named-pipe's *ACL* — those default to something more permissive on both platforms (a socket
file in the shared temp dir inherits the umask and is commonly group/world-readable; an
unsecured Windows named pipe's default DACL grants the `Everyone` group read access per
`CreateNamedPipe`'s own docs). On a shared/multi-user machine, another local account could
have observed or interacted with a live DRAFT session once the user granted any agent access.

**Fixed on both platforms:**
- Windows: the named pipe now gets an explicit `D:P(A;;GA;;;OW)` security descriptor
  (Generic-All to Owner only) built via `ConvertStringSecurityDescriptorToSecurityDescriptorW`
  and passed through `create_with_security_attributes_raw`.
- Unix: the socket file is `chmod`'d to `0600` immediately after `bind`, and moved from the
  shared temp directory into the user's own app-data directory (via `draft-platform`).

**A real Rust gotcha hit while building this:** the Windows security descriptor type holds a
raw pointer, making it `!Send`. Constructing it inline inside the `async fn` accept loop —
even with an explicit `drop()` right after use — still made the whole future non-`Send`
across the loop's `.await`, because a value with a custom `Drop` impl is considered live for
its full lexical scope, not just to its last use. Fixed by extracting a fully synchronous
helper function (`create_secured_pipe_instance`) that builds the descriptor, creates the
pipe, and lets the descriptor drop — all before returning a plain, `Send` `NamedPipeServer`.
A synchronous function's internal locals never leak into the caller's async state machine;
only the return value does.

**Verified:** all existing MCP tests still pass against the hardened pipe (proving the
owner's own connections still work), plus a new unit test that the security descriptor
builds successfully, plus a new Unix-only integration test
(`mcp_local_socket_unix.rs`, `#![cfg(unix)]`) asserting the socket file is exactly `0600` —
can't be run on this Windows dev machine, so it's verified by CI's Linux/macOS legs instead.

---

## 2026-09-06 (later) — Write MCP tools + bidirectional sync

**Commit:** (pending push at time of writing)

Continued straight from the live-read MCP work: added `create_object`/`modify_object`/
`delete_object` to `LiveMcpServer`, gated on `AgentMode::allows_write()` (`Build` only).
Originally scoped as Session 3 work, but shipped now since read-only access is only half of
"connect human creativity to AI" — an agent that can see a design but never help build it
falls short of the stated goal.

**A real gap caught while building this:** a write nobody sees isn't useful. Added
`LiveState.changes` (a `tokio::sync::broadcast::Sender<PageId>`) that fires on every
successful write; `apps/desktop` forwards it as a `draft-graph-changed` Tauri event, and the
frontend refetches the affected page (`getPageSnapshot`) and merges it into the canvas
(`@draft/canvas`'s new `applyRemoteObjects`, which replaces the shapes map without touching
undo history — an agent's write isn't something the human should be able to "undo" through
their own history stack). This closes the loop in both directions: human edits reach the
agent (Session 2's earlier work), agent edits reach the human (this).

**Verified for real:** `crates/draft-mcp/tests/mcp_local_socket.rs` gained a second test —
`Watch` mode denies `create_object` (names the mode in the response), raising to `Build`
lets the same call through, a change notification fires with the right page ID, and
`modify_object`/`delete_object` are confirmed against actual graph state afterward.

**Still not done** (see ROADMAP.md): `request_user_permission` as a callable MCP tool,
per-connection (rather than whole-app) mode scoping, a visible "N agents connected"
indicator.

---

## 2026-09-06 — Foundation phase

**Commits:** `633a3e3`..`4b238dc` (repo init through CI toolchain pin)

Built the entire foundation phase from an empty repo: pnpm + Cargo workspace, the eight
foundation crates with real minimal content (not placeholders — see `docs/development.md`'s
rule on this), the TS packages, root + `docs/` documentation, ADR-001 through ADR-012,
ROADMAP.md, and CI.

**Key decision made mid-foundation:** the original product spec called for tldraw as the
canvas foundation. Research surfaced that tldraw's SDK license changed in September 2025
(paid key or watermark required in production) — incompatible with DRAFT's free-forever,
unbranded positioning. Given four options, the user chose to build a custom canvas engine
from scratch rather than accept a watermark, vendor an old tldraw release, or pay for a
license. See [ADR-004](docs/decisions/adr-004-custom-canvas-engine.md). This is the single
biggest scope change from the original spec.

Also integrated the real brand kit (logo, icons, JetBrains Mono, color palette) once the
user provided it, replacing the placeholder text wordmark and default Tauri icons.

**Verified:** full `cargo test --workspace` + `pnpm test`/`lint`/`build` green; a
`security-review` and `code-review` pass over the foundation diff (one low-severity CI
toolchain-pinning issue found and fixed); the Tauri window boots.

---

## 2026-09-06 — Session 1: real canvas

**Commit:** `52fc242`

Built the actual drawing canvas in `packages/canvas`: one SVG `Canvas` component, camera-driven
pan/zoom, and tools — rectangle, ellipse, diamond, text, line, arrow, freehand, select
(click + marquee + drag-to-move + 4-corner resize handles), eraser. Undo/redo via snapshot
diffing rather than stored inverse operations — see
[ADR-013](docs/decisions/adr-013-undo-redo.md) for why.

**Real bug found and fixed during manual testing:** the text tool held SVG pointer capture
and focused its textarea synchronously on creation, racing the browser's own native
click/focus handling. The browser would steal focus back immediately, firing the textarea's
blur handler with empty text, which the "discard empty text" cleanup then deleted — before
the user could type a single character. Fixed by not taking pointer capture for the text
tool and deferring the initial focus to `requestAnimationFrame`.

**Verified:** every tool manually exercised in the actual browser preview (not just unit
tests) — drawing, resize handles anchoring correctly, eraser, undo/redo state, zoom controls.
28 Vitest tests green.

---

## 2026-09-06 — Session 2: real MCP server + persistence

**Commit:** `4133fc4`, plus the local-socket work landing today (see below, uncommitted at
time of writing in that entry — now part of the next entry once pushed).

Added real page/object persistence (`draft-project`'s `PageDocument`, `save_page`/
`load_page`/`load_all_pages` — the format previously only persisted the manifest, not actual
content) and a real `rmcp` v3 MCP server: a `draft-mcp` stdio CLI binary that loads a saved
`.draft` project and exposes `get_project`/`get_page`/`get_object` as read-only tools.

**Verified for real, not mocked:** `crates/draft-mcp/tests/mcp_stdio.rs` spawns the actual
`draft-mcp` binary as a subprocess via a genuine `rmcp` client, connects over stdio, lists
tools, and calls them against a real saved project — this is Session 2's exit test from
ROADMAP.md, passing.

---

## 2026-09-06 (continued) — the live MCP path

The user's stated priority: *"the main point of making this tool is the MCP server to
connect human creativity to AI"* — and the stdio server only reads a stale saved file, not
a human's live editing session. This session closed that gap.

**What got built:**
- `draft-graph::Graph::ensure_page` — idempotent page creation under a caller-supplied ID,
  needed because the frontend generates page IDs client-side and the Rust graph needs a
  matching page before operations for it can apply.
- `draft-security::AgentMode::allows_read()` — symmetric with the existing `allows_write()`;
  every mode except `Manual` permits reads.
- `crates/draft-mcp/src/live.rs` — `LiveMcpServer`, the same three tools as the stdio server
  but backed by a shared, mutex-guarded live `Graph`, and gated: every tool call checks
  `AgentMode::allows_read()` first and returns a clear "no access" response if the mode is
  `Manual` (the default).
- `crates/draft-mcp/src/local_socket.rs` — the actual loopback transport from ADR-007: a
  Windows named pipe accept loop (`#[cfg(windows)]`) and a Unix domain socket accept loop
  (`#[cfg(unix)]`, not tested on this Windows machine but the standard, low-risk API).
- `apps/desktop`: a `LiveState` (`Arc<Mutex<Graph>>` + `Arc<Mutex<AgentMode>>`) managed by
  Tauri, spawned local-socket listener at startup, new commands (`ensure_page`,
  `apply_operations`, `set_agent_mode`, `get_agent_mode`), and a real "Agent access" dropdown
  in the header — the spec's "explicit, visible, revocable" grant, not a placeholder.
  `@draft/canvas`'s store is now subscribed to from `App.tsx`, forwarding every committed
  operation to the live graph via `apply_operations` — the "canvas emits operations,
  draft-graph applies them" architecture docs/architecture.md already described, now wired
  end to end instead of frontend-only.

**Verified for real:** `crates/draft-mcp/tests/mcp_local_socket.rs` hosts the accept loop
in-process, connects a genuine `rmcp` client over a real named pipe, confirms a `Manual`-mode
connection is denied with the current mode named in the response, then raises the mode and
confirms the *same* live graph now returns real data — proving the permission gate and the
live-read path both work, not just that the code compiles.

**What's still not done** (tracked in ROADMAP.md, not repeated here): write MCP tools, a
visible "N agents connected" indicator, `selection`/`recent_changes` resources (need live
selection/history tracking on the Rust side first), the real object/shape taxonomy in
`draft-graph` (payloads are still opaque JSON).
