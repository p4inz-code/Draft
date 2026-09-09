import { type Theme, useTheme } from "@draft/ui";
import { useEffect } from "react";
import "./SettingsPanel.css";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

interface SettingsPanelProps {
  onClose: () => void;
}

/**
 * A scaffold, not a full preferences system — today it only holds the
 * appearance toggle. More settings (per the user's own roadmap) land here in
 * future versions rather than needing a new top-level surface each time.
 */
export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [theme, setTheme] = useTheme();

  // The close button is the primary keyboard path; Escape is the
  // conventional secondary one for any dismissible overlay.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only convenience (click outside to dismiss) — the close button and the Escape handler above are the real keyboard paths.
    <div className="settings-overlay" onClick={onClose}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: only stops the overlay's dismiss-on-click from firing for clicks inside the panel — not itself a keyboard-operable control. */}
      <div className="settings-panel" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-header">
          <h2>Settings</h2>
          <button
            type="button"
            className="app-header-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            &#x2715;
          </button>
        </div>

        <section className="settings-section">
          <h3>Appearance</h3>
          <div className="settings-theme-options">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={theme === option.value}
                className={`settings-theme-btn${theme === option.value ? " is-active" : ""}`}
                onClick={() => setTheme(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="settings-hint">
            "System" follows your OS's light/dark setting; the other two override it for this app
            only.
          </p>
        </section>

        <section className="settings-section">
          <h3>More settings</h3>
          <p className="settings-hint">Additional preferences will be added in future versions.</p>
        </section>
      </div>
    </div>
  );
}
