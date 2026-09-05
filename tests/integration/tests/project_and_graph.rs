//! Cross-cutting integration test: exercises `draft-project`, `draft-graph`,
//! and `draft-events` together, the way a real save/load cycle eventually
//! will once the canvas produces real operations (Session 1/2 — see
//! docs/architecture.md's data-flow walkthrough). Per-crate unit tests cover
//! each crate in isolation; this proves they compose correctly.

use draft_core::PageId;
use draft_events::{Actor, Operation, OperationLog};
use draft_graph::Graph;
use draft_project::create_project;
use serde_json::json;

#[test]
fn a_recorded_operation_log_replays_into_the_expected_graph_state() {
    // A project exists on disk (draft-project)...
    let root = tempfile::tempdir().unwrap();
    let manifest = create_project(&root.path().join("Boss Arena.draft"), "Boss Arena").unwrap();
    assert_eq!(manifest.pages.len(), 0);

    // ...its graph starts empty, and pages are created in it (draft-graph)...
    let mut graph = Graph::new();
    let page: PageId = graph.create_page("Level 1");

    // ...user actions are recorded as operations (draft-events)...
    let mut log = OperationLog::new();
    let object = draft_core::ObjectId::new();
    log.append(
        Actor::User,
        Operation::CreateObject {
            page,
            object,
            payload: json!({"kind": "enemy_spawn"}),
        },
        1_700_000_000,
    );
    log.append(
        Actor::User,
        Operation::MoveObject {
            page,
            object,
            x: 120.0,
            y: 40.0,
        },
        1_700_000_005,
    );

    // ...and replaying the log against the graph reproduces the same state
    // an agent reading the graph through MCP would eventually see.
    for record in log.iter() {
        graph.apply(&record.operation).unwrap();
    }

    let stored = graph.page(page).unwrap().object(object).unwrap();
    assert_eq!(stored["kind"], "enemy_spawn");
    assert_eq!(stored["x"], 120.0);
    assert_eq!(stored["y"], 40.0);
}
