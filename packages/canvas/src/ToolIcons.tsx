import type { Tool } from "./store";

/**
 * Toolbar icons, drawn from Feather Icons (feather.dev, MIT licensed) — real
 * path data inlined directly rather than a runtime icon-font/library
 * dependency, matching the "built from scratch, no icon dependency"
 * convention for DRAFT's chrome while still using clean, recognized shapes
 * instead of ad-hoc line art. 24x24 native viewBox (Feather's own coordinate
 * system, unmodified), rendered at 16x16, 2px round-joined stroke —
 * Feather's own visual defaults — so every icon in this set reads as one
 * consistent family.
 */
export function ToolIcon({ tool }: { tool: Tool }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (tool) {
    // Feather "mouse-pointer"
    case "select":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 3l7.07 17 2.51-7.39L20 10.07z" />
          <path d="M13 13l6 6" />
        </svg>
      );
    // Feather "square"
    case "rectangle":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        </svg>
      );
    // Feather "circle"
    case "ellipse":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    // In the same family as Feather's own geometric icons (square/circle) —
    // Feather has no diamond of its own.
    case "diamond":
      return (
        <svg {...common} aria-hidden="true">
          <polygon points="12 2 22 12 12 22 2 12" />
        </svg>
      );
    // Feather "type"
    case "text":
      return (
        <svg {...common} aria-hidden="true">
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="9" y1="20" x2="15" y2="20" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
      );
    case "line":
      return (
        <svg {...common} aria-hidden="true">
          <line x1="5" y1="19" x2="19" y2="5" />
        </svg>
      );
    // Feather "arrow-up-right"
    case "arrow":
      return (
        <svg {...common} aria-hidden="true">
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      );
    // Feather "edit-3"
    case "freehand":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      );
    // Feather "x-square"
    case "eraser":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="9" x2="15" y2="15" />
          <line x1="15" y1="9" x2="9" y2="15" />
        </svg>
      );
    // Feather "flag"
    case "requirement":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      );
    // Feather "move" — the closest Feather glyph to Figma/Adobe's own Hand
    // tool icon (Feather has no dedicated hand glyph); reads clearly as
    // "grab and reposition the canvas" at toolbar size.
    case "hand":
      return (
        <svg {...common} aria-hidden="true">
          <polyline points="5 9 2 12 5 15" />
          <polyline points="9 5 12 2 15 5" />
          <polyline points="15 19 12 22 9 19" />
          <polyline points="19 9 22 12 19 15" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="12" y1="2" x2="12" y2="22" />
        </svg>
      );
    default:
      return null;
  }
}
