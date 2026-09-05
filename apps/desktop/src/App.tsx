import { Canvas, Toolbar } from "@draft/canvas";
import { getCoreVersion } from "@draft/project-client";
import { Logo } from "@draft/ui";
import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [coreVersion, setCoreVersion] = useState<string | null>(null);

  useEffect(() => {
    getCoreVersion()
      .then(setCoreVersion)
      .catch(() => setCoreVersion(null));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <Logo height={22} />
        <span className="status">
          core <strong>{coreVersion ?? "…"}</strong>
        </span>
      </header>
      <Toolbar />
      <div className="app-canvas">
        <Canvas />
      </div>
    </div>
  );
}

export default App;
