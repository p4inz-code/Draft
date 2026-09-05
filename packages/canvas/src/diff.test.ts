import { newObjectId, newPageId } from "@draft/shared";
import { describe, expect, it } from "vitest";
import { type ShapeMap, diffShapeMaps } from "./diff";

describe("diffShapeMaps", () => {
  const page = newPageId();

  it("emits create_object for a shape only in after", () => {
    const id = newObjectId();
    const after: ShapeMap = {
      [id]: { id, shape: { kind: "rectangle", x: 0, y: 0, width: 10, height: 10 } },
    };

    const ops = diffShapeMaps({}, after, page);

    expect(ops).toEqual([{ type: "create_object", page, object: id, payload: after[id].shape }]);
  });

  it("emits delete_object for a shape only in before", () => {
    const id = newObjectId();
    const before: ShapeMap = {
      [id]: { id, shape: { kind: "rectangle", x: 0, y: 0, width: 10, height: 10 } },
    };

    const ops = diffShapeMaps(before, {}, page);

    expect(ops).toEqual([{ type: "delete_object", page, object: id }]);
  });

  it("emits move_object when only x/y changed", () => {
    const id = newObjectId();
    const before: ShapeMap = {
      [id]: { id, shape: { kind: "rectangle", x: 0, y: 0, width: 10, height: 10 } },
    };
    const after: ShapeMap = {
      [id]: { id, shape: { kind: "rectangle", x: 5, y: 8, width: 10, height: 10 } },
    };

    const ops = diffShapeMaps(before, after, page);

    expect(ops).toEqual([{ type: "move_object", page, object: id, x: 5, y: 8 }]);
  });

  it("emits update_object when a non-position field changed", () => {
    const id = newObjectId();
    const before: ShapeMap = {
      [id]: { id, shape: { kind: "rectangle", x: 0, y: 0, width: 10, height: 10 } },
    };
    const after: ShapeMap = {
      [id]: { id, shape: { kind: "rectangle", x: 0, y: 0, width: 99, height: 10 } },
    };

    const ops = diffShapeMaps(before, after, page);

    expect(ops).toEqual([{ type: "update_object", page, object: id, payload: after[id].shape }]);
  });

  it("emits nothing when nothing changed", () => {
    const id = newObjectId();
    const shapes: ShapeMap = {
      [id]: { id, shape: { kind: "rectangle", x: 0, y: 0, width: 10, height: 10 } },
    };

    expect(diffShapeMaps(shapes, shapes, page)).toEqual([]);
  });
});
