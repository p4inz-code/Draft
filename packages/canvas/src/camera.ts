/**
 * The canvas engine's viewport (ADR-004: custom DOM/SVG canvas, not tldraw).
 * A `Camera` is the pan/zoom state applied as a CSS transform to the shape
 * layer; these are the pure coordinate-space conversions every tool
 * (selection hit-testing, drawing, the minimap later) builds on. Kept
 * framework-agnostic — no React here — so it's trivially unit-testable and
 * reusable if the rendering layer ever changes.
 */

export interface Camera {
  /** World-space coordinates of the point currently at the screen origin. */
  x: number;
  y: number;
  /** Scale factor: world units per screen pixel is `1 / zoom`. */
  zoom: number;
}

export interface Point {
  x: number;
  y: number;
}

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 1 };
}

/** Converts a point in screen (viewport pixel) space to world space. */
export function screenToWorld(camera: Camera, screen: Point): Point {
  return {
    x: camera.x + screen.x / camera.zoom,
    y: camera.y + screen.y / camera.zoom,
  };
}

/** Converts a point in world space to screen (viewport pixel) space. */
export function worldToScreen(camera: Camera, world: Point): Point {
  return {
    x: (world.x - camera.x) * camera.zoom,
    y: (world.y - camera.y) * camera.zoom,
  };
}

/** Pans the camera by a screen-space delta (e.g. from a drag gesture). */
export function panBy(camera: Camera, dxScreen: number, dyScreen: number): Camera {
  return {
    ...camera,
    x: camera.x - dxScreen / camera.zoom,
    y: camera.y - dyScreen / camera.zoom,
  };
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;

/**
 * Zooms by `factor` while keeping the world point currently under
 * `screenFocus` visually fixed — the standard "zoom to cursor" behavior.
 */
export function zoomAt(camera: Camera, screenFocus: Point, factor: number): Camera {
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor));
  const worldFocus = screenToWorld(camera, screenFocus);
  return {
    zoom: nextZoom,
    x: worldFocus.x - screenFocus.x / nextZoom,
    y: worldFocus.y - screenFocus.y / nextZoom,
  };
}
