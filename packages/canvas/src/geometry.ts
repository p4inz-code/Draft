import type { Shape } from "@draft/shared";
import type { Point } from "./camera";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Rotates `point` by `degrees` clockwise around `center` — screen/SVG
 * coordinates (y grows downward), matching the `rotate(angle, cx, cy)`
 * transform `ShapeView` renders a rotated shape with, so a point computed
 * here lines up with what's actually on screen. */
export function rotatePoint(point: Point, center: Point, degrees: number): Point {
  if (!degrees) return point;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
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
      const rotation = shape.kind === "image" ? undefined : shape.rotation;
      if (!rotation) {
        return {
          minX: Math.min(shape.x, x2),
          minY: Math.min(shape.y, y2),
          maxX: Math.max(shape.x, x2),
          maxY: Math.max(shape.y, y2),
        };
      }
      // Rotated: the AABB of the shape's own bounding box is no longer
      // axis-aligned with the world — take the AABB of its 4 corners after
      // rotating them around the shape's center instead, the same
      // conservative-bounding-box approach every corner-handle-based tool
      // uses (this is already an approximation for ellipse/diamond even
      // unrotated — hitTest checks the box, not the curve/polygon).
      const center = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
      const corners = [
        { x: shape.x, y: shape.y },
        { x: x2, y: shape.y },
        { x: x2, y: y2 },
        { x: shape.x, y: y2 },
      ].map((corner) => rotatePoint(corner, center, rotation));
      return {
        minX: Math.min(...corners.map((c) => c.x)),
        minY: Math.min(...corners.map((c) => c.y)),
        maxX: Math.max(...corners.map((c) => c.x)),
        maxY: Math.max(...corners.map((c) => c.y)),
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
