import { AGENT_MODES, type AgentMode } from "@draft/shared";
import { getCurrentWindow } from "@tauri-apps/api/window";
import symbolIcon from "./assets/draft-symbol-light.svg";
import "./Titlebar.css";

/**
 * `getCurrentWindow()` reads `window.__TAURI_INTERNALS__`, which only exists
 * inside a real Tauri webview — calling it eagerly (e.g. at module scope)
 * throws immediately in the plain browser-preview dev environment, crashing
 * the whole app before React ever mounts (found by actually loading this in
 * the browser preview, not assumed). Deferred to first use inside a click
 * handler instead, so a preview-only session degrades to "the button
 * doesn't do anything here" rather than "nothing renders at all."
 */
function currentWindow() {
  return getCurrentWindow();
}

/** Best-effort: outside a real Tauri window (e.g. the browser preview used
 * for manual UI checks during development), these controls simply have
 * nothing to act on. */
function withWindow(action: (win: ReturnType<typeof getCurrentWindow>) => unknown) {
  try {
    void action(currentWindow());
  } catch (err) {
    console.warn("[Titlebar] window control unavailable in this environment:", err);
  }
}

const AGENT_MODE_HINTS: Record<AgentMode, string> = {
  manual: "No agent access at all — the safest default, nothing to connect yet.",
  ask: "Agents can read, but only one call at a time — you approve each read individually.",
  watch: "Agents can read everything and see changes as they happen, but never write.",
  assist: "Like Watch, plus agents can suggest changes (still no direct writes).",
  build: "Full access — agents can read and write; you'll see their edits appear live.",
};

/** Window-control glyphs, from Feather Icons (feather.dev, MIT) — real path
 * data inlined the same way packages/canvas/src/ToolIcons.tsx does. */
const WINDOW_ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

interface TitlebarProps {
  agentMode: AgentMode;
  onAgentModeChange: (mode: AgentMode) => void;
  agentConnections: number | null;
  coreVersion: string | null;
  status: string | null;
  onSave: () => void;
  onLoad: () => void;
  onApproveNextAgentRead: () => void;
}

/**
 * Replaces the OS's own window chrome (`decorations: false` in
 * tauri.conf.json) with a custom bar — merges what used to be a separate
 * in-content `.app-header` into this same bar rather than stacking two,
 * since the window no longer has a native titlebar to sit below.
 */
export function Titlebar({
  agentMode,
  onAgentModeChange,
  agentConnections,
  coreVersion,
  status,
  onSave,
  onLoad,
  onApproveNextAgentRead,
}: TitlebarProps) {
  return (
    <div className="app-titlebar" data-tauri-drag-region="deep">
      <div className="app-titlebar-brand">
        <img src={symbolIcon} alt="" width={16} height={16} />
        <span>DRAFT</span>
      </div>

      <div className="app-titlebar-actions">
        <div className="titlebar-group">
          <button type="button" className="app-header-btn" onClick={onSave}>
            Save
          </button>
          <button type="button" className="app-header-btn" onClick={onLoad}>
            Open
          </button>
        </div>

        <span className="titlebar-divider" aria-hidden="true" />

        <div className="titlebar-group">
          <label className="agent-mode-control" title={AGENT_MODE_HINTS[agentMode]}>
            Agent access:
            <select
              value={agentMode}
              onChange={(e) => onAgentModeChange(e.target.value as AgentMode)}
            >
              {AGENT_MODES.map((mode) => (
                <option key={mode} value={mode} title={AGENT_MODE_HINTS[mode]}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          {agentMode === "ask" && (
            <button
              type="button"
              className="app-header-btn"
              onClick={onApproveNextAgentRead}
              title="Ask mode requires approving each read individually — this authorizes exactly one, not a standing grant"
            >
              Approve next read
            </button>
          )}
        </div>

        {status && (
          <>
            <span className="titlebar-divider" aria-hidden="true" />
            <span className="status status-error" title={status}>
              {status}
            </span>
          </>
        )}

        <span className="titlebar-spacer" />

        <span className="status" title="Agents connected over the local MCP socket">
          {agentConnections ?? "…"} agent{agentConnections === 1 ? "" : "s"} connected
        </span>
        <span className="status">
          core <strong>{coreVersion ?? "…"}</strong>
        </span>
      </div>

      <div className="app-titlebar-window-controls">
        <button
          type="button"
          className="app-titlebar-window-btn"
          aria-label="Minimize"
          onClick={() => withWindow((win) => win.minimize())}
        >
          {/* Feather "minus" */}
          <svg {...WINDOW_ICON_PROPS} aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          type="button"
          className="app-titlebar-window-btn"
          aria-label="Maximize"
          onClick={() => withWindow((win) => win.toggleMaximize())}
        >
          {/* Feather "square" */}
          <svg {...WINDOW_ICON_PROPS} aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="1.5" ry="1.5" />
          </svg>
        </button>
        <button
          type="button"
          className="app-titlebar-window-btn app-titlebar-close"
          aria-label="Close"
          onClick={() => withWindow((win) => win.close())}
        >
          {/* Feather "x" */}
          <svg {...WINDOW_ICON_PROPS} aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
