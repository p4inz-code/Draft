import {
  Canvas,
  type ShapeMap,
  Toolbar,
  extractVideoThumbnail,
  useCanvasStore,
} from "@draft/canvas";
import {
  applyOperations,
  ensurePage,
  getAgentConnectionCount,
  getAgentMode,
  getCoreVersion,
  getPageSnapshot,
  loadAsset,
  loadSnapshot,
  onAgentConnectionsChanged,
  onGraphChanged,
  saveAsset,
  saveSnapshot,
  setAgentMode,
  setSelection,
} from "@draft/project-client";
import { AGENT_MODES, type AgentMode, type ObjectId } from "@draft/shared";
import { Logo } from "@draft/ui";
import { useEffect, useState } from "react";
import "./App.css";

const LAST_PROJECT_DIR_KEY = "draft.lastProjectDir";

/** `page.objects` (from the Rust side) into the canvas store's `ShapeMap` shape. */
function toShapeMap(objects: Record<ObjectId, unknown>): ShapeMap {
  return Object.fromEntries(
    Object.entries(objects).map(([id, shape]) => [id, { id, shape }]),
    // biome-ignore lint/suspicious/noExplicitAny: shapes reconstructed from untyped JSON
  ) as any;
}

/**
 * Reads each image object's asset bytes back (as a data URL, purely for
 * this viewer's own rendering — see ADR-015) and caches any not already
 * cached. Best-effort per asset: one bad/missing reference (e.g. an agent
 * wrote a fabricated `assetId`) shouldn't stop the rest of the page from
 * rendering.
 *
 * A `mediaKind: "video"` object's loaded bytes are the video file itself,
 * not something an `<image>` element can render (see `video.ts`) — those
 * get re-thumbnailed after loading rather than cached as-is.
 */
function loadImageAssets(objects: Record<string, unknown>, projectDir: string | null) {
  const cache = useCanvasStore.getState().assetCache;
  for (const shape of Object.values(objects)) {
    if (
      typeof shape === "object" &&
      shape !== null &&
      "kind" in shape &&
      shape.kind === "image" &&
      "assetId" in shape &&
      typeof shape.assetId === "string" &&
      !(shape.assetId in cache)
    ) {
      const assetId = shape.assetId;
      const isVideo = "mediaKind" in shape && shape.mediaKind === "video";
      loadAsset(assetId, projectDir ?? undefined)
        .then((dataUrl) =>
          isVideo ? extractVideoThumbnail(dataUrl).then((t) => t.dataUrl) : dataUrl,
        )
        .then((displayDataUrl) => useCanvasStore.getState().cacheAsset(assetId, displayDataUrl))
        .catch((err) => console.warn(`[App] couldn't load asset ${assetId}:`, err));
    }
  }
}

function App() {
  const [coreVersion, setCoreVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [agentMode, setAgentModeState] = useState<AgentMode>("manual");
  const [agentConnections, setAgentConnections] = useState<number | null>(null);

  useEffect(() => {
    getCoreVersion()
      .then(setCoreVersion)
      .catch(() => setCoreVersion(null));
    getAgentMode()
      .then(setAgentModeState)
      .catch(() => {});
    getAgentConnectionCount()
      .then(setAgentConnections)
      .catch(() => {});
  }, []);

  // @draft/canvas has no Tauri/IPC awareness by design — image import calls
  // through this injected backend rather than depending on
  // @draft/project-client directly (see the matching comment on
  // CanvasState.assetBackend).
  useEffect(() => {
    useCanvasStore.getState().setAssetBackend({
      save: (extension, dataUrl) =>
        saveAsset(extension, dataUrl, useCanvasStore.getState().projectDir ?? undefined),
    });
  }, []);

  // The spec's "explicit, visible" permission story means a connection
  // should be visible the moment it's accepted — not just once a tool call
  // succeeds or is denied against it.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onAgentConnectionsChanged(setAgentConnections).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // Keeps the live MCP graph (apps/desktop/src-tauri's `LiveState`) in sync
  // with the canvas as the human edits, so an agent connected over the local
  // socket sees changes as they happen — not just whatever was last saved.
  useEffect(() => {
    const store = useCanvasStore;
    ensurePage(store.getState().pageId, "Page 1").catch(() => {});

    return store.subscribe((state, prev) => {
      if (state.pageId !== prev.pageId) {
        ensurePage(state.pageId, "Page 1").catch(() => {});
      }
      if (state.operations.length > prev.operations.length) {
        const newOps = state.operations.slice(prev.operations.length).map((r) => r.operation);
        applyOperations(newOps).catch((err) => setStatus(`Live sync failed: ${String(err)}`));
      }
      if (state.selection !== prev.selection) {
        setSelection(state.pageId, state.selection).catch(() => {});
      }
    });
  }, []);

  // The reverse direction: an agent wrote something via an MCP write tool
  // (Build mode granted) — refresh the canvas if it's the page we're
  // currently looking at, so the human sees what the agent built.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onGraphChanged((pageId) => {
      if (pageId !== useCanvasStore.getState().pageId) return;
      getPageSnapshot(pageId)
        .then((page) => {
          useCanvasStore.getState().applyRemoteObjects(toShapeMap(page.objects));
          loadImageAssets(page.objects, useCanvasStore.getState().projectDir);
          setStatus("Agent updated the canvas");
        })
        .catch((err) => setStatus(`Couldn't load agent's change: ${String(err)}`));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  async function handleAgentModeChange(mode: AgentMode) {
    try {
      await setAgentMode(mode);
      setAgentModeState(mode);
    } catch (err) {
      setStatus(`Couldn't change agent access: ${String(err)}`);
    }
  }

  function promptForDir(): string | null {
    const last = localStorage.getItem(LAST_PROJECT_DIR_KEY) ?? "";
    // A real folder picker (Tauri's dialog plugin) is a follow-up — this
    // proves the actual save/load round trip through draft-project without
    // taking on that extra dependency in this pass.
    const dir = window.prompt("Project folder path (a new or existing .draft folder)", last);
    if (!dir) return null;
    localStorage.setItem(LAST_PROJECT_DIR_KEY, dir);
    return dir;
  }

  async function handleSave() {
    const dir = promptForDir();
    if (!dir) return;
    const { pageId, shapes } = useCanvasStore.getState();
    try {
      await saveSnapshot(dir, "Untitled", {
        pageId,
        pageName: "Page 1",
        objects: Object.fromEntries(Object.entries(shapes).map(([id, o]) => [id, o.shape])),
      });
      // Any asset imported before this save landed in the scratch directory
      // (ADR-015) and just got migrated into `dir` by the save command —
      // future saves/loads for this session now target the real project.
      useCanvasStore.getState().setProjectDir(dir);
      setStatus(`Saved to ${dir}`);
    } catch (err) {
      setStatus(`Save failed: ${String(err)}`);
    }
  }

  async function handleLoad() {
    const dir = promptForDir();
    if (!dir) return;
    try {
      const snapshot = await loadSnapshot(dir);
      const page = snapshot.pages[0];
      if (!page) {
        setStatus(`${dir} has no pages yet`);
        return;
      }
      useCanvasStore.getState().setProjectDir(dir);
      useCanvasStore.getState().loadPage(page.pageId, toShapeMap(page.objects));
      loadImageAssets(page.objects, dir);
      setStatus(`Loaded ${dir}`);
    } catch (err) {
      setStatus(`Load failed: ${String(err)}`);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <Logo height={22} />
        <div className="app-header-actions">
          <button type="button" className="app-header-btn" onClick={handleSave}>
            Save
          </button>
          <button type="button" className="app-header-btn" onClick={handleLoad}>
            Open
          </button>
          <label className="agent-mode-control">
            Agent access:
            <select
              value={agentMode}
              onChange={(e) => handleAgentModeChange(e.target.value as AgentMode)}
            >
              {AGENT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          {status && <span className="status">{status}</span>}
          <span className="status" title="Agents connected over the local MCP socket">
            {agentConnections ?? "…"} agent{agentConnections === 1 ? "" : "s"} connected
          </span>
          <span className="status">
            core <strong>{coreVersion ?? "…"}</strong>
          </span>
        </div>
      </header>
      <Toolbar />
      <div className="app-canvas">
        <Canvas />
      </div>
    </div>
  );
}

export default App;
