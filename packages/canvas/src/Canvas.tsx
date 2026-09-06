import {
  type ObjectId,
  type Shape,
  type TextShape,
  isResizableShape,
  newObjectId,
} from "@draft/shared";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import "./Canvas.css";
import { ShapeView } from "./ShapeView";
import { type Point, screenToWorld } from "./camera";
import { boundsContainPoint, boundsIntersect, shapeBounds } from "./geometry";
import { NUMBER_KEY_TOOLS, useCanvasStore } from "./store";

/** Reads a pointer event's position relative to the SVG element, in screen (pixel) space. */
function screenPointFromEvent(e: React.PointerEvent<SVGSVGElement>): Point {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

type DragState =
  | { kind: "none" }
  | { kind: "pan" }
  | { kind: "marquee"; startWorld: Point }
  | { kind: "move-selection"; lastWorld: Point }
  | { kind: "draw"; objectId: ObjectId; startWorld: Point }
  | { kind: "erase" }
  | { kind: "resize"; objectId: ObjectId; handle: ResizeHandle; anchor: Point };

/** Which corner of a resizable shape's bounding box is being dragged. */
type ResizeHandle = "nw" | "ne" | "sw" | "se";

/**
 * The canvas surface: a single SVG viewport whose shape layer is positioned
 * by the camera transform, plus one pointer-event state machine keyed on
 * the active tool. See docs/canvas.md and ADR-004 for why this is DOM/SVG
 * rather than a pixel `<canvas>`.
 */
export function Canvas() {
  const camera = useCanvasStore((s) => s.camera);
  const tool = useCanvasStore((s) => s.tool);
  const shapes = useCanvasStore((s) => s.shapes);
  const selection = useCanvasStore((s) => s.selection);
  const store = useCanvasStore;

  const [drag, setDrag] = useState<DragState>({ kind: "none" });
  const [marqueeRect, setMarqueeRect] = useState<{ x: Point; y: Point } | null>(null);
  const [editingTextId, setEditingTextId] = useState<ObjectId | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // In-memory clipboard (not the OS clipboard — copying a shape isn't text,
  // and this avoids the async permission dance of the real Clipboard API
  // for something that only needs to survive within the same session).
  const clipboardRef = useRef<Shape[]>([]);

  function finishEditingText(id: ObjectId, text: string) {
    const state = store.getState();
    const obj = state.shapes[id];
    if (obj && obj.shape.kind === "text") {
      if (text.trim().length === 0) {
        state.deleteShapes([id]);
      } else {
        state.updateShape(id, { ...obj.shape, text });
      }
    }
    state.commitAction();
    setEditingTextId(null);
  }

  function startEditingExistingText(id: ObjectId) {
    store.getState().beginAction();
    setEditingTextId(id);
  }

  function handleResizeHandlePointerDown(
    e: React.PointerEvent<SVGRectElement>,
    objectId: ObjectId,
    handle: ResizeHandle,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
  ) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    // The anchor is the fixed opposite corner — dragging "nw" keeps "se" put.
    const anchor: Point = {
      x: handle.includes("w") ? bounds.maxX : bounds.minX,
      y: handle.includes("n") ? bounds.maxY : bounds.minY,
    };
    store.getState().beginAction();
    setDrag({ kind: "resize", objectId, handle, anchor });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const state = store.getState();
      const isEditableTarget =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
      if (isEditableTarget) return;

      const numberedTool = NUMBER_KEY_TOOLS[e.key];
      if (numberedTool && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        state.setTool(numberedTool);
      } else if ((e.key === "Delete" || e.key === "Backspace") && state.selection.length > 0) {
        e.preventDefault();
        state.beginAction();
        state.deleteShapes(state.selection);
        state.commitAction();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (state.selection.length === 0) return;
        e.preventDefault();
        clipboardRef.current = state.selection
          .map((id) => state.shapes[id]?.shape)
          .filter((shape): shape is Shape => shape != null)
          // Deep-clone so later edits to the live shape don't mutate the clipboard.
          .map((shape) => JSON.parse(JSON.stringify(shape)));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        if (clipboardRef.current.length === 0) return;
        e.preventDefault();
        state.beginAction();
        const pasteOffset = 20;
        // Remap groupIds to fresh ones (shared across this paste's shapes,
        // keeping their relative grouping) rather than reusing the
        // originals — otherwise a pasted copy would silently rejoin the
        // source group, so moving the original would drag the copy too.
        const groupIdMap = new Map<string, string>();
        const newIds = clipboardRef.current.map((shape) => {
          let groupId = shape.groupId;
          if (groupId) {
            const remapped = groupIdMap.get(groupId) ?? newObjectId();
            groupIdMap.set(groupId, remapped);
            groupId = remapped;
          }
          return state.addShape({
            ...shape,
            x: shape.x + pasteOffset,
            y: shape.y + pasteOffset,
            groupId,
          });
        });
        state.commitAction();
        state.select(newIds);
        // Pasting again pastes at a further offset, like most editors, so
        // repeated Ctrl+V doesn't stack copies exactly on top of each other.
        clipboardRef.current = clipboardRef.current.map((shape) => ({
          ...shape,
          x: shape.x + pasteOffset,
          y: shape.y + pasteOffset,
        }));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) state.redo();
        else state.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        state.redo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        state.zoomBy(1.25);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        state.zoomBy(1 / 1.25);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        state.resetView();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);

  const worldPointFromEvent = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => screenToWorld(camera, screenPointFromEvent(e)),
    [camera],
  );

  // Text is handled separately in handlePointerDown (placed + edited in
  // place, not dragged to size), so it's not one of the cases here.
  const newShapeForTool = useCallback((tool: string, world: Point): Shape | null => {
    switch (tool) {
      case "rectangle":
        return { kind: "rectangle", x: world.x, y: world.y, width: 0, height: 0 };
      case "ellipse":
        return { kind: "ellipse", x: world.x, y: world.y, width: 0, height: 0 };
      case "diamond":
        return { kind: "diamond", x: world.x, y: world.y, width: 0, height: 0 };
      case "arrow":
        return { kind: "arrow", x: world.x, y: world.y, dx: 0, dy: 0 };
      case "line":
        return { kind: "line", x: world.x, y: world.y, dx: 0, dy: 0 };
      case "freehand":
        return { kind: "freehand", x: world.x, y: world.y, points: [[0, 0]] };
      default:
        return null;
    }
  }, []);

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    // Blurring the active text editor (if any) is normally a side effect of
    // the browser's own default mousedown handling — but preventDefault()
    // below suppresses that default handling too, which would otherwise
    // strand the textarea focused and never commit its text. Do it
    // ourselves first so it doesn't depend on that default action.
    if (document.activeElement instanceof HTMLTextAreaElement) {
      document.activeElement.blur();
    }
    // Without this, a left-drag (marquee, draw, move, pan) also kicks off
    // the browser's own native drag-selection over the page — the two
    // visibly fight each other, showing as a stray native text-selection
    // highlight instead of (or on top of) our own marquee rectangle.
    e.preventDefault();
    const world = worldPointFromEvent(e);
    const state = store.getState();

    if (e.button === 1) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ kind: "pan" });
      return;
    }

    if (tool === "text") {
      // No pointer capture / drag tracking needed for text — and holding
      // capture here was racing the textarea's focus() against the
      // browser's native click/focus handling, causing an immediate blur
      // (and, via our own "discard empty text" cleanup, an instant delete)
      // before the user could type anything.
      state.beginAction();
      const id = state.addShape({ kind: "text", x: world.x, y: world.y, text: "" });
      setEditingTextId(id);
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "select") {
      const hitId = hitTest(state.shapes, world);
      if (hitId) {
        if (!state.selection.includes(hitId)) state.select(state.groupMembers(hitId));
        state.beginAction();
        setDrag({ kind: "move-selection", lastWorld: world });
      } else {
        state.clearSelection();
        setMarqueeRect({ x: world, y: world });
        setDrag({ kind: "marquee", startWorld: world });
      }
      return;
    }

    if (tool === "eraser") {
      state.beginAction();
      const hitId = hitTest(state.shapes, world);
      if (hitId) state.deleteShapes([hitId]);
      setDrag({ kind: "erase" });
      return;
    }

    // A drawing tool: snapshot first (ADR-013), then create the shape.
    state.beginAction();
    const shape = newShapeForTool(tool, world);
    if (!shape) return;
    const id = state.addShape(shape);
    setDrag({ kind: "draw", objectId: id, startWorld: world });
  }

  function handleDoubleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (tool !== "select") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const world = screenToWorld(camera, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    const state = store.getState();
    const hitId = hitTest(state.shapes, world);
    if (hitId && state.shapes[hitId].shape.kind === "text") {
      startEditingExistingText(hitId);
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const world = worldPointFromEvent(e);
    const state = store.getState();

    switch (drag.kind) {
      case "pan":
        state.pan(e.movementX, e.movementY);
        return;
      case "marquee":
        setMarqueeRect({ x: drag.startWorld, y: world });
        return;
      case "move-selection": {
        const dx = world.x - drag.lastWorld.x;
        const dy = world.y - drag.lastWorld.y;
        for (const id of state.selection) {
          const obj = state.shapes[id];
          if (obj) state.moveShape(id, obj.shape.x + dx, obj.shape.y + dy);
        }
        setDrag({ kind: "move-selection", lastWorld: world });
        return;
      }
      case "draw": {
        const obj = state.shapes[drag.objectId];
        if (!obj) return;
        const { shape } = obj;
        if (shape.kind === "rectangle" || shape.kind === "ellipse" || shape.kind === "diamond") {
          state.updateShape(drag.objectId, {
            ...shape,
            width: world.x - drag.startWorld.x,
            height: world.y - drag.startWorld.y,
          });
        } else if (shape.kind === "arrow" || shape.kind === "line") {
          state.updateShape(drag.objectId, {
            ...shape,
            dx: world.x - drag.startWorld.x,
            dy: world.y - drag.startWorld.y,
          });
        } else if (shape.kind === "freehand") {
          state.updateShape(drag.objectId, {
            ...shape,
            points: [...shape.points, [world.x - shape.x, world.y - shape.y]],
          });
        }
        return;
      }
      case "erase": {
        const hitId = hitTest(state.shapes, world);
        if (hitId) state.deleteShapes([hitId]);
        return;
      }
      case "resize": {
        const obj = state.shapes[drag.objectId];
        if (!obj || !isResizableShape(obj.shape)) return;
        const { anchor } = drag;
        const minX = Math.min(anchor.x, world.x);
        const minY = Math.min(anchor.y, world.y);
        const maxX = Math.max(anchor.x, world.x);
        const maxY = Math.max(anchor.y, world.y);
        state.updateShape(drag.objectId, {
          ...obj.shape,
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        });
        return;
      }
      default:
        return;
    }
  }

  function handlePointerUp() {
    const state = store.getState();
    if (drag.kind === "marquee" && marqueeRect) {
      const rect = {
        minX: Math.min(marqueeRect.x.x, marqueeRect.y.x),
        minY: Math.min(marqueeRect.x.y, marqueeRect.y.y),
        maxX: Math.max(marqueeRect.x.x, marqueeRect.y.x),
        maxY: Math.max(marqueeRect.x.y, marqueeRect.y.y),
      };
      const hits = Object.values(state.shapes)
        .filter((o) => boundsIntersect(shapeBounds(o.shape), rect))
        .map((o) => o.id);
      state.select(hits);
    }
    if (drag.kind === "draw") {
      // A click with no drag leaves a zero-size, invisible shape (e.g. a
      // 0x0 rectangle) — discard it rather than committing clutter no one
      // can see or select.
      const obj = state.shapes[drag.objectId];
      if (obj && isZeroSize(obj.shape)) state.deleteShapes([drag.objectId]);
      state.commitAction();
    } else if (drag.kind === "move-selection" || drag.kind === "erase" || drag.kind === "resize") {
      state.commitAction();
    }
    setDrag({ kind: "none" });
    setMarqueeRect(null);
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const focus = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const factor = Math.exp(-e.deltaY * 0.001);
    store.getState().zoom(focus, factor);
  }

  const transform = `scale(${camera.zoom}) translate(${-camera.x} ${-camera.y})`;
  const gridId = useId();
  const GRID_SIZE = 40;
  const gridSizeScreen = GRID_SIZE * camera.zoom;
  const gridOffsetX = -camera.x * camera.zoom;
  const gridOffsetY = -camera.y * camera.zoom;

  // The select tool points and drags shapes, so a plain arrow reads better
  // than the crosshair every drawing tool uses to mark "click here to place
  // a point" — showing crosshair unconditionally (the previous behavior)
  // made the select tool look like it was in some kind of drawing mode even
  // when it wasn't doing anything unusual.
  const cursor = tool === "select" ? "default" : "crosshair";

  return (
    <svg
      ref={svgRef}
      className="draft-canvas"
      style={{ cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      role="application"
      aria-label="DRAFT canvas"
    >
      <defs>
        <pattern
          id={gridId}
          width={gridSizeScreen}
          height={gridSizeScreen}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${gridOffsetX} ${gridOffsetY})`}
        >
          <circle cx={1.5} cy={1.5} r={1.5} fill="var(--draft-text-muted)" opacity={0.5} />
        </pattern>
      </defs>
      <rect x={0} y={0} width="100%" height="100%" fill={`url(#${gridId})`} />
      <g transform={transform}>
        {Object.values(shapes).map((object) =>
          object.id === editingTextId ? null : (
            <ShapeView key={object.id} object={object} selected={selection.includes(object.id)} />
          ),
        )}
        {editingTextId &&
          (() => {
            const editingShape = shapes[editingTextId]?.shape;
            if (!editingShape || editingShape.kind !== "text") return null;
            return (
              <TextEditor
                shape={editingShape}
                onDone={(text) => finishEditingText(editingTextId, text)}
              />
            );
          })()}
        {tool === "select" &&
          selection.length === 1 &&
          (() => {
            const obj = shapes[selection[0]];
            if (!obj || !isResizableShape(obj.shape)) return null;
            return (
              <ResizeHandles
                objectId={obj.id}
                bounds={shapeBounds(obj.shape)}
                zoom={camera.zoom}
                onHandlePointerDown={handleResizeHandlePointerDown}
              />
            );
          })()}
      </g>
      {marqueeRect && (
        <rect
          x={Math.min(marqueeRect.x.x, marqueeRect.y.x)}
          y={Math.min(marqueeRect.x.y, marqueeRect.y.y)}
          width={Math.abs(marqueeRect.y.x - marqueeRect.x.x)}
          height={Math.abs(marqueeRect.y.y - marqueeRect.x.y)}
          fill="rgba(14, 165, 233, 0.1)"
          stroke="var(--draft-accent)"
          strokeDasharray="4 4"
        />
      )}
    </svg>
  );
}

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];

/**
 * Four corner handles on a selected resizable shape's bounding box. Rendered
 * inside the world-transformed `<g>`, so the handle size is divided by zoom
 * to stay a constant size on screen rather than scaling with content.
 */
function ResizeHandles({
  objectId,
  bounds,
  zoom,
  onHandlePointerDown,
}: {
  objectId: ObjectId;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  zoom: number;
  onHandlePointerDown: (
    e: React.PointerEvent<SVGRectElement>,
    objectId: ObjectId,
    handle: ResizeHandle,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
  ) => void;
}) {
  const size = 8 / zoom;
  const positions: Record<ResizeHandle, Point> = {
    nw: { x: bounds.minX, y: bounds.minY },
    ne: { x: bounds.maxX, y: bounds.minY },
    sw: { x: bounds.minX, y: bounds.maxY },
    se: { x: bounds.maxX, y: bounds.maxY },
  };
  const cursors: Record<ResizeHandle, string> = {
    nw: "nwse-resize",
    se: "nwse-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
  };

  return (
    <>
      {RESIZE_HANDLES.map((handle) => (
        <rect
          key={handle}
          x={positions[handle].x - size / 2}
          y={positions[handle].y - size / 2}
          width={size}
          height={size}
          fill="var(--draft-surface)"
          stroke="var(--draft-accent)"
          strokeWidth={1 / zoom}
          style={{ cursor: cursors[handle] }}
          onPointerDown={(e) => onHandlePointerDown(e, objectId, handle, bounds)}
        />
      ))}
    </>
  );
}

/** An inline, in-place `<textarea>` for editing a text shape, via `foreignObject`. */
function TextEditor({ shape, onDone }: { shape: TextShape; onDone: (text: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    // Deferred a frame: focusing synchronously on mount raced the browser's
    // own native click/focus handling for the pointerdown that created this
    // element, causing an immediate blur (see handlePointerDown's text
    // branch for the pointer-capture half of this fix).
    const raf = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.select();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Discard edits: blur with the shape's original text.
      doneRef.current = () => onDone(shape.text);
      e.currentTarget.blur();
    }
  }

  return (
    <foreignObject x={shape.x} y={shape.y - 16} width={240} height={80}>
      <textarea
        ref={ref}
        defaultValue={shape.text}
        onKeyDown={handleKeyDown}
        onBlur={(e) => doneRef.current(e.currentTarget.value)}
        className="draft-text-editor"
        rows={1}
      />
    </foreignObject>
  );
}

function isZeroSize(shape: Shape): boolean {
  switch (shape.kind) {
    case "rectangle":
    case "ellipse":
    case "diamond":
      return shape.width === 0 && shape.height === 0;
    case "arrow":
    case "line":
      return shape.dx === 0 && shape.dy === 0;
    case "freehand":
      return shape.points.length <= 1;
    case "text":
    case "image":
      return false;
  }
}

function hitTest(shapes: Record<ObjectId, { id: ObjectId; shape: Shape }>, point: Point) {
  const ids = Object.keys(shapes) as ObjectId[];
  for (let i = ids.length - 1; i >= 0; i--) {
    const shape = shapes[ids[i]].shape;
    if (boundsContainPoint(shapeBounds(shape), point.x, point.y)) return ids[i];
  }
  return null;
}
