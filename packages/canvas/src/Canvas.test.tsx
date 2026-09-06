// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Canvas } from "./Canvas";
import { LETTER_KEY_TOOLS, NUMBER_KEY_TOOLS, type Tool, useCanvasStore } from "./store";

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

describe("Illustrator-style letter tool shortcuts", () => {
  it("switches to each tool on its letter key, matching LETTER_KEY_TOOLS, alongside the number keys", () => {
    const { unmount } = render(<Canvas />);

    for (const [key, tool] of Object.entries(LETTER_KEY_TOOLS)) {
      useCanvasStore.setState({ tool: "diamond" });
      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      expect(useCanvasStore.getState().tool).toBe(tool);
    }

    unmount();
  });

  it("is case-insensitive (Caps Lock / Shift shouldn't matter)", () => {
    const { unmount } = render(<Canvas />);
    useCanvasStore.setState({ tool: "diamond" });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "V" }));

    expect(useCanvasStore.getState().tool).toBe("select");
    unmount();
  });

  it("ignores letter keys with a modifier held (e.g. Ctrl+V, which pastes)", () => {
    const { unmount } = render(<Canvas />);
    useCanvasStore.setState({ tool: "diamond" });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }));

    expect(useCanvasStore.getState().tool).toBe("diamond");
    unmount();
  });

  it("ignores letter keys while typing in an input/textarea", () => {
    const { unmount } = render(<Canvas />);
    useCanvasStore.setState({ tool: "diamond" });
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    input.focus();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true }));

    expect(useCanvasStore.getState().tool).toBe("diamond");
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

  it("starting a second text box while the tool is still armed doesn't clone the first box's content into it", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");

    setTool("text");
    pointerDownAt(svg, 50, 50);
    let textarea = container.querySelector(".draft-text-editor") as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    textarea?.focus();
    fireEvent.change(textarea as HTMLTextAreaElement, { target: { value: "first box" } });

    // The tool stays "text" (unlike the click-away-commit test above, which
    // switches to "select" first) — this is the exact repro: both the
    // outgoing shape's commit and the incoming shape's creation land in the
    // same batched React update, so `editingTextId` never goes truthy ->
    // falsy -> truthy in a way that unmounts the old TextEditor. Without a
    // `key`, React reuses the same uncontrolled <textarea> DOM node across
    // both shapes — its stale "first box" value would still be sitting in
    // the DOM the instant the new (empty) shape's editor appears, since
    // `defaultValue` only ever applies at mount, never on a prop update.
    pointerDownAt(svg, 300, 300);
    textarea = container.querySelector(".draft-text-editor") as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    expect(textarea?.value).toBe("");
    textarea?.focus();
    fireEvent.change(textarea as HTMLTextAreaElement, { target: { value: "second box" } });

    setTool("select");
    pointerDownAt(svg, 500, 500);

    const textShapes = Object.values(useCanvasStore.getState().shapes)
      .filter((o) => o.shape.kind === "text")
      .map((o) => (o.shape.kind === "text" ? o.shape.text : ""));
    expect(textShapes.sort()).toEqual(["first box", "second box"]);

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
    // exercise the retry path is to simulate an environment where the first
    // attempt doesn't "take".
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

  it("reclaims focus if something steals it away on a later frame, not just the first one", () => {
    // jsdom's real requestAnimationFrame can burn through the whole retry
    // budget faster than a test can interleave a focus steal in between —
    // stepping frames manually makes "steal it back after frame 1" testable
    // at all, which is the exact scenario checking success only once (right
    // after the first focus() call) could never catch.
    const frames: FrameRequestCallback[] = [];
    const originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    }) as typeof window.requestAnimationFrame;

    try {
      const { container, unmount } = render(<Canvas />);
      const svg = container.querySelector('[role="application"]');
      if (!svg) throw new Error("canvas svg not found");

      setTool("text");
      pointerDownAt(svg, 50, 50);

      const textarea = container.querySelector(".draft-text-editor") as HTMLTextAreaElement | null;
      if (!textarea) throw new Error("text editor not found");

      act(() => {
        frames.shift()?.(0);
      });
      expect(document.activeElement).toBe(textarea);

      const decoy = document.createElement("input");
      document.body.appendChild(decoy);
      decoy.focus();
      expect(document.activeElement).toBe(decoy);

      act(() => {
        frames.shift()?.(0);
      });
      expect(document.activeElement).toBe(textarea);

      document.body.removeChild(decoy);
      unmount();
    } finally {
      window.requestAnimationFrame = originalRAF;
    }
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});
