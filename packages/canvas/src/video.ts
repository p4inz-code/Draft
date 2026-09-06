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
    const cleanup = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("the browser could not decode this file as a video"));
    };

    video.onloadedmetadata = () => {
      // A frame at exactly 0s is black/undecoded for some codecs; a small
      // offset (or the midpoint of a very short clip) reliably lands on a
      // real decoded frame across browsers.
      video.currentTime = Math.min(0.1, video.duration / 2 || 0);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2D canvas context unavailable");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png");
        cleanup();
        resolve({ dataUrl, width: video.videoWidth, height: video.videoHeight });
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    video.src = src;
  });
}
