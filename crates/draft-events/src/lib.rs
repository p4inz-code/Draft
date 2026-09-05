//! ADR-012: the frontend's fast in-memory live-edit store and the
//! Rust-owned Project Graph stay in sync through a typed operation log
//! rather than whole-graph snapshots. This crate defines that vocabulary
//! (spec §14's `user.*` events are exactly these operations, tagged with
//! who performed them) and the append-only log itself. `draft-graph`
//! depends on this crate and is the thing that actually *applies* operations
//! to build current state — this crate only records what happened.
//!
//! Object payloads are kept as untyped [`serde_json::Value`] for now: the
//! concrete shape schema (freehand stroke, text, arrow, ...) is Session 1/2
//! scope and shouldn't be guessed at during the foundation phase.

use draft_core::{ObjectId, PageId};
use serde::{Deserialize, Serialize};

/// Who performed an operation — carried on every record so an agent's
/// changes are always distinguishable from the human's (spec §13/§16).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Actor {
    User,
    Agent,
}

/// A single mutation to the Project Graph. Variants intentionally mirror
/// spec §14's event names (`user.created_object` -> `CreateObject`, etc.).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Operation {
    CreateObject {
        page: PageId,
        object: ObjectId,
        payload: serde_json::Value,
    },
    UpdateObject {
        page: PageId,
        object: ObjectId,
        payload: serde_json::Value,
    },
    MoveObject {
        page: PageId,
        object: ObjectId,
        x: f64,
        y: f64,
    },
    DeleteObject {
        page: PageId,
        object: ObjectId,
    },
}

/// A recorded operation: what happened, who did it, when, and its position
/// in the log (used for undo/redo replay and for MCP's `recent_changes`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OperationRecord {
    pub sequence: u64,
    pub at_unix: i64,
    pub actor: Actor,
    pub operation: Operation,
}

/// An append-only, in-order log of operations. Foundation-stage: in-memory
/// only. Persisting/replaying the log across sessions is Session 1/2 scope
/// once `draft-project` has somewhere to store it.
#[derive(Debug, Default)]
pub struct OperationLog {
    records: Vec<OperationRecord>,
}

impl OperationLog {
    pub fn new() -> Self {
        Self::default()
    }

    /// Appends an operation, stamping it with the next sequence number and
    /// the given actor, and returns the resulting record.
    pub fn append(&mut self, actor: Actor, operation: Operation, at_unix: i64) -> &OperationRecord {
        let sequence = self.records.len() as u64;
        self.records.push(OperationRecord {
            sequence,
            at_unix,
            actor,
            operation,
        });
        self.records.last().expect("just pushed")
    }

    pub fn iter(&self) -> impl Iterator<Item = &OperationRecord> {
        self.records.iter()
    }

    pub fn len(&self) -> usize {
        self.records.len()
    }

    pub fn is_empty(&self) -> bool {
        self.records.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appended_records_get_increasing_sequence_numbers() {
        let mut log = OperationLog::new();
        let page = PageId::new();

        log.append(
            Actor::User,
            Operation::CreateObject {
                page,
                object: ObjectId::new(),
                payload: serde_json::json!({"kind": "note"}),
            },
            1_700_000_000,
        );
        log.append(
            Actor::Agent,
            Operation::DeleteObject {
                page,
                object: ObjectId::new(),
            },
            1_700_000_001,
        );

        let sequences: Vec<u64> = log.iter().map(|r| r.sequence).collect();
        assert_eq!(sequences, vec![0, 1]);
        assert_eq!(log.len(), 2);
    }

    #[test]
    fn preserves_which_actor_performed_each_operation() {
        let mut log = OperationLog::new();
        log.append(
            Actor::Agent,
            Operation::MoveObject {
                page: PageId::new(),
                object: ObjectId::new(),
                x: 10.0,
                y: 20.0,
            },
            0,
        );

        assert_eq!(log.iter().next().unwrap().actor, Actor::Agent);
    }
}
