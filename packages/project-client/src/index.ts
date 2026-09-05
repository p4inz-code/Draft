/**
 * The frontend's typed boundary onto the Tauri-hosted Rust core. Every
 * `invoke` call the rest of the app makes goes through here so the IPC
 * surface has one place to evolve as `draft-project`/`draft-graph` grow —
 * components should never call `@tauri-apps/api` directly.
 */
import { invoke } from "@tauri-apps/api/core";

/** Returns the running `draft-core` version (see `apps/desktop`'s `app_version` command). */
export async function getCoreVersion(): Promise<string> {
  return invoke<string>("app_version");
}
