# Roadmap

Status markers: `[ ]` Planned · `[~]` In progress · `[x]` Complete · `[!]` Blocked.
A feature is only marked `[x]` once it has a passing test or a real, verified check behind
it — not just because code exists. See [docs/testing.md](docs/testing.md) for what
"verified" means at each layer.

## Known issues / blocked

- [x] ~~`pnpm --filter @draft/desktop tauri build` reliably crashes rustc~~ — **root-caused
  and fixed 2026-09-07.** It was never the code, and never actually the root `Cargo.toml`'s
  `[profile.release]` (`lto = true` + `codegen-units = 1`) either, despite that being the
  first suspect — it was a corrupted `target/release` directory. The first crash (from an
  unrelated cause, likely transient) left partial/incoherent incremental-build artifacts
  behind; every retry after that then crashed too, with a *different* signature each time
  (`STATUS_ACCESS_VIOLATION`, `STATUS_STACK_BUFFER_OVERRUN`, `STATUS_ILLEGAL_INSTRUCTION`, on
  different crates each attempt — including `memchr`, which is far too simple to have a real
  LLVM bug in it, the tell that this was never a code/toolchain issue). Fix: `rm -rf
  target/release` before retrying a release build that just crashed — don't retry against a
  possibly-corrupted cache. A clean build with the original, unmodified profile settings
  succeeded in 4m44s, producing both an MSI and an NSIS installer. **If a release build ever
  crashes again, wipe `target/release` first, then retry once before assuming it's a real
  regression.**

## Foundation phase (pre-Session-1)

Repository, architecture, and documentation groundwork (product spec §35), ahead of the
four implementation sessions below.

- [x] pnpm + Cargo workspace, Biome lint/format
- [x] Eight foundation crates (`draft-core`, `draft-security`, `draft-platform`,
  `draft-events`, `draft-graph`, `draft-media`, `draft-project`, `draft-mcp`), each with
  real minimal content and passing tests
- [x] `@draft/shared`, `@draft/ui`, `@draft/canvas` (camera math), `@draft/project-client`
- [x] Tauri 2 + React desktop shell, booting and round-tripping one IPC call
- [x] Minimal web shell (`apps/web`)
- [x] Root + `docs/` documentation set, ADR-001 through ADR-012
- [x] `security-review` pass on the foundation-stage code (no findings — no real attack
  surface exists yet at this stage)
- [x] CI workflow (Windows/Linux/macOS matrix) — all three green
- [x] Full local verification pass (build + test + lint, Rust and TS, all green together)
- [x] The Tauri window boots (`pnpm dev`): clean Rust + Vite build, the process launches,
  runs, responds, and holds a valid, non-minimized window handle. A pixel screenshot of the
  native window wasn't obtainable in this environment (the automation session's screen
  capture shows a different display/session than where the native window renders) — verified
  via process/window-API state instead of a visual capture; worth a human glance on a real
  machine before calling this fully done.
- [x] Real brand kit integrated (logo, icons, colors, JetBrains Mono typography) —
  replaces the placeholder text wordmark and default Tauri icons; see
  `assets/brand/README.md`
- [x] `code-review` pass over the complete foundation diff (one low-severity finding —
  CI's floating Rust toolchain — found and fixed)
- [x] `CLAUDE.md` generated from the real repository structure

## V1

### Session 1 — Foundation + Canvas

- [x] Freehand drawing, shapes (rectangle/ellipse/diamond), text, line, arrow — one SVG
  `Canvas` component in `@draft/canvas` driving the camera engine, tool state machine keyed
  on the active tool
- [x] Fill color for rectangle/ellipse/diamond — a `#rrggbb` hex string on the shape itself
  (`ImageShape`'s sibling optional field, same absent-means-transparent convention as every
  other optional field here), mirrored into `crates/draft-graph::shape::KnownShape`'s three
  variants in the same change per ADR-014's manual-mirror rule, with a hex-format validation
  at the same point a malformed known-kind payload is already rejected (`fill: "red"` fails
  the same way a missing required field would). New `FillPicker.tsx`: a small popover (not a
  general properties/inspector panel — deliberately out of scope) shown near a single
  selected fill-capable shape's top-right corner, 8 preset swatches plus a native
  `<input type="color">` for anything else, a "None" option to clear it. Since `fill` crosses
  the same typed `Shape`/MCP boundary every other field does, an agent can already see it via
  `get_object` — genuinely useful design-intent signal, not raw asset data, so no new ADR-015-
  style privacy concern. Verified for real: a Rust round-trip test (present/absent/malformed),
  a `FillPicker` component test (swatch click, "None", custom picker all call `updateShape`
  correctly, one click = one undo step), and a `ShapeView` render test asserting the SVG
  `fill` attribute reflects the shape's value across all three fillable kinds.
- [x] Selection (click + marquee), move-by-drag, resize handles on resizable shapes
  (rectangle/ellipse/diamond) — grouping not yet implemented
- [x] Two real bugs found and fixed from a user-supplied screen recording of the select
  tool "not working properly": (1) `.draft-canvas` hardcoded `cursor: crosshair` regardless
  of the active tool, so the select tool visually looked like a drawing tool was still
  armed — now the cursor is `default` for select and `crosshair` for every drawing tool. (2)
  no drag-initiating pointerdown handler called `e.preventDefault()`, so a marquee/move/pan
  drag also kicked off the browser's own native text/drag-selection over the page — visible
  in the recording as a stray light-blue selection band fighting the marquee rectangle for
  the same drag. Fixed by calling `preventDefault()` at the top of both pointerdown handlers
  and adding `user-select: none` to the canvas as defense-in-depth. Verified manually
  in-browser: marquee-selecting two shapes now shows only the intended selection outline,
  no native selection artifact.
- [x] Caught and fixed a regression from that same `preventDefault()` fix before it shipped:
  `preventDefault()` on pointerdown also suppresses the browser's default "blur the
  currently-focused element" behavior, which the text tool's click-away-to-commit flow
  depended on implicitly — so a text box could no longer be finished by clicking elsewhere.
  Fixed by blurring the active `<textarea>` ourselves (if any) *before* calling
  `preventDefault()`, so committing text no longer depends on that default action. Verified
  with a real test (`Canvas.test.tsx`, `text tool click-away commit`) that types into a text
  box, clicks elsewhere on the canvas, and asserts the editor closes and the text commits.
- [x] Number-key tool shortcuts (1–9, matching the toolbar's left-to-right order: Select,
  Rect, Ellipse, Diamond, Text, Line, Arrow, Draw, Eraser — `Image` isn't included since it
  opens a file picker rather than arming a persistent mode), defined once in
  `NUMBER_KEY_TOOLS` (`store.ts`) and consumed by both `Canvas.tsx`'s keydown handler and
  `Toolbar.tsx`'s button tooltips, so there's one source of truth instead of two lists that
  could drift. Lives in `@draft/canvas`, so it's already live on desktop and will apply to
  `apps/web` automatically once that app is wired up to the shared canvas (still open, see
  Session 3). Verified with real tests: each key switches to its tool, a held modifier
  (Ctrl/Cmd/Alt) is ignored, and typing in a text field doesn't trigger a switch.
- [x] Illustrator/Photoshop-style letter shortcuts (V/R/O/T/L/A/P/E), additive alongside the
  number keys above — `LETTER_KEY_TOOLS` (`store.ts`) mirrors `NUMBER_KEY_TOOLS`'s structure
  exactly, reusing the same modifier/editable-target guards in `Canvas.tsx`'s keydown handler
  rather than duplicating them. Diamond has no real Illustrator equivalent, so it stays
  number-only (`4`). Toolbar tooltips show both (e.g. "Select (V / 1)"). Verified with the
  same test shape as the number-key suite: each letter switches its tool, case-insensitively,
  ignoring a held modifier or typing in a text field.
- [x] Text tool bug: creating a second text box while the tool was still armed (not switching
  to Select first) could clone/cross-contaminate the first box's typed content into the
  second — `TextEditor` (`Canvas.tsx`) was mounted with no `key`, so when both the outgoing
  shape's commit and the incoming shape's creation batched into one React update,
  `editingTextId` never went truthy → falsy → truthy in a way that actually unmounted the old
  editor; React reused the same uncontrolled `<textarea>` DOM node across two unrelated
  shapes, and its stale value (from `defaultValue`, which only applies at mount) leaked into
  the next shape. Fixed with `key={editingTextId}`, forcing a real remount per edited shape.
  Verified with a regression test asserting the fix by checking the *mechanism*, not just the
  end state: confirmed to fail without the fix (textarea reads the stale value) and pass with
  it (fresh, empty textarea for the new shape).
- [x] Eraser tool (click or drag over shapes to delete)
- [x] Zoom (wheel zoom-to-cursor, toolbar +/-/reset with a live %, Ctrl+=/Ctrl+-/Ctrl+0),
  pan (middle-mouse-drag, works regardless of active tool — no separate Pan tool needed)
- [x] Undo/redo via snapshot diffing ([ADR-013](docs/decisions/adr-013-undo-redo.md)), wired to
  toolbar buttons and Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y
- [x] Inline text editing (a real `foreignObject`/`textarea` editor, not a `prompt()` shim) —
  fixed a real bug here: holding SVG pointer capture into the text tool's gesture raced the
  textarea's `focus()` against the browser's native click handling, causing an instant blur
  that (via the "discard empty text" cleanup) deleted the shape before typing could happen;
  fixed by skipping pointer capture for the text tool and deferring focus a frame
- [x] Pages persisted through `draft-project`/`draft-graph`: `PageDocument` +
  `save_page`/`load_page`/`load_all_pages`, Tauri `save_snapshot`/`load_snapshot` commands,
  a Save/Open UI in `apps/desktop` — real round-trip, not just an in-memory store
- [x] Copy/paste: Ctrl+C/Ctrl+V for the current selection, in-memory (not the OS clipboard),
  offsets each successive paste diagonally so repeats don't stack exactly on top of each
  other — verified manually in-browser
- [x] Image import onto the canvas: an "Image" toolbar button opens a native file picker,
  reads the file via `FileReader.readAsDataURL`, and drops an `ImageShape` at the current
  view's center (large images capped at 400px on their long edge, smaller images keep native
  size). Resize handles, selection, undo/redo, and copy/paste all apply for free since image
  reuses the existing `ResizableShape`/bounds machinery. Video import not attempted — no
  in-canvas video playback exists to import into. Validates file type and a 15MB size cap
  before ever reading the file, surfaces read/decode failures as a visible toolbar error
  (not just a silent no-op) plus a `console.error`, and logs (rather than hides) the fallback
  when natural image-size detection fails.
- [x] Asset privacy: imported images no longer embed a data URL in the shape payload —
  [ADR-015](docs/decisions/adr-015-asset-privacy-content-addressed-store.md). `ImageShape.src`
  became `ImageShape.assetId`, a content-addressed (SHA-256) filename reference written via
  `draft-media`/`draft-project`'s new `save_asset`/`load_asset`/`copy_asset`, exposed to the
  frontend as Tauri commands. Import always writes through this path immediately — even
  before a project's first save, via a scratch asset directory
  (`draft-platform::PlatformPaths`) — that `save_snapshot` migrates into the real project's
  `assets/` on save, so an agent with live read access never sees raw image bytes at any
  point, not just after the human happens to save. `@draft/canvas` stays host-agnostic: the
  store takes an injectable `assetBackend`, set by `apps/desktop`, rather than importing
  `@draft/project-client` directly. Verified for real:
  `get_object_never_returns_raw_asset_bytes_for_an_image` in
  `crates/draft-mcp/tests/mcp_local_socket.rs` asserts the MCP response for an image object
  is small and contains neither `"base64"` nor a `"src"` field, only the `assetId` reference.
- [x] Import format breadth, on top of the now-fixed asset-reference architecture (the one
  area the user explicitly wants real feature strength — see
  [ADR-015](docs/decisions/adr-015-asset-privacy-content-addressed-store.md)'s plan):
  - **SVG (vector)**: sized from the SVG markup's own `width`/`height` or `viewBox`
    (`packages/canvas/src/svg.ts::parseSvgDimensions`), not from `Image().naturalWidth` —
    browsers don't reliably derive an intrinsic size from a viewBox-only SVG, so that path
    would silently mis-size vector imports. Stored through the same asset-reference path as
    raster images; no separate MCP/graph representation needed. Verified with 9 unit tests
    covering explicit dimensions, unit-suffixed dimensions, viewBox fallback, percentage
    dimensions falling back to viewBox, malformed/non-SVG/non-numeric input.
  - **JPG/JPEG**: was already accepted by the existing `accept="image/*"` picker but had zero
    test coverage (only PNG was ever exercised) — added a real import test.
  - **Animated GIF**: already works with no code change — `image/gif` passes the existing
    `image/*` type check and both `<img>`/`Image()` natural-size detection and the SVG
    `<image href="data:...">` renderer handle animated GIFs the same as any other raster
    format, so it needed verifying, not building.
  - Verified for real: `packages/canvas/src/Toolbar.test.tsx` (new — the import flow had no
    test file before this) covers PNG/JPEG/SVG import through the injected `assetBackend`,
    a rejected non-image file, and the "no backend wired in" error path, using a fake
    `Image` global since jsdom never decodes real image bytes.
- [x] Video import onto the canvas — reference-only, per ADR-015's plan: a thumbnail frame
  shown on canvas, the actual video file kept as a full-fidelity asset reference, no in-canvas
  playback. `packages/canvas/src/video.ts::extractVideoThumbnail` drives an offscreen
  `<video>`/`<canvas>` pair (seek to a small time offset once metadata loads, draw the seeked
  frame, read it back as a PNG data URL) and works from either a fresh `File` (import) or an
  already-loaded data URL (reopening a project — `App.tsx`'s `loadImageAssets` re-derives the
  thumbnail after `loadAsset` returns the video's own bytes, since those aren't something an
  `<image>` element can render directly). The toolbar's "Media" button now accepts
  `video/*` alongside `image/*`, at a looser 50MB cap than the 15MB image limit (a reference/
  template video, not a full production). A new `ImageShape.mediaKind?: "video"` field (mirrored
  in `draft-graph::shape::KnownShape::Image` as `Option<MediaKind>`, per ADR-014's manual-mirror
  rule) marks the reference as a video so an agent reading it via `get_object` knows not to
  expect the bytes to decode as a still image. Verified for real: `video.test.ts` (7 tests)
  drives the video/canvas sequencing with mocked `getContext`/`toDataURL` (jsdom has neither
  real video decoding nor a 2D canvas context without the optional `canvas` package), and
  `Toolbar.test.tsx` gained end-to-end import tests asserting the video's own bytes reach
  `assetBackend.save` while the cached, human-visible asset is the extracted thumbnail.
  A follow-up `code-review` pass (8 finder angles) over this feature found and fixed 5
  confirmed bugs before it was considered done: `extractVideoThumbnail` could hang forever
  with no timeout when a zero/NaN-duration clip made the seek target equal the video's
  already-current time (no-op seeks never fire `seeked`); `apps/desktop/src-tauri`'s
  `mime_for_extension` had no video branch at all, so a reopened video was rebuilt as
  `application/octet-stream` and silently failed to re-thumbnail on every save/reload;
  a zero-dimension decoded frame (audio-only file mislabeled `video/*`) produced an
  invisible 1×1 shape with no error instead of a clear failure; `isVideoFile` had no
  filename-extension fallback the way `isSvgFile` does, rejecting legitimate videos with
  an empty/unrecognized MIME type; and a thumbnail-extraction failure aborted the whole
  import instead of degrading to a placeholder size the way an undecodable image already
  does. Two lower-severity findings (no visual video/image distinction on canvas, and
  `mediaKind` as an optional field rather than a first-class reference-asset shape kind)
  were deliberately not fixed this pass — the first is UI polish (deferred per the
  standing instruction to hold visual work until just before the final audit), the second
  is a defensible architectural choice consistent with ADR-014's explicit scoping of the
  typed taxonomy to drawing kinds only, revisit if a second non-image reference type
  actually needs it.
- [x] Real bugs found by actually running the desktop app (not just the browser preview) and
  testing it — the first time this session the real Tauri window, not the Vite dev-server
  preview, surfaced a bug the preview couldn't: a real user's report ("text tool doesn't
  work, only a box appears") is exactly the class of thing ROADMAP's earlier entries already
  flagged the browser preview can't validate (every Tauri `invoke` fails there). Three issues
  reported at once, investigated and two fixed:
  - **Text tool not receiving keystrokes.** `TextEditor`'s focus-on-mount had already been
    patched twice this session for real timing races against the browser's own native
    click/focus handling (deferred a frame via `requestAnimationFrame`); a single rAF still
    wasn't reliably enough in the real desktop WebView. Fixed by retrying the focus for up to
    10 frames, verifying `document.activeElement` actually landed on the textarea each time,
    instead of assuming one frame is always enough.
  - **"Live sync failed: object ... does not exist."** `apps/desktop/src/App.tsx`'s canvas→
    live-graph sync fired `ensurePage`/`applyOperations` as independent, un-awaited Tauri IPC
    calls with no ordering guarantee between them — a quick draw immediately followed by
    another action (e.g. Ctrl+Z) could have its two operations reach the Rust graph out of
    order, rejecting the later-arriving-but-earlier-generated one with `UnknownObject`. Fixed
    by chaining every `ensurePage`/`applyOperations` call through one promise queue, so they
    always land in the same order they were generated in.
  - **"N agents connected" showing a stale, too-high count.** Investigated and traced to
    `pnpm tauri dev`'s file-watcher restarting the whole process repeatedly during a
    Rust-file-heavy session (7+ commits touching `crates/`/`apps/desktop/src-tauri` in one
    sitting) — `crates/draft-mcp/src/local_socket.rs`'s connection-count accept loop itself
    checked out clean (each process's counter starts at 0, RAII-guarded, no double-spawn path
    in `apps/desktop/src-tauri`'s `setup` hook). Not a code defect found; treated as a
    dev-mode artifact from repeated restarts rather than "fixed."
- [x] Toolbar redesign: grouped into three floating "islands" (draw tools / content
  [Media+Group+Ungroup] / view+history [Undo+Redo+zoom]) instead of one long undifferentiated
  row, informed by the Stitch UI mockups and Figma/tldraw's floating-panel convention (kanvaz,
  P4inz's other product, was also checked for reference). Floats centered at the *bottom* of
  the canvas (moved there after direct feedback — "why toolbar aint like island in downwards
  why top? like figma" — matching Figma/tldraw's own convention rather than sitting in normal
  flow under the header), with a 20px pill-shaped corner radius. Auto-hides after 3s idle
  (fades to 15% opacity, `pointer-events: none` so a faded toolbar can't steal a click meant
  for the canvas), revives on a pointer approaching the *bottom* of the window or any numbered/
  lettered tool shortcut, and a "Pin" toggle (persisted to `localStorage`) disables auto-hide
  entirely for anyone who'd rather it just stay put. The drawing-tool row is icon-only (custom
  hand-drawn SVGs in `ToolIcons.tsx`, no icon-font/library dependency) and collapses
  Rectangle/Ellipse/Diamond and Line/Arrow/Freehand into two Illustrator-style grouped slots —
  holding a slot past 400ms (or a normal quick click, which just runs the remembered tool) flies
  out its other members, and the slot's own icon becomes whichever member was used most
  recently, from *any* source (flyout pick, letter shortcut, number shortcut) via one small
  effect syncing on the active tool rather than three separate update sites. Buttons get a
  fast (~80ms) hover/press transition and a `:active` scale-down, matching the snappy,
  no-lag feel of Photoshop/Illustrator's own tool switching rather than a laggy fade. Verified
  for real: 18 tests in `Toolbar.test.tsx` (fade timing, revive triggers at the bottom edge,
  pin persistence across remounts, a quick click vs. a hold opening the flyout, picking a
  flyout member, a letter shortcut updating the remembered slot icon, outside-click dismissal)
  plus a live check in the browser preview confirming the fade/revive/flyout logic actually
  runs correctly against a real DOM (jsdom's synthetic pointer events don't model this
  reliably, so the logic itself was additionally verified by dispatching real `PointerEvent`s
  in a live browser tab).
- [x] Custom frameless titlebar, replacing the native OS window chrome (direct feedback: "no
  windows native stuff like the chrome bar it looks ugly asf"). `tauri.conf.json` sets
  `"decorations": false` plus a `minWidth`/`minHeight` floor; new `Titlebar.tsx` merges the old
  `<header>`'s Save/Open/agent-access/status controls into one glassmorphic bar
  (`backdrop-filter: blur(16px)` over `--draft-overlay`) with a `data-tauri-drag-region`
  wrapper for window dragging and custom minimize/maximize/close buttons via
  `@tauri-apps/api/window`'s `getCurrentWindow()`. Caught and fixed two real regressions by
  actually loading the app rather than trusting the diff: (1) `getCurrentWindow()` called at
  module scope throws synchronously outside a real Tauri webview (`window.__TAURI_INTERNALS__`
  doesn't exist in the plain browser preview), crashing the whole app before React ever
  mounted — fixed by deferring it to a lazy, try/caught call inside each button's own
  `onClick`; (2) removing `App.tsx`'s last named import from `@draft/ui` let Vite tree-shake
  away that package's side-effect-only `tokens.css` import, silently dropping every
  `--draft-*` token and the JetBrains Mono font from the bundle (CSS output size ~27KB → ~5KB
  was the tell) — fixed with an explicit bare `import "@draft/ui";`. New design tokens
  (`--draft-surface-2/-3`, `--draft-overlay`, `--draft-danger`, `--draft-radius-sm/md/lg`) added
  to `packages/ui/src/tokens.css` for both bars' glass treatment, extending the existing brand
  anchors rather than replacing them. Verified for real: reloading the browser preview after
  each fix, a titlebar-text-wrapping layout bug found via screenshot at a narrow viewport width
  (fixed with `white-space: nowrap`/`text-overflow: ellipsis` on the lower-priority status
  text), and the frameless window's actual drag/minimize/maximize/close mechanics confirmed by
  relaunching `pnpm tauri dev` (no automated test harness exists for `apps/desktop` itself —
  pre-existing gap).
- [x] Grouping: a shared `groupId` on the shape payload (not a new graph/operation concept —
  `draft-graph` already treats payloads as opaque JSON), a `Group`/`Ungroup` toolbar pair
  gated on selection state, and click-to-select expanding to every group sibling
  (`groupMembers`) so moving one member moves the whole group. Copy/paste remaps pasted
  groupIds to fresh ones (keeping relative grouping) rather than reusing the originals, so a
  pasted copy doesn't silently rejoin the source group. A real "group" as a first-class graph
  object (with its own MCP-visible identity) is Session 2's object-taxonomy work, not this.
- [x] Fixed the real desktop app's minimize/maximize/close buttons doing nothing when clicked
  (reported directly, with a screenshot) — Tauri v2's capability system only granted
  `core:default`, which excludes the window action commands (`minimize`/`toggle_maximize`/
  `close`/`start_dragging`); every click silently failed permission and was swallowed by
  `Titlebar.tsx`'s own try/catch (added earlier for the "no real Tauri window" browser-preview
  case), so it looked identical to a dead button. Added the four specific `core:window:allow-*`
  permissions to `capabilities/default.json`.
- [x] A 4-persona background audit (security, performance, accessibility, architecture) over
  the whole codebase, per direct request — findings applied where cheap/safe, documented where
  not:
  - **Performance** — `ShapeView` had no memoization, so every camera pan/zoom/drag re-rendered
    every shape on the page; wrapped in `React.memo`. Freehand recorded one point per
    pointermove with no decimation (unbounded array growth on a long/fast stroke); now skips
    points closer than 2 world units to the last one. `shapeBounds`'s freehand case spread the
    whole point array into `Math.min(...)/Math.max(...)` — a real crash risk on a long enough
    stroke — replaced with a single-pass loop. Also surfaced a correctness bug: drawing (not
    resizing) a rectangle/ellipse/diamond up-or-left stored a negative width/height, the exact
    `ShapeView`(`Math.abs`)-vs-`shapeBounds`(min/max) desync ADR-014 describes, closed for
    resize but not draw — now normalized the same way resize already is.
  - **Accessibility** — light-mode `--draft-accent-contrast` (white) computed to ~2.77:1
    against `--draft-accent`, under both WCAG minimums, affecting every active toolbar button;
    switched to reuse dark mode's already-passing (~7:1) accent/foreground pairing.
    `FillPicker`'s selection ring had the same root cause, fixed by switching to `--draft-text`.
    Confirmed and left open (a real feature, not a fix): the tool-group flyout added this
    session is reachable only by holding a pointer down, with no keyboard path to its other
    members; canvas shape creation/selection/move/resize is entirely pointer-driven with no
    keyboard alternative at all — both are honest, named gaps, not attempted as quick patches.
  - **Security** — confirmed `AgentMode::Ask` is enforced identically to `Watch` (no
    per-request confirmation gates it, matching an existing code comment admitting the gap);
    `docs/mcp.md` and `docs/agent-permissions.md` now say so plainly instead of only in a
    source comment, rather than building the real per-request-confirmation feature under time
    pressure. Everything else audited (path traversal, typed-ID injection, asset-privacy
    guarantee, local-socket ACL) held up with no new finding.
  - **Architecture** — deduped `FillPicker.tsx`'s own `isFillable` into a shared
    `isFillableShape` next to the existing `isResizableShape` pattern; refreshed two doc/comment
    spots ADR-014 left stale (`shapes.ts`'s header still described Rust payloads as opaque
    JSON, and `docs/project-graph.md`'s taxonomy section didn't mention `fill`/`mediaKind` or
    that video import had shipped). Noted but not acted on: `Toolbar.tsx` has grown to bundle
    toolbar rendering, tool-group/idle-fade state, and ~230 lines of media-import parsing —
    flagged as a future split, not urgent.
- [ ] Exit test: create a project, draw across multiple tools, save, close, reopen, verify
  identical state — both former blockers (image import, grouping) are now done, so this is
  unblocked feature-wise. Not yet run as one combined pass: `Save`/`Open` call real Tauri
  commands (`save_snapshot`/`load_snapshot`) that only exist inside an actual running Tauri
  window, and this dev environment can only preview the pure-frontend Vite build in a browser
  (`apps/desktop`'s `src-tauri` backend isn't reachable there — every `invoke` fails, as seen
  in the "Live sync failed" / "core …" banner during this session's manual testing). Needs a
  real machine with the Tauri window open to close out; `crates/draft-project`'s round-trip
  test already covers the underlying save/load format for what it's worth.

Scoped heavier than the original product spec assumed, because the canvas is being built
from scratch rather than adopting tldraw (see ADR-004) — expect this session to take
longer than "foundation + canvas" sounds like it should.

### Session 2 — Project Intelligence + MCP

- [x] `rmcp` (v3) added to `draft-mcp`, real server on **both** transports from ADR-007:
  - `draft-mcp` CLI binary (stdio) reads a saved `.draft` project directory — for
    headless/CI use with no desktop instance running
  - a local-socket server (Windows named pipe; Unix domain socket path exists via `#[cfg(unix)]`
    but is untested on this Windows dev machine) hosted **inside the running desktop app**,
    reading the *live* in-memory `Graph` as the human edits — this is the actually-important
    half: an agent reading a live session, not just a stale file
- [x] Local-socket access control: a `security-review` pass caught that the socket wasn't
  actually restricted to the current OS user (Windows named pipes and Unix socket files
  don't get "loopback-only" protection for free the way TCP sockets do). Fixed: an explicit
  owner-only Windows security descriptor (`D:P(A;;GA;;;OW)`), and a `0600`-chmod'd Unix
  socket file in the user's app-data dir instead of the shared temp directory
- [x] Read-only MCP tools: `get_project`, `get_page`, `get_object` (both transports).
  `selection`/`recent_changes`/`agent_state` deliberately not exposed yet — they only make
  sense for a live session with real selection/history tracking, which doesn't exist on the
  Rust side yet (selection is still frontend-only); `annotations`/`requirements`/`assets`
  wait on the real object/shape taxonomy below
- [x] Write MCP tools on the live transport: `create_object`/`modify_object`/`delete_object`,
  gated on `AgentMode::allows_write()` (`Build` only — every other mode gets a clear "no
  write access" response). A successful write fires a change notification
  (`LiveState.changes`, a `tokio::sync::broadcast::Sender<PageId>`) that `apps/desktop`
  forwards as a `draft-graph-changed` Tauri event; the frontend refetches and merges the
  affected page (`getPageSnapshot` + `@draft/canvas`'s new `applyRemoteObjects`) so the human
  actually sees what the agent built, not just that the Rust state changed underneath them
- [x] Agent permission gate wired for real, not just typed: every live-socket tool call
  checks `AgentMode::allows_read()` against a shared `Arc<Mutex<AgentMode>>`; `Manual`
  (default) returns a clear "no access" response instead of data. `apps/desktop` has a
  real "Agent access" dropdown (Manual/Ask/Watch/Assist/Build) wired to `set_agent_mode` —
  this *is* the spec's "explicit, visible, revocable" grant, not a placeholder
- [x] The canvas's committed operations now flow to the live graph for real: `apply_operations`
  (Tauri command) + `ensure_page`, wired from `@draft/canvas`'s store via a subscription in
  `apps/desktop/src/App.tsx` — closes the "operations, not snapshots" loop docs/architecture.md
  already described
- [x] Exit test, both transports, passing for real (spawned server + real client, not
  mocked): `crates/draft-mcp/tests/mcp_stdio.rs` (saved-file path) and
  `crates/draft-mcp/tests/mcp_local_socket.rs` (live path — proves `Manual` denies reads and
  raising the mode allows them)
- [x] The real object/shape taxonomy in `draft-graph`, replacing untyped JSON payloads —
  [ADR-014](docs/decisions/adr-014-typed-shape-taxonomy.md): a Rust `Shape` enum mirroring
  `packages/shared/src/shapes.ts`'s eight drawing kinds exactly, validated at the live write
  boundary (`Graph::apply`, both human edits and agent writes) with a real error on a
  malformed known-kind payload instead of silently storing it, plus an `Other` fallback so an
  unrecognized `kind` (a future frontend addition) still round-trips instead of being
  rejected outright. Closes the negative-image-size bug found in the day's code review at
  its actual root (normalized during deserialization) rather than patching the two TS files
  that disagreed about it. Scoped to the eight *drawing* kinds only — the product spec's
  *semantic* taxonomy (below) stays deferred, per the same "don't guess before a concrete
  need exists" reasoning ADR-005 originally used to defer this. Verified for real: 13 new
  `draft-graph` tests (round-trip per kind, `Other` fallback preserves unknown data, a
  malformed known kind is rejected via `apply` but tolerated via the lenient
  `insert_page` load path, negative width/height normalizes, `set_position` works uniformly)
  plus every existing MCP/integration test updated and passing against the new type.
- [ ] Annotations, requirements, relationships, media references, regions (the product
  spec's *semantic* taxonomy — layers meaning onto objects, not an object kind itself; still
  needs a concrete driving feature before being designed, same reasoning as above)
- [x] `recent_changes` MCP tool: `LiveState.log` (a `draft_events::OperationLog`, already
  defined in Session 1's foundation work but never wired up until now) records every
  operation applied to the live graph — the human's (`apply_operations`, tagged
  `Actor::User`) and the agent's (the three write tools, tagged `Actor::Agent`) alike.
  `recent_changes` returns the tail of it (`limit`/`since_sequence` params for incremental
  polling), gated on `allows_read()` like the other read tools. Verified for real: the
  existing `watch_mode_denies_writes_and_build_mode_allows_them` test now also asserts
  `recent_changes` returns the create/modify/delete sequence in order, correctly tagged
  `agent`.
- [x] `code-review` pass (high effort, 8 finder angles) over the whole day's diff (image
  import through `get_selection`) — found and fixed 4 confirmed correctness bugs: marquee
  selection not expanding to full group membership, `recent_changes`'s `since_sequence`
  paging returning the newest unseen operations instead of the oldest (breaking its own
  incremental-polling contract), image import centering on window dimensions instead of the
  canvas's actual viewport, and `apply_operations` losing log entries for a batch's
  already-applied operations when a later one in the batch fails. Also generalized the
  text-editor blur fix (previously only handled `<textarea>`, now any focused control) since
  the same `preventDefault()` gap would have reproduced for any other focusable element.
  Remaining lower-severity findings (stale selection after undoing a group, negative-size
  image hit-test/render desync, a lock-ordering race between human and agent writes, write-
  tool code duplication, `groupMembers`' O(n) scan) are tracked but not fixed this pass —
  narrower edge cases or larger refactors than the session's remaining time justified.
- [x] `security-review` pass over the same diff, scoped to the MCP write surface —
  `recent_changes`'s `since_sequence` (an agent-controlled, unbounded `u64`) did
  `since as usize + 1` with no bound check, overflowing (a debug-build panic; a silent wrap
  to the wrong cursor in release) on `since_sequence: 18446744073709551615`. Fixed with
  saturating arithmetic, clamped to the log length before the cast back to `usize`. Verified
  with a real test connecting a client and calling `recent_changes` with `since_sequence:
  u64::MAX`, asserting a clean empty result instead of a panic. No other findings met the
  review's confidence bar (checked and cleared: `Shape`'s custom deserializer for
  unbounded-amplification/recursion risk, NaN/Infinity via JSON numeric literals — `serde_json`
  already rejects these at parse time — every `.expect()` on `Shape` serialization for
  attacker-reachability, and `get_selection`/`recent_changes`'s permission gates against the
  existing `allows_read()` checks).
- [x] `get_selection` MCP tool: a `set_selection` Tauri command mirrors `@draft/canvas`'s
  store selection into `LiveState.selection` (page ID + object IDs) on every change, and the
  new tool returns it, gated on `allows_read()` like the other read tools — lets a `Watch`-mode
  agent (or any read-access agent) see what the human is actually looking at, not just what
  objects exist on the page. Verified for real: `get_selection_reflects_the_humans_current_selection`
  connects a client before and after setting a selection and asserts both states.
- [x] CI had been red on macOS only, on every commit, for 6 hours straight before anyone
  (including the assistant, despite an earlier session-log entry wrongly claiming a test was
  "verified by CI's Linux/macOS legs") noticed — surfaced by the user from a GitHub screenshot,
  not caught proactively. Root cause (via `gh run view --log-failed`):
  `mcp_local_socket_unix.rs`'s `the_socket_file_is_owner_only` test built its socket path from
  `tempfile::tempdir()` plus a verbose UUID filename, exceeding macOS's 104-byte
  `sockaddr_un.sun_path` limit (Linux's is 108, so Ubuntu passed while macOS silently failed —
  `bind()`'s error was swallowed by the accept loop's `let _ = ...`, so the socket file was
  simply never created). Fixed by using `std::env::temp_dir()` directly with a short 8-hex-char
  filename instead of a nested tempdir and a full UUID. Confirmed (not just assumed) green
  on all three CI legs — Windows, macOS, and Ubuntu — after pushing the fix.
- [x] Cross-client MCP compatibility audit — the user asked directly for DRAFT to "work with
  any agent and any IDE" (named Claude, Codex, Devin, and others). Audited `crates/draft-mcp`
  against the spec rather than assuming: the **stdio** transport (the `draft-mcp` CLI binary)
  is genuinely spec-compliant via the official `rmcp` SDK, already proven end-to-end against
  a real `rmcp` client (not a bespoke mock) in `tests/mcp_stdio.rs` — any MCP client with
  local-stdio-server support can point at it today. The **local-socket "live"** transport
  speaks real MCP bytes too, but isn't reachable through any mainstream client's
  configuration surface (no client supports "dial this named pipe/socket path") — it's
  DRAFT-desktop-app's own channel, not a generic entry point, honestly documented as such in
  `docs/mcp.md`'s new "which transport can your client actually use" section rather than
  implying broader compatibility than what's actually reachable. No code changes needed — the
  audit found no spec deviations to fix.
- [ ] `agent_state` resource — still vague pending a concrete need for it

### Session 3 — Agent Collaboration + Project Workflow

- [x] Permission UI (grant/revoke): the "Agent access" dropdown shipped in Session 2, ahead
  of schedule, since the live MCP server needed a real gate to test against
- [x] Write MCP tools (`create_object`/`modify_object`/`delete_object`) gated through
  `AgentMode::allows_write()`, shipped in Session 2 alongside the read tools — also ahead of
  schedule. `PermissionGrant::check_write()` (the richer, timestamped grant type) is still
  unused; the live gate checks `AgentMode::allows_write()` directly, which is simpler and
  sufficient for a whole-app (not yet per-connection) grant.
- [x] Human sees agent writes: a successful write fires `LiveState.changes`, forwarded as a
  `draft-graph-changed` Tauri event, refetched and merged into the canvas
  (`applyRemoteObjects`) — this wasn't in the original plan but is necessary for write tools
  to be useful at all (a write nobody sees isn't "collaboration")
- [x] Watch mode (an `AgentMode` since Session 2) plus agent observation of live changes: the
  `recent_changes` MCP tool (see Session 2's entry above) now gives a `Watch`-mode agent a
  real way to see what changed without write access — polling `recent_changes` is how an
  agent that can only watch actually watches.
- [x] Visible connection indicator: `LiveState.connections` (a `tokio::sync::watch<usize>`,
  not `broadcast` — a UI only cares about the latest count) is incremented/decremented by an
  RAII guard around each accepted local-socket connection (`ConnectionGuard` in
  `local_socket.rs`, so the count comes back down even if a connection's task exits early or
  panics), forwarded to the frontend as a `draft-agent-connections-changed` Tauri event, and
  shown as "N agents connected" in the header — visible the moment a connection is accepted,
  not just once a tool call succeeds or is denied against it (closes the last gap in the
  spec's "explicit, visible, revocable" permission story). Verified with a real test
  (`connection_count_tracks_connect_and_disconnect`) that connects and disconnects a genuine
  client and asserts the count goes 0 → 1 → 0; the header render itself was only checked
  against the Tauri-less browser preview (shows the "…" loading state without crashing) — the
  live count needs a real Tauri window with a real MCP client attached to see end to end.
- [ ] `apps/web` gains `@draft/canvas` and reaches feature parity with desktop —
  architecture decided: [ADR-016](docs/decisions/adr-016-web-desktop-bridge.md).
  `apps/web` attaches to an already-running desktop session over a new local HTTP/WebSocket
  bridge (mirroring `packages/project-client`'s existing command surface), rather than a
  standalone WASM+browser-storage build — the live MCP transport (OS named pipe/Unix socket)
  fundamentally cannot run in a browser tab, so only a desktop-hosted approach keeps live
  agent access working from a web session. Implementation not started; ADR's action items
  are the plan.
- [ ] Existing repository/project filesystem integration
- [ ] `draft-platform`'s browser/WASM implementation (deferred per ADR-016 — a standalone,
  no-desktop-companion browser mode stays possible later, not ruled out, just not the
  approach being built now)
- [ ] Exit test: create a real design, connect an agent, have it work on a real project,
  change the design, confirm the agent picks up the change

### Session 4 — Hardening + Audit + Ship

No new features. Security (MCP, permissions, path safety, malformed/malicious input,
resource exhaustion), reliability (crash/corruption recovery, large assets/canvases),
performance, and cross-platform validation (actually running the Linux/macOS CI legs, not
just assuming parity — see [docs/cross-platform.md](docs/cross-platform.md)). Finalized
docs, changelog, and the first real release.

## Next two working sessions — features and polish (locked in for review)

Everything below was discussed and organized on 2026-09-07 for the user to review before
either session starts — nothing here is started. Major-to-minor within each session; the
next session opens with the one blocking item, not a feature.

### Session A — features

- [x] ~~Blocking, do first: root-cause the `tauri build` rustc crash~~ — done, see "Known
  issues" above (a corrupted `target/release`, not the profile settings or the code). A real
  `tauri build` CI step is still worth adding so a genuine future regression is caught on
  push instead of only when someone needs to demo — not done yet, folded into Session B.
- [x] **Shape rotation.** `rotation?: number` (degrees) on Rectangle/Ellipse/Diamond, mirrored
  across the TS/Rust boundary per ADR-014, wrapped to a canonical `[0, 360)` range. A rotate
  handle orbits the selected shape; resize handles render at their rotated positions and
  keep the opposite corner pinned in world space while resizing (solved via the rotation
  pivot shift, not just naive unrotated min/max math — see SESSION_LOG.md for the
  derivation). `shapeBounds()` now returns the rotated AABB for hit-testing/marquee. Verified
  with a dedicated regression test for the anchor-pinning property, plus live confirmation in
  the running app (the opposite handle's screen position was pixel-identical before/after).
- [x] **Shift-to-constrain while drawing/resizing** (direct user request) — Illustrator/
  Photoshop-style: holding Shift while creating or resizing a rectangle/ellipse/diamond
  constrains it to equal width/height (square/circle); holding Shift while drawing a
  line/arrow snaps its angle to 45° steps; holding Shift while rotating snaps to 45° steps
  too, for the same muscle-memory consistency.
- [x] **Stroke customization** — `strokeColor`/`strokeWidth` on Rectangle/Ellipse/Diamond/
  Line/Arrow, mirrored across the TS/Rust boundary and validated the same way `fill` already
  is. `FillPicker.tsx` now shows a Fill section and/or a Stroke section depending on what the
  selected shape supports (line/arrow have a stroke but no fill).
- [ ] **Shape z-order** — bring-to-front / send-to-back; shapes currently only stack in
  creation order with no way to reorder them.
- [ ] **Edge-snapping connectors** — arrows/lines that anchor to a shape's edge and follow it
  when the shape moves, instead of floating free-floating endpoints.
- [ ] **Keyboard-accessible canvas** (closes two audit-confirmed gaps, not just documents
  them): arrow-key nudge on a selected shape, Tab-cycling selection, Enter/Space to operate
  the tool-group flyout without a pointer.
- [ ] **Real per-request confirmation for `Ask` agent-mode** — today it's enforced identically
  to `Watch` (documented as a known gap this session); this turns that doc caveat into an
  actual pending-request-queue feature.
- [ ] Sticky note / callout shape, and basic text formatting (font size, bold, alignment) —
  smaller additions, sequence after the above if time allows.

### Session B — polish

- [ ] **Alignment & distribution tools** (align left/center/right/top/bottom, distribute
  evenly across a multi-select) and **snapping** (to other shapes' edges/centers, to the
  grid, with visual smart-guides while dragging).
- [ ] **Distinctive, on-brand additions** (these are what actually differentiate DRAFT from a
  generic whiteboard clone, not just parity features):
  - Live agent-edit highlighting — flash/outline a shape on the human's canvas the moment an
    MCP agent modifies it, instead of the human having to go hunt a diff log.
  - Named objects — a semantic label on a shape ("Boss Room") independent of its visual
    appearance, for both human readability and agent context.
  - Per-object agent lock — freeze specific objects from agent writes even in `Build` mode, a
    natural extension of the existing whole-app permission model.
  - Comment pins tied to a specific object.
- [ ] Alt/Option-drag to duplicate; opacity per shape; right-click context menu
  (delete/duplicate/bring-to-front — currently everything routes through the toolbar or
  shortcuts only).
- [ ] Color eyedropper (pick a fill from an existing shape/image, not just the 8 presets);
  recently-used colors row in `FillPicker`; a live dimension readout while drawing/resizing;
  zoom-to-selection / zoom-to-fit.
- [ ] `apps/web`'s placeholder shell brought up to the same visual standard as desktop (shell
  only — the live desktop bridge, ADR-016, stays a separate, bigger initiative).
- [ ] Split `Toolbar.tsx` (flagged by this session's architecture audit as having outgrown
  itself — pull the ~230 lines of media-import parsing into its own module).
- [ ] Motion pass (selection/hover/zoom-pan easing — everything is instant today, no
  transitions) and a tooltip/microcopy pass across toolbar, titlebar, and error states.
- [ ] Real screenshots into the README banner (needs a file from the user, or a working
  capture path — the browser-automation tool available this session can't export a
  screenshot to a file).
- [ ] A from-scratch clone-and-build sanity check on a clean checkout (CI green across three
  OSes is evidence, not proof, of "ready to use on another PC").

## V2 (not scheduled)

- [ ] Full plugin ecosystem (foundation is plugin-ready per the crate/package boundaries in
  [ARCHITECTURE.md](ARCHITECTURE.md), but no plugin API exists yet)
- [ ] Real-time collaboration
- [ ] Advanced media import: PSD (layers), AI/EPS (vector), video regions/timelines.
  Common raster/vector formats (PNG/JPG/WebP/SVG/GIF) and DRAFT's own project JSON are
  Session 1/2 scope via `draft-media`; PSD/AI specifically need dedicated parsing libraries
  (e.g. `ag-psd` for PSD) and real testing against real files before claiming support —
  not attempted until there's time to do it properly, per product spec §24's own
  "defer if necessary" list.
- [ ] Cloud sync (opt-in, without compromising the local-first default — see
  [ADR-008](docs/decisions/adr-008-local-first-architecture.md))
- [ ] Additional agent-platform integrations beyond the MCP-compatible ones already covered
- [ ] Advanced AI interpretation (freeform sketches auto-recognized as semantic objects)

## Priority if time runs short

Canvas > project format > Project Graph > MCP > agent understanding > agent permissions >
media > existing-project integration. The Project Graph and MCP architecture are never
sacrificed for visual polish (product spec §24).
