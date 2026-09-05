/**
 * Mirrors `draft-events::Operation` (ADR-012). The `type` discriminant and
 * field names match the Rust side's serde representation
 * (`#[serde(tag = "type", rename_all = "snake_case")]`) exactly, since these
 * values cross the Tauri IPC boundary as JSON.
 */
import type { ObjectId, PageId } from "./ids";

export type Operation =
  | { type: "create_object"; page: PageId; object: ObjectId; payload: unknown }
  | { type: "update_object"; page: PageId; object: ObjectId; payload: unknown }
  | { type: "move_object"; page: PageId; object: ObjectId; x: number; y: number }
  | { type: "delete_object"; page: PageId; object: ObjectId };

export type Actor = "user" | "agent";

export interface OperationRecord {
  sequence: number;
  at_unix: number;
  actor: Actor;
  operation: Operation;
}
