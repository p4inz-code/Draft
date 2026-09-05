export interface WordmarkProps {
  size?: number;
}

/** Plain-text placeholder wordmark — swapped for real brand assets once
 * they're provided (user opted for a placeholder at foundation stage). */
export function Wordmark({ size = 24 }: WordmarkProps) {
  return (
    <span
      style={{
        fontWeight: 700,
        letterSpacing: "0.08em",
        fontSize: size,
        color: "var(--draft-text)",
      }}
    >
      DRAFT
    </span>
  );
}
