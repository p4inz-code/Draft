/**
 * The frontend's typed boundary onto the Tauri-hosted Rust core. Every
 * `invoke` call the rest of the app makes goes through here so the IPC
 * surface has one place to evolve as `draft-project`/`draft-graph` grow —
 * components should never call `@tauri-apps/api` directly.
 */
import type { AgentMode, ObjectId, Operation, PageId } from "@draft/shared";
import { invoke } from "@tauri-apps/api/core";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";

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

/**
 * Loads a `.draft` project directory back into a snapshot the canvas store
 * can rehydrate from, and seeds the live MCP graph with it (see
 * `apps/desktop/src-tauri`'s `load_snapshot` command).
 */
export async function loadSnapshot(dir: string): Promise<ProjectSnapshot> {
  return invoke<ProjectSnapshot>("load_snapshot", { dir });
}

/** Registers a frontend-generated page ID with the live graph before operations for it arrive. */
export async function ensurePage(pageId: PageId, name: string): Promise<void> {
  return invoke<void>("ensure_page", { pageId, name });
}

/**
 * Applies committed canvas operations to the live graph an MCP agent reads
 * — this is what makes a local-socket connection see *live* edits, not just
 * whatever was last saved to disk.
 */
export async function applyOperations(operations: Operation[]): Promise<void> {
  return invoke<void>("apply_operations", { operations });
}

/** Sets the live agent-access grant (spec §13/§16 — explicit, visible, revocable). */
export async function setAgentMode(mode: AgentMode): Promise<void> {
  return invoke<void>("set_agent_mode", { mode });
}

export async function getAgentMode(): Promise<AgentMode> {
  return invoke<AgentMode>("get_agent_mode");
}

/** Fetches one page's current live content — used after `onGraphChanged` fires. */
export async function getPageSnapshot(pageId: PageId): Promise<PageSnapshot> {
  return invoke<PageSnapshot>("get_page_snapshot", { pageId });
}

/**
 * Subscribes to `draft-graph-changed`, fired whenever an MCP write tool
 * mutates the live graph (an agent created/modified/deleted an object while
 * Build mode was granted) — see `apps/desktop/src-tauri`'s `setup` hook.
 * Returns an unsubscribe function.
 */
export async function onGraphChanged(handler: (pageId: PageId) => void): Promise<UnlistenFn> {
  return listen<string>("draft-graph-changed", (event) => {
    handler(event.payload as PageId);
  });
}
