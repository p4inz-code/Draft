import { getCoreVersion } from "@draft/project-client";
import { Wordmark } from "@draft/ui";
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
    <main className="shell">
      <Wordmark size={32} />
      <p className="tagline">If you can&rsquo;t explain it to AI, show it to AI.</p>
      <span className="status">
        foundation shell &middot; core <strong>{coreVersion ?? "…"}</strong>
      </span>
    </main>
  );
}

export default App;
