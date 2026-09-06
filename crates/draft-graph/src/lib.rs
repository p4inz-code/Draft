//! The Project Graph (spec §7/§8): the structured, agent-readable state
//! that sits between the canvas and MCP. It is built by *applying*
//! [`draft_events::Operation`]s, never by the canvas writing to it directly
//! — the canvas is not the source of truth (spec §7).
//!
//! Object payloads are validated into a typed [`shape::Shape`] on the way
//! in (ADR-014) — the drawing-shape taxonomy from spec §8, not yet the full
//! semantic taxonomy (`Region`, `Requirement`, `Flow`, ...), which stays
//! deferred per `docs/project-graph.md`.

pub mod shape;

use std::collections::HashMap;

use draft_core::{ObjectId, PageId};
use draft_events::Operation;
pub use shape::{KnownShape, Shape, ShapeBase};

#[derive(Debug, thiserror::Error)]
pub enum GraphError {
    #[error("page {0} does not exist")]
    UnknownPage(PageId),
    #[error("object {0} does not exist")]
    UnknownObject(ObjectId),
    #[error("object {0} already exists")]
    DuplicateObject(ObjectId),
    #[error("invalid shape payload: {0}")]
    InvalidShape(String),
}

#[derive(Debug, Clone)]
pub struct Page {
    pub id: PageId,
    pub name: String,
    objects: HashMap<ObjectId, Shape>,
}

impl Page {
    pub fn object(&self, id: ObjectId) -> Option<&Shape> {
        self.objects.get(&id)
    }

    pub fn object_count(&self) -> usize {
        self.objects.len()
    }

    /// All objects on this page, keyed by ID — for persistence (`draft-project`
    /// owns the file format; this crate only exposes the data to export).
    pub fn objects(&self) -> &HashMap<ObjectId, Shape> {
        &self.objects
    }
}

/// Strict: used at the live write boundary (`Graph::apply`) — a malformed
/// known-kind payload from a human edit or agent write is rejected outright.
fn parse_shape(payload: &serde_json::Value) -> Result<Shape, GraphError> {
    serde_json::from_value(payload.clone()).map_err(|e| GraphError::InvalidShape(e.to_string()))
}

/// Lenient: used when reconstructing a `Graph` from previously-saved data
/// (`insert_page`) — a malformed object shouldn't fail loading the entire
/// project, so it's kept as `Shape::Other` rather than rejected.
fn shape_from_json_lenient(value: serde_json::Value) -> Shape {
    serde_json::from_value::<Shape>(value.clone()).unwrap_or(Shape::Other(value))
}

/// The current, materialized state of a project: its pages and their
/// objects, as produced by replaying an operation log.
#[derive(Debug, Default)]
pub struct Graph {
    pages: HashMap<PageId, Page>,
}

impl Graph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn create_page(&mut self, name: impl Into<String>) -> PageId {
        let id = PageId::new();
        self.pages.insert(
            id,
            Page {
                id,
                name: name.into(),
                objects: HashMap::new(),
            },
        );
        id
    }

    pub fn page(&self, id: PageId) -> Option<&Page> {
        self.pages.get(&id)
    }

    /// All pages, for persistence/export — order is not guaranteed; callers
    /// that care about display order use `ProjectManifest.pages` instead.
    pub fn pages(&self) -> impl Iterator<Item = &Page> {
        self.pages.values()
    }

    /// Inserts a page with a caller-supplied ID and pre-existing objects —
    /// used when reconstructing a `Graph` from saved `draft-project` page
    /// documents, where the IDs must match what was persisted rather than
    /// being freshly generated (see `create_page` for the "new page" case).
    pub fn insert_page(
        &mut self,
        id: PageId,
        name: String,
        objects: HashMap<ObjectId, serde_json::Value>,
    ) {
        let objects = objects
            .into_iter()
            .map(|(id, value)| (id, shape_from_json_lenient(value)))
            .collect();
        self.pages.insert(id, Page { id, name, objects });
    }

    /// Creates a page under a caller-supplied ID only if it doesn't already
    /// exist — idempotent, unlike `insert_page` (which always overwrites).
    /// Used when the frontend generates a page ID client-side and needs the
    /// Rust-owned graph to have a matching page before any `CreateObject`
    /// operation for it can apply, without risking clobbering objects a
    /// concurrent/earlier call already added.
    pub fn ensure_page(&mut self, id: PageId, name: impl Into<String>) {
        self.pages.entry(id).or_insert_with(|| Page {
            id,
            name: name.into(),
            objects: HashMap::new(),
        });
    }

    /// Applies one operation from the log, mutating graph state. Rejects
    /// operations that target a page/object that doesn't exist rather than
    /// silently creating one — the log is expected to be well-formed by the
    /// time it reaches here (validated at the layer that accepts frontend
    /// commits or agent write requests).
    pub fn apply(&mut self, operation: &Operation) -> Result<(), GraphError> {
        match operation {
            Operation::CreateObject {
                page,
                object,
                payload,
            } => {
                let shape = parse_shape(payload)?;
                let page = self
                    .pages
                    .get_mut(page)
                    .ok_or(GraphError::UnknownPage(*page))?;
                if page.objects.contains_key(object) {
                    return Err(GraphError::DuplicateObject(*object));
                }
                page.objects.insert(*object, shape);
                Ok(())
            }
            Operation::UpdateObject {
                page,
                object,
                payload,
            } => {
                let shape = parse_shape(payload)?;
                let page = self
                    .pages
                    .get_mut(page)
                    .ok_or(GraphError::UnknownPage(*page))?;
                let existing = page
                    .objects
                    .get_mut(object)
                    .ok_or(GraphError::UnknownObject(*object))?;
                *existing = shape;
                Ok(())
            }
            Operation::MoveObject { page, object, x, y } => {
                let page = self
                    .pages
                    .get_mut(page)
                    .ok_or(GraphError::UnknownPage(*page))?;
                let existing = page
                    .objects
                    .get_mut(object)
                    .ok_or(GraphError::UnknownObject(*object))?;
                existing.set_position(*x, *y);
                Ok(())
            }
            Operation::DeleteObject { page, object } => {
                let page = self
                    .pages
                    .get_mut(page)
                    .ok_or(GraphError::UnknownPage(*page))?;
                page.objects
                    .remove(object)
                    .ok_or(GraphError::UnknownObject(*object))?;
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn create_update_move_delete_round_trip() {
        let mut graph = Graph::new();
        let page = graph.create_page("Level 1");
        let object = ObjectId::new();

        graph
            .apply(&Operation::CreateObject {
                page,
                object,
                payload: json!({"kind": "rectangle", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0}),
            })
            .unwrap();
        assert_eq!(graph.page(page).unwrap().object_count(), 1);

        graph
            .apply(&Operation::MoveObject {
                page,
                object,
                x: 5.0,
                y: 10.0,
            })
            .unwrap();
        let moved = graph.page(page).unwrap().object(object).unwrap();
        assert_eq!(moved.position(), (5.0, 10.0));

        graph
            .apply(&Operation::DeleteObject { page, object })
            .unwrap();
        assert_eq!(graph.page(page).unwrap().object_count(), 0);
    }

    #[test]
    fn rejects_operations_on_unknown_pages_and_objects() {
        let mut graph = Graph::new();
        let stray_page = PageId::new();
        let stray_object = ObjectId::new();

        let err = graph
            .apply(&Operation::CreateObject {
                page: stray_page,
                object: stray_object,
                payload: json!({}),
            })
            .unwrap_err();
        assert!(matches!(err, GraphError::UnknownPage(_)));

        let page = graph.create_page("Empty");
        let err = graph
            .apply(&Operation::DeleteObject {
                page,
                object: stray_object,
            })
            .unwrap_err();
        assert!(matches!(err, GraphError::UnknownObject(_)));
    }

    #[test]
    fn rejects_creating_the_same_object_twice() {
        let mut graph = Graph::new();
        let page = graph.create_page("Level 1");
        let object = ObjectId::new();
        let op = Operation::CreateObject {
            page,
            object,
            payload: json!({}),
        };

        graph.apply(&op).unwrap();
        let err = graph.apply(&op).unwrap_err();
        assert!(matches!(err, GraphError::DuplicateObject(_)));
    }

    #[test]
    fn ensure_page_is_idempotent_and_does_not_clobber_existing_objects() {
        let mut graph = Graph::new();
        let id = PageId::new();

        graph.ensure_page(id, "Level 1");
        let object = ObjectId::new();
        graph
            .apply(&Operation::CreateObject {
                page: id,
                object,
                payload: json!({"kind": "note"}),
            })
            .unwrap();

        // Calling ensure_page again (e.g. the frontend re-registering the
        // same page) must not wipe out the object just created.
        graph.ensure_page(id, "Level 1 renamed");

        assert_eq!(graph.page(id).unwrap().object_count(), 1);
        assert_eq!(graph.page(id).unwrap().name, "Level 1");
    }

    #[test]
    fn apply_rejects_a_malformed_known_kind_payload() {
        let mut graph = Graph::new();
        let page = graph.create_page("Level 1");

        let err = graph
            .apply(&Operation::CreateObject {
                page,
                object: ObjectId::new(),
                // "rectangle" is a known kind, but missing width/height —
                // must be rejected, not silently stored as an opaque blob.
                payload: json!({"kind": "rectangle", "x": 0.0, "y": 0.0}),
            })
            .unwrap_err();

        assert!(matches!(err, GraphError::InvalidShape(_)));
        assert_eq!(graph.page(page).unwrap().object_count(), 0);
    }

    #[test]
    fn apply_accepts_an_unrecognized_kind_verbatim() {
        let mut graph = Graph::new();
        let page = graph.create_page("Level 1");
        let object = ObjectId::new();

        // "region" isn't one of the eight drawing shapes this build knows
        // about (ADR-014's forward-compatibility fallback) — it should be
        // stored, not rejected.
        graph
            .apply(&Operation::CreateObject {
                page,
                object,
                payload: json!({"kind": "region", "x": 1.0, "y": 2.0, "note": "future kind"}),
            })
            .unwrap();

        let stored = graph.page(page).unwrap().object(object).unwrap();
        assert!(matches!(stored, Shape::Other(_)));
        assert_eq!(stored.position(), (1.0, 2.0));
    }

    #[test]
    fn insert_page_tolerates_a_malformed_known_kind_instead_of_panicking() {
        let mut graph = Graph::new();
        let id = PageId::new();
        let object = ObjectId::new();
        let mut objects = HashMap::new();
        // Simulates a corrupted/old-format saved page: "ellipse" is known,
        // but has no width/height. Loading must not panic or drop the page.
        objects.insert(object, json!({"kind": "ellipse", "x": 0.0, "y": 0.0}));

        graph.insert_page(id, "Recovered".to_string(), objects);

        assert_eq!(graph.page(id).unwrap().object_count(), 1);
        assert!(matches!(
            graph.page(id).unwrap().object(object).unwrap(),
            Shape::Other(_)
        ));
    }
}
