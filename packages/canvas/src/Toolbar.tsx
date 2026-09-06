import { useRef, useState } from "react";
import "./Toolbar.css";
import { screenToWorld } from "./camera";
import { NUMBER_KEY_TOOLS, type Tool, useCanvasStore } from "./store";
import { parseSvgDimensions } from "./svg";
import { extractVideoThumbnail } from "./video";

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: "select", label: "Select" },
  { id: "rectangle", label: "Rect" },
  { id: "ellipse", label: "Ellipse" },
  { id: "diamond", label: "Diamond" },
  { id: "text", label: "Text" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "freehand", label: "Draw" },
  { id: "eraser", label: "Eraser" },
];

/** Tool -> its number-key shortcut, e.g. "select" -> "1" (see `NUMBER_KEY_TOOLS`). */
const TOOL_SHORTCUT_KEYS: Partial<Record<Tool, string>> = Object.fromEntries(
  Object.entries(NUMBER_KEY_TOOLS).map(([key, tool]) => [tool, key]),
);

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

  return (
    <div
      className="draft-toolbar"
      role="toolbar"
      aria-label="Canvas tools"
      title="Tip: middle-mouse-drag pans regardless of the active tool"
    >
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={t.id === tool ? "draft-toolbar-btn active" : "draft-toolbar-btn"}
          onClick={() => setTool(t.id)}
          aria-pressed={t.id === tool}
          title={`${t.label} (${TOOL_SHORTCUT_KEYS[t.id]})`}
        >
          {t.label}
        </button>
      ))}
      <span className="draft-toolbar-sep" />
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
      {imageError && (
        <span className="draft-toolbar-error" role="alert">
          {imageError}
        </span>
      )}
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
      <span className="draft-toolbar-sep" />
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
    </div>
  );
}
