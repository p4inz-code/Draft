import { isFillableShape } from "@draft/shared";
import "./FillPicker.css";
import { worldToScreen } from "./camera";
import { shapeBounds } from "./geometry";
import { useCanvasStore } from "./store";

/** A small, deliberately fixed palette (not derived from CSS theme tokens —
 * fill is a concrete hex value stored on the shape and synced over MCP, so
 * it needs a real color, not a variable that changes with light/dark mode). */
const PRESET_FILLS = [
  "#0ea5e9", // brand accent
  "#ef4444", // red
  "#f59e0b", // amber
  "#22c55e", // green
  "#a855f7", // purple
  "#64748b", // slate
  "#ffffff", // white
  "#000000", // black
];

/**
 * A small popover for setting a selected shape's fill color — not a general
 * properties/inspector panel (deliberately out of scope, see ROADMAP), just
 * this one control. Only shown when exactly one fill-capable shape
 * (rectangle/ellipse/diamond) is selected, positioned near its top-right
 * corner in screen space so it doesn't cover the shape itself.
 */
export function FillPicker() {
  const selectedId = useCanvasStore((s) => (s.selection.length === 1 ? s.selection[0] : null));
  // Keyed lookup (like `ShapeView.tsx`'s asset-cache selector), not the whole
  // `shapes` map — this object reference only changes when *this* shape is
  // edited, not on every edit anywhere on the canvas.
  const object = useCanvasStore((s) => (selectedId ? s.shapes[selectedId] : undefined));
  const camera = useCanvasStore((s) => s.camera);
  const updateShape = useCanvasStore((s) => s.updateShape);
  const beginAction = useCanvasStore((s) => s.beginAction);
  const commitAction = useCanvasStore((s) => s.commitAction);

  const shape = object?.shape;

  if (!object || !shape || !isFillableShape(shape)) return null;
  // Re-bound as a fresh, concretely-typed const: TS's narrowing of `object`/
  // `shape` above doesn't reliably persist into the closures below.
  const selected = { id: object.id, shape };

  const bounds = shapeBounds(selected.shape);
  const anchor = worldToScreen(camera, { x: bounds.maxX, y: bounds.minY });

  function applyFill(fill: string | undefined) {
    beginAction();
    updateShape(selected.id, { ...selected.shape, fill });
    commitAction();
  }

  return (
    <fieldset
      className="draft-fill-picker"
      style={{ left: anchor.x + 8, top: anchor.y }}
      aria-label="Fill color"
    >
      {PRESET_FILLS.map((color) => (
        <button
          key={color}
          type="button"
          className={shape.fill === color ? "draft-fill-swatch selected" : "draft-fill-swatch"}
          style={{ background: color }}
          aria-label={`Fill ${color}`}
          aria-pressed={shape.fill === color}
          onClick={() => applyFill(color)}
        />
      ))}
      <label
        className="draft-fill-swatch draft-fill-custom"
        title="Custom fill color"
        aria-label="Custom fill color"
      >
        <input
          type="color"
          value={shape.fill ?? "#000000"}
          onChange={(e) => applyFill(e.target.value)}
        />
      </label>
      <button
        type="button"
        className={shape.fill === undefined ? "draft-fill-none selected" : "draft-fill-none"}
        aria-pressed={shape.fill === undefined}
        onClick={() => applyFill(undefined)}
      >
        None
      </button>
    </fieldset>
  );
}
