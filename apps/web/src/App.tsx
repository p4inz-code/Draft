import { Logo } from "@draft/ui";
import "./App.css";

/**
 * Minimal foundation-stage shell: proves the web build wires up through
 * @draft/ui. It deliberately does not import @draft/canvas yet — that
 * package's API will shift heavily once Session 1 builds real drawing
 * tools, and wiring the web app to it now would just mean redoing this
 * integration almost immediately. Session 3 (per ROADMAP.md) is where
 * apps/web gains the canvas and reaches parity with the desktop app.
 */
function App() {
  return (
    <main className="shell">
      <Logo height={32} />
      <p className="tagline">The web build of DRAFT — foundation shell only for now.</p>
    </main>
  );
}

export default App;
