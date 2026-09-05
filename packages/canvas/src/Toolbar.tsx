import "./Toolbar.css";
import { type Tool, useCanvasStore } from "./store";

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
        >
          {t.label}
        </button>
      ))}
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
