import { describe, expect, it } from "vitest";
import { type Shape, isResizableShape } from "./shapes";

describe("isResizableShape", () => {
  it("is true for shapes with a width/height bounding box", () => {
    const rectangle: Shape = { kind: "rectangle", x: 0, y: 0, width: 10, height: 10 };
    const ellipse: Shape = { kind: "ellipse", x: 0, y: 0, width: 10, height: 10 };
    const diamond: Shape = { kind: "diamond", x: 0, y: 0, width: 10, height: 10 };
    const image: Shape = { kind: "image", x: 0, y: 0, width: 10, height: 10, src: "data:," };

    expect(isResizableShape(rectangle)).toBe(true);
    expect(isResizableShape(ellipse)).toBe(true);
    expect(isResizableShape(diamond)).toBe(true);
    expect(isResizableShape(image)).toBe(true);
  });

  it("is false for shapes without a width/height bounding box", () => {
    const text: Shape = { kind: "text", x: 0, y: 0, text: "hi" };
    const arrow: Shape = { kind: "arrow", x: 0, y: 0, dx: 5, dy: 5 };
    const line: Shape = { kind: "line", x: 0, y: 0, dx: 5, dy: 5 };
    const freehand: Shape = { kind: "freehand", x: 0, y: 0, points: [[0, 0]] };

    expect(isResizableShape(text)).toBe(false);
    expect(isResizableShape(arrow)).toBe(false);
    expect(isResizableShape(line)).toBe(false);
    expect(isResizableShape(freehand)).toBe(false);
  });
});
