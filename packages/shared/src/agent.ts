/**
 * Mirrors `draft_security::AgentMode` (`#[serde(rename_all = "snake_case")]`).
 * `"manual"` is the default on both sides — an agent has no access until the
 * user explicitly raises this.
 */
export type AgentMode = "manual" | "ask" | "watch" | "assist" | "build";

export const AGENT_MODES: readonly AgentMode[] = ["manual", "ask", "watch", "assist", "build"];
