import { useEffect, useState } from "react";

/** "system" defers to `prefers-color-scheme` (tokens.css's default); "light"/"dark"
 * force a choice regardless of the OS setting, via `:root[data-theme]` in tokens.css. */
export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "draft.theme";

function isTheme(value: string | null): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

/** Reads the persisted choice, falling back to "system" for a first run or a
 * storage read that fails (private browsing, disabled storage). */
export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/** Applies a theme to the document root: "system" removes the override
 * entirely (tokens.css's `prefers-color-scheme` media query takes back
 * over), "light"/"dark" set `data-theme` so the matching `:root[data-theme]`
 * block in tokens.css wins regardless of the OS setting. */
export function applyTheme(theme: Theme): void {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Best-effort persistence only — the theme still applies for this session.
  }
}

/** A small React hook wrapping the module-level functions above: applies the
 * stored theme once on mount (so a reload keeps the user's choice) and
 * exposes a setter that both updates state and re-applies to the document. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  // Only on mount: applies whatever getStoredTheme() returned before state
  // existed. Later changes go through setTheme below, which already calls
  // applyTheme itself — re-running this effect on every `theme` change would
  // just be redundant, not wrong, but the setter is the single source of the
  // side effect to keep it in one place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally mount-only, see above.
  useEffect(() => {
    applyTheme(theme);
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    applyTheme(next);
  }

  return [theme, setTheme];
}
