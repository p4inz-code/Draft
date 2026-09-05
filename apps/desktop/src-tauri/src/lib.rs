use std::{collections::HashMap, path::PathBuf};

use draft_core::{ObjectId, PageId};
use draft_project::{PageDocument, ProjectManifest};

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
/// it if it doesn't exist yet. Single-page for now — `@draft/canvas`'s store
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
/// rehydrate its canvas store from.
#[tauri::command]
fn load_snapshot(dir: String) -> Result<ProjectSnapshot, String> {
    let project_dir = PathBuf::from(dir);
    let manifest: ProjectManifest =
        draft_project::open_project(&project_dir).map_err(|e| e.to_string())?;
    let pages =
        draft_project::load_all_pages(&project_dir, &manifest).map_err(|e| e.to_string())?;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_version,
            save_snapshot,
            load_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
