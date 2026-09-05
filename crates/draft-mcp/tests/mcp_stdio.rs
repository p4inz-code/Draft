//! Session 2's exit test: an MCP client connects to `draft-mcp` over stdio,
//! queries a real saved project, and gets back a correct structured
//! response — proving the whole path (draft-project -> draft-graph ->
//! draft-mcp -> MCP wire protocol -> client) works, not just that each
//! piece compiles in isolation.

use std::collections::HashMap;

use draft_core::{ObjectId, PageId};
use draft_project::{save_page, save_project, PageDocument};
use rmcp::{model::CallToolRequestParams, transport::TokioChildProcess, ServiceExt};
use tokio::process::Command;

#[tokio::test]
async fn an_mcp_client_can_query_a_real_saved_project() {
    let root = tempfile::tempdir().unwrap();
    let project_dir = root.path().join("Boss Arena.draft");
    let mut manifest = draft_project::create_project(&project_dir, "Boss Arena").unwrap();

    let page_id = PageId::new();
    let object_id = ObjectId::new();
    let mut objects = HashMap::new();
    objects.insert(
        object_id,
        serde_json::json!({"kind": "rectangle", "x": 10, "y": 20, "width": 100, "height": 50}),
    );
    save_page(
        &project_dir,
        &PageDocument {
            id: page_id,
            name: "Level 1".to_string(),
            objects,
        },
    )
    .unwrap();
    manifest.pages.push(page_id);
    save_project(&project_dir, &mut manifest).unwrap();

    let server_bin = env!("CARGO_BIN_EXE_draft-mcp");
    let mut command = Command::new(server_bin);
    command.arg(project_dir.to_str().unwrap());
    let client = ().serve(TokioChildProcess::new(command).unwrap()).await.unwrap();

    let tools = client.list_tools(Default::default()).await.unwrap();
    let tool_names: Vec<_> = tools.tools.iter().map(|t| t.name.to_string()).collect();
    assert!(tool_names.contains(&"get_project".to_string()));
    assert!(tool_names.contains(&"get_page".to_string()));
    assert!(tool_names.contains(&"get_object".to_string()));

    let project_result = client
        .call_tool(CallToolRequestParams::new("get_project"))
        .await
        .unwrap();
    let project_json = first_text_content(&project_result);
    assert_eq!(project_json["name"], "Boss Arena");
    assert_eq!(project_json["pages"][0]["object_count"], 1);

    let page_args = serde_json::Map::from_iter([(
        "page_id".to_string(),
        serde_json::Value::String(page_id.to_string()),
    )]);
    let page_result = client
        .call_tool(CallToolRequestParams::new("get_page").with_arguments(page_args))
        .await
        .unwrap();
    let page_json = first_text_content(&page_result);
    assert_eq!(page_json["name"], "Level 1");
    let objects = page_json["objects"].as_object().unwrap();
    let (_, object_payload) = objects.iter().next().unwrap();
    assert_eq!(object_payload["kind"], "rectangle");
    assert_eq!(object_payload["width"], 100);

    client.cancel().await.unwrap();
}

fn first_text_content(result: &rmcp::model::CallToolResult) -> serde_json::Value {
    let text = result
        .content
        .first()
        .and_then(|c| c.as_text())
        .expect("first content block is text");
    serde_json::from_str(&text.text).expect("tool response is valid JSON")
}
