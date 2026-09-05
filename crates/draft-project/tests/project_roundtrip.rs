//! Black-box integration test: exercises only `draft-project`'s public API
//! (no access to its internals), verifying the product spec's own "important
//! test" — create -> save -> reload -> identical semantic state.

use draft_project::{create_project, open_project};

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
