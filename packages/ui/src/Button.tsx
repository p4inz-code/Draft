import type { ButtonHTMLAttributes, CSSProperties } from "react";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const baseStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--draft-border)",
  padding: "0.5em 1em",
  fontSize: "0.9rem",
  fontWeight: 500,
  cursor: "pointer",
};

const variantStyle: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--draft-accent)",
    color: "var(--draft-accent-contrast)",
    borderColor: "var(--draft-accent)",
  },
  secondary: {
    background: "var(--draft-surface)",
    color: "var(--draft-text)",
  },
};

export function Button({ variant = "secondary", style, ...rest }: ButtonProps) {
  return (
    <button type="button" style={{ ...baseStyle, ...variantStyle[variant], ...style }} {...rest} />
  );
}
