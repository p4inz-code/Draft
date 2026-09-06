/**
 * Extracts a single still frame from a video, for on-canvas display. This is
 * reference-only import (per ADR-015's plan): the video's own bytes are what
 * gets stored as the asset (see `Toolbar.tsx`'s `handleImageFile`), never
 * this thumbnail — an SVG `<image>` element (`ShapeView.tsx`'s renderer)
 * can't display a video file directly, so *something* has to stand in for
 * it on canvas, the same way any other reference/template asset shows up.
 *
 * `source` is either the freshly picked `File` (import) or an already-loaded
 * data URL (reopening a project — `App.tsx` re-derives the thumbnail from
 * the loaded bytes rather than caching them as-is, since those bytes aren't
 * an image).
 */
/** Safety net for a decode that never fires `loadedmetadata`/`seeked`/`error`
 * at all (an unsupported codec some browsers don't cleanly error on, a
 * stalled fetch) — without this, `extractVideoThumbnail` would hang forever
 * with no feedback (found in review). */
const THUMBNAIL_TIMEOUT_MS = 8000;

export function extractVideoThumbnail(
  source: File | string,
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const src = typeof source === "string" ? source : URL.createObjectURL(source);
    const objectUrl = typeof source === "string" ? null : src;

    let settled = false;
    const timer = setTimeout(() => {
      finish(() => reject(new Error("timed out extracting a video thumbnail")));
    }, THUMBNAIL_TIMEOUT_MS);

    function finish(action: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      action();
    }

    video.onerror = () => {
      finish(() => reject(new Error("the browser could not decode this file as a video")));
    };

    const captureFrame = () => {
      try {
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          throw new Error("the video has no decodable frame");
        }
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2D canvas context unavailable");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png");
        finish(() => resolve({ dataUrl, width: video.videoWidth, height: video.videoHeight }));
      } catch (err) {
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    };

    video.onloadedmetadata = () => {
      // A frame at exactly 0s is black/undecoded for some codecs; a small
      // offset (or the midpoint of a very short clip) reliably lands on a
      // real decoded frame across browsers.
      const target = Math.min(0.1, video.duration / 2 || 0);
      // Setting currentTime to the position it's already at (e.g. a
      // zero/NaN-duration clip, where `target` computes to 0) is a no-op per
      // the HTML spec — no `seeked` event follows, so waiting for one would
      // hang forever (found in review). Capture directly in that case.
      if (target === video.currentTime) {
        captureFrame();
      } else {
        video.currentTime = target;
      }
    };

    video.onseeked = captureFrame;

    video.src = src;
  });
}
