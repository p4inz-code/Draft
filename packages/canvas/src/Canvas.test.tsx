// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Canvas } from "./Canvas";
import { NUMBER_KEY_TOOLS, type Tool, useCanvasStore } from "./store";

// handlePointerDown reads `tool` from a render-time closure, not
// store.getState() — correct in the browser (a real click always comes
// after React has re-rendered from the toolbar's own setState), but a
// direct useCanvasStore.setState() in a test needs to be flushed through
// an explicit render first, or the very next dispatched event still sees
// the old closure.
function setTool(tool: Tool) {
  act(() => {
    useCanvasStore.setState({ tool });
  });
}

// jsdom doesn't implement the Pointer Events capture API; Canvas.tsx calls
// setPointerCapture unconditionally on pointerdown, so give it a harmless
// no-op rather than mocking every individual test's element.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
}

function pointerDownAt(target: Element, x: number, y: number) {
  fireEvent.pointerDown(target, { clientX: x, clientY: y, button: 0, pointerId: 1 });
}

beforeEach(() => {
  useCanvasStore.setState({ tool: "select", shapes: {}, selection: [] });
});

describe("number-key tool shortcuts", () => {
  it("switches to each tool on its number key, matching NUMBER_KEY_TOOLS", () => {
    const { unmount } = render(<Canvas />);

    for (const [key, tool] of Object.entries(NUMBER_KEY_TOOLS)) {
      useCanvasStore.setState({ tool: "select" });
      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      expect(useCanvasStore.getState().tool).toBe(tool);
    }

    unmount();
  });

  it("ignores number keys with a modifier held (e.g. Ctrl+1)", () => {
    const { unmount } = render(<Canvas />);
    useCanvasStore.setState({ tool: "eraser" });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", ctrlKey: true }));

    expect(useCanvasStore.getState().tool).toBe("eraser");
    unmount();
  });

  it("ignores number keys while typing in an input/textarea", () => {
    const { unmount } = render(<Canvas />);
    useCanvasStore.setState({ tool: "eraser" });
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    input.focus();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true }));

    expect(useCanvasStore.getState().tool).toBe("eraser");
    document.body.removeChild(input);
    unmount();
  });
});

describe("text tool click-away commit", () => {
  it("clicking elsewhere on the canvas commits the in-progress text instead of stranding the editor open", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");

    setTool("text");
    pointerDownAt(svg, 50, 50);

    const textarea = container.querySelector(".draft-text-editor") as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    textarea?.focus();
    fireEvent.change(textarea as HTMLTextAreaElement, { target: { value: "hello" } });

    // A pointerdown elsewhere on the canvas (e.g. switching to select and
    // clicking away) must not get stuck with the textarea still open and
    // its text uncommitted — this is the regression from adding
    // preventDefault() to suppress native drag-selection, which also
    // suppresses the browser's default "blur the focused element" action
    // that this flow used to rely on implicitly.
    setTool("select");
    pointerDownAt(svg, 300, 300);

    expect(container.querySelector(".draft-text-editor")).toBeNull();
    const committed = Object.values(useCanvasStore.getState().shapes).find(
      (o) => o.shape.kind === "text",
    );
    expect(committed?.shape.kind === "text" && committed.shape.text).toBe("hello");

    unmount();
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});
