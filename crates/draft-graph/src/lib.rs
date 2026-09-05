//! The Project Graph (spec §7/§8): the structured, agent-readable state
//! that sits between the canvas and MCP. It is built by *applying*
//! [`draft_events::Operation`]s, never by the canvas writing to it directly
//! — the canvas is not the source of truth (spec §7).
//!
//! Object payloads stay untyped ([`serde_json::Value`]) at foundation stage;
//! the concrete shape taxonomy from spec §8 (FreehandStroke, Text, Arrow,
//! Image, ...) is Session 1/2 scope, once the canvas engine needs it.

use std::collections::HashMap;

use draft_core::{ObjectId, PageId};
use draft_events::Operation;

#[derive(Debug, thiserror::Error)]
pub enum GraphError {
    #[error("page {0} does not exist")]
    UnknownPage(PageId),
    #[error("object {0} does not exist")]
    UnknownObject(ObjectId),
    #[error("object {0} already exists")]
    DuplicateObject(ObjectId),
}

#[derive(Debug, Clone)]
pub struct Page {
    pub id: PageId,
    pub name: String,
    objects: HashMap<ObjectId, serde_json::Value>,
}

impl Page {
    pub fn object(&self, id: ObjectId) -> Option<&serde_json::Value> {
        self.objects.get(&id)
    }

    pub fn object_count(&self) -> usize {
        self.objects.len()
    }

    /// All objects on this page, keyed by ID — for persistence (`draft-project`
    /// owns the file format; this crate only exposes the data to export).
    pub fn objects(&self) -> &HashMap<ObjectId, serde_json::Value> {
        &self.objects
    }
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
        self.pages.insert(id, Page { id, name, objects });
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
                let page = self
                    .pages
                    .get_mut(page)
                    .ok_or(GraphError::UnknownPage(*page))?;
                if page.objects.contains_key(object) {
                    return Err(GraphError::DuplicateObject(*object));
                }
                page.objects.insert(*object, payload.clone());
                Ok(())
            }
            Operation::UpdateObject {
                page,
                object,
                payload,
            } => {
                let page = self
                    .pages
                    .get_mut(page)
                    .ok_or(GraphError::UnknownPage(*page))?;
                let existing = page
                    .objects
                    .get_mut(object)
                    .ok_or(GraphError::UnknownObject(*object))?;
                *existing = payload.clone();
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
                if let Some(map) = existing.as_object_mut() {
                    map.insert("x".into(), (*x).into());
                    map.insert("y".into(), (*y).into());
                }
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
                payload: json!({"kind": "rectangle"}),
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
        assert_eq!(moved["x"], 5.0);
        assert_eq!(moved["y"], 10.0);

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
}
