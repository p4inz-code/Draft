// @vitest-environment jsdom
import type { CanvasObject } from "@draft/shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShapeView } from "./ShapeView";

function objectFor(shape: CanvasObject["shape"]): CanvasObject {
  return { id: "object://test" as CanvasObject["id"], shape };
}

describe("ShapeView fill rendering", () => {
  it("renders an unfilled rectangle as fill=none", () => {
    const { container } = render(
      <svg role="presentation">
        <ShapeView
          object={objectFor({ kind: "rectangle", x: 0, y: 0, width: 10, height: 10 })}
          selected={false}
        />
      </svg>,
    );
    expect(container.querySelector("rect")?.getAttribute("fill")).toBe("none");
  });

  it("renders a filled rectangle/ellipse/diamond with the shape's own fill color", () => {
    const { container: rectContainer } = render(
      <svg role="presentation">
        <ShapeView
          object={objectFor({
            kind: "rectangle",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            fill: "#ff0000",
          })}
          selected={false}
        />
      </svg>,
    );
    expect(rectContainer.querySelector("rect")?.getAttribute("fill")).toBe("#ff0000");

    const { container: ellipseContainer } = render(
      <svg role="presentation">
        <ShapeView
          object={objectFor({
            kind: "ellipse",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            fill: "#00ff00",
          })}
          selected={false}
        />
      </svg>,
    );
    expect(ellipseContainer.querySelector("ellipse")?.getAttribute("fill")).toBe("#00ff00");

    const { container: diamondContainer } = render(
      <svg role="presentation">
        <ShapeView
          object={objectFor({
            kind: "diamond",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            fill: "#0000ff",
          })}
          selected={false}
        />
      </svg>,
    );
    expect(diamondContainer.querySelector("polygon")?.getAttribute("fill")).toBe("#0000ff");
  });
});
