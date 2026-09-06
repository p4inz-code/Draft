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

  it("imports a video as a reference thumbnail, storing the video bytes but caching a still image", async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => ({
      drawImage,
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,thumb",
    );
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
    let video: HTMLVideoElement | undefined;
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === "video") video = el as HTMLVideoElement;
      return el;
    });

    const { container } = render(<Toolbar />);
    const file = new File(["fake-video-bytes"], "clip.mp4", { type: "video/mp4" });
    importFile(container, file);

    await vi.waitFor(() => expect(video).toBeDefined());
    Object.defineProperty(video, "videoWidth", { value: 640, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 320, configurable: true });
    video?.dispatchEvent(new Event("loadedmetadata"));
    video?.dispatchEvent(new Event("seeked"));

    await vi.waitFor(() => {
      expect(Object.values(useCanvasStore.getState().shapes)).toHaveLength(1);
    });

    const shape = useCanvasStore.getState().shapes;
    const added = Object.values(shape)[0]?.shape;
    expect(added).toMatchObject({ kind: "image", mediaKind: "video", assetId: "hash-mp4" });
    // The asset backend is handed the video's own bytes (a data: URL for the
    // File, not the thumbnail) — that's what gets stored as the asset.
    expect(useCanvasStore.getState().assetBackend?.save).toHaveBeenCalledWith(
      "mp4",
      expect.stringContaining("data:"),
    );
    // What the human sees on canvas is the extracted thumbnail, not the raw video bytes.
    expect(useCanvasStore.getState().assetCache["hash-mp4"]).toBe("data:image/png;base64,thumb");

    vi.unstubAllGlobals();
  });

  it("still imports a video whose thumbnail can't be extracted, as a placeholder-sized shape with no preview", async () => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
    let video: HTMLVideoElement | undefined;
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === "video") video = el as HTMLVideoElement;
      return el;
    });

    const { container } = render(<Toolbar />);
    const file = new File(["fake-video-bytes"], "clip.mp4", { type: "video/mp4" });
    importFile(container, file);

    await vi.waitFor(() => expect(video).toBeDefined());
    video?.dispatchEvent(new Event("error"));

    await vi.waitFor(() => {
      expect(Object.values(useCanvasStore.getState().shapes)).toHaveLength(1);
    });

    const added = Object.values(useCanvasStore.getState().shapes)[0]?.shape;
    expect(added).toMatchObject({ kind: "image", mediaKind: "video", width: 200, height: 200 });
    // The asset (the video's real bytes) is still saved even though no
    // preview could be extracted — a decode failure degrades the preview,
    // it doesn't lose the import.
    expect(useCanvasStore.getState().assetBackend?.save).toHaveBeenCalled();
    expect(useCanvasStore.getState().assetCache["hash-mp4"]).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("rejects a non-image file without calling the asset backend", async () => {
    const { container } = render(<Toolbar />);
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    importFile(container, file);

    expect((await screen.findByRole("alert")).textContent).toMatch(/isn't an image or video file/);
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
