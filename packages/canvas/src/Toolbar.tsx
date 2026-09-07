import { useEffect, useRef, useState } from "react";
import "./Toolbar.css";
import { ToolIcon } from "./ToolIcons";
import { screenToWorld } from "./camera";
import { LETTER_KEY_TOOLS, NUMBER_KEY_TOOLS, type Tool, useCanvasStore } from "./store";
import { parseSvgDimensions } from "./svg";
import { extractVideoThumbnail } from "./video";

const TOOL_LABELS: Record<Tool, string> = {
  select: "Select",
  rectangle: "Rect",
  ellipse: "Ellipse",
  diamond: "Diamond",
  text: "Text",
  line: "Line",
  arrow: "Arrow",
  freehand: "Draw",
  eraser: "Eraser",
};

/** Illustrator-style tool groups: the drawing-tool row collapses each of
 * these into one slot showing whichever member was used last — holding the
 * slot (or tapping its caret) flies out the rest, exactly like Illustrator's
 * nested shape/pen tools. Select/Text/Eraser have no siblings, so they stay
 * standalone slots. */
const TOOL_GROUPS: Array<{ key: string; tools: Tool[] }> = [
  { key: "shapes", tools: ["rectangle", "ellipse", "diamond"] },
  { key: "draw", tools: ["line", "arrow", "freehand"] },
];

function groupForTool(t: Tool) {
  return TOOL_GROUPS.find((g) => g.tools.includes(t));
}

type ToolbarSlot =
  | { kind: "tool"; tool: Tool }
  | { kind: "group"; group: (typeof TOOL_GROUPS)[number] };

const TOOLBAR_SLOTS: ToolbarSlot[] = [
  { kind: "tool", tool: "select" },
  { kind: "group", group: TOOL_GROUPS[0] },
  { kind: "tool", tool: "text" },
  { kind: "group", group: TOOL_GROUPS[1] },
  { kind: "tool", tool: "eraser" },
];

/** How long a slot must be held before it counts as "hold" (opens the
 * flyout) rather than "click" (selects the remembered tool) — long enough
 * that a normal click never misfires into opening the menu. */
const GROUP_HOLD_MS = 400;

/** Tool -> its number-key shortcut, e.g. "select" -> "1" (see `NUMBER_KEY_TOOLS`). */
const TOOL_SHORTCUT_KEYS: Partial<Record<Tool, string>> = Object.fromEntries(
  Object.entries(NUMBER_KEY_TOOLS).map(([key, tool]) => [tool, key]),
);

/** Tool -> its Illustrator-style letter shortcut, e.g. "select" -> "v" (see `LETTER_KEY_TOOLS`). */
const TOOL_LETTER_KEYS: Partial<Record<Tool, string>> = Object.fromEntries(
  Object.entries(LETTER_KEY_TOOLS).map(([key, tool]) => [tool, key]),
);

/** The tooltip text for a tool button: the letter shortcut first (the more
 * familiar convention for anyone coming from Illustrator/Photoshop), the
 * number as a secondary hint — both always work. */
function shortcutLabel(tool: Tool): string {
  const letter = TOOL_LETTER_KEYS[tool];
  const number = TOOL_SHORTCUT_KEYS[tool];
  if (letter && number) return `${letter.toUpperCase()} / ${number}`;
  return letter?.toUpperCase() ?? number ?? "";
}

const TOOLBAR_PINNED_KEY = "draft.toolbarPinned";
/** No revive signal for this long fades the toolbar out. */
const IDLE_MS = 3000;
/** A pointer this close to the bottom of the window counts as "reaching for
 * the toolbar," reviving it — matches where the dock actually floats. */
const REVIVE_ZONE_PX = 120;

/** Rejects anything past this before it's ever read into memory as a data URL. */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
/** Videos are reference/template assets (ADR-015's plan), not full productions —
 * a looser cap than images, not an unbounded one. */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** Reads natural pixel dimensions of a data URL by loading it into an offscreen `Image`. */
function readImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("the browser could not decode this file as an image"));
    img.src = dataUrl;
  });
}

/** A short, filesystem-safe extension for the content-addressed asset store. */
function fileExtension(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && /^[a-zA-Z0-9]{1,10}$/.test(fromName)) return fromName.toLowerCase();
  const fromMime = file.type.split("/")[1];
  if (fromMime && /^[a-zA-Z0-9]{1,10}$/.test(fromMime)) return fromMime.toLowerCase();
  return "bin";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("failed to read the file"));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("failed to read the file"));
    reader.readAsText(file);
  });
}

function isSvgFile(file: File): boolean {
  return file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
}

/** MIME sniffing for video is as unreliable as it is for SVG (`isSvgFile`) —
 * some OS/browser combos leave `file.type` empty for less common containers. */
const VIDEO_EXTENSIONS = /^(mp4|m4v|webm|mov|ogv|avi|mkv)$/i;

function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || VIDEO_EXTENSIONS.test(file.name.split(".").pop() ?? "");
}

/** SVG dimensions come from the markup itself (`readImageSize`'s `Image()`-based
 * detection is unreliable for viewBox-only SVGs — see `svg.ts`); every other
 * format keeps using natural raster decoding. */
async function readImportedSize(
  file: File,
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  if (isSvgFile(file)) {
    const text = await readFileAsText(file).catch(() => null);
    const parsed = text ? parseSvgDimensions(text) : null;
    if (parsed) return parsed;
    console.warn("[draft/canvas] couldn't parse SVG dimensions, using a default");
    return { width: 200, height: 200 };
  }
  return readImageSize(dataUrl).catch((err) => {
    console.warn("[draft/canvas] couldn't read natural image size, using a default:", err);
    return { width: 200, height: 200 };
  });
}

export function Toolbar() {
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s.past.length > 0);
  const canRedo = useCanvasStore((s) => s.future.length > 0);
  const zoomPct = useCanvasStore((s) => Math.round(s.camera.zoom * 100));
  const zoomBy = useCanvasStore((s) => s.zoomBy);
  const resetView = useCanvasStore((s) => s.resetView);
  const selection = useCanvasStore((s) => s.selection);
  const groupShapes = useCanvasStore((s) => s.groupShapes);
  const ungroupShapes = useCanvasStore((s) => s.ungroupShapes);
  const beginAction = useCanvasStore((s) => s.beginAction);
  const commitAction = useCanvasStore((s) => s.commitAction);
  const canGroup = selection.length > 1;
  const canUngroup = useCanvasStore((s) => s.selection.some((id) => s.shapes[id]?.shape.groupId));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem(TOOLBAR_PINNED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [idle, setIdle] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [groupTool, setGroupTool] = useState<Record<string, Tool>>(() =>
    Object.fromEntries(TOOL_GROUPS.map((g) => [g.key, g.tools[0]])),
  );
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set right before a hold opens the flyout, so the `click` that the
  // browser still fires on pointerup (same element, same gesture) doesn't
  // also select the remembered tool and stomp the flyout right back closed.
  const heldOpenRef = useRef(false);

  // Whichever tool actually becomes active — via a letter/number shortcut,
  // undo/redo replaying a tool change, or a flyout pick — becomes that
  // group's remembered "last used" member, matching Illustrator's own
  // nested-tool behavior (the slot shows whatever you used most recently
  // regardless of how you got there).
  useEffect(() => {
    const g = groupForTool(tool);
    if (!g) return;
    setGroupTool((prev) => (prev[g.key] === tool ? prev : { ...prev, [g.key]: tool }));
  }, [tool]);

  useEffect(() => {
    if (!openGroup) return;
    function onDocPointerDown(e: PointerEvent) {
      if (e.target instanceof Node && (e.target as Element).closest?.(".draft-tool-slot")) return;
      setOpenGroup(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenGroup(null);
    }
    window.addEventListener("pointerdown", onDocPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onDocPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openGroup]);

  function startHold(groupKey: string) {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      heldOpenRef.current = true;
      setOpenGroup(groupKey);
    }, GROUP_HOLD_MS);
  }

  function cancelHold() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function handleGroupClick(remembered: Tool) {
    if (heldOpenRef.current) {
      // The hold already opened the flyout — this trailing click is just
      // the browser's normal click-after-pointerup, not a fresh request to
      // select the remembered tool.
      heldOpenRef.current = false;
      return;
    }
    setOpenGroup(null);
    setTool(remembered);
  }

  function pickFromFlyout(groupKey: string, t: Tool) {
    setTool(t);
    setGroupTool((prev) => ({ ...prev, [groupKey]: t }));
    setOpenGroup(null);
    revive();
  }

  function revive() {
    setIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setIdle(true), IDLE_MS);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: revive is redefined every render but only ever closes over refs/setState, so omitting it from the deps array is safe and avoids tearing down/rebuilding these listeners on every render.
  useEffect(() => {
    revive();
    function onPointerMove(e: PointerEvent) {
      if (window.innerHeight - e.clientY <= REVIVE_ZONE_PX) revive();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (NUMBER_KEY_TOOLS[e.key]) revive();
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", onKeyDown);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  function togglePinned() {
    setPinned((p) => {
      const next = !p;
      try {
        localStorage.setItem(TOOLBAR_PINNED_KEY, next ? "1" : "0");
      } catch {
        // Best-effort persistence only — a private window or blocked
        // storage just means the preference doesn't survive a reload.
      }
      return next;
    });
    // Without this, unpinning after the idle timer has already elapsed in
    // the background (masked until now by `dockClass`'s `!pinned` check)
    // would instantly snap the toolbar to idle with no fresh grace period.
    revive();
  }

  function handleGroup() {
    beginAction();
    groupShapes(selection);
    commitAction();
  }

  function handleUngroup() {
    beginAction();
    ungroupShapes(selection);
    commitAction();
  }

  async function handleImageFile(file: File) {
    setImageError(null);
    try {
      const isVideo = isVideoFile(file);
      if (!file.type.startsWith("image/") && !isVideo) {
        throw new Error(
          `"${file.name}" isn't an image or video file (got "${file.type || "unknown"}")`,
        );
      }
      const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (file.size > maxBytes) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        throw new Error(`"${file.name}" is ${mb}MB, over the ${maxBytes / (1024 * 1024)}MB limit`);
      }

      const state = useCanvasStore.getState();
      if (!state.assetBackend) {
        throw new Error("image import isn't available in this environment");
      }

      // The full file, always — this is what actually gets stored as the
      // asset (see ADR-015). For a video, this is the video's own bytes,
      // never rendered directly; `displayDataUrl` below is what the human
      // actually sees on canvas.
      let dataUrl: string;
      let natural: { width: number; height: number };
      let displayDataUrl: string | null;
      if (isVideo) {
        // Neither read depends on the other's result, so run them
        // concurrently rather than paying for the full base64 encode before
        // decoding even starts (matters for large files, up to
        // MAX_VIDEO_BYTES). A thumbnail-extraction failure (unsupported
        // codec, corrupt file) degrades to a placeholder size and no
        // preview rather than aborting the whole import — the same
        // graceful-fallback philosophy `readImportedSize` already applies
        // to an undecodable image.
        const [rawDataUrl, thumb] = await Promise.all([
          readFileAsDataUrl(file),
          extractVideoThumbnail(file).catch((err) => {
            console.warn(
              "[draft/canvas] couldn't extract a video thumbnail, importing without a preview:",
              err,
            );
            return null;
          }),
        ]);
        dataUrl = rawDataUrl;
        natural = thumb
          ? { width: thumb.width, height: thumb.height }
          : { width: 200, height: 200 };
        displayDataUrl = thumb?.dataUrl ?? null;
      } else {
        dataUrl = await readFileAsDataUrl(file);
        natural = await readImportedSize(file, dataUrl);
        displayDataUrl = dataUrl;
      }
      const maxDimension = 400;
      const scale = Math.min(1, maxDimension / Math.max(natural.width, natural.height, 1));
      const width = Math.max(1, Math.round(natural.width * scale));
      const height = Math.max(1, Math.round(natural.height * scale));

      // The reference (assetId), not `dataUrl`, is what ends up on the
      // shape and crosses into the graph/MCP — see ADR-015. `displayDataUrl`
      // stays local, cached only for this viewer's own rendering (for a
      // video, a still thumbnail — an SVG `<image>` can't render the video
      // file itself, see `video.ts`).
      const extension = fileExtension(file);
      const assetId = await state.assetBackend.save(extension, dataUrl);
      if (displayDataUrl) state.cacheAsset(assetId, displayDataUrl);

      // The canvas SVG doesn't fill the window (header/toolbar sit above
      // it), so centering on window dimensions offsets the drop point from
      // what's actually visible — use the canvas element's own rect, like
      // every other screen-to-world conversion in Canvas.tsx already does.
      const canvasRect = document.querySelector(".draft-canvas")?.getBoundingClientRect();
      const screenCenter = canvasRect
        ? { x: canvasRect.width / 2, y: canvasRect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const center = screenToWorld(state.camera, screenCenter);
      state.beginAction();
      state.addShape({
        kind: "image",
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        assetId,
        ...(isVideo ? { mediaKind: "video" as const } : {}),
      });
      state.commitAction();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[draft/canvas] image import failed:", err);
      setImageError(message);
    }
  }

  const dockClass = ["draft-toolbar-dock", idle && !pinned ? "idle" : ""].filter(Boolean).join(" ");

  return (
    <div
      className={dockClass}
      onPointerEnter={revive}
      title="Tip: middle-mouse-drag pans regardless of the active tool"
    >
      <div className="draft-toolbar-island" role="toolbar" aria-label="Draw tools">
        {TOOLBAR_SLOTS.map((slot) => {
          if (slot.kind === "tool") {
            const t = slot.tool;
            return (
              <button
                key={t}
                type="button"
                className={
                  t === tool
                    ? "draft-toolbar-btn draft-toolbar-icon-btn active"
                    : "draft-toolbar-btn draft-toolbar-icon-btn"
                }
                onClick={() => setTool(t)}
                aria-pressed={t === tool}
                title={`${TOOL_LABELS[t]} (${shortcutLabel(t)})`}
                aria-label={TOOL_LABELS[t]}
              >
                <ToolIcon tool={t} />
              </button>
            );
          }

          const { group } = slot;
          const remembered = groupTool[group.key] ?? group.tools[0];
          const isOpen = openGroup === group.key;
          const groupActive = group.tools.includes(tool);
          return (
            <div className="draft-tool-slot" key={group.key}>
              <button
                type="button"
                className={
                  groupActive
                    ? "draft-toolbar-btn draft-toolbar-icon-btn draft-tool-slot-btn active"
                    : "draft-toolbar-btn draft-toolbar-icon-btn draft-tool-slot-btn"
                }
                onPointerDown={() => startHold(group.key)}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                onClick={() => handleGroupClick(remembered)}
                aria-pressed={groupActive}
                aria-haspopup="true"
                aria-expanded={isOpen}
                title={`${TOOL_LABELS[remembered]} (${shortcutLabel(remembered)}) — hold for more`}
                aria-label={TOOL_LABELS[remembered]}
              >
                <ToolIcon tool={remembered} />
                <span className="draft-tool-slot-caret" aria-hidden="true" />
              </button>
              {isOpen && (
                <div className="draft-tool-flyout" role="menu">
                  {group.tools.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="menuitem"
                      className={
                        t === tool
                          ? "draft-toolbar-btn draft-toolbar-icon-btn active"
                          : "draft-toolbar-btn draft-toolbar-icon-btn"
                      }
                      onClick={() => pickFromFlyout(group.key, t)}
                      aria-label={TOOL_LABELS[t]}
                      title={`${TOOL_LABELS[t]} (${shortcutLabel(t)})`}
                    >
                      <ToolIcon tool={t} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="draft-toolbar-island" role="toolbar" aria-label="Content">
        <button
          type="button"
          className="draft-toolbar-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Import an image, SVG, or video (video imports as a reference thumbnail — see ROADMAP)"
        >
          Media
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleImageFile(file);
          }}
        />
        <span className="draft-toolbar-sep" />
        <button
          type="button"
          className="draft-toolbar-btn"
          onClick={handleGroup}
          disabled={!canGroup}
        >
          Group
        </button>
        <button
          type="button"
          className="draft-toolbar-btn"
          onClick={handleUngroup}
          disabled={!canUngroup}
        >
          Ungroup
        </button>
      </div>

      {imageError && (
        <span className="draft-toolbar-error" role="alert">
          {imageError}
        </span>
      )}

      <div className="draft-toolbar-island" role="toolbar" aria-label="View and history">
        <button type="button" className="draft-toolbar-btn" onClick={undo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" className="draft-toolbar-btn" onClick={redo} disabled={!canRedo}>
          Redo
        </button>
        <span className="draft-toolbar-sep" />
        <button
          type="button"
          className="draft-toolbar-btn"
          onClick={() => zoomBy(1 / 1.25)}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="draft-toolbar-btn draft-toolbar-zoom"
          onClick={resetView}
          title="Reset view"
        >
          {zoomPct}%
        </button>
        <button
          type="button"
          className="draft-toolbar-btn"
          onClick={() => zoomBy(1.25)}
          aria-label="Zoom in"
        >
          +
        </button>
        <span className="draft-toolbar-sep" />
        <button
          type="button"
          className={pinned ? "draft-toolbar-pin pinned" : "draft-toolbar-pin"}
          onClick={togglePinned}
          aria-pressed={pinned}
          aria-label={pinned ? "Unpin toolbar (allow auto-hide)" : "Pin toolbar (keep it visible)"}
          title={pinned ? "Unpin toolbar (allow auto-hide)" : "Pin toolbar (keep it visible)"}
        >
          Pin
        </button>
      </div>
    </div>
  );
}
