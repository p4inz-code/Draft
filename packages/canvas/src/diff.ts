/**
 * Snapshot diffing for undo/redo (ADR-013): given the shape map before and
 * after a step on the history stack, synthesizes the forward `Operation`s
 * that turn `before` into `after`. This is what makes undo/redo produce
 * ordinary operations rather than a special "undo" concept — `draft-graph`
 * and, eventually, MCP never need to know a change came from an undo.
 */
import type { CanvasObject, ObjectId, Operation, PageId } from "@draft/shared";

export type ShapeMap = Record<ObjectId, CanvasObject>;

function shapesEqual(a: CanvasObject["shape"], b: CanvasObject["shape"]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isPureMove(a: CanvasObject["shape"], b: CanvasObject["shape"]): boolean {
  if (a.kind !== b.kind) return false;
  const withoutPosition = (shape: CanvasObject["shape"]) => {
    const { x: _x, y: _y, ...rest } = shape;
    return rest;
  };
  return JSON.stringify(withoutPosition(a)) === JSON.stringify(withoutPosition(b));
}

export function diffShapeMaps(before: ShapeMap, after: ShapeMap, page: PageId): Operation[] {
  const ops: Operation[] = [];
  const beforeIds = Object.keys(before) as ObjectId[];
  const afterIds = Object.keys(after) as ObjectId[];

  for (const id of afterIds) {
    if (!(id in before)) {
      ops.push({ type: "create_object", page, object: id, payload: after[id].shape });
    }
  }

  for (const id of beforeIds) {
    if (!(id in after)) {
      ops.push({ type: "delete_object", page, object: id });
    }
  }

  for (const id of afterIds) {
    if (!(id in before)) continue;
    const prev = before[id].shape;
    const next = after[id].shape;
    if (shapesEqual(prev, next)) continue;

    if (isPureMove(prev, next)) {
      ops.push({ type: "move_object", page, object: id, x: next.x, y: next.y });
    } else {
      ops.push({ type: "update_object", page, object: id, payload: next });
    }
  }

  return ops;
}
