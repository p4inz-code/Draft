//! The local-socket half of ADR-007: the desktop app hosts this server so an
//! agent can read the human's *live*, in-progress editing session — not
//! just a saved file (that's `src/bin/main.rs`'s stdio server). Every tool
//! call checks the current [`AgentMode`] first; a connection accepting the
//! socket/pipe handshake is never itself access — see docs/agent-permissions.md.
//!
//! `apps/desktop` owns the actual `Graph`/`AgentMode` and passes them in via
//! [`LiveState`]; this crate doesn't know about Tauri.

use std::sync::{Arc, Mutex};

use draft_core::{ObjectId, PageId};
use draft_graph::Graph;
use draft_security::AgentMode;
use rmcp::{handler::server::wrapper::Parameters, schemars, tool, tool_router};
use serde::Deserialize;

/// The live graph and current agent-access grant, shared between the Tauri
/// app (which mutates them as the human edits and as the mode changes) and
/// however many agent connections are open at once.
pub struct LiveState {
    pub graph: Mutex<Graph>,
    pub mode: Mutex<AgentMode>,
}

impl LiveState {
    pub fn new(graph: Graph, mode: AgentMode) -> Self {
        Self {
            graph: Mutex::new(graph),
            mode: Mutex::new(mode),
        }
    }

    fn current_mode(&self) -> AgentMode {
        *self.mode.lock().expect("LiveState.mode poisoned")
    }
}

#[derive(Clone)]
pub struct LiveMcpServer {
    state: Arc<LiveState>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GetPageParams {
    page_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GetObjectParams {
    page_id: String,
    object_id: String,
}

fn denied(mode: AgentMode) -> String {
    serde_json::json!({
        "error": "no read access",
        "current_mode": mode,
        "hint": "the DRAFT user needs to raise the agent access mode above Manual in the app",
    })
    .to_string()
}

#[tool_router(server_handler)]
impl LiveMcpServer {
    #[tool(
        description = "Get the live project's pages (id, name, object count). Requires the user to have granted at least Ask-level access."
    )]
    fn get_project(&self) -> String {
        let mode = self.state.current_mode();
        if !mode.allows_read() {
            return denied(mode);
        }
        let graph = self.state.graph.lock().expect("LiveState.graph poisoned");
        let pages: Vec<_> = graph
            .pages()
            .map(|p| {
                serde_json::json!({
                    "id": p.id.to_string(),
                    "name": p.name,
                    "object_count": p.object_count(),
                })
            })
            .collect();
        serde_json::json!({ "pages": pages, "live": true }).to_string()
    }

    #[tool(description = "Get one live page's objects by page ID (e.g. \"page://<uuid>\").")]
    fn get_page(&self, Parameters(GetPageParams { page_id }): Parameters<GetPageParams>) -> String {
        let mode = self.state.current_mode();
        if !mode.allows_read() {
            return denied(mode);
        }
        let Ok(id) = page_id.parse::<PageId>() else {
            return serde_json::json!({ "error": format!("invalid page id: {page_id}") })
                .to_string();
        };
        let graph = self.state.graph.lock().expect("LiveState.graph poisoned");
        match graph.page(id) {
            Some(page) => serde_json::json!({
                "id": page.id.to_string(),
                "name": page.name,
                "objects": page.objects(),
            })
            .to_string(),
            None => serde_json::json!({ "error": format!("no such page: {page_id}") }).to_string(),
        }
    }

    #[tool(description = "Get one live object's data by page ID and object ID.")]
    fn get_object(
        &self,
        Parameters(GetObjectParams { page_id, object_id }): Parameters<GetObjectParams>,
    ) -> String {
        let mode = self.state.current_mode();
        if !mode.allows_read() {
            return denied(mode);
        }
        let (Ok(page_id), Ok(object_id)) =
            (page_id.parse::<PageId>(), object_id.parse::<ObjectId>())
        else {
            return serde_json::json!({ "error": "invalid page or object id" }).to_string();
        };
        let graph = self.state.graph.lock().expect("LiveState.graph poisoned");
        match graph.page(page_id).and_then(|p| p.object(object_id)) {
            Some(object) => object.to_string(),
            None => serde_json::json!({ "error": "no such object on that page" }).to_string(),
        }
    }
}

impl LiveMcpServer {
    pub fn new(state: Arc<LiveState>) -> Self {
        Self { state }
    }
}
