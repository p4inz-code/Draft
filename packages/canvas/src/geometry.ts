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
      const xs = shape.points.map(([px]) => px + shape.x);
      const ys = shape.points.map(([, py]) => py + shape.y);
      return {
        minX: Math.min(...xs, shape.x),
        minY: Math.min(...ys, shape.y),
        maxX: Math.max(...xs, shape.x),
        maxY: Math.max(...ys, shape.y),
      };
    }
  }
}

export function boundsContainPoint(b: Bounds, x: number, y: number): boolean {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
