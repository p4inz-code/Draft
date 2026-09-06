/**
 * The concrete shape payload schema carried inside `Operation.payload`
 * (`payload: unknown` on the Rust side — `draft-graph` stores it as opaque
 * JSON, per docs/architecture.md's "untyped payloads" trade-off; this is
 * that schema, now that Session 1 needs one). Every shape has `x`/`y` at
 * the top level because `draft-graph::Graph::apply`'s `MoveObject` handler
 * writes those two keys directly onto the payload regardless of kind.
 */
import type { ObjectId } from "./ids";

interface ShapeBase {
  x: number;
  y: number;
  /**
   * Shapes sharing a `groupId` move and select together (Session 1's
   * grouping feature). Deliberately a plain field on the shape payload
   * rather than a new `Operation`/graph concept — `draft-graph` already
   * treats payloads as opaque JSON (see the file-level comment above), and a
   * real "group" as a first-class graph object is Session 2's object
   * taxonomy work, not this one.
   */
  groupId?: string;
}

export interface RectangleShape extends ShapeBase {
  kind: "rectangle";
  width: number;
  height: number;
}

export interface EllipseShape extends ShapeBase {
  kind: "ellipse";
  width: number;
  height: number;
}

export interface DiamondShape extends ShapeBase {
  kind: "diamond";
  width: number;
  height: number;
}

/** A plain straight line — like `ArrowShape` but rendered with no arrowhead. */
export interface LineShape extends ShapeBase {
  kind: "line";
  /** End point, relative to `x`/`y`. */
  dx: number;
  dy: number;
}

export interface TextShape extends ShapeBase {
  kind: "text";
  text: string;
}

export interface ArrowShape extends ShapeBase {
  kind: "arrow";
  /** End point, relative to `x`/`y`. */
  dx: number;
  dy: number;
}

export interface FreehandShape extends ShapeBase {
  kind: "freehand";
  /** Points relative to `x`/`y`, in drawing order. */
  points: Array<[number, number]>;
}

/**
 * An imported image. `src` is a data URL, embedded directly in the shape
 * payload — an interim simplification, not the final design: spec §11 wants
 * media referenced by an `asset://` ID so raw bytes don't have to cross the
 * MCP boundary on every `get_page` call, but that needs a project directory
 * to store the asset file in, and a fresh unsaved canvas doesn't have one
 * yet. Revisit once project/asset lifecycle (creating a project before the
 * first save) is wired up — see ROADMAP.md.
 */
export interface ImageShape extends ShapeBase {
  kind: "image";
  width: number;
  height: number;
  src: string;
}

export type Shape =
  | RectangleShape
  | EllipseShape
  | DiamondShape
  | TextShape
  | ArrowShape
  | LineShape
  | FreehandShape
  | ImageShape;

/** Shapes with a `width`/`height` bounding box — the ones resize handles apply to. */
export type ResizableShape = RectangleShape | EllipseShape | DiamondShape | ImageShape;

export function isResizableShape(shape: Shape): shape is ResizableShape {
  return (
    shape.kind === "rectangle" ||
    shape.kind === "ellipse" ||
    shape.kind === "diamond" ||
    shape.kind === "image"
  );
}

export type ShapeKind = Shape["kind"];

export interface CanvasObject {
  id: ObjectId;
  shape: Shape;
}
