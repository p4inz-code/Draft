import logoForDarkBg from "./assets/draft-logo-horizontal-light.svg";
import logoForLightBg from "./assets/draft-logo-horizontal.svg";
import "./Logo.css";

export interface LogoProps {
  /** Rendered height in px; width follows the logo's own aspect ratio. */
  height?: number;
}

/**
 * DRAFT's primary logo lockup (symbol + wordmark), from the brand kit at
 * assets/brand/logo/primary/. Renders both the light-bg and dark-bg color
 * variants and lets CSS pick the right one via prefers-color-scheme, so it
 * always matches @draft/ui's system-follow theme (see tokens.css) without
 * needing to know the current theme at render time.
 */
export function Logo({ height = 32 }: LogoProps) {
  return (
    <>
      <img
        src={logoForLightBg}
        alt="DRAFT"
        height={height}
        className="draft-logo draft-logo-for-light-bg"
      />
      <img
        src={logoForDarkBg}
        alt="DRAFT"
        height={height}
        className="draft-logo draft-logo-for-dark-bg"
      />
    </>
  );
}
