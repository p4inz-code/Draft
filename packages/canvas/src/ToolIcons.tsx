import type { Tool } from "./store";

/**
 * Small hand-drawn line icons for the toolbar, one per drawing tool —
 * custom SVG, not an icon-font/library dependency, matching the "built from
 * scratch" instruction for DRAFT's chrome. 16x16, `currentColor` stroke so
 * they inherit the button's own text/accent color for free (active state,
 * hover, idle-fade all already work via CSS with no icon-specific styling).
 */
export function ToolIcon({ tool }: { tool: Tool }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (tool) {
    case "select":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 2.5 12.5 8.5 8.5 9.5 10.5 13 9 13.7 7 10.2 4.3 12.7 Z" />
        </svg>
      );
    case "rectangle":
      return (
        <svg {...common} aria-hidden="true">
          <rect x={2.5} y={3.5} width={11} height={9} rx={1} />
        </svg>
      );
    case "ellipse":
      return (
        <svg {...common} aria-hidden="true">
          <ellipse cx={8} cy={8} rx={5.5} ry={4.5} />
        </svg>
      );
    case "diamond":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M8 2.5 13.5 8 8 13.5 2.5 8 Z" />
        </svg>
      );
    case "text":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 3.5h10M8 3.5v9" />
        </svg>
      );
    case "line":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 13 13 3" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 13 13 3M7 3h6v6" />
        </svg>
      );
    case "freehand":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 12c1.5-3 2-6.5 3.5-8S9 3 9.5 5s0 4.5 1.5 5 2.5-1 3-2.5" />
        </svg>
      );
    case "eraser":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M10.5 2.5 13.5 5.5 6.5 12.5H4L2.5 11 10.5 2.5Z" />
          <path d="M6 9 9.5 12.5" />
        </svg>
      );
    default:
      return null;
  }
}
