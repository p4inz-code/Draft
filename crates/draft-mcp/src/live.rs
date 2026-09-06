//! The local-socket half of ADR-007: the desktop app hosts this server so an
//! agent can read the human's *live*, in-progress editing session — not
//! just a saved file (that's `src/bin/main.rs`'s stdio server). Every tool
//! call checks the current [`AgentMode`] first; a connection accepting the
//! socket/pipe handshake is never itself access — see docs/agent-permissions.md.
//!
//! `apps/desktop` owns the actual `Graph`/`AgentMode` and passes them in via
//! [`LiveState`]; this crate doesn't know about Tauri. Writes go through the
//! same `Operation` vocabulary the canvas itself uses (ADR-012) — an agent's
//! edit and a human's edit are indistinguishable once applied, which is the
//! point: the graph doesn't have a separate "agent wrote this" code path.

use std::sync::{Arc, Mutex};

use draft_core::{ObjectId, PageId};
use draft_events::{Actor, Operation, OperationLog};
use draft_graph::Graph;
use draft_security::AgentMode;
use rmcp::{handler::server::wrapper::Parameters, schemars, tool, tool_router};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

/// What the human currently has selected on the canvas — frontend-owned
/// state (`@draft/canvas`'s Zustand store), mirrored here via `set_selection`
/// so an agent can see what the human is looking at, not just what exists.
#[derive(Debug, Clone, Default, Serialize)]
pub struct SelectionState {
    pub page: Option<PageId>,
    pub objects: Vec<ObjectId>,
}

/// The live graph and current agent-access grant, shared between the Tauri
/// app (which mutates them as the human edits and as the mode changes) and
/// however many agent connections are open at once.
pub struct LiveState {
    pub graph: Mutex<Graph>,
    pub mode: Mutex<AgentMode>,
    /// Fires the affected page's ID whenever a *write* tool successfully
    /// mutates the graph, so a host app (the desktop app) can refresh its
    /// own view — the canvas has no other way to learn an agent changed
    /// something out from under it. Sending is best-effort: no receivers
    /// (e.g. running the stdio binary, which has no UI to refresh) is fine.
    pub changes: broadcast::Sender<PageId>,
    /// The current number of open local-socket connections — a `watch`
    /// channel (not `broadcast`) because a UI only ever cares about the
    /// latest count, not every increment/decrement event. This is what
    /// backs the "N agents connected" indicator (spec's "explicit, visible"
    /// permission story): accepting a connection is visible even before any
    /// tool call succeeds or is denied, not just silent until one is.
    pub connections: tokio::sync::watch::Sender<usize>,
    /// A rolling record of every operation applied to the live graph, human
    /// and agent alike (tagged by [`Actor`]) — what backs the `recent_changes`
    /// MCP tool below. `apps/desktop`'s `apply_operations` command appends
    /// the human's edits here; the write tools in this file append the
    /// agent's.
    pub log: Mutex<OperationLog>,
    /// The human's current canvas selection — see [`SelectionState`].
    pub selection: Mutex<SelectionState>,
}

impl LiveState {
    pub fn new(graph: Graph, mode: AgentMode) -> Self {
        let (changes, _) = broadcast::channel(64);
        let (connections, _) = tokio::sync::watch::channel(0);
        Self {
            graph: Mutex::new(graph),
            mode: Mutex::new(mode),
            changes,
            connections,
            log: Mutex::new(OperationLog::new()),
            selection: Mutex::new(SelectionState::default()),
        }
    }

    fn current_mode(&self) -> AgentMode {
        *self.mode.lock().expect("LiveState.mode poisoned")
    }

    /// Appends an operation to the log with the current wall-clock time.
    /// Best-effort: a poisoned log mutex just means `recent_changes` misses
    /// an entry, not that the operation itself failed to apply. Public so
    /// `apps/desktop`'s `apply_operations` command can log the human's edits
    /// through the exact same path the agent write tools below use, rather
    /// than duplicating the timestamp/lock/append sequence.
    pub fn record(&self, actor: Actor, operation: Operation) {
        let Ok(mut log) = self.log.lock() else {
            return;
        };
        let at_unix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        log.append(actor, operation, at_unix);
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

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreateObjectParams {
    page_id: String,
    /// Arbitrary object data — e.g. `{"kind": "rectangle", "x": 0, "y": 0, "width": 10, "height": 10}`.
    /// See `@draft/shared`'s `Shape` union for the shapes the canvas itself understands.
    payload: serde_json::Value,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ModifyObjectParams {
    page_id: String,
    object_id: String,
    payload: serde_json::Value,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct DeleteObjectParams {
    page_id: String,
    object_id: String,
}

#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
struct RecentChangesParams {
    limit: Option<usize>,
    since_sequence: Option<u64>,
}

fn read_denied(mode: AgentMode) -> String {
    serde_json::json!({
        "error": "no read access",
        "current_mode": mode,
        "hint": "the DRAFT user needs to raise the agent access mode above Manual in the app",
    })
    .to_string()
}

fn write_denied(mode: AgentMode) -> String {
    serde_json::json!({
        "error": "no write access",
        "current_mode": mode,
        "hint": "the DRAFT user needs to grant Build mode in the app before an agent can write",
    })
    .to_string()
}

fn invalid_ids() -> String {
    serde_json::json!({ "error": "invalid page or object id" }).to_string()
}

#[tool_router(server_handler)]
impl LiveMcpServer {
    #[tool(
        description = "Get the live project's pages (id, name, object count). Requires the user to have granted at least Ask-level access."
    )]
    fn get_project(&self) -> String {
        let mode = self.state.current_mode();
        if !mode.allows_read() {
            return read_denied(mode);
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
            return read_denied(mode);
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
            return read_denied(mode);
        }
        let (Ok(page_id), Ok(object_id)) =
            (page_id.parse::<PageId>(), object_id.parse::<ObjectId>())
        else {
            return invalid_ids();
        };
        let graph = self.state.graph.lock().expect("LiveState.graph poisoned");
        match graph.page(page_id).and_then(|p| p.object(object_id)) {
            Some(object) => object.to_string(),
            None => serde_json::json!({ "error": "no such object on that page" }).to_string(),
        }
    }

    #[tool(
        description = "Create a new object on a page. Requires the user to have granted Build-mode access."
    )]
    fn create_object(
        &self,
        Parameters(CreateObjectParams { page_id, payload }): Parameters<CreateObjectParams>,
    ) -> String {
        let mode = self.state.current_mode();
        if !mode.allows_write() {
            return write_denied(mode);
        }
        let Ok(page) = page_id.parse::<PageId>() else {
            return invalid_ids();
        };
        let object = ObjectId::new();
        let op = Operation::CreateObject {
            page,
            object,
            payload,
        };
        let mut graph = self.state.graph.lock().expect("LiveState.graph poisoned");
        match graph.apply(&op) {
            Ok(()) => {
                drop(graph);
                self.state.record(Actor::Agent, op);
                let _ = self.state.changes.send(page);
                serde_json::json!({ "object_id": object.to_string() }).to_string()
            }
            Err(err) => serde_json::json!({ "error": err.to_string() }).to_string(),
        }
    }

    #[tool(
        description = "Replace an existing object's data. Requires the user to have granted Build-mode access."
    )]
    fn modify_object(
        &self,
        Parameters(ModifyObjectParams {
            page_id,
            object_id,
            payload,
        }): Parameters<ModifyObjectParams>,
    ) -> String {
        let mode = self.state.current_mode();
        if !mode.allows_write() {
            return write_denied(mode);
        }
        let (Ok(page), Ok(object)) = (page_id.parse::<PageId>(), object_id.parse::<ObjectId>())
        else {
            return invalid_ids();
        };
        let op = Operation::UpdateObject {
            page,
            object,
            payload,
        };
        let mut graph = self.state.graph.lock().expect("LiveState.graph poisoned");
        match graph.apply(&op) {
            Ok(()) => {
                drop(graph);
                self.state.record(Actor::Agent, op);
                let _ = self.state.changes.send(page);
                serde_json::json!({ "ok": true }).to_string()
            }
            Err(err) => serde_json::json!({ "error": err.to_string() }).to_string(),
        }
    }

    #[tool(
        description = "Delete an object from a page. Requires the user to have granted Build-mode access."
    )]
    fn delete_object(
        &self,
        Parameters(DeleteObjectParams { page_id, object_id }): Parameters<DeleteObjectParams>,
    ) -> String {
        let mode = self.state.current_mode();
        if !mode.allows_write() {
            return write_denied(mode);
        }
        let (Ok(page), Ok(object)) = (page_id.parse::<PageId>(), object_id.parse::<ObjectId>())
        else {
            return invalid_ids();
        };
        let op = Operation::DeleteObject { page, object };
        let mut graph = self.state.graph.lock().expect("LiveState.graph poisoned");
        match graph.apply(&op) {
            Ok(()) => {
                drop(graph);
                self.state.record(Actor::Agent, op);
                let _ = self.state.changes.send(page);
                serde_json::json!({ "ok": true }).to_string()
            }
            Err(err) => serde_json::json!({ "error": err.to_string() }).to_string(),
        }
    }

    #[tool(
        description = "Get recent operations applied to the live graph (human and agent edits alike), newest last. Optional `limit` caps how many are returned (default 50, max 200); optional `since_sequence` returns only operations after that sequence number, for incremental polling. Requires the user to have granted at least Ask-level access."
    )]
    fn recent_changes(
        &self,
        Parameters(RecentChangesParams {
            limit,
            since_sequence,
        }): Parameters<RecentChangesParams>,
    ) -> String {
        let mode = self.state.current_mode();
        if !mode.allows_read() {
            return read_denied(mode);
        }
        let limit = limit.unwrap_or(50).min(200);
        let log = self.state.log.lock().expect("LiveState.log poisoned");
        let total = log.len();
        // `since_sequence` is for incremental polling: the caller wants
        // everything it hasn't seen yet, oldest first, so a gap larger than
        // `limit` doesn't get silently skipped on the next poll. Without
        // `since_sequence`, the caller just wants the tail of the log.
        let (skip, take) = match since_sequence {
            Some(since) => ((since as usize + 1).min(total), limit),
            None => (total.saturating_sub(limit), limit),
        };
        let records: Vec<_> = log.iter().skip(skip).take(take).collect();
        serde_json::json!({ "changes": records, "total_logged": total }).to_string()
    }

    #[tool(
        description = "Get what the human currently has selected on the canvas (page ID and object IDs, empty if nothing is selected). Requires the user to have granted at least Ask-level access."
    )]
    fn get_selection(&self) -> String {
        let mode = self.state.current_mode();
        if !mode.allows_read() {
            return read_denied(mode);
        }
        let selection = self.state.selection.lock().expect("LiveState.selection poisoned");
        serde_json::json!({
            "page": selection.page.map(|p| p.to_string()),
            "objects": selection.objects.iter().map(|o| o.to_string()).collect::<Vec<_>>(),
        })
        .to_string()
    }
}

impl LiveMcpServer {
    pub fn new(state: Arc<LiveState>) -> Self {
        Self { state }
    }
}
