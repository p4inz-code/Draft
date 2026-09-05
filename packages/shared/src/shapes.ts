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

export type Shape =
  | RectangleShape
  | EllipseShape
  | DiamondShape
  | TextShape
  | ArrowShape
  | LineShape
  | FreehandShape;

/** Shapes with a `width`/`height` bounding box — the ones resize handles apply to. */
export type ResizableShape = RectangleShape | EllipseShape | DiamondShape;

export function isResizableShape(shape: Shape): shape is ResizableShape {
  return shape.kind === "rectangle" || shape.kind === "ellipse" || shape.kind === "diamond";
}

export type ShapeKind = Shape["kind"];

export interface CanvasObject {
  id: ObjectId;
  shape: Shape;
}
