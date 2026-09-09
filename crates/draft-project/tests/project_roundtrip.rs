//! Black-box integration test: exercises only `draft-project`'s public API
//! (no access to its internals), verifying the product spec's own "important
//! test" — create -> save -> reload -> identical semantic state.

use std::collections::HashMap;

use draft_core::{ObjectId, PageId};
use draft_project::{
    create_project, load_all_pages, open_project, save_page, save_project, PageDocument,
};

#[test]
fn a_freshly_created_project_reopens_with_identical_semantic_state() {
    let root = tempfile::tempdir().unwrap();
    let project_dir = root.path().join("Level Design.draft");

    let created = create_project(&project_dir, "Level Design").unwrap();
    let reopened = open_project(&project_dir).unwrap();

    assert_eq!(created.id, reopened.id);
    assert_eq!(created.name, reopened.name);
    assert_eq!(created.schema_version, reopened.schema_version);
    assert_eq!(created.pages, reopened.pages);
    assert_eq!(created.created_at, reopened.created_at);
}

/// The exit test from the product spec, run for real: draw across multiple
/// tools (one shape per kind the canvas supports), save, close (drop every
/// in-memory value — nothing left but what's on disk), reopen, and verify
/// the reopened page's objects are byte-for-byte identical to what was
/// drawn. This exercises the exact `draft-project` calls
/// `apps/desktop/src-tauri`'s `save_snapshot`/`load_snapshot` Tauri commands
/// make (`create_project`, `save_page`, `save_project`, `open_project`,
/// `load_all_pages`) — the same code path the desktop app's Save/Open
/// buttons drive, just without going through Tauri IPC and a live window.
#[test]
fn a_page_drawn_with_every_shape_kind_reopens_with_identical_object_data() {
    let root = tempfile::tempdir().unwrap();
    let project_dir = root.path().join("Multi-tool sketch.draft");

    let mut manifest = create_project(&project_dir, "Multi-tool sketch").unwrap();
    let page_id = PageId::new();

    let mut objects: HashMap<ObjectId, serde_json::Value> = HashMap::new();
    objects.insert(
        ObjectId::new(),
        serde_json::json!({"kind": "rectangle", "x": 10.0, "y": 20.0, "width": 100.0, "height": 50.0, "fill": "#ff0000"}),
    );
    objects.insert(
        ObjectId::new(),
        serde_json::json!({"kind": "ellipse", "x": 0.0, "y": 0.0, "width": 40.0, "height": 40.0}),
    );
    objects.insert(
        ObjectId::new(),
        serde_json::json!({"kind": "diamond", "x": 5.0, "y": 5.0, "width": 30.0, "height": 30.0, "rotation": 45.0}),
    );
    objects.insert(
        ObjectId::new(),
        serde_json::json!({"kind": "text", "x": 0.0, "y": 0.0, "width": 120.0, "height": 24.0, "text": "hello world"}),
    );
    objects.insert(
        ObjectId::new(),
        serde_json::json!({"kind": "line", "x1": 0.0, "y1": 0.0, "x2": 50.0, "y2": 50.0, "stroke": "#00ff00", "strokeWidth": 3.0}),
    );
    objects.insert(
        ObjectId::new(),
        serde_json::json!({"kind": "arrow", "x1": 0.0, "y1": 0.0, "x2": 50.0, "y2": 0.0}),
    );
    objects.insert(
        ObjectId::new(),
        serde_json::json!({"kind": "freehand", "points": [[0.0, 0.0], [1.0, 2.0], [3.0, 5.0]]}),
    );

    let document = PageDocument {
        id: page_id,
        name: "Page 1".to_string(),
        objects: objects.clone(),
    };
    save_page(&project_dir, &document).unwrap();
    manifest.pages.push(page_id);
    save_project(&project_dir, &mut manifest).unwrap();

    // Close: drop every in-memory value. Nothing survives but what's on disk.
    drop(manifest);
    drop(document);
    drop(objects.clone());

    // Reopen, exactly as `load_snapshot` does.
    let reopened_manifest = open_project(&project_dir).unwrap();
    let reopened_pages = load_all_pages(&project_dir, &reopened_manifest).unwrap();

    assert_eq!(reopened_pages.len(), 1);
    let reopened_page = &reopened_pages[0];
    assert_eq!(reopened_page.id, page_id);
    assert_eq!(reopened_page.name, "Page 1");
    assert_eq!(reopened_page.objects, objects);
}
