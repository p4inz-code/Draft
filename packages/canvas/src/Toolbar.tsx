import { useRef, useState } from "react";
import "./Toolbar.css";
import { screenToWorld } from "./camera";
import { NUMBER_KEY_TOOLS, type Tool, useCanvasStore } from "./store";

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

/** Reads natural pixel dimensions of a data URL by loading it into an offscreen `Image`. */
function readImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("the browser could not decode this file as an image"));
    img.src = dataUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("failed to read the file"));
    reader.readAsDataURL(file);
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
      if (!file.type.startsWith("image/")) {
        throw new Error(`"${file.name}" isn't an image file (got "${file.type || "unknown"}")`);
      }
      if (file.size > MAX_IMAGE_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        throw new Error(
          `"${file.name}" is ${mb}MB, over the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit`,
        );
      }

      const dataUrl = await readFileAsDataUrl(file);
      const natural = await readImageSize(dataUrl).catch((err) => {
        console.warn("[draft/canvas] couldn't read natural image size, using a default:", err);
        return { width: 200, height: 200 };
      });
      const maxDimension = 400;
      const scale = Math.min(1, maxDimension / Math.max(natural.width, natural.height, 1));
      const width = Math.max(1, Math.round(natural.width * scale));
      const height = Math.max(1, Math.round(natural.height * scale));

      const state = useCanvasStore.getState();
      const center = screenToWorld(state.camera, {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      state.beginAction();
      state.addShape({
        kind: "image",
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        src: dataUrl,
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
      >
        Image
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
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
