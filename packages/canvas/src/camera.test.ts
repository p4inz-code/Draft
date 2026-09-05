import { describe, expect, it } from "vitest";
import { createCamera, panBy, screenToWorld, worldToScreen, zoomAt } from "./camera";

describe("screenToWorld / worldToScreen", () => {
  it("round-trip back to the original point", () => {
    const camera = { x: 120, y: -40, zoom: 2.5 };
    const screenPoint = { x: 300, y: 150 };

    const world = screenToWorld(camera, screenPoint);
    const backToScreen = worldToScreen(camera, world);

    expect(backToScreen.x).toBeCloseTo(screenPoint.x);
    expect(backToScreen.y).toBeCloseTo(screenPoint.y);
  });
});

describe("panBy", () => {
  it("moves world-space content in the direction of the drag", () => {
    const camera = createCamera();
    const panned = panBy(camera, 100, 0);
    // Dragging the canvas right by 100px should bring content that was
    // further left into view, i.e. decrease camera.x.
    expect(panned.x).toBeLessThan(camera.x);
  });
});

describe("zoomAt", () => {
  it("keeps the world point under the focal point fixed on screen", () => {
    const camera = createCamera();
    const focus = { x: 400, y: 300 };
    const worldUnderCursorBefore = screenToWorld(camera, focus);

    const zoomed = zoomAt(camera, focus, 2);
    const worldUnderCursorAfter = screenToWorld(zoomed, focus);

    expect(worldUnderCursorAfter.x).toBeCloseTo(worldUnderCursorBefore.x);
    expect(worldUnderCursorAfter.y).toBeCloseTo(worldUnderCursorBefore.y);
    expect(zoomed.zoom).toBeCloseTo(2);
  });

  it("clamps to the min/max zoom bounds", () => {
    const camera = createCamera();
    const zoomedOut = zoomAt(camera, { x: 0, y: 0 }, 0.0001);
    const zoomedIn = zoomAt(camera, { x: 0, y: 0 }, 100000);

    expect(zoomedOut.zoom).toBeGreaterThan(0);
    expect(zoomedIn.zoom).toBeLessThan(100);
  });
});
