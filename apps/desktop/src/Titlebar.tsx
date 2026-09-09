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
        <button type="button" className="app-header-btn" onClick={onSave}>
          Save
        </button>
        <button type="button" className="app-header-btn" onClick={onLoad}>
          Open
        </button>
        <label className="agent-mode-control">
          Agent access:
          <select
            value={agentMode}
            onChange={(e) => onAgentModeChange(e.target.value as AgentMode)}
          >
            {AGENT_MODES.map((mode) => (
              <option key={mode} value={mode}>
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
        {status && <span className="status">{status}</span>}
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
          &#x2212;
        </button>
        <button
          type="button"
          className="app-titlebar-window-btn"
          aria-label="Maximize"
          onClick={() => withWindow((win) => win.toggleMaximize())}
        >
          &#x25a1;
        </button>
        <button
          type="button"
          className="app-titlebar-window-btn app-titlebar-close"
          aria-label="Close"
          onClick={() => withWindow((win) => win.close())}
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
