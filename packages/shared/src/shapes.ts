/**
 * The concrete shape payload schema carried inside `Operation.payload`. This
 * is the hand-mirrored TypeScript side of `draft-graph::shape::KnownShape`
 * (ADR-014's typed shape taxonomy) — the Rust side is a real, validated
 * `Shape` enum, not opaque JSON; there's no codegen between the two, so a
 * change here needs the matching change in `shape.rs` in the same commit
 * (see CLAUDE.md). Every shape has `x`/`y` at the top level because
 * `draft-graph::Graph::apply`'s `MoveObject` handler writes those two keys
 * directly onto the payload regardless of kind.
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
  /**
   * Stacking order — higher renders on top. Absent (not `0`) for a shape
   * that's never had its z-order explicitly changed, treated as `0` for
   * sorting; a stable sort keeps every such shape in creation order among
   * themselves (matching the pre-z-order rendering behavior exactly), so
   * old saved projects with no `zIndex` at all render identically to
   * before. Only `bringToFront`/`sendToBack` ever assign a value.
   */
  zIndex?: number;
}

/**
 * A `#rrggbb` hex fill color, shared by every shape kind that can meaningfully
 * have one. Absent (not `null`) means unfilled/transparent, matching every
 * other optional field's convention here — the stroke still renders either way.
 */
interface Fillable {
  fill?: string;
}

/**
 * Degrees clockwise around the shape's own bounding-box center. Absent (not
 * `0`) when unrotated, matching every other optional field's convention
 * here — `draft-graph`'s `normalize_rotation` collapses an explicit `0` back
 * to absent for the same reason, so a shape that's never been rotated and
 * one that was rotated back to 0° round-trip identically.
 */
interface Rotatable {
  rotation?: number;
}

/**
 * Stroke customization, shared by every shape kind that renders a visible
 * outline (rectangle/ellipse/diamond/line/arrow — not freehand, whose
 * "stroke" is really a filled outline polygon from `perfect-freehand`, or
 * text/image, which have no stroke at all). Absent fields fall back to the
 * theme's default stroke color/width, matching `fill`'s convention.
 */
interface Strokable {
  strokeColor?: string;
  strokeWidth?: number;
}

export interface RectangleShape extends ShapeBase, Fillable, Rotatable, Strokable {
  kind: "rectangle";
  width: number;
  height: number;
}

export interface EllipseShape extends ShapeBase, Fillable, Rotatable, Strokable {
  kind: "ellipse";
  width: number;
  height: number;
}

export interface DiamondShape extends ShapeBase, Fillable, Rotatable, Strokable {
  kind: "diamond";
  width: number;
  height: number;
}

/** A plain straight line — like `ArrowShape` but rendered with no arrowhead. */
export interface LineShape extends ShapeBase, Strokable {
  kind: "line";
  /** End point, relative to `x`/`y`. */
  dx: number;
  dy: number;
}

export interface TextShape extends ShapeBase {
  kind: "text";
  text: string;
}

export interface ArrowShape extends ShapeBase, Strokable {
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
 * An imported image. `assetId` is a reference into the project's
 * content-addressed asset store (ADR-015) — a filename like
 * `"<sha256>.png"`, resolved to actual bytes via `@draft/project-client`'s
 * `loadAsset`/`saveAsset` — never the raw file data itself. This is what
 * keeps `get_page`/`get_object` from handing an MCP agent the user's actual
 * image: the payload that crosses the graph/MCP boundary only ever carries
 * this reference, matching the project's "no raw assets to an agent"
 * principle (the same one that already applies to canvas screenshots).
 *
 * `mediaKind: "video"` marks a reference-only video/animation import: the
 * asset behind `assetId` is a video file, not a still image, so an agent
 * reading this shape knows not to expect the bytes to decode as one —
 * `width`/`height` and the human's own on-canvas rendering both come from a
 * single extracted thumbnail frame (`packages/canvas/src/video.ts`), not the
 * video itself (no in-canvas video playback exists — see ROADMAP). Absent
 * (not `false`) for a plain image, matching every other optional field here.
 */
export interface ImageShape extends ShapeBase {
  kind: "image";
  width: number;
  height: number;
  assetId: string;
  mediaKind?: "video";
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

/** Shapes with a `fill` field — the ones `FillPicker` applies to. Mirrors the
 * `Fillable` mixin above so there's one list to update (here) when a shape
 * kind gains a fill, instead of this plus a second hand-copied type guard. */
export type FillableShape = RectangleShape | EllipseShape | DiamondShape;

export function isFillableShape(shape: Shape): shape is FillableShape {
  return shape.kind === "rectangle" || shape.kind === "ellipse" || shape.kind === "diamond";
}

/** Shapes with a `rotation` field — the same set as `FillableShape` today,
 * kept as its own guard (not aliased) since the two properties happen to
 * share a set of kinds by coincidence, not by rule — a future fillable-only
 * or rotatable-only kind shouldn't have to fight this alias. */
export type RotatableShape = RectangleShape | EllipseShape | DiamondShape;

export function isRotatableShape(shape: Shape): shape is RotatableShape {
  return shape.kind === "rectangle" || shape.kind === "ellipse" || shape.kind === "diamond";
}

/** Shapes with a `strokeColor`/`strokeWidth` — a wider set than
 * `FillableShape`/`RotatableShape` since line/arrow have a visible stroke
 * but no fill or rotation. */
export type StrokableShape = RectangleShape | EllipseShape | DiamondShape | LineShape | ArrowShape;

export function isStrokableShape(shape: Shape): shape is StrokableShape {
  return (
    shape.kind === "rectangle" ||
    shape.kind === "ellipse" ||
    shape.kind === "diamond" ||
    shape.kind === "line" ||
    shape.kind === "arrow"
  );
}

export type ShapeKind = Shape["kind"];

export interface CanvasObject {
  id: ObjectId;
  shape: Shape;
}
