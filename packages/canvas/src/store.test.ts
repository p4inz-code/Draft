import { beforeEach, describe, expect, it } from "vitest";
import { useCanvasStore } from "./store";

const rect = () => ({ kind: "rectangle" as const, x: 0, y: 0, width: 10, height: 10 });

beforeEach(() => {
  useCanvasStore.setState({
    shapes: {},
    selection: [],
    operations: [],
    past: [],
    future: [],
  });
});

describe("addShape / moveShape", () => {
  it("adds a shape retrievable by the returned id", () => {
    const id = useCanvasStore.getState().addShape(rect());
    expect(useCanvasStore.getState().shapes[id].shape).toEqual(rect());
  });

  it("moveShape updates x/y in place", () => {
    const id = useCanvasStore.getState().addShape(rect());
    useCanvasStore.getState().moveShape(id, 40, 50);
    const shape = useCanvasStore.getState().shapes[id].shape;
    expect(shape.x).toBe(40);
    expect(shape.y).toBe(50);
  });
});

describe("beginAction / commitAction", () => {
  it("records a create_object operation for a shape added between begin and commit", () => {
    const { beginAction, addShape, commitAction } = useCanvasStore.getState();
    beginAction();
    const id = addShape(rect());
    commitAction();

    const ops = useCanvasStore.getState().operations;
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toMatchObject({ type: "create_object", object: id });
  });

  it("drops the history entry when nothing actually changed", () => {
    const { beginAction, commitAction } = useCanvasStore.getState();
    beginAction();
    commitAction();

    expect(useCanvasStore.getState().past).toHaveLength(0);
    expect(useCanvasStore.getState().operations).toHaveLength(0);
  });
});

describe("undo / redo", () => {
  it("undo restores the pre-action shape map and records the inverse as an operation", () => {
    const { beginAction, addShape, commitAction, undo } = useCanvasStore.getState();
    beginAction();
    const id = addShape(rect());
    commitAction();

    undo();

    expect(useCanvasStore.getState().shapes[id]).toBeUndefined();
    const ops = useCanvasStore.getState().operations;
    expect(ops[ops.length - 1].operation).toEqual({
      type: "delete_object",
      page: useCanvasStore.getState().pageId,
      object: id,
    });
  });

  it("redo re-applies what undo removed", () => {
    const { beginAction, addShape, commitAction, undo, redo } = useCanvasStore.getState();
    beginAction();
    const id = addShape(rect());
    commitAction();
    undo();

    redo();

    expect(useCanvasStore.getState().shapes[id]).toBeDefined();
  });

  it("undo is a no-op when there's nothing to undo", () => {
    const before = useCanvasStore.getState().shapes;
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().shapes).toBe(before);
  });
});

describe("selection", () => {
  it("select/clearSelection/toggleSelect", () => {
    const id = useCanvasStore.getState().addShape(rect());
    useCanvasStore.getState().select([id]);
    expect(useCanvasStore.getState().selection).toEqual([id]);

    useCanvasStore.getState().toggleSelect(id);
    expect(useCanvasStore.getState().selection).toEqual([]);

    useCanvasStore.getState().toggleSelect(id);
    useCanvasStore.getState().clearSelection();
    expect(useCanvasStore.getState().selection).toEqual([]);
  });

  it("deleteShapes also removes deleted ids from the selection", () => {
    const id = useCanvasStore.getState().addShape(rect());
    useCanvasStore.getState().select([id]);

    useCanvasStore.getState().deleteShapes([id]);

    expect(useCanvasStore.getState().shapes[id]).toBeUndefined();
    expect(useCanvasStore.getState().selection).toEqual([]);
  });
});

describe("z-order", () => {
  it("bringToFront gives the moved shape a higher zIndex than everything else", () => {
    const { addShape, bringToFront } = useCanvasStore.getState();
    const a = addShape(rect());
    const b = addShape(rect());
    const c = addShape(rect());

    bringToFront([a]);

    const shapes = useCanvasStore.getState().shapes;
    const zIndex = (id: typeof a) => shapes[id].shape.zIndex ?? 0;
    expect(zIndex(a)).toBeGreaterThan(zIndex(b));
    expect(zIndex(a)).toBeGreaterThan(zIndex(c));
  });

  it("sendToBack gives the moved shape a lower zIndex than everything else", () => {
    const { addShape, sendToBack } = useCanvasStore.getState();
    const a = addShape(rect());
    const b = addShape(rect());
    const c = addShape(rect());

    sendToBack([c]);

    const shapes = useCanvasStore.getState().shapes;
    const zIndex = (id: typeof a) => shapes[id].shape.zIndex ?? 0;
    expect(zIndex(c)).toBeLessThan(zIndex(a));
    expect(zIndex(c)).toBeLessThan(zIndex(b));
  });

  it("bringToFront preserves the given order among a multi-shape selection", () => {
    const { addShape, bringToFront } = useCanvasStore.getState();
    const a = addShape(rect());
    const b = addShape(rect());
    addShape(rect()); // c, left at the back

    bringToFront([a, b]);

    const shapes = useCanvasStore.getState().shapes;
    expect(shapes[a].shape.zIndex).toBeLessThan(shapes[b].shape.zIndex as number);
  });

  it("repeated bringToFront calls keep moving the shape further ahead, not stalling", () => {
    const { addShape, bringToFront } = useCanvasStore.getState();
    const a = addShape(rect());
    const b = addShape(rect());

    bringToFront([b]);
    bringToFront([a]);

    const shapes = useCanvasStore.getState().shapes;
    expect(shapes[a].shape.zIndex).toBeGreaterThan(shapes[b].shape.zIndex as number);
  });

  it("is a no-op for an empty selection", () => {
    const { addShape, bringToFront, sendToBack } = useCanvasStore.getState();
    const a = addShape(rect());
    const before = useCanvasStore.getState().shapes;

    bringToFront([]);
    sendToBack([]);

    expect(useCanvasStore.getState().shapes).toBe(before);
    expect(useCanvasStore.getState().shapes[a].shape.zIndex).toBeUndefined();
  });
});

describe("grouping", () => {
  it("groupShapes assigns a shared groupId, groupMembers returns every sibling", () => {
    const { addShape, groupShapes, groupMembers } = useCanvasStore.getState();
    const a = addShape(rect());
    const b = addShape(rect());
    const c = addShape(rect());

    groupShapes([a, b]);

    const groupIdA = useCanvasStore.getState().shapes[a].shape.groupId;
    const groupIdB = useCanvasStore.getState().shapes[b].shape.groupId;
    expect(groupIdA).toBeDefined();
    expect(groupIdA).toBe(groupIdB);
    expect(groupMembers(a).sort()).toEqual([a, b].sort());
    expect(groupMembers(c)).toEqual([c]);
  });

  it("groupShapes is a no-op for fewer than two ids", () => {
    const { addShape, groupShapes } = useCanvasStore.getState();
    const a = addShape(rect());

    groupShapes([a]);

    expect(useCanvasStore.getState().shapes[a].shape.groupId).toBeUndefined();
  });

  it("ungroupShapes clears groupId from every given id", () => {
    const { addShape, groupShapes, ungroupShapes } = useCanvasStore.getState();
    const a = addShape(rect());
    const b = addShape(rect());
    groupShapes([a, b]);

    ungroupShapes([a, b]);

    expect(useCanvasStore.getState().shapes[a].shape.groupId).toBeUndefined();
    expect(useCanvasStore.getState().shapes[b].shape.groupId).toBeUndefined();
  });
});
