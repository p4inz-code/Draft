// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractVideoThumbnail } from "./video";

// jsdom implements neither video decoding nor a real 2D canvas context (the
// optional `canvas` package isn't a dependency here), so this exercises the
// function's sequencing — create video, wait for metadata, seek, draw, read
// back a data URL — rather than real frame decoding, the same trade-off
// `Toolbar.test.tsx`'s `FakeImage` makes for raster imports.
describe("extractVideoThumbnail", () => {
  let drawImage: ReturnType<typeof vi.fn>;
  let toDataURL: ReturnType<typeof vi.fn>;
  let getContext: ReturnType<typeof vi.fn>;
  let lastVideo: HTMLVideoElement | undefined;

  beforeEach(() => {
    drawImage = vi.fn();
    toDataURL = vi.fn(() => "data:image/png;base64,thumbnail");
    getContext = vi.fn(() => ({ drawImage }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      getContext as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(toDataURL);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });

    // `extractVideoThumbnail` never appends its offscreen <video> to the
    // document (real browsers don't need that to decode), so a test has no
    // other way to reach the instance it's driving — capture it here
    // instead of changing production code just to make it queryable.
    lastVideo = undefined;
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === "video") lastVideo = el as HTMLVideoElement;
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Fires the loadedmetadata -> seeked sequence a real browser would, after
   * stubbing the read-only video dimensions jsdom otherwise reports as 0. */
  function driveToSeeked(video: HTMLVideoElement, width: number, height: number) {
    Object.defineProperty(video, "videoWidth", { value: width, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: height, configurable: true });
    video.dispatchEvent(new Event("loadedmetadata"));
    video.dispatchEvent(new Event("seeked"));
  }

  it("draws the seeked frame onto a canvas sized to the video and resolves with its dimensions", async () => {
    const file = new File(["fake-video-bytes"], "clip.mp4", { type: "video/mp4" });
    const promise = extractVideoThumbnail(file);
    const video = lastVideo as HTMLVideoElement;
    expect(video).toBeTruthy();

    driveToSeeked(video, 640, 360);

    await expect(promise).resolves.toEqual({
      dataUrl: "data:image/png;base64,thumbnail",
      width: 640,
      height: 360,
    });
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
    expect(toDataURL).toHaveBeenCalledWith("image/png");
  });

  it("accepts an already-loaded data URL directly, without an object URL", async () => {
    const dataUrl = "data:video/mp4;base64,ZmFrZQ==";
    const promise = extractVideoThumbnail(dataUrl);
    const video = lastVideo as HTMLVideoElement;
    expect(video.src).toBe(dataUrl);

    driveToSeeked(video, 100, 50);
    await expect(promise).resolves.toEqual({
      dataUrl: "data:image/png;base64,thumbnail",
      width: 100,
      height: 50,
    });
  });

  it("rejects when the browser can't decode the file as a video", async () => {
    const file = new File(["not really a video"], "broken.mp4", { type: "video/mp4" });
    const promise = extractVideoThumbnail(file);
    const video = lastVideo as HTMLVideoElement;
    video.dispatchEvent(new Event("error"));

    await expect(promise).rejects.toThrow(/could not decode/);
  });

  it("rejects when a 2D canvas context isn't available", async () => {
    getContext.mockReturnValue(null);
    const file = new File(["fake-video-bytes"], "clip.mp4", { type: "video/mp4" });
    const promise = extractVideoThumbnail(file);
    const video = lastVideo as HTMLVideoElement;

    driveToSeeked(video, 640, 360);
    await expect(promise).rejects.toThrow(/2D canvas context unavailable/);
  });

  it("rejects when the seeked frame has zero dimensions instead of resolving with a blank thumbnail", async () => {
    const file = new File(["fake-video-bytes"], "clip.mp4", { type: "video/mp4" });
    const promise = extractVideoThumbnail(file);
    const video = lastVideo as HTMLVideoElement;

    driveToSeeked(video, 0, 0);
    await expect(promise).rejects.toThrow(/no decodable frame/);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it("captures immediately when the seek target is already the current time, instead of waiting forever for a no-op seek", async () => {
    // A zero/NaN-duration clip makes the seek target compute to 0, which is
    // also jsdom's (and a real browser's) default currentTime — setting
    // currentTime to its own value is a no-op that never fires `seeked`.
    const file = new File(["fake-video-bytes"], "clip.mp4", { type: "video/mp4" });
    const promise = extractVideoThumbnail(file);
    const video = lastVideo as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { value: 320, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 240, configurable: true });

    video.dispatchEvent(new Event("loadedmetadata"));
    // Deliberately no `seeked` dispatch — a real browser wouldn't fire one either.

    await expect(promise).resolves.toEqual({
      dataUrl: "data:image/png;base64,thumbnail",
      width: 320,
      height: 240,
    });
  });

  it("rejects after a timeout if the video never fires loadedmetadata, seeked, or error", async () => {
    vi.useFakeTimers();
    try {
      const file = new File(["fake-video-bytes"], "clip.mp4", { type: "video/mp4" });
      const promise = extractVideoThumbnail(file);
      const revokeObjectURL = (URL as unknown as { revokeObjectURL: ReturnType<typeof vi.fn> })
        .revokeObjectURL;

      const assertion = expect(promise).rejects.toThrow(/timed out/);
      await vi.runAllTimersAsync();
      await assertion;
      // The blob URL still gets revoked on a timeout, not just on success/error.
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    } finally {
      vi.useRealTimers();
    }
  });
});
