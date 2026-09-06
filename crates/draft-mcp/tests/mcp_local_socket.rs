//! Proves the *live* half of ADR-007: an MCP client connects to a local
//! socket hosted in-process (standing in for the desktop app), reads
//! nothing while the agent mode is `Manual` (the default — no access), then
//! reads real data once the mode is raised — exercising the exact
//! permission gate `draft-mcp::live::LiveMcpServer` enforces.

#![cfg(windows)]

use std::{collections::HashMap, sync::Arc, time::Duration};

use draft_core::{ObjectId, PageId};
use draft_graph::Graph;
use draft_mcp::live::LiveState;
use draft_security::AgentMode;
use rmcp::{model::CallToolRequestParams, ServiceExt};
use tokio::net::windows::named_pipe::ClientOptions;

async fn connect_client(pipe_name: &str) -> rmcp::service::RunningService<rmcp::RoleClient, ()> {
    // The server side creates its pipe instance asynchronously; retry the
    // connect briefly instead of racing it.
    for _ in 0..50 {
        match ClientOptions::new().open(pipe_name) {
            Ok(client) => return ().serve(client).await.expect("client handshake"),
            Err(_) => tokio::time::sleep(Duration::from_millis(20)).await,
        }
    }
    panic!("could not connect to {pipe_name} after retrying");
}

fn first_text_content(result: &rmcp::model::CallToolResult) -> serde_json::Value {
    let text = result
        .content
        .first()
        .and_then(|c| c.as_text())
        .expect("first content block is text");
    serde_json::from_str(&text.text).expect("tool response is valid JSON")
}

#[tokio::test]
async fn manual_mode_denies_reads_and_a_higher_mode_allows_them() {
    let pipe_name = format!(
        r"\\.\pipe\draft-mcp-test-{}",
        ObjectId::new().as_uuid().simple()
    );

    let mut graph = Graph::new();
    let page_id = PageId::new();
    graph.ensure_page(page_id, "Level 1");
    let object_id = ObjectId::new();
    let mut objects = HashMap::new();
    objects.insert(object_id, serde_json::json!({"kind": "rectangle"}));
    // Insert directly (bypassing apply/operations) since this test is about
    // the MCP permission gate, not the operation log.
    graph.insert_page(page_id, "Level 1".to_string(), objects);

    let state = Arc::new(LiveState::new(graph, AgentMode::Manual));

    let server_pipe_name = pipe_name.clone();
    let server_state = Arc::clone(&state);
    tokio::spawn(async move {
        let _ = draft_mcp::local_socket::serve_forever_on(server_state, &server_pipe_name).await;
    });

    // Manual (default): denied.
    let client = connect_client(&pipe_name).await;
    let result = client
        .call_tool(CallToolRequestParams::new("get_project"))
        .await
        .unwrap();
    let json = first_text_content(&result);
    assert_eq!(json["current_mode"], "manual");
    assert!(json["error"].is_string());
    client.cancel().await.unwrap();

    // Raise the mode (this is what the desktop app's "set agent mode" Tauri
    // command does) and reconnect.
    *state.mode.lock().unwrap() = AgentMode::Watch;

    let client = connect_client(&pipe_name).await;
    let result = client
        .call_tool(CallToolRequestParams::new("get_project"))
        .await
        .unwrap();
    let json = first_text_content(&result);
    assert_eq!(json["pages"][0]["object_count"], 1);
    assert_eq!(json["live"], true);
    client.cancel().await.unwrap();
}

#[tokio::test]
async fn connection_count_tracks_connect_and_disconnect() {
    let pipe_name = format!(
        r"\\.\pipe\draft-mcp-test-{}",
        ObjectId::new().as_uuid().simple()
    );

    let state = Arc::new(LiveState::new(Graph::new(), AgentMode::Manual));
    let mut connections = state.connections.subscribe();
    assert_eq!(*connections.borrow(), 0);

    let server_pipe_name = pipe_name.clone();
    let server_state = Arc::clone(&state);
    tokio::spawn(async move {
        let _ = draft_mcp::local_socket::serve_forever_on(server_state, &server_pipe_name).await;
    });

    let client = connect_client(&pipe_name).await;
    connections.changed().await.expect("connection count changed");
    assert_eq!(*connections.borrow(), 1);

    client.cancel().await.unwrap();
    connections.changed().await.expect("connection count changed");
    assert_eq!(*connections.borrow(), 0);
}

#[tokio::test]
async fn watch_mode_denies_writes_and_build_mode_allows_them() {
    let pipe_name = format!(
        r"\\.\pipe\draft-mcp-test-{}",
        ObjectId::new().as_uuid().simple()
    );

    let mut graph = Graph::new();
    let page_id = PageId::new();
    graph.ensure_page(page_id, "Level 1");

    // Watch: reads allowed, writes not.
    let state = Arc::new(LiveState::new(graph, AgentMode::Watch));
    let mut changes = state.changes.subscribe();

    let server_pipe_name = pipe_name.clone();
    let server_state = Arc::clone(&state);
    tokio::spawn(async move {
        let _ = draft_mcp::local_socket::serve_forever_on(server_state, &server_pipe_name).await;
    });

    let client = connect_client(&pipe_name).await;
    let create_args = serde_json::Map::from_iter([
        (
            "page_id".to_string(),
            serde_json::Value::String(page_id.to_string()),
        ),
        (
            "payload".to_string(),
            serde_json::json!({"kind": "rectangle"}),
        ),
    ]);
    let result = client
        .call_tool(CallToolRequestParams::new("create_object").with_arguments(create_args.clone()))
        .await
        .unwrap();
    let json = first_text_content(&result);
    assert_eq!(json["current_mode"], "watch");
    assert!(json["error"].is_string());
    client.cancel().await.unwrap();

    // Raise to Build: the same call now actually creates the object, and a
    // change notification fires for the affected page.
    *state.mode.lock().unwrap() = AgentMode::Build;

    let client = connect_client(&pipe_name).await;
    let result = client
        .call_tool(CallToolRequestParams::new("create_object").with_arguments(create_args))
        .await
        .unwrap();
    let json = first_text_content(&result);
    let object_id: draft_core::ObjectId = json["object_id"]
        .as_str()
        .expect("object_id in response")
        .parse()
        .expect("valid object id");

    assert_eq!(
        changes.recv().await.expect("a change notification fired"),
        page_id
    );
    assert_eq!(
        state
            .graph
            .lock()
            .unwrap()
            .page(page_id)
            .unwrap()
            .object_count(),
        1
    );

    // modify_object and delete_object go through the same gate.
    let modify_args = serde_json::Map::from_iter([
        (
            "page_id".to_string(),
            serde_json::Value::String(page_id.to_string()),
        ),
        (
            "object_id".to_string(),
            serde_json::Value::String(object_id.to_string()),
        ),
        (
            "payload".to_string(),
            serde_json::json!({"kind": "rectangle", "moved": true}),
        ),
    ]);
    client
        .call_tool(CallToolRequestParams::new("modify_object").with_arguments(modify_args))
        .await
        .unwrap();
    assert_eq!(
        state
            .graph
            .lock()
            .unwrap()
            .page(page_id)
            .unwrap()
            .object(object_id)
            .unwrap()["moved"],
        true
    );

    let delete_args = serde_json::Map::from_iter([
        (
            "page_id".to_string(),
            serde_json::Value::String(page_id.to_string()),
        ),
        (
            "object_id".to_string(),
            serde_json::Value::String(object_id.to_string()),
        ),
    ]);
    client
        .call_tool(CallToolRequestParams::new("delete_object").with_arguments(delete_args))
        .await
        .unwrap();
    assert_eq!(
        state
            .graph
            .lock()
            .unwrap()
            .page(page_id)
            .unwrap()
            .object_count(),
        0
    );

    client.cancel().await.unwrap();
}
