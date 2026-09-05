import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [coreVersion, setCoreVersion] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("app_version")
      .then(setCoreVersion)
      .catch(() => setCoreVersion(null));
  }, []);

  return (
    <main className="shell">
      <h1 className="wordmark">DRAFT</h1>
      <p className="tagline">If you can&rsquo;t explain it to AI, show it to AI.</p>
      <span className="status">
        foundation shell &middot; core <strong>{coreVersion ?? "…"}</strong>
      </span>
    </main>
  );
}

export default App;
