import {
  type ObjectId,
  type Shape,
  type TextShape,
  isResizableShape,
  isRotatableShape,
  newObjectId,
} from "@draft/shared";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import "./Canvas.css";
import { FillPicker } from "./FillPicker";
import { ShapeView } from "./ShapeView";
import { type Point, screenToWorld } from "./camera";
import { boundsContainPoint, boundsIntersect, rotatePoint, shapeBounds } from "./geometry";
import { LETTER_KEY_TOOLS, NUMBER_KEY_TOOLS, useCanvasStore } from "./store";

/** Freehand only records a new point once the pointer has moved at least this far in world
 * units since the last one — imperceptible at any normal zoom level, but bounds a stroke's
 * point count against a fast, long, or high-poll-rate drag instead of growing unbounded
 * (every recorded point costs an O(n) array copy on append and a re-walk in `shapeBounds`/
 * `getStroke` on every subsequent frame of the same stroke). */
const MIN_FREEHAND_POINT_DISTANCE = 2;

/** Reads a pointer event's position relative to the SVG element, in screen (pixel) space. */
function screenPointFromEvent(e: React.PointerEvent<SVGSVGElement>): Point {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** Holding Shift while drawing or resizing a rectangle/ellipse/diamond
 * constrains it to equal width/height (a square/circle) instead of a free
 * rectangle — Illustrator/Photoshop's own convention. Keeps `anchor` fixed
 * and picks whichever axis was dragged further as the shared size. */
function constrainToSquare(anchor: Point, pointer: Point): Point {
  const size = Math.max(Math.abs(pointer.x - anchor.x), Math.abs(pointer.y - anchor.y));
  const signX = pointer.x >= anchor.x ? 1 : -1;
  const signY = pointer.y >= anchor.y ? 1 : -1;
  return { x: anchor.x + signX * size, y: anchor.y + signY * size };
}

/** Holding Shift while drawing a line/arrow snaps its angle to the nearest
 * 45° step instead of a free angle, preserving the drawn distance. */
function constrainAngleTo45(dx: number, dy: number): { dx: number; dy: number } {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { dx, dy };
  const step = Math.PI / 4;
  const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
  return { dx: distance * Math.cos(snapped), dy: distance * Math.sin(snapped) };
}

type DragState =
  | { kind: "none" }
  | { kind: "pan" }
  | { kind: "marquee"; startWorld: Point }
  | { kind: "move-selection"; lastWorld: Point }
  | { kind: "draw"; objectId: ObjectId; startWorld: Point }
  | { kind: "erase" }
  | {
      kind: "resize";
      objectId: ObjectId;
      handle: ResizeHandle;
      /** In the shape's own *local* (unrotated) frame — the opposite,
       * fixed corner. */
      anchor: Point;
      /** That same corner's on-screen (world) position at the moment the
       * drag started — what has to stay visually fixed as width/height
       * change, for a rotated shape. */
      anchorWorld: Point;
      /** The shape's center and rotation at the moment the drag started,
       * frozen for the whole gesture — recomputing these mid-drag from the
       * shape's own evolving width/height would be circular. */
      center: Point;
      rotation: number;
    }
  | { kind: "rotate"; objectId: ObjectId; center: Point };

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
    // The shape's own *local* (unrotated) bounds — not `shapeBounds()`'s
    // rotated AABB, which is a different, larger box once the shape is
    // rotated and would put the anchor in the wrong place entirely.
    localBounds: { minX: number; minY: number; maxX: number; maxY: number },
    rotation: number,
  ) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    // The anchor is the fixed opposite corner — dragging "nw" keeps "se" put.
    const anchor: Point = {
      x: handle.includes("w") ? localBounds.maxX : localBounds.minX,
      y: handle.includes("n") ? localBounds.maxY : localBounds.minY,
    };
    const center: Point = {
      x: (localBounds.minX + localBounds.maxX) / 2,
      y: (localBounds.minY + localBounds.maxY) / 2,
    };
    const anchorWorld = rotatePoint(anchor, center, rotation);
    store.getState().beginAction();
    setDrag({ kind: "resize", objectId, handle, anchor, anchorWorld, center, rotation });
  }

  function handleRotateHandlePointerDown(
    e: React.PointerEvent<SVGCircleElement>,
    objectId: ObjectId,
    localBounds: { minX: number; minY: number; maxX: number; maxY: number },
  ) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const center: Point = {
      x: (localBounds.minX + localBounds.maxX) / 2,
      y: (localBounds.minY + localBounds.maxY) / 2,
    };
    store.getState().beginAction();
    setDrag({ kind: "rotate", objectId, center });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const state = store.getState();
      const isEditableTarget =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
      if (isEditableTarget) return;

      const numberedTool = NUMBER_KEY_TOOLS[e.key];
      const letterTool = LETTER_KEY_TOOLS[e.key.toLowerCase()];
      if (numberedTool && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        state.setTool(numberedTool);
      } else if (letterTool && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        state.setTool(letterTool);
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
    // Blurring whatever currently has focus (the text editor, a toolbar
    // control like the agent-access dropdown, ...) is normally a side
    // effect of the browser's own default mousedown handling — but
    // preventDefault() below suppresses that default handling too. Do it
    // ourselves first, generically, so nothing can be stranded focused
    // (and, for the text editor specifically, its onBlur is what commits
    // the in-progress text).
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
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
          // Normalized to a top-left x/y with non-negative width/height, the
          // same way the "resize" case below already does — dragging up or
          // left while drawing (routine, not adversarial) used to store a
          // negative width/height that `ShapeView` (Math.abs) and
          // `shapeBounds` (min/max) disagreed on, the exact desync
          // ADR-014 describes but only actually closed for the resize path.
          const pointer = e.shiftKey ? constrainToSquare(drag.startWorld, world) : world;
          const minX = Math.min(drag.startWorld.x, pointer.x);
          const minY = Math.min(drag.startWorld.y, pointer.y);
          const maxX = Math.max(drag.startWorld.x, pointer.x);
          const maxY = Math.max(drag.startWorld.y, pointer.y);
          state.updateShape(drag.objectId, {
            ...shape,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          });
        } else if (shape.kind === "arrow" || shape.kind === "line") {
          const rawDx = world.x - drag.startWorld.x;
          const rawDy = world.y - drag.startWorld.y;
          const { dx, dy } = e.shiftKey
            ? constrainAngleTo45(rawDx, rawDy)
            : { dx: rawDx, dy: rawDy };
          state.updateShape(drag.objectId, { ...shape, dx, dy });
        } else if (shape.kind === "freehand") {
          const last = shape.points[shape.points.length - 1];
          const nextX = world.x - shape.x;
          const nextY = world.y - shape.y;
          // Skip points closer than MIN_FREEHAND_POINT_DISTANCE to the last
          // recorded one — imperceptible at any normal zoom, but keeps a
          // fast/long/high-poll-rate stroke's point array (and every
          // downstream bounds/outline recompute on it) bounded.
          if (
            !last ||
            Math.hypot(nextX - last[0], nextY - last[1]) >= MIN_FREEHAND_POINT_DISTANCE
          ) {
            state.updateShape(drag.objectId, {
              ...shape,
              points: [...shape.points, [nextX, nextY]],
            });
          }
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
        const { anchor, anchorWorld, center, rotation } = drag;
        // `world` is in screen/world space; `anchor` was captured in the
        // shape's own *local* (unrotated) frame at drag start — rotate the
        // live pointer back by the shape's (frozen, gesture-start) rotation
        // around its (also frozen) center so both sides of the min/max
        // comparison below are in the same frame. Un-rotated shapes take
        // the cheap identity path (rotation === 0, `rotatePoint` is a no-op).
        const localPointer = rotatePoint(world, center, -rotation);
        const pointer = e.shiftKey ? constrainToSquare(anchor, localPointer) : localPointer;
        const minX = Math.min(anchor.x, pointer.x);
        const minY = Math.min(anchor.y, pointer.y);
        const maxX = Math.max(anchor.x, pointer.x);
        const maxY = Math.max(anchor.y, pointer.y);
        const width = maxX - minX;
        const height = maxY - minY;
        // For a rotated shape, simply setting x/y to (minX, minY) would let
        // the anchor corner drift in *world* space — its render pivot
        // (the shape's own center) moves whenever width/height change, and
        // rotating around a different pivot lands every point somewhere
        // else. Solving for the x/y that puts the anchor corner back at
        // `anchorWorld` under the *new* width/height keeps it visually
        // pinned instead — see the "resize" section of the rotation
        // feature's design notes (SESSION_LOG.md) for the derivation.
        // Reduces to the plain `x = minX, y = minY` case when rotation is 0.
        const anchorOffset = { x: anchor.x - minX, y: anchor.y - minY };
        const halfExtent = { x: width / 2, y: height / 2 };
        const pivotOffset = rotatePoint(
          { x: anchorOffset.x - halfExtent.x, y: anchorOffset.y - halfExtent.y },
          { x: 0, y: 0 },
          rotation,
        );
        state.updateShape(drag.objectId, {
          ...obj.shape,
          x: anchorWorld.x - pivotOffset.x - halfExtent.x,
          y: anchorWorld.y - pivotOffset.y - halfExtent.y,
          width,
          height,
        });
        return;
      }
      case "rotate": {
        const obj = state.shapes[drag.objectId];
        if (!obj || !isRotatableShape(obj.shape)) return;
        // 0° is "pointer directly above center" (atan2 = -90°), so +90
        // maps that back to a neutral, unrotated angle.
        let rotation =
          (Math.atan2(world.y - drag.center.y, world.x - drag.center.x) * 180) / Math.PI + 90;
        if (e.shiftKey) rotation = Math.round(rotation / 45) * 45;
        state.updateShape(drag.objectId, { ...obj.shape, rotation });
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
      // Expand to full group membership — otherwise a marquee that only
      // partially overlaps a group selects just the enclosed members, and
      // dragging then silently pulls a grouped shape's mates apart.
      const expanded = new Set<ObjectId>();
      for (const id of hits) {
        for (const member of state.groupMembers(id)) expanded.add(member);
      }
      state.select([...expanded]);
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
    <div className="draft-canvas-wrapper">
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
                  key={editingTextId}
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
              const { shape } = obj;
              // The shape's own *local* (unrotated) bounds — not
              // `shapeBounds()`'s rotated AABB, which exists for hit-testing/
              // marquee and would put these handles in the wrong place once
              // the shape is rotated.
              const localBounds = {
                minX: shape.x,
                minY: shape.y,
                maxX: shape.x + shape.width,
                maxY: shape.y + shape.height,
              };
              const rotation = isRotatableShape(shape) ? (shape.rotation ?? 0) : 0;
              return (
                <ResizeHandles
                  objectId={obj.id}
                  bounds={localBounds}
                  rotation={rotation}
                  rotatable={isRotatableShape(shape)}
                  zoom={camera.zoom}
                  onHandlePointerDown={handleResizeHandlePointerDown}
                  onRotateHandlePointerDown={handleRotateHandlePointerDown}
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
      {selection.length === 1 && <FillPicker />}
    </div>
  );
}

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];

/** How far above the shape's own (rotated) top edge the rotate handle floats. */
const ROTATE_HANDLE_OFFSET = 24;

/**
 * Four corner handles on a selected resizable shape's bounding box, plus one
 * rotate handle for a rotatable shape. Rendered inside the world-transformed
 * `<g>`, so handle sizes are divided by zoom to stay a constant size on
 * screen rather than scaling with content. Handle positions are computed in
 * the shape's own local (unrotated) frame, then rotated around its center to
 * match — so they track the shape visually instead of sitting at its plain
 * axis-aligned bounds once it's rotated.
 */
function ResizeHandles({
  objectId,
  bounds,
  rotation,
  rotatable,
  zoom,
  onHandlePointerDown,
  onRotateHandlePointerDown,
}: {
  objectId: ObjectId;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  rotation: number;
  rotatable: boolean;
  zoom: number;
  onHandlePointerDown: (
    e: React.PointerEvent<SVGRectElement>,
    objectId: ObjectId,
    handle: ResizeHandle,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    rotation: number,
  ) => void;
  onRotateHandlePointerDown: (
    e: React.PointerEvent<SVGCircleElement>,
    objectId: ObjectId,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
  ) => void;
}) {
  const size = 8 / zoom;
  const center: Point = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  const localPositions: Record<ResizeHandle, Point> = {
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
  const rotateHandlePosition = rotatePoint(
    { x: center.x, y: bounds.minY - ROTATE_HANDLE_OFFSET / zoom },
    center,
    rotation,
  );

  return (
    <>
      {RESIZE_HANDLES.map((handle) => {
        const position = rotatePoint(localPositions[handle], center, rotation);
        return (
          <rect
            key={handle}
            role="button"
            aria-label={`Resize (${handle})`}
            x={position.x - size / 2}
            y={position.y - size / 2}
            width={size}
            height={size}
            fill="var(--draft-surface)"
            stroke="var(--draft-accent)"
            strokeWidth={1 / zoom}
            style={{ cursor: cursors[handle] }}
            onPointerDown={(e) => onHandlePointerDown(e, objectId, handle, bounds, rotation)}
          />
        );
      })}
      {rotatable && (
        <circle
          role="button"
          aria-label="Rotate"
          cx={rotateHandlePosition.x}
          cy={rotateHandlePosition.y}
          r={size / 2}
          fill="var(--draft-surface)"
          stroke="var(--draft-accent)"
          strokeWidth={1 / zoom}
          style={{ cursor: "grab" }}
          onPointerDown={(e) => onRotateHandlePointerDown(e, objectId, bounds)}
        />
      )}
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
    // branch for the pointer-capture half of this fix). That native
    // handling doesn't always finish settling within a single frame, and it
    // can steal focus back on a *later* frame than the one this effect
    // first runs on — checking success only once, immediately after calling
    // focus(), can't detect a steal that hasn't happened yet. So this
    // re-asserts focus on every frame for a bounded window instead of
    // checking once: if something else has taken focus by the time a given
    // frame runs, it's reclaimed and re-verified again next frame, rather
    // than declaring victory the moment a single focus() call returns.
    let rafId: number;
    let framesLeft = 10;
    const ensureFocused = () => {
      const el = ref.current;
      if (!el) return;
      if (document.activeElement !== el) {
        el.focus();
        el.select();
      }
      framesLeft -= 1;
      if (framesLeft > 0) {
        rafId = requestAnimationFrame(ensureFocused);
      }
    };
    rafId = requestAnimationFrame(ensureFocused);
    return () => cancelAnimationFrame(rafId);
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
