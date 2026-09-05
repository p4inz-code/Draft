/**
 * The canvas's fast, in-memory live-edit store (docs/architecture.md's
 * "data flow: a user drags a shape" — step 1). This is the moment-to-moment
 * source of truth while editing; flushing committed operations out to the
 * Rust core is a separate concern (Task: "wire canvas to draft-graph").
 */
import {
  type CanvasObject,
  type ObjectId,
  type Operation,
  type OperationRecord,
  type PageId,
  type Shape,
  newObjectId,
  newPageId,
} from "@draft/shared";
import { create } from "zustand";
import { type Camera, createCamera, panBy as panCameraBy, zoomAt as zoomCameraAt } from "./camera";
import { type ShapeMap, diffShapeMaps } from "./diff";

// No dedicated "pan" tool: middle-mouse-drag pans regardless of the active
// tool (see Canvas.tsx's handlePointerDown), so a toolbar entry for it was
// redundant.
export type Tool =
  | "select"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "text"
  | "arrow"
  | "line"
  | "freehand"
  | "eraser";

interface HistoryEntry {
  shapes: ShapeMap;
}

interface CanvasState {
  pageId: PageId;
  camera: Camera;
  tool: Tool;
  shapes: ShapeMap;
  selection: ObjectId[];
  operations: OperationRecord[];
  past: HistoryEntry[];
  future: HistoryEntry[];

  setTool: (tool: Tool) => void;
  pan: (dxScreen: number, dyScreen: number) => void;
  zoom: (screenFocus: { x: number; y: number }, factor: number) => void;
  /** Zoom in/out around the current view's own anchor (toolbar +/- buttons, keyboard). */
  zoomBy: (factor: number) => void;
  resetView: () => void;

  /** Snapshots current shapes before a mutating gesture (pointerdown). */
  beginAction: () => void;
  /** Diffs against the last snapshot and records the resulting operations. */
  commitAction: () => void;

  addShape: (shape: Shape) => ObjectId;
  moveShape: (id: ObjectId, x: number, y: number) => void;
  updateShape: (id: ObjectId, shape: Shape) => void;
  deleteShapes: (ids: ObjectId[]) => void;

  select: (ids: ObjectId[]) => void;
  toggleSelect: (id: ObjectId) => void;
  clearSelection: () => void;

  undo: () => void;
  redo: () => void;

  /** Replaces the whole page with loaded content (open project) — resets history. */
  loadPage: (pageId: PageId, shapes: ShapeMap) => void;
}

function recordOps(state: Pick<CanvasState, "operations">, ops: Operation[]): OperationRecord[] {
  const base = state.operations.length;
  const now = Date.now();
  const records = ops.map((operation, i) => ({
    sequence: base + i,
    at_unix: Math.floor(now / 1000),
    actor: "user" as const,
    operation,
  }));
  return [...state.operations, ...records];
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  pageId: newPageId(),
  camera: createCamera(),
  tool: "select",
  shapes: {},
  selection: [],
  operations: [],
  past: [],
  future: [],

  setTool: (tool) => set({ tool, selection: tool === "select" ? get().selection : [] }),

  pan: (dxScreen, dyScreen) => set((s) => ({ camera: panCameraBy(s.camera, dxScreen, dyScreen) })),

  zoom: (screenFocus, factor) =>
    set((s) => ({ camera: zoomCameraAt(s.camera, screenFocus, factor) })),

  // Anchored at the screen origin rather than the viewport center (the store
  // doesn't know the viewport's size) — reuses zoomAt's existing clamping.
  zoomBy: (factor) => set((s) => ({ camera: zoomCameraAt(s.camera, { x: 0, y: 0 }, factor) })),

  resetView: () => set({ camera: createCamera() }),

  beginAction: () => set((s) => ({ past: [...s.past, { shapes: s.shapes }], future: [] })),

  commitAction: () =>
    set((s) => {
      const last = s.past[s.past.length - 1];
      if (!last) return s;
      const ops = diffShapeMaps(last.shapes, s.shapes, s.pageId);
      if (ops.length === 0) {
        // No real change happened (e.g. a click that didn't move anything) —
        // don't leave a no-op entry on the undo stack.
        return { past: s.past.slice(0, -1) };
      }
      return { operations: recordOps(s, ops) };
    }),

  addShape: (shape) => {
    const id = newObjectId();
    set((s) => ({ shapes: { ...s.shapes, [id]: { id, shape } } }));
    return id;
  },

  moveShape: (id, x, y) =>
    set((s) => {
      const existing = s.shapes[id];
      if (!existing) return s;
      return { shapes: { ...s.shapes, [id]: { id, shape: { ...existing.shape, x, y } } } };
    }),

  updateShape: (id, shape) => set((s) => ({ shapes: { ...s.shapes, [id]: { id, shape } } })),

  deleteShapes: (ids) =>
    set((s) => {
      const shapes = { ...s.shapes };
      for (const id of ids) delete shapes[id];
      return { shapes, selection: s.selection.filter((id) => !ids.includes(id)) };
    }),

  select: (ids) => set({ selection: ids }),
  toggleSelect: (id) =>
    set((s) => ({
      selection: s.selection.includes(id)
        ? s.selection.filter((x) => x !== id)
        : [...s.selection, id],
    })),
  clearSelection: () => set({ selection: [] }),

  // Per ADR-013, undo/redo don't get a special code path downstream: the
  // transition is diffed into the same forward Operation vocabulary as any
  // other change, so draft-graph/MCP just see an ordinary edit.
  undo: () =>
    set((s) => {
      const last = s.past[s.past.length - 1];
      if (!last) return s;
      const ops = diffShapeMaps(s.shapes, last.shapes, s.pageId);
      return {
        shapes: last.shapes,
        past: s.past.slice(0, -1),
        future: [{ shapes: s.shapes }, ...s.future],
        operations: recordOps(s, ops),
      };
    }),

  redo: () =>
    set((s) => {
      const [next, ...rest] = s.future;
      if (!next) return s;
      const ops = diffShapeMaps(s.shapes, next.shapes, s.pageId);
      return {
        shapes: next.shapes,
        past: [...s.past, { shapes: s.shapes }],
        future: rest,
        operations: recordOps(s, ops),
      };
    }),
  loadPage: (pageId, shapes) =>
    set({
      pageId,
      shapes,
      selection: [],
      operations: [],
      past: [],
      future: [],
    }),
}));

export type { CanvasObject, ShapeMap };
