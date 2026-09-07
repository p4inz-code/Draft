import { isFillableShape, isStrokableShape } from "@draft/shared";
import "./FillPicker.css";
import { worldToScreen } from "./camera";
import { shapeBounds } from "./geometry";
import { useCanvasStore } from "./store";

/** A small, deliberately fixed palette (not derived from CSS theme tokens —
 * fill is a concrete hex value stored on the shape and synced over MCP, so
 * it needs a real color, not a variable that changes with light/dark mode).
 * Reused for stroke color too — same rationale, same palette. */
const PRESET_COLORS = [
  "#0ea5e9", // brand accent
  "#ef4444", // red
  "#f59e0b", // amber
  "#22c55e", // green
  "#a855f7", // purple
  "#64748b", // slate
  "#ffffff", // white
  "#000000", // black
];

const MIN_STROKE_WIDTH = 1;
const MAX_STROKE_WIDTH = 8;

/**
 * A small popover for setting a selected shape's fill color and/or stroke
 * color/width — not a general properties/inspector panel (deliberately out
 * of scope, see ROADMAP), just these controls. Shown whenever exactly one
 * fillable (rectangle/ellipse/diamond) and/or strokable (those three plus
 * line/arrow) shape is selected, positioned near its top-right corner in
 * screen space so it doesn't cover the shape itself.
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
  if (!object || !shape) return null;
  // Re-bound as a fresh, concretely-typed const: TS's narrowing of `object`/
  // `shape` above doesn't reliably persist into the closures below. The
  // narrowed fillable/strokable variants are separate bindings (not just
  // booleans) so JSX reading `.fill`/`.strokeColor` off them type-checks —
  // a plain `isFillableShape(shape)` boolean doesn't narrow `shape` itself
  // inside a `{cond && <jsx using shape.fill>}` block.
  const selected = { id: object.id, shape };
  const fillable = isFillableShape(shape) ? shape : null;
  const strokable = isStrokableShape(shape) ? shape : null;
  if (!fillable && !strokable) return null;

  const bounds = shapeBounds(selected.shape);
  const anchor = worldToScreen(camera, { x: bounds.maxX, y: bounds.minY });

  function applyFill(fill: string | undefined) {
    if (!fillable) return;
    beginAction();
    updateShape(selected.id, { ...fillable, fill });
    commitAction();
  }

  function applyStrokeColor(strokeColor: string | undefined) {
    if (!strokable) return;
    beginAction();
    updateShape(selected.id, { ...strokable, strokeColor });
    commitAction();
  }

  function applyStrokeWidth(strokeWidth: number) {
    if (!strokable) return;
    beginAction();
    updateShape(selected.id, { ...strokable, strokeWidth });
    commitAction();
  }

  return (
    <div className="draft-shape-picker" style={{ left: anchor.x + 8, top: anchor.y }}>
      {fillable && (
        <fieldset className="draft-fill-picker" aria-label="Fill color">
          <legend>Fill</legend>
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={
                fillable.fill === color ? "draft-fill-swatch selected" : "draft-fill-swatch"
              }
              style={{ background: color }}
              aria-label={`Fill ${color}`}
              aria-pressed={fillable.fill === color}
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
              value={fillable.fill ?? "#000000"}
              onChange={(e) => applyFill(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={fillable.fill === undefined ? "draft-fill-none selected" : "draft-fill-none"}
            aria-pressed={fillable.fill === undefined}
            onClick={() => applyFill(undefined)}
          >
            None
          </button>
        </fieldset>
      )}
      {strokable && (
        <fieldset className="draft-fill-picker" aria-label="Stroke color and width">
          <legend>Stroke</legend>
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={
                strokable.strokeColor === color ? "draft-fill-swatch selected" : "draft-fill-swatch"
              }
              style={{ background: color }}
              aria-label={`Stroke ${color}`}
              aria-pressed={strokable.strokeColor === color}
              onClick={() => applyStrokeColor(color)}
            />
          ))}
          <label
            className="draft-fill-swatch draft-fill-custom"
            title="Custom stroke color"
            aria-label="Custom stroke color"
          >
            <input
              type="color"
              value={strokable.strokeColor ?? "#000000"}
              onChange={(e) => applyStrokeColor(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={
              strokable.strokeColor === undefined ? "draft-fill-none selected" : "draft-fill-none"
            }
            aria-pressed={strokable.strokeColor === undefined}
            onClick={() => applyStrokeColor(undefined)}
          >
            Default
          </button>
          <label className="draft-stroke-width" aria-label="Stroke width">
            <input
              type="range"
              min={MIN_STROKE_WIDTH}
              max={MAX_STROKE_WIDTH}
              step={0.5}
              value={strokable.strokeWidth ?? 1.5}
              title={`Stroke width: ${strokable.strokeWidth ?? 1.5}px`}
              onChange={(e) => applyStrokeWidth(Number(e.target.value))}
            />
          </label>
        </fieldset>
      )}
    </div>
  );
}
