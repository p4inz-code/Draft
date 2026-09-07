// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FillPicker } from "./FillPicker";
import { useCanvasStore } from "./store";

const rect = () => ({ kind: "rectangle" as const, x: 0, y: 0, width: 10, height: 10 });

beforeEach(() => {
  useCanvasStore.setState({
    shapes: {},
    selection: [],
    past: [],
    future: [],
    operations: [],
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("FillPicker visibility", () => {
  it("renders nothing when nothing is selected", () => {
    const { container } = render(<FillPicker />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when more than one shape is selected", () => {
    const a = useCanvasStore.getState().addShape(rect());
    const b = useCanvasStore.getState().addShape(rect());
    useCanvasStore.setState({ selection: [a, b] });

    const { container } = render(<FillPicker />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for a non-fillable shape kind (e.g. text)", () => {
    const id = useCanvasStore.getState().addShape({ kind: "text", x: 0, y: 0, text: "hi" });
    useCanvasStore.setState({ selection: [id] });

    const { container } = render(<FillPicker />);
    expect(container.firstChild).toBeNull();
  });

  it("renders swatches when exactly one fillable shape is selected", () => {
    const id = useCanvasStore.getState().addShape(rect());
    useCanvasStore.setState({ selection: [id] });

    const { container } = render(<FillPicker />);
    expect(container.querySelectorAll(".draft-fill-swatch").length).toBeGreaterThan(0);
  });
});

describe("FillPicker interactions", () => {
  it("clicking a swatch sets the shape's fill and commits it as one action", () => {
    const id = useCanvasStore.getState().addShape(rect());
    useCanvasStore.setState({ selection: [id] });

    const { container } = render(<FillPicker />);
    const swatch = container.querySelector('[aria-label="Fill #ef4444"]') as HTMLButtonElement;
    expect(swatch).not.toBeNull();
    fireEvent.click(swatch);

    const shape = useCanvasStore.getState().shapes[id].shape;
    expect(shape.kind === "rectangle" && shape.fill).toBe("#ef4444");
    // A single click should be one undo step, not a dangling begin with
    // nothing to commit or an extra no-op entry.
    expect(useCanvasStore.getState().past).toHaveLength(1);
  });

  it("clicking None clears an existing fill", () => {
    const id = useCanvasStore.getState().addShape({ ...rect(), fill: "#0ea5e9" });
    useCanvasStore.setState({ selection: [id] });

    const { container, getByText } = render(<FillPicker />);
    fireEvent.click(getByText("None"));

    const shape = useCanvasStore.getState().shapes[id].shape;
    expect(shape.kind === "rectangle" && shape.fill).toBeUndefined();
    expect(container.querySelector(".draft-fill-none.selected")).not.toBeNull();
  });

  it("the custom color input reflects and updates the shape's fill", () => {
    const id = useCanvasStore.getState().addShape({ ...rect(), fill: "#123456" });
    useCanvasStore.setState({ selection: [id] });

    const { container } = render(<FillPicker />);
    const customInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    expect(customInput.value).toBe("#123456");

    fireEvent.change(customInput, { target: { value: "#abcdef" } });
    const shape = useCanvasStore.getState().shapes[id].shape;
    expect(shape.kind === "rectangle" && shape.fill).toBe("#abcdef");
  });
});
