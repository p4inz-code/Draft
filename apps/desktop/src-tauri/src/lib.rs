use std::{collections::HashMap, path::PathBuf, sync::Arc};

use draft_core::{ObjectId, PageId};
use draft_events::Operation;
use draft_graph::Graph;
use draft_mcp::live::LiveState;
use draft_project::{PageDocument, ProjectManifest};
use draft_security::AgentMode;
use tauri::{Emitter, Manager, State};

/// Reports the `draft-core` version, proving both the Tauri IPC round-trip
/// and the Rust workspace wiring (desktop -> crates/) work end to end.
#[tauri::command]
fn app_version() -> String {
    draft_core::CORE_VERSION.to_string()
}

/// One page's worth of canvas state, as sent from the frontend's
/// `@draft/canvas` store — see `packages/canvas/src/store.ts`.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageSnapshot {
    page_id: PageId,
    page_name: String,
    objects: HashMap<ObjectId, serde_json::Value>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSnapshot {
    project_name: String,
    pages: Vec<PageSnapshotOut>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PageSnapshotOut {
    page_id: PageId,
    page_name: String,
    objects: HashMap<ObjectId, serde_json::Value>,
}

/// Saves the current canvas state to a `.draft` project directory, creating
/// it if it doesn't exist. Single-page for now — `@draft/canvas`'s store
/// only holds one page per session (see docs/canvas.md).
#[tauri::command]
fn save_snapshot(dir: String, project_name: String, page: PageSnapshot) -> Result<(), String> {
    let project_dir = PathBuf::from(dir);
    let mut manifest = if project_dir.join("project.json").exists() {
        draft_project::open_project(&project_dir).map_err(|e| e.to_string())?
    } else {
        draft_project::create_project(&project_dir, &project_name).map_err(|e| e.to_string())?
    };

    let document = PageDocument {
        id: page.page_id,
        name: page.page_name,
        objects: page.objects,
    };
    draft_project::save_page(&project_dir, &document).map_err(|e| e.to_string())?;

    if !manifest.pages.contains(&page.page_id) {
        manifest.pages.push(page.page_id);
    }
    draft_project::save_project(&project_dir, &mut manifest).map_err(|e| e.to_string())?;
    Ok(())
}

/// Loads a `.draft` project directory back into a snapshot the frontend can
/// rehydrate its canvas store from, and seeds the live MCP graph with it so
/// an already-connected agent sees the newly opened project.
#[tauri::command]
fn load_snapshot(dir: String, live: State<'_, Arc<LiveState>>) -> Result<ProjectSnapshot, String> {
    let project_dir = PathBuf::from(dir);
    let manifest: ProjectManifest =
        draft_project::open_project(&project_dir).map_err(|e| e.to_string())?;
    let pages =
        draft_project::load_all_pages(&project_dir, &manifest).map_err(|e| e.to_string())?;

    {
        let mut graph = live.graph.lock().map_err(|_| "graph lock poisoned")?;
        *graph = Graph::new();
        for page in &pages {
            graph.insert_page(page.id, page.name.clone(), page.objects.clone());
        }
    }

    Ok(ProjectSnapshot {
        project_name: manifest.name,
        pages: pages
            .into_iter()
            .map(|p| PageSnapshotOut {
                page_id: p.id,
                page_name: p.name,
                objects: p.objects,
            })
            .collect(),
    })
}

/// Ensures the live graph has a page under the given (frontend-generated)
/// ID before any operation for it arrives — see `Graph::ensure_page`.
#[tauri::command]
fn ensure_page(
    page_id: PageId,
    name: String,
    live: State<'_, Arc<LiveState>>,
) -> Result<(), String> {
    let mut graph = live.graph.lock().map_err(|_| "graph lock poisoned")?;
    graph.ensure_page(page_id, name);
    Ok(())
}

/// Applies committed canvas operations to the live graph, so an agent
/// connected via the local socket sees them immediately — this is the
/// "canvas emits operations, draft-graph applies them" path from
/// docs/architecture.md, now wired end to end instead of frontend-only.
#[tauri::command]
fn apply_operations(
    operations: Vec<Operation>,
    live: State<'_, Arc<LiveState>>,
) -> Result<(), String> {
    let mut graph = live.graph.lock().map_err(|_| "graph lock poisoned")?;
    for op in &operations {
        graph.apply(op).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Sets the live agent-access grant (spec §13/§16: explicit, visible,
/// revocable — this *is* that control, exposed to the UI).
#[tauri::command]
fn set_agent_mode(mode: AgentMode, live: State<'_, Arc<LiveState>>) -> Result<(), String> {
    *live.mode.lock().map_err(|_| "mode lock poisoned")? = mode;
    Ok(())
}

#[tauri::command]
fn get_agent_mode(live: State<'_, Arc<LiveState>>) -> Result<AgentMode, String> {
    Ok(*live.mode.lock().map_err(|_| "mode lock poisoned")?)
}

/// The current number of open local-socket agent connections — the initial
/// value for the frontend's "N agents connected" indicator; live updates
/// after this arrive via the `draft-agent-connections-changed` event.
#[tauri::command]
fn get_agent_connection_count(live: State<'_, Arc<LiveState>>) -> Result<usize, String> {
    Ok(*live.connections.borrow())
}

/// Fetches one page's current live content — used by the frontend to
/// refresh after a `draft-graph-changed` event (an agent wrote something
/// via an MCP write tool while Build mode was granted).
#[tauri::command]
fn get_page_snapshot(
    page_id: PageId,
    live: State<'_, Arc<LiveState>>,
) -> Result<PageSnapshotOut, String> {
    let graph = live.graph.lock().map_err(|_| "graph lock poisoned")?;
    let page = graph.page(page_id).ok_or("no such page")?;
    Ok(PageSnapshotOut {
        page_id: page.id,
        page_name: page.name.clone(),
        objects: page.objects().clone(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let live_state = Arc::new(LiveState::new(Graph::new(), AgentMode::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(live_state)
        .setup(|app| {
            let live_state = app.state::<Arc<LiveState>>().inner().clone();

            let listener_state = live_state.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = draft_mcp::local_socket::serve_forever(listener_state).await {
                    eprintln!("draft-mcp local-socket listener stopped: {err}");
                }
            });

            // Forwards an MCP write tool's change notification (see
            // draft_mcp::live::LiveState.changes) to the frontend, so the
            // canvas can refresh a page an agent just wrote to.
            let app_handle = app.handle().clone();
            let mut changes = live_state.changes.subscribe();
            tauri::async_runtime::spawn(async move {
                while let Ok(page_id) = changes.recv().await {
                    let _ = app_handle.emit("draft-graph-changed", page_id.to_string());
                }
            });

            // Forwards the live connection count (see
            // draft_mcp::live::LiveState.connections) so the frontend can
            // show a real "N agents connected" indicator instead of staying
            // silent until a tool call succeeds or is denied.
            let app_handle = app.handle().clone();
            let mut connections = live_state.connections.subscribe();
            tauri::async_runtime::spawn(async move {
                loop {
                    let count = *connections.borrow_and_update();
                    let _ = app_handle.emit("draft-agent-connections-changed", count);
                    if connections.changed().await.is_err() {
                        break;
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            save_snapshot,
            load_snapshot,
            ensure_page,
            apply_operations,
            set_agent_mode,
            get_agent_mode,
            get_agent_connection_count,
            get_page_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
