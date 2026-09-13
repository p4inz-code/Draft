import { type Theme, useTheme } from "@draft/ui";
import { type ReactElement, useEffect, useState } from "react";
import "./SettingsPanel.css";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

type SectionKey = "appearance" | "agents" | "about";

/** Feather Icons (feather.dev, MIT) path data, inlined the same way
 * ToolIcons.tsx does — see its own doc comment for why. */
const ICON_PROPS = {
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

const SECTIONS: { key: SectionKey; label: string; icon: ReactElement }[] = [
  {
    key: "appearance",
    label: "Appearance",
    // Feather "sun"
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
  {
    key: "agents",
    label: "Agents",
    // Feather "cpu"
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
        <rect x="9" y="9" width="6" height="6" />
        <line x1="9" y1="1" x2="9" y2="4" />
        <line x1="15" y1="1" x2="15" y2="4" />
        <line x1="9" y1="20" x2="9" y2="23" />
        <line x1="15" y1="20" x2="15" y2="23" />
        <line x1="20" y1="9" x2="23" y2="9" />
        <line x1="20" y1="14" x2="23" y2="14" />
        <line x1="1" y1="9" x2="4" y2="9" />
        <line x1="1" y1="14" x2="4" y2="14" />
      </svg>
    ),
  },
  {
    key: "about",
    label: "About",
    // Feather "info"
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
];

interface SettingsPanelProps {
  onClose: () => void;
  coreVersion: string | null;
}

/**
 * A centered, sectioned settings modal (sidebar nav + content pane) —
 * Figma/Notion's own preferences pattern — rather than a corner popover, per
 * the user's own direction to make this feel like a considered, premium
 * surface. Structurally still a scaffold underneath: three sections today,
 * more land here in future versions rather than needing a new top-level
 * surface each time.
 */
export function SettingsPanel({ onClose, coreVersion }: SettingsPanelProps) {
  const [theme, setTheme] = useTheme();
  const [active, setActive] = useState<SectionKey>("appearance");

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
      <div
        className="settings-modal"
        // biome-ignore lint/a11y/useSemanticElements: <dialog> brings native modal semantics (showModal, focus trapping) this scaffold doesn't implement yet — a real upgrade path, not something to fake with the element name alone.
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="settings-sidebar" aria-label="Settings sections">
          <div className="settings-sidebar-title">Settings</div>
          {SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              className={`settings-nav-item${active === section.key ? " is-active" : ""}`}
              aria-current={active === section.key}
              onClick={() => setActive(section.key)}
            >
              <span className="settings-nav-icon">{section.icon}</span>
              {section.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            &#x2715;
          </button>

          {active === "appearance" && (
            <section className="settings-pane">
              <h2 className="settings-pane-title">Appearance</h2>
              <p className="settings-pane-desc">Choose how DRAFT looks on this device.</p>
              <div className="settings-segmented" aria-label="Theme">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={theme === option.value}
                    className={`settings-segmented-btn${theme === option.value ? " is-active" : ""}`}
                    onClick={() => setTheme(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="settings-hint">
                "System" follows your OS's light/dark setting; the other two override it for this
                app only.
              </p>
            </section>
          )}

          {active === "agents" && (
            <section className="settings-pane">
              <h2 className="settings-pane-title">Connect an agent</h2>
              <div className="settings-card settings-card-live">
                <span className="settings-card-dot" aria-hidden="true" />
                <div>
                  <p className="settings-card-title">Live access — already on</p>
                  <p className="settings-card-body">
                    Any agent you've granted access to (see "Agent access" in the titlebar) can
                    read/write this canvas the moment it's open — nothing to configure.
                  </p>
                </div>
              </div>
              <p className="settings-pane-desc" style={{ marginTop: "1.1rem" }}>
                To connect a standard MCP client (Claude Desktop, Claude Code, Codex CLI, and
                others) to a saved project directly, point it at the <code>draft-mcp</code> command
                with your project's folder as the one argument.
              </p>
              <p className="settings-hint">
                This build doesn't bundle that binary in the installer yet — build it from source:
              </p>
              <pre className="settings-code">cargo build --release -p draft-mcp</pre>
              <p className="settings-hint">
                Then point your client's config at the resulting binary.
              </p>
            </section>
          )}

          {active === "about" && (
            <section className="settings-pane">
              <h2 className="settings-pane-title">About DRAFT</h2>
              <dl className="settings-kv">
                <dt>Version</dt>
                <dd>{coreVersion ?? "…"}</dd>
                <dt>License</dt>
                <dd>Free forever, source-available</dd>
              </dl>
              <p className="settings-pane-desc" style={{ marginTop: "1.1rem" }}>
                DRAFT is free to use for any purpose, with no subscription and no paid tier — the
                source stays visible for trust, without a future paywall.
              </p>
              <p className="settings-hint">More settings will be added in future versions.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
