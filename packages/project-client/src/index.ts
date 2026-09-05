/**
 * The frontend's typed boundary onto the Tauri-hosted Rust core. Every
 * `invoke` call the rest of the app makes goes through here so the IPC
 * surface has one place to evolve as `draft-project`/`draft-graph` grow —
 * components should never call `@tauri-apps/api` directly.
 */
import type { ObjectId, PageId } from "@draft/shared";
import { invoke } from "@tauri-apps/api/core";

/** Returns the running `draft-core` version (see `apps/desktop`'s `app_version` command). */
export async function getCoreVersion(): Promise<string> {
  return invoke<string>("app_version");
}

export interface PageSnapshot {
  pageId: PageId;
  pageName: string;
  objects: Record<ObjectId, unknown>;
}

export interface ProjectSnapshot {
  projectName: string;
  pages: PageSnapshot[];
}

/**
 * Saves the current canvas page to a `.draft` project directory (created if
 * it doesn't exist). Single-page today — see `@draft/canvas`'s store.
 */
export async function saveSnapshot(
  dir: string,
  projectName: string,
  page: PageSnapshot,
): Promise<void> {
  return invoke<void>("save_snapshot", { dir, projectName, page });
}

/** Loads a `.draft` project directory back into a snapshot the canvas store can rehydrate from. */
export async function loadSnapshot(dir: string): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>("load_snapshot", { dir });
}
