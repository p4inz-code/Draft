//! Reads and writes the DRAFT project format (spec §18, ADR-006):
//!
//! ```text
//! project.draft/
//!     project.json     — manifest: schemaVersion, id, name, page index
//!     pages/            — one JSON file per page
//!     assets/           — imported media, content-addressed
//!     thumbnails/
//!     metadata/
//! ```
//!
//! `project.json` carries a `schemaVersion` from day one so future format
//! changes can migrate forward instead of silently misreading old projects.

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use draft_core::{ObjectId, PageId, ProjectId};
use draft_security::is_path_within_project;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

/// Bumped whenever `project.json`'s shape changes in a way that requires a
/// migration. `draft-project` only knows how to open this exact version for
/// now — see [`open_project`] for what happens when it doesn't match.
pub const CURRENT_SCHEMA_VERSION: u32 = 1;

const MANIFEST_FILENAME: &str = "project.json";
const SUBDIRS: [&str; 4] = ["pages", "assets", "thumbnails", "metadata"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub id: ProjectId,
    pub name: String,
    #[serde(with = "time::serde::rfc3339")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    pub modified_at: OffsetDateTime,
    /// Page IDs in display order — the source of truth for page ordering,
    /// since `pages/*.json` filenames are not (spec §8's Project > Page
    /// hierarchy).
    pub pages: Vec<PageId>,
}

#[derive(Debug, thiserror::Error)]
pub enum ProjectError {
    #[error("io error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("project.json at {0} is not valid JSON")]
    Corrupt(PathBuf, #[source] serde_json::Error),
    #[error(
        "project schema version {found} is newer than the {supported} this build of DRAFT supports — update DRAFT to open this project"
    )]
    UnsupportedSchemaVersion { found: u32, supported: u32 },
    #[error("{0} already contains a DRAFT project")]
    AlreadyExists(PathBuf),
    #[error("{0} is not a DRAFT project (no project.json)")]
    NotFound(PathBuf),
    #[error("asset path `{0}` resolves outside the project directory")]
    UnsafeAssetPath(String),
}

fn io_err(path: &Path, source: std::io::Error) -> ProjectError {
    ProjectError::Io {
        path: path.to_path_buf(),
        source,
    }
}

/// Creates a new project bundle at `dir`, which must not already exist.
pub fn create_project(dir: &Path, name: &str) -> Result<ProjectManifest, ProjectError> {
    if dir.exists() {
        return Err(ProjectError::AlreadyExists(dir.to_path_buf()));
    }
    std::fs::create_dir_all(dir).map_err(|e| io_err(dir, e))?;
    for subdir in SUBDIRS {
        std::fs::create_dir_all(dir.join(subdir)).map_err(|e| io_err(dir, e))?;
    }

    let now = OffsetDateTime::now_utc();
    let manifest = ProjectManifest {
        schema_version: CURRENT_SCHEMA_VERSION,
        id: ProjectId::new(),
        name: name.to_string(),
        created_at: now,
        modified_at: now,
        pages: Vec::new(),
    };
    write_manifest(dir, &manifest)?;
    Ok(manifest)
}

/// Opens an existing project bundle, validating its schema version.
pub fn open_project(dir: &Path) -> Result<ProjectManifest, ProjectError> {
    let manifest_path = dir.join(MANIFEST_FILENAME);
    if !manifest_path.exists() {
        return Err(ProjectError::NotFound(dir.to_path_buf()));
    }
    let raw = std::fs::read_to_string(&manifest_path).map_err(|e| io_err(&manifest_path, e))?;
    let manifest: ProjectManifest =
        serde_json::from_str(&raw).map_err(|e| ProjectError::Corrupt(manifest_path.clone(), e))?;

    if manifest.schema_version > CURRENT_SCHEMA_VERSION {
        return Err(ProjectError::UnsupportedSchemaVersion {
            found: manifest.schema_version,
            supported: CURRENT_SCHEMA_VERSION,
        });
    }
    Ok(manifest)
}

/// Persists the manifest, bumping `modified_at`.
pub fn save_project(dir: &Path, manifest: &mut ProjectManifest) -> Result<(), ProjectError> {
    manifest.modified_at = OffsetDateTime::now_utc();
    write_manifest(dir, manifest)
}

fn write_manifest(dir: &Path, manifest: &ProjectManifest) -> Result<(), ProjectError> {
    let manifest_path = dir.join(MANIFEST_FILENAME);
    let json =
        serde_json::to_string_pretty(manifest).expect("ProjectManifest serialization cannot fail");
    std::fs::write(&manifest_path, json).map_err(|e| io_err(&manifest_path, e))
}

/// One page's saved content: `draft-graph::Page`'s persisted form. This crate
/// doesn't depend on `draft-graph` — callers (the Tauri command layer,
/// `draft-mcp`) convert between `Graph`/`Page` and this type, keeping the
/// domain model (`draft-graph`) decoupled from the storage format (here).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageDocument {
    pub id: PageId,
    pub name: String,
    pub objects: HashMap<ObjectId, serde_json::Value>,
}

fn page_path(project_dir: &Path, page_id: PageId) -> PathBuf {
    project_dir
        .join("pages")
        .join(format!("{}.json", page_id.as_uuid()))
}

/// Saves one page's content to `pages/<uuid>.json`.
pub fn save_page(project_dir: &Path, page: &PageDocument) -> Result<(), ProjectError> {
    let path = page_path(project_dir, page.id);
    let json = serde_json::to_string_pretty(page).expect("PageDocument serialization cannot fail");
    std::fs::write(&path, json).map_err(|e| io_err(&path, e))
}

/// Loads one page's content by ID.
pub fn load_page(project_dir: &Path, page_id: PageId) -> Result<PageDocument, ProjectError> {
    let path = page_path(project_dir, page_id);
    let raw = std::fs::read_to_string(&path).map_err(|e| io_err(&path, e))?;
    serde_json::from_str(&raw).map_err(|e| ProjectError::Corrupt(path, e))
}

/// Loads every page listed in the manifest, in the manifest's order.
pub fn load_all_pages(
    project_dir: &Path,
    manifest: &ProjectManifest,
) -> Result<Vec<PageDocument>, ProjectError> {
    manifest
        .pages
        .iter()
        .map(|&id| load_page(project_dir, id))
        .collect()
}

/// Resolves a project-relative asset path, rejecting anything that would
/// escape the project directory (spec §17 privacy/local-first boundary —
/// project files are portable and not trusted input; see
/// `draft_security::is_path_within_project`).
pub fn resolve_asset_path(project_dir: &Path, relative: &str) -> Result<PathBuf, ProjectError> {
    let candidate = project_dir.join("assets").join(relative);
    if !is_path_within_project(project_dir, &candidate) {
        return Err(ProjectError::UnsafeAssetPath(relative.to_string()));
    }
    Ok(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn create_then_open_round_trips_identically() {
        let root = tempfile::tempdir().unwrap();
        let project_dir = root.path().join("My Game.draft");

        let created = create_project(&project_dir, "My Game").unwrap();
        let reopened = open_project(&project_dir).unwrap();

        assert_eq!(created.id, reopened.id);
        assert_eq!(created.name, reopened.name);
        assert_eq!(created.schema_version, reopened.schema_version);
        for subdir in SUBDIRS {
            assert!(project_dir.join(subdir).is_dir());
        }
    }

    #[test]
    fn opening_a_future_schema_version_fails_clearly_instead_of_misreading() {
        let root = tempfile::tempdir().unwrap();
        let project_dir = root.path().join("Future.draft");
        create_project(&project_dir, "Future").unwrap();

        // Simulate a project.json written by a much newer DRAFT version.
        let mut manifest = open_project(&project_dir).unwrap();
        manifest.schema_version = CURRENT_SCHEMA_VERSION + 1;
        write_manifest(&project_dir, &manifest).unwrap();

        let err = open_project(&project_dir).unwrap_err();
        assert!(matches!(
            err,
            ProjectError::UnsupportedSchemaVersion { found, supported }
                if found == CURRENT_SCHEMA_VERSION + 1 && supported == CURRENT_SCHEMA_VERSION
        ));
    }

    #[test]
    fn opening_garbage_json_fails_instead_of_panicking() {
        let root = tempfile::tempdir().unwrap();
        let project_dir = root.path().join("Corrupt.draft");
        fs::create_dir_all(&project_dir).unwrap();
        fs::write(project_dir.join(MANIFEST_FILENAME), b"{ not valid json ").unwrap();

        let err = open_project(&project_dir).unwrap_err();
        assert!(matches!(err, ProjectError::Corrupt(_, _)));
    }

    #[test]
    fn opening_a_directory_without_a_manifest_is_reported_as_not_found() {
        let root = tempfile::tempdir().unwrap();
        let not_a_project = root.path().join("just-a-folder");
        fs::create_dir_all(&not_a_project).unwrap();

        assert!(matches!(
            open_project(&not_a_project),
            Err(ProjectError::NotFound(_))
        ));
    }

    #[test]
    fn resolve_asset_path_rejects_traversal_outside_assets() {
        let root = tempfile::tempdir().unwrap();
        let project_dir = root.path().join("Traversal.draft");
        create_project(&project_dir, "Traversal").unwrap();
        fs::write(project_dir.join("assets").join("ok.png"), b"ok").unwrap();

        assert!(resolve_asset_path(&project_dir, "ok.png").is_ok());
        assert!(matches!(
            resolve_asset_path(&project_dir, "../../secret.txt"),
            Err(ProjectError::UnsafeAssetPath(_))
        ));
    }

    #[test]
    fn save_and_load_page_round_trips_objects() {
        let root = tempfile::tempdir().unwrap();
        let project_dir = root.path().join("Pages.draft");
        let mut manifest = create_project(&project_dir, "Pages").unwrap();

        let page_id = PageId::new();
        let object_id = ObjectId::new();
        let mut objects = HashMap::new();
        objects.insert(
            object_id,
            serde_json::json!({"kind": "rectangle", "x": 1, "y": 2}),
        );
        let page = PageDocument {
            id: page_id,
            name: "Level 1".to_string(),
            objects,
        };

        save_page(&project_dir, &page).unwrap();
        manifest.pages.push(page_id);
        save_project(&project_dir, &mut manifest).unwrap();

        let reloaded_manifest = open_project(&project_dir).unwrap();
        let pages = load_all_pages(&project_dir, &reloaded_manifest).unwrap();

        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].id, page_id);
        assert_eq!(pages[0].name, "Level 1");
        assert_eq!(pages[0].objects[&object_id]["kind"], "rectangle");
    }
}
