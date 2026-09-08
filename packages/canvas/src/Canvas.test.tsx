// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Canvas } from "./Canvas";
import { rotatePoint } from "./geometry";
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
function firePointer(
  target: Element,
  type: string,
  x: number,
  y: number,
  opts: { shiftKey?: boolean } = {},
) {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
    ...opts,
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

describe("drawing normalization and freehand decimation", () => {
  it("dragging up-and-left while drawing a rectangle still produces a non-negative width/height", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");

    setTool("rectangle");
    pointerDownAt(svg, 100, 100);
    firePointer(svg, "pointermove", 20, 30);
    firePointer(svg, "pointerup", 20, 30);

    const [object] = Object.values(useCanvasStore.getState().shapes);
    const shape = object?.shape;
    if (!shape || shape.kind !== "rectangle") throw new Error("expected a rectangle");
    expect(shape).toMatchObject({ x: 20, y: 30, width: 80, height: 70 });

    unmount();
  });

  it("skips freehand points closer than the minimum recording distance to the last one", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");

    setTool("freehand");
    pointerDownAt(svg, 0, 0);
    // Each of these is under the 2-unit threshold from the previous point,
    // so none should add a new entry to the stroke.
    firePointer(svg, "pointermove", 0.5, 0);
    firePointer(svg, "pointermove", 1, 0);
    firePointer(svg, "pointermove", 1.5, 0);
    // Comfortably past the threshold — this one should record.
    firePointer(svg, "pointermove", 20, 0);
    firePointer(svg, "pointerup", 20, 0);

    const [object] = Object.values(useCanvasStore.getState().shapes);
    const shape = object?.shape;
    if (!shape || shape.kind !== "freehand") throw new Error("expected a freehand shape");
    expect(shape.points).toEqual([
      [0, 0],
      [20, 0],
    ]);

    unmount();
  });
});

describe("shape rotation", () => {
  it("dragging the rotate handle sets the shape's rotation", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");

    const { addShape, select } = useCanvasStore.getState();
    const id = addShape({ kind: "rectangle", x: 0, y: 0, width: 100, height: 100 });
    setTool("select");
    act(() => select([id]));

    const rotateHandle = container.querySelector('[aria-label="Rotate"]');
    if (!rotateHandle) throw new Error("rotate handle not found");
    // Handle starts directly above the shape's center (50, 50), 24px up.
    pointerDownAt(rotateHandle, 50, -24);
    // Directly to the right of center — 0° in atan2 terms, +90° offset for
    // "up = neutral" puts this at a clean 90°.
    firePointer(svg, "pointermove", 150, 50);
    firePointer(svg, "pointerup", 150, 50);

    const shape = useCanvasStore.getState().shapes[id]?.shape;
    if (!shape || shape.kind !== "rectangle") throw new Error("expected a rectangle");
    expect(shape.rotation).toBeCloseTo(90);

    unmount();
  });

  it("holding Shift while rotating snaps to the nearest 45° step", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");

    const { addShape, select } = useCanvasStore.getState();
    const id = addShape({ kind: "rectangle", x: 0, y: 0, width: 100, height: 100 });
    setTool("select");
    act(() => select([id]));

    const rotateHandle = container.querySelector('[aria-label="Rotate"]');
    if (!rotateHandle) throw new Error("rotate handle not found");
    pointerDownAt(rotateHandle, 50, -24);
    // atan2(36.4, 100) ≈ 20°, +90 offset ≈ 110° unconstrained — nearest 45°
    // step is 90°, not 110° or 135°.
    firePointer(svg, "pointermove", 150, 86.4, { shiftKey: true });
    firePointer(svg, "pointerup", 150, 86.4, { shiftKey: true });

    const shape = useCanvasStore.getState().shapes[id]?.shape;
    if (!shape || shape.kind !== "rectangle") throw new Error("expected a rectangle");
    expect(shape.rotation).toBe(90);

    unmount();
  });

  it("only rectangle/ellipse/diamond get a rotate handle — not image", () => {
    const { container, unmount } = render(<Canvas />);
    const { addShape, select } = useCanvasStore.getState();
    const id = addShape({ kind: "image", x: 0, y: 0, width: 50, height: 50, assetId: "a.png" });
    setTool("select");
    act(() => select([id]));

    expect(container.querySelector('[aria-label="Rotate"]')).toBeNull();
    // The resize handles should still be there — rotation just doesn't apply.
    expect(container.querySelector('[aria-label="Resize (se)"]')).not.toBeNull();

    unmount();
  });
});

describe("Shift-to-constrain while drawing", () => {
  it("constrains a rectangle to a square when Shift is held", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");

    setTool("rectangle");
    pointerDownAt(svg, 0, 0);
    firePointer(svg, "pointermove", 100, 40, { shiftKey: true });
    firePointer(svg, "pointerup", 100, 40, { shiftKey: true });

    const [object] = Object.values(useCanvasStore.getState().shapes);
    const shape = object?.shape;
    if (!shape || shape.kind !== "rectangle") throw new Error("expected a rectangle");
    expect(shape.width).toBe(100);
    expect(shape.height).toBe(100);

    unmount();
  });

  it("does not constrain when Shift is not held", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");

    setTool("rectangle");
    pointerDownAt(svg, 0, 0);
    firePointer(svg, "pointermove", 100, 40);
    firePointer(svg, "pointerup", 100, 40);

    const [object] = Object.values(useCanvasStore.getState().shapes);
    const shape = object?.shape;
    if (!shape || shape.kind !== "rectangle") throw new Error("expected a rectangle");
    expect(shape).toMatchObject({ width: 100, height: 40 });

    unmount();
  });

  it("snaps a line's angle to the nearest 45° step when Shift is held", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");

    setTool("line");
    pointerDownAt(svg, 0, 0);
    // atan2(10, 100) ≈ 5.7°, well under the 22.5° snap threshold, so this
    // should snap flat to 0° while keeping the drawn distance.
    firePointer(svg, "pointermove", 100, 10, { shiftKey: true });
    firePointer(svg, "pointerup", 100, 10, { shiftKey: true });

    const [object] = Object.values(useCanvasStore.getState().shapes);
    const shape = object?.shape;
    if (!shape || shape.kind !== "line") throw new Error("expected a line");
    expect(shape.dy).toBeCloseTo(0, 5);
    expect(shape.dx).toBeCloseTo(Math.hypot(100, 10), 5);

    unmount();
  });
});

describe("keyboard-only canvas use", () => {
  it("arrow keys nudge the selected shape by 1px, Shift+arrow by 10px", () => {
    const { unmount } = render(<Canvas />);
    const { addShape, select } = useCanvasStore.getState();
    let id = "" as ReturnType<typeof addShape>;
    act(() => {
      id = addShape({ kind: "rectangle", x: 10, y: 10, width: 5, height: 5 });
      select([id]);
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    let shape = useCanvasStore.getState().shapes[id].shape;
    expect(shape.x).toBe(11);
    expect(shape.y).toBe(10);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true }));
    shape = useCanvasStore.getState().shapes[id].shape;
    expect(shape.x).toBe(11);
    expect(shape.y).toBe(20);

    unmount();
  });

  it("does nothing on arrow keys when nothing is selected", () => {
    const { unmount } = render(<Canvas />);
    const { addShape } = useCanvasStore.getState();
    let id = "" as ReturnType<typeof addShape>;
    act(() => {
      id = addShape({ kind: "rectangle", x: 10, y: 10, width: 5, height: 5 });
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));

    expect(useCanvasStore.getState().shapes[id].shape.x).toBe(10);
    unmount();
  });

  it("Tab cycles selection through every shape when the canvas has focus", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");
    const { addShape } = useCanvasStore.getState();
    let a = "" as ReturnType<typeof addShape>;
    let b = a;
    act(() => {
      a = addShape({ kind: "rectangle", x: 0, y: 0, width: 5, height: 5 });
      b = addShape({ kind: "rectangle", x: 10, y: 10, width: 5, height: 5 });
    });
    (svg as HTMLElement).focus();
    expect(document.activeElement).toBe(svg);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(useCanvasStore.getState().selection).toEqual([a]);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(useCanvasStore.getState().selection).toEqual([b]);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
    expect(useCanvasStore.getState().selection).toEqual([a]);

    unmount();
  });

  it("Tab does nothing when the canvas doesn't have focus", () => {
    const { unmount } = render(<Canvas />);
    const { addShape } = useCanvasStore.getState();
    act(() => {
      addShape({ kind: "rectangle", x: 0, y: 0, width: 5, height: 5 });
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));

    expect(useCanvasStore.getState().selection).toEqual([]);
    unmount();
  });
});

describe("z-order rendering and shortcuts", () => {
  it("renders shapes sorted by zIndex, not insertion order", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");
    const { addShape, bringToFront } = useCanvasStore.getState();
    let a = "" as ReturnType<typeof addShape>;
    act(() => {
      a = addShape({ kind: "rectangle", x: 0, y: 0, width: 10, height: 10 });
      addShape({ kind: "rectangle", x: 20, y: 20, width: 10, height: 10 });
    });

    act(() => bringToFront([a]));

    // Excludes the background grid rect (width="100%", not a shape).
    const rects = [...svg.querySelectorAll("rect")].filter(
      (r) => r.getAttribute("width") !== "100%",
    );
    expect(rects).toHaveLength(2);
    // b (unmoved, zIndex 0) should render first, a (brought to front) last —
    // later SVG elements paint on top, so this is what "in front" means.
    expect(rects[0].getAttribute("x")).toBe("20");
    expect(rects[1].getAttribute("x")).toBe("0");

    unmount();
  });

  it("Ctrl+] brings the selection to front, Ctrl+[ sends it to back", () => {
    const { unmount } = render(<Canvas />);
    const { addShape, select } = useCanvasStore.getState();
    const a = addShape({ kind: "rectangle", x: 0, y: 0, width: 10, height: 10 });
    const b = addShape({ kind: "rectangle", x: 0, y: 0, width: 10, height: 10 });
    act(() => select([a]));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "]", ctrlKey: true }));
    let shapes = useCanvasStore.getState().shapes;
    expect(shapes[a].shape.zIndex).toBeGreaterThan(shapes[b].shape.zIndex ?? 0);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "[", ctrlKey: true }));
    shapes = useCanvasStore.getState().shapes;
    expect(shapes[a].shape.zIndex).toBeLessThan(shapes[b].shape.zIndex ?? 0);

    unmount();
  });
});

describe("resizing a rotated shape", () => {
  it("keeps the opposite corner pinned in world space while the dragged corner moves", () => {
    const { container, unmount } = render(<Canvas />);
    const svg = container.querySelector('[role="application"]');
    if (!svg) throw new Error("canvas svg not found");

    const { addShape, select, updateShape } = useCanvasStore.getState();
    const id = addShape({ kind: "rectangle", x: 0, y: 0, width: 100, height: 50 });
    act(() =>
      updateShape(id, { kind: "rectangle", x: 0, y: 0, width: 100, height: 50, rotation: 90 }),
    );
    setTool("select");
    act(() => select([id]));

    // Rotated 90° around its center (50, 25): the local "se" corner (100, 50)
    // renders at world (25, 75) — see the geometry worked out in
    // SESSION_LOG.md's rotation entry. Drag it further out to (25, 125).
    const seHandle = container.querySelector('[aria-label="Resize (se)"]');
    if (!seHandle) throw new Error("se resize handle not found");
    pointerDownAt(seHandle, 25, 75);
    firePointer(svg, "pointermove", 25, 125);
    firePointer(svg, "pointerup", 25, 125);

    const shape = useCanvasStore.getState().shapes[id]?.shape;
    if (!shape || shape.kind !== "rectangle") throw new Error("expected a rectangle");
    expect(shape.rotation).toBeCloseTo(90);

    // The "nw" local corner (x, y) rotated around the *new* center must land
    // back at the original anchor's world position, (75, -25) — not just
    // "wherever (minX, minY) ends up," which is what a rotation-naive resize
    // would silently get wrong.
    const newCenter = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
    const rotatedNwCorner = rotatePoint({ x: shape.x, y: shape.y }, newCenter, shape.rotation ?? 0);
    expect(rotatedNwCorner.x).toBeCloseTo(75);
    expect(rotatedNwCorner.y).toBeCloseTo(-25);

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
