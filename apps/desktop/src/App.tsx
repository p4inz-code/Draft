import { Canvas, Toolbar, useCanvasStore } from "@draft/canvas";
import { getCoreVersion, loadSnapshot, saveSnapshot } from "@draft/project-client";
import { Logo } from "@draft/ui";
import { useEffect, useState } from "react";
import "./App.css";

const LAST_PROJECT_DIR_KEY = "draft.lastProjectDir";

function App() {
  const [coreVersion, setCoreVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    getCoreVersion()
      .then(setCoreVersion)
      .catch(() => setCoreVersion(null));
  }, []);

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
      const shapes = Object.fromEntries(
        Object.entries(page.objects).map(([id, shape]) => [id, { id, shape }]),
      );
      // biome-ignore lint/suspicious/noExplicitAny: shapes reconstructed from untyped JSON on load
      useCanvasStore.getState().loadPage(page.pageId, shapes as any);
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
          {status && <span className="status">{status}</span>}
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
