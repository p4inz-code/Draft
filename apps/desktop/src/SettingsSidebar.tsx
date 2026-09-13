import { type Theme, useTheme } from "@draft/ui";
import { type ReactElement, useState } from "react";
import "./SettingsSidebar.css";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

type SectionKey = "appearance" | "agents" | "updates" | "about";

/** Feather Icons (feather.dev, MIT) path data, inlined the same way
 * packages/canvas/src/ToolIcons.tsx does — see its own doc comment for why. */
const ICON_PROPS = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
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
    key: "updates",
    label: "Updates",
    // Feather "download-cloud"
    icon: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <polyline points="8 17 12 21 16 17" />
        <line x1="12" y1="12" x2="12" y2="21" />
        <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
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

const ALL_SECTION_KEYS = SECTIONS.map((s) => s.key);

export type UpdatePreference = "ask" | "auto";
const UPDATE_PREFERENCE_KEY = "draft.updatePreference";

function getStoredUpdatePreference(): UpdatePreference {
  try {
    const stored = localStorage.getItem(UPDATE_PREFERENCE_KEY);
    return stored === "auto" ? "auto" : "ask";
  } catch {
    return "ask";
  }
}

interface SettingsSidebarProps {
  coreVersion: string | null;
}

/**
 * A permanently docked right-hand panel — Figma's own properties panel is
 * always present, not an overlay a user opens/closes, so this doesn't hide
 * behind a floating toggle or auto-fade the way the floating toolbar does;
 * it's laid out as a real flex sibling of the canvas (see App.tsx/App.css),
 * taking its own width rather than floating on top.
 *
 * One scrollable column of stacked, individually collapsible sections (no
 * separate icon nav rail) — each section is its own disclosure, all
 * expanded by default, matching Figma's own panel structure.
 */
export function SettingsSidebar({ coreVersion }: SettingsSidebarProps) {
  const [expanded, setExpanded] = useState<Set<SectionKey>>(() => new Set(ALL_SECTION_KEYS));
  const [theme, setTheme] = useTheme();
  const [updatePreference, setUpdatePreferenceState] =
    useState<UpdatePreference>(getStoredUpdatePreference);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  function toggleSection(key: SectionKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setUpdatePreference(next: UpdatePreference) {
    setUpdatePreferenceState(next);
    try {
      localStorage.setItem(UPDATE_PREFERENCE_KEY, next);
    } catch {
      // Best-effort persistence only — the choice still applies for this session.
    }
  }

  function checkForUpdates() {
    // Honest placeholder, not a fake check: a real update check needs a
    // signed release manifest this project doesn't host yet (see
    // ROADMAP.md's Known Issues — tauri-plugin-updater requires a signing
    // keypair and a hosted latest.json, neither of which exist). The
    // preference above is real and will take effect the moment that
    // exists; faking a "you're up to date" result here would be lying
    // about a check that never happened.
    setUpdateStatus(
      "Automatic update checks aren't set up yet — see About for the current version.",
    );
  }

  return (
    <div className="settings-sidebar-panel">
      <div className="settings-panel-header">
        <span className="settings-panel-title">Settings</span>
      </div>

      <div className="settings-sidebar-content">
        {SECTIONS.map((section) => {
          const isExpanded = expanded.has(section.key);
          return (
            <section className="settings-section" key={section.key}>
              <button
                type="button"
                className="settings-section-header"
                aria-expanded={isExpanded}
                onClick={() => toggleSection(section.key)}
              >
                <span className="settings-section-icon">{section.icon}</span>
                <span className="settings-section-label">{section.label}</span>
                {/* Feather "chevron-down", rotated via CSS when collapsed */}
                <svg
                  {...ICON_PROPS}
                  width={13}
                  height={13}
                  className="settings-section-chevron"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isExpanded && (
                <div className="settings-section-body">
                  {section.key === "appearance" && (
                    <>
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
                        "System" follows your OS's light/dark setting; the other two override it for
                        this app only.
                      </p>
                    </>
                  )}

                  {section.key === "agents" && (
                    <>
                      <div className="settings-card settings-card-live">
                        <span className="settings-card-dot" aria-hidden="true" />
                        <div>
                          <p className="settings-card-title">Live access — already on</p>
                          <p className="settings-card-body">
                            Any agent you've granted access to (see "Agent access" in the titlebar)
                            can read/write this canvas the moment it's open — nothing to configure.
                          </p>
                        </div>
                      </div>
                      <p className="settings-pane-desc" style={{ marginTop: "0.9rem" }}>
                        To connect a standard MCP client (Claude Desktop, Claude Code, Codex CLI,
                        and others) to a saved project directly, point it at the{" "}
                        <code>draft-mcp</code> command with your project's folder as the one
                        argument.
                      </p>
                      <p className="settings-hint">
                        This build doesn't bundle that binary in the installer yet — build it from
                        source:
                      </p>
                      <pre className="settings-code">cargo build --release -p draft-mcp</pre>
                      <p className="settings-hint">
                        Then point your client's config at the resulting binary.
                      </p>
                    </>
                  )}

                  {section.key === "updates" && (
                    <>
                      <p className="settings-pane-desc">
                        Choose how DRAFT should handle a new version once automatic updates are set
                        up.
                      </p>
                      <div
                        className="settings-segmented settings-segmented--stack"
                        aria-label="Update preference"
                      >
                        <button
                          type="button"
                          aria-pressed={updatePreference === "ask"}
                          className={`settings-segmented-btn${updatePreference === "ask" ? " is-active" : ""}`}
                          onClick={() => setUpdatePreference("ask")}
                        >
                          Ask first
                        </button>
                        <button
                          type="button"
                          aria-pressed={updatePreference === "auto"}
                          className={`settings-segmented-btn${updatePreference === "auto" ? " is-active" : ""}`}
                          onClick={() => setUpdatePreference("auto")}
                        >
                          Download automatically
                        </button>
                      </div>
                      <p className="settings-hint">
                        "Ask first" notifies you and waits for confirmation before downloading;
                        "Download automatically" fetches a new version in the background and asks
                        only before installing it.
                      </p>
                      <button
                        type="button"
                        className="settings-check-updates"
                        onClick={checkForUpdates}
                      >
                        Check for updates
                      </button>
                      {updateStatus && <p className="settings-hint">{updateStatus}</p>}
                    </>
                  )}

                  {section.key === "about" && (
                    <>
                      <dl className="settings-kv">
                        <dt>Version</dt>
                        <dd>{coreVersion ?? "…"}</dd>
                        <dt>License</dt>
                        <dd>Free forever, source-available</dd>
                      </dl>
                      <p className="settings-pane-desc" style={{ marginTop: "0.9rem" }}>
                        DRAFT is free to use for any purpose, with no subscription and no paid tier
                        — the source stays visible for trust, without a future paywall.
                      </p>
                      <p className="settings-hint">
                        More settings will be added in future versions.
                      </p>
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
