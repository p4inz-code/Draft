import type { CanvasObject } from "@draft/shared";
import { getStroke } from "perfect-freehand";

/** Renders one shape as an SVG element, in the shape's own local (x/y-relative) coordinates. */
export function ShapeView({ object, selected }: { object: CanvasObject; selected: boolean }) {
  const { shape } = object;
  const stroke = "var(--draft-text)";
  const selectionStroke = selected ? "var(--draft-accent)" : stroke;

  switch (shape.kind) {
    case "rectangle":
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={Math.abs(shape.width)}
          height={Math.abs(shape.height)}
          fill="none"
          stroke={selectionStroke}
          strokeWidth={selected ? 2 : 1.5}
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={shape.x + shape.width / 2}
          cy={shape.y + shape.height / 2}
          rx={Math.abs(shape.width) / 2}
          ry={Math.abs(shape.height) / 2}
          fill="none"
          stroke={selectionStroke}
          strokeWidth={selected ? 2 : 1.5}
        />
      );
    case "diamond": {
      const { x, y, width, height } = shape;
      const points = [
        [x + width / 2, y],
        [x + width, y + height / 2],
        [x + width / 2, y + height],
        [x, y + height / 2],
      ]
        .map(([px, py]) => `${px},${py}`)
        .join(" ");
      return (
        <polygon
          points={points}
          fill="none"
          stroke={selectionStroke}
          strokeWidth={selected ? 2 : 1.5}
        />
      );
    }
    case "line":
      return (
        <line
          x1={shape.x}
          y1={shape.y}
          x2={shape.x + shape.dx}
          y2={shape.y + shape.dy}
          stroke={selectionStroke}
          strokeWidth={selected ? 2 : 1.5}
        />
      );
    case "text":
      return (
        <text x={shape.x} y={shape.y} fill={selectionStroke} fontSize={16}>
          {shape.text}
        </text>
      );
    case "arrow": {
      const x2 = shape.x + shape.dx;
      const y2 = shape.y + shape.dy;
      const angle = Math.atan2(shape.dy, shape.dx);
      const headLength = 10;
      const headAngle = Math.PI / 7;
      return (
        <g stroke={selectionStroke} strokeWidth={selected ? 2 : 1.5} fill="none">
          <line x1={shape.x} y1={shape.y} x2={x2} y2={y2} />
          <line
            x1={x2}
            y1={y2}
            x2={x2 - headLength * Math.cos(angle - headAngle)}
            y2={y2 - headLength * Math.sin(angle - headAngle)}
          />
          <line
            x1={x2}
            y1={y2}
            x2={x2 - headLength * Math.cos(angle + headAngle)}
            y2={y2 - headLength * Math.sin(angle + headAngle)}
          />
        </g>
      );
    }
    case "freehand": {
      const outline = getStroke(shape.points, { size: 3 });
      if (outline.length === 0) return null;
      const d = `M ${outline.map(([x, y]) => `${x + shape.x},${y + shape.y}`).join(" L ")} Z`;
      return <path d={d} fill={selectionStroke} />;
    }
    default:
      return null;
  }
}
