/**
 * Extracts intrinsic pixel dimensions directly from an SVG document's own
 * `width`/`height` or `viewBox` attributes. `Image().naturalWidth/Height`
 * (the mechanism used for raster formats) is unreliable for SVGs that only
 * declare a `viewBox`: browsers fall back to an arbitrary default (often
 * 300x150) rather than consistently deriving it from the viewBox aspect
 * ratio, so SVG import parses the markup itself instead.
 */
export function parseSvgDimensions(svgText: string): { width: number; height: number } | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
    return null;
  }

  const width = parseLength(root.getAttribute("width"));
  const height = parseLength(root.getAttribute("height"));
  if (width && height) return { width, height };

  const viewBox = root.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [, , vbWidth, vbHeight] = parts;
      if (vbWidth > 0 && vbHeight > 0) return { width: vbWidth, height: vbHeight };
    }
  }

  return null;
}

/** Strips a CSS unit suffix (e.g. "120px") and parses the numeric part; a
 * percentage is meaningless without a containing viewport, so treated as absent. */
function parseLength(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) return null;
  const value = Number.parseFloat(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}
