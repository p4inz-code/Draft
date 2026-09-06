// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// jsdom has no PointerEvent constructor at all, so fireEvent.pointerDown/
// Move/Up (which try to build one) silently produce an event with no
// clientX/clientY — every coordinate reads back NaN, not just 0. Dispatch
// a real MouseEvent instead (jsdom supports clientX/clientY on that) with
// the same "pointerdown"/etc. type string — React's delegated listeners
// match by type, not by constructor — plus a `pointerId` shim since
// Canvas.tsx reads that off the event too.
function firePointer(target: Element, type: string, x: number, y: number) {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "pointerId", { value: 1, configurable: true });
  // fireEvent.* wraps its dispatch in act() so React flushes synchronously;
  // a raw dispatchEvent doesn't get that for free.
  act(() => {
    target.dispatchEvent(event);
  });
}

function pointerDownAt(target: Element, x: number, y: number) {
  firePointer(target, "pointerdown", x, y);
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

describe("marquee selection and grouping", () => {
  it("expands a marquee that only touches one group member to the whole group", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");

    const { addShape, groupShapes } = useCanvasStore.getState();
    const a = addShape({ kind: "rectangle", x: 10, y: 10, width: 10, height: 10 });
    const b = addShape({ kind: "rectangle", x: 100, y: 100, width: 10, height: 10 });
    groupShapes([a, b]);

    setTool("select");
    // Marquee from (0,0) to (25,25) — overlaps only shape A, not B.
    pointerDownAt(svg, 0, 0);
    firePointer(svg, "pointermove", 25, 25);
    firePointer(svg, "pointerup", 25, 25);

    expect(new Set(useCanvasStore.getState().selection)).toEqual(new Set([a, b]));

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

describe("text tool focus retry", () => {
  it("keeps retrying focus across frames instead of giving up after one attempt", async () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");

    setTool("text");
    pointerDownAt(svg, 50, 50);

    const textarea = container.querySelector(".draft-text-editor") as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    if (!textarea) throw new Error("text editor not found");

    // Real jsdom's focus() always succeeds immediately, so the only way to
    // exercise the retry path (added after this exact bug reached a real
    // user: "only a box appears, typing does nothing" — one rAF wasn't
    // always enough in the desktop WebView) is to simulate an environment
    // where the first attempt doesn't "take".
    const realFocus = textarea.focus.bind(textarea);
    let focusCalls = 0;
    textarea.focus = () => {
      focusCalls += 1;
      if (focusCalls > 1) realFocus();
    };

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(textarea);
    });
    expect(focusCalls).toBeGreaterThan(1);

    unmount();
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});
