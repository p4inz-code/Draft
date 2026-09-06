// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toolbar } from "./Toolbar";
import { useCanvasStore } from "./store";

// jsdom never decodes real image bytes, so a real `Image()` never fires
// onload/onerror — every raster-import test needs this so `readImageSize`
// (Toolbar.tsx) resolves instead of hanging forever.
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 300;
  naturalHeight = 150;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function importFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

describe("Toolbar image import", () => {
  const originalImage = global.Image;

  beforeEach(() => {
    // @ts-expect-error test double, not a full HTMLImageElement
    global.Image = FakeImage;
    useCanvasStore.setState({
      shapes: {},
      assetCache: {},
      assetBackend: { save: vi.fn(async (ext: string) => `hash-${ext}`) },
    });
  });

  afterEach(() => {
    global.Image = originalImage;
    cleanup();
  });

  it("imports a PNG via the injected asset backend, storing a reference not bytes", async () => {
    const { container } = render(<Toolbar />);
    const file = new File(["fake-png-bytes"], "photo.png", { type: "image/png" });
    importFile(container, file);

    await vi.waitFor(() => {
      expect(Object.values(useCanvasStore.getState().shapes)).toHaveLength(1);
    });

    const shape = Object.values(useCanvasStore.getState().shapes)[0]?.shape;
    expect(shape?.kind).toBe("image");
    expect(shape).toHaveProperty("assetId", "hash-png");
    expect(shape).not.toHaveProperty("src");
    expect(useCanvasStore.getState().assetBackend?.save).toHaveBeenCalledWith(
      "png",
      expect.stringContaining("data:"),
    );
  });

  it("imports a JPEG the same way as PNG", async () => {
    const { container } = render(<Toolbar />);
    const file = new File(["fake-jpeg-bytes"], "photo.jpg", { type: "image/jpeg" });
    importFile(container, file);

    await vi.waitFor(() => {
      expect(Object.values(useCanvasStore.getState().shapes)).toHaveLength(1);
    });

    const shape = Object.values(useCanvasStore.getState().shapes)[0]?.shape;
    expect(shape?.kind).toBe("image");
    expect(shape).toHaveProperty("assetId", "hash-jpg");
  });

  it("imports an SVG, sizing it from the markup's viewBox rather than Image() decoding", async () => {
    const { container } = render(<Toolbar />);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"></svg>`;
    const file = new File([svg], "icon.svg", { type: "image/svg+xml" });
    importFile(container, file);

    await vi.waitFor(() => {
      expect(Object.values(useCanvasStore.getState().shapes)).toHaveLength(1);
    });

    const shape = Object.values(useCanvasStore.getState().shapes)[0]?.shape as {
      width: number;
      height: number;
    };
    // 640x320 exceeds the 400px max-dimension cap, so it scales down keeping
    // the 2:1 aspect ratio from the viewBox — proving the viewBox (not a
    // FakeImage default) drove the computed size.
    expect(shape.width).toBe(400);
    expect(shape.height).toBe(200);
  });

  it("rejects a non-image file without calling the asset backend", async () => {
    const { container } = render(<Toolbar />);
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    importFile(container, file);

    expect((await screen.findByRole("alert")).textContent).toMatch(/isn't an image file/);
    expect(useCanvasStore.getState().assetBackend?.save).not.toHaveBeenCalled();
    expect(Object.values(useCanvasStore.getState().shapes)).toHaveLength(0);
  });

  it("surfaces a clear error when no asset backend is wired in", async () => {
    useCanvasStore.setState({ assetBackend: null });
    const { container } = render(<Toolbar />);
    const file = new File(["fake-png-bytes"], "photo.png", { type: "image/png" });
    importFile(container, file);

    expect((await screen.findByRole("alert")).textContent).toMatch(/isn't available/);
    expect(Object.values(useCanvasStore.getState().shapes)).toHaveLength(0);
  });
});
