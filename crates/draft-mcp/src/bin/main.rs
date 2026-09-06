//! The `draft-mcp` CLI: the stdio half of ADR-007's two-transport design.
//! Loads a `.draft` project directory (built via `draft-project`) into a
//! `draft-graph::Graph` once at startup and exposes it read-only over MCP —
//! for headless/CI use where no desktop instance is running. The
//! live-session half (a local socket hosted by the running desktop app,
//! for an agent to read a human's in-progress editing) is still unbuilt;
//! see docs/mcp.md.
//!
//! Resources that only make sense for a *live* session — `selection`,
//! `recent_changes`, `agent_state` — aren't exposed here on purpose: a
//! static snapshot loaded from disk has no selection or in-progress
//! changes to report. Those wait for the local-socket transport.

use std::{env, path::PathBuf, sync::Arc};

use draft_core::{ObjectId, PageId};
use draft_graph::Graph;
use draft_project::{load_all_pages, open_project, ProjectManifest};
use rmcp::{
    handler::server::wrapper::Parameters, schemars, tool, tool_router, transport::stdio, ServiceExt,
};
use serde::Deserialize;

struct LoadedProject {
    manifest: ProjectManifest,
    graph: Graph,
}

#[derive(Clone)]
struct DraftMcpServer {
    state: Arc<LoadedProject>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GetPageParams {
    /// A page ID in `page://<uuid>` form, from `get_project`'s page list.
    page_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GetObjectParams {
    page_id: String,
    /// An object ID in `object://<uuid>` form, from `get_page`'s object list.
    object_id: String,
}

#[tool_router(server_handler)]
impl DraftMcpServer {
    #[tool(
        description = "Get the project's manifest: id, name, schema version, and its pages (id, name, object count)."
    )]
    fn get_project(&self) -> String {
        let pages: Vec<_> = self
            .state
            .graph
            .pages()
            .map(|p| {
                serde_json::json!({
                    "id": p.id.to_string(),
                    "name": p.name,
                    "object_count": p.object_count(),
                })
            })
            .collect();
        serde_json::json!({
            "id": self.state.manifest.id.to_string(),
            "name": self.state.manifest.name,
            "schema_version": self.state.manifest.schema_version,
            "pages": pages,
        })
        .to_string()
    }

    #[tool(description = "Get one page's objects by page ID (e.g. \"page://<uuid>\").")]
    fn get_page(&self, Parameters(GetPageParams { page_id }): Parameters<GetPageParams>) -> String {
        let Ok(id) = page_id.parse::<PageId>() else {
            return serde_json::json!({ "error": format!("invalid page id: {page_id}") })
                .to_string();
        };
        match self.state.graph.page(id) {
            Some(page) => serde_json::json!({
                "id": page.id.to_string(),
                "name": page.name,
                "objects": page.objects(),
            })
            .to_string(),
            None => serde_json::json!({ "error": format!("no such page: {page_id}") }).to_string(),
        }
    }

    #[tool(description = "Get one object's data by page ID and object ID.")]
    fn get_object(
        &self,
        Parameters(GetObjectParams { page_id, object_id }): Parameters<GetObjectParams>,
    ) -> String {
        let (Ok(page_id), Ok(object_id)) =
            (page_id.parse::<PageId>(), object_id.parse::<ObjectId>())
        else {
            return serde_json::json!({ "error": "invalid page or object id" }).to_string();
        };
        match self
            .state
            .graph
            .page(page_id)
            .and_then(|p| p.object(object_id))
        {
            Some(object) => serde_json::to_string(object).expect("Shape always serializes"),
            None => serde_json::json!({ "error": "no such object on that page" }).to_string(),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dir = env::args()
        .nth(1)
        .ok_or("usage: draft-mcp <project-directory>")?;
    let project_dir = PathBuf::from(dir);

    let manifest = open_project(&project_dir)?;
    let pages = load_all_pages(&project_dir, &manifest)?;
    let mut graph = Graph::new();
    for page in pages {
        graph.insert_page(page.id, page.name, page.objects);
    }

    let server = DraftMcpServer {
        state: Arc::new(LoadedProject { manifest, graph }),
    };
    let service = server.serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}
