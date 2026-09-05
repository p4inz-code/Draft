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
