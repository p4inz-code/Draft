import { type Theme, useTheme } from "@draft/ui";
import { type ReactElement, useEffect, useRef, useState } from "react";
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

/** How long with no interaction before the open sidebar auto-collapses back
 * to just its edge handle — matches the floating toolbar's own idle-fade
 * convention (Toolbar.tsx's IDLE_MS) rather than inventing a second value. */
const IDLE_MS = 3000;

interface SettingsSidebarProps {
  coreVersion: string | null;
}

/**
 * A docked edge sidebar, not a modal — a slim handle (Feather "chevron-left")
 * sits fixed to the right edge; opening slides the full panel out from under
 * it. Auto-collapses after IDLE_MS of no interaction, the same fade
 * discipline the floating toolbar already uses, so a settings surface left
 * open doesn't just sit there permanently covering canvas. Still a scaffold
 * underneath (three sections today; more land here in future versions).
 */
export function SettingsSidebar({ coreVersion }: SettingsSidebarProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<SectionKey>("appearance");
  const [theme, setTheme] = useTheme();
  const [updatePreference, setUpdatePreferenceState] =
    useState<UpdatePreference>(getStoredUpdatePreference);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /** (Re)starts the auto-collapse countdown — called once when the sidebar
   * opens, and again on every interaction inside it while open, matching
   * the toolbar's own revive-on-activity pattern. */
  function revive() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setOpen(false), IDLE_MS);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: revive is redefined every render but only ever closes over the ref/setState, so omitting it is safe and avoids resetting the timer on every unrelated re-render.
  useEffect(() => {
    if (!open) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }
    revive();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [open]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (open && e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div
      className={`settings-sidebar-dock${open ? " is-open" : ""}`}
      onPointerMove={open ? revive : undefined}
    >
      <button
        type="button"
        className="settings-sidebar-handle"
        aria-label={open ? "Close settings" : "Open settings"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Feather "chevron-left" / "chevron-right" */}
        <svg {...ICON_PROPS} width={16} height={16} aria-hidden="true">
          {open ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
        </svg>
      </button>

      <div className="settings-sidebar-panel" aria-hidden={!open}>
        <nav className="settings-sidebar-nav" aria-label="Settings sections">
          <div className="settings-sidebar-title">Settings</div>
          {SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              tabIndex={open ? 0 : -1}
              className={`settings-nav-item${active === section.key ? " is-active" : ""}`}
              aria-current={active === section.key}
              onClick={() => setActive(section.key)}
            >
              <span className="settings-nav-icon">{section.icon}</span>
              {section.label}
            </button>
          ))}
        </nav>

        <div className="settings-sidebar-content">
          {active === "appearance" && (
            <section className="settings-pane">
              <h2 className="settings-pane-title">Appearance</h2>
              <p className="settings-pane-desc">Choose how DRAFT looks on this device.</p>
              <div className="settings-segmented" aria-label="Theme">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    tabIndex={open ? 0 : -1}
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

          {active === "updates" && (
            <section className="settings-pane">
              <h2 className="settings-pane-title">Updates</h2>
              <p className="settings-pane-desc">
                Choose how DRAFT should handle a new version once automatic updates are set up.
              </p>
              <div className="settings-segmented" aria-label="Update preference">
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
                "Ask first" notifies you and waits for confirmation before downloading; "Download
                automatically" fetches a new version in the background and asks only before
                installing it.
              </p>
              <button type="button" className="settings-check-updates" onClick={checkForUpdates}>
                Check for updates
              </button>
              {updateStatus && <p className="settings-hint">{updateStatus}</p>}
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
