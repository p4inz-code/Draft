import type { Shape } from "@draft/shared";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Axis-aligned bounding box in world space, for hit-testing and marquee selection. */
export function shapeBounds(shape: Shape): Bounds {
  switch (shape.kind) {
    case "rectangle":
    case "ellipse":
    case "diamond":
    case "image": {
      const x2 = shape.x + shape.width;
      const y2 = shape.y + shape.height;
      return {
        minX: Math.min(shape.x, x2),
        minY: Math.min(shape.y, y2),
        maxX: Math.max(shape.x, x2),
        maxY: Math.max(shape.y, y2),
      };
    }
    case "text":
      return {
        minX: shape.x,
        minY: shape.y - 16,
        maxX: shape.x + Math.max(shape.text.length, 1) * 8,
        maxY: shape.y + 4,
      };
    case "arrow":
    case "line": {
      const x2 = shape.x + shape.dx;
      const y2 = shape.y + shape.dy;
      return {
        minX: Math.min(shape.x, x2),
        minY: Math.min(shape.y, y2),
        maxX: Math.max(shape.x, x2),
        maxY: Math.max(shape.y, y2),
      };
    }
    case "freehand": {
      // A single pass, not `Math.min(...xs)` on a mapped array — spreading a
      // long stroke's points as call arguments risks blowing the engine's
      // max-arguments limit, and this also skips the two intermediate
      // arrays `.map()` would otherwise allocate per bounds check.
      let minX = shape.x;
      let minY = shape.y;
      let maxX = shape.x;
      let maxY = shape.y;
      for (const [px, py] of shape.points) {
        const x = px + shape.x;
        const y = py + shape.y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return { minX, minY, maxX, maxY };
    }
  }
}

export function boundsContainPoint(b: Bounds, x: number, y: number): boolean {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
