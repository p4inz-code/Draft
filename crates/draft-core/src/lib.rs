//! Shared domain primitives used across every DRAFT crate: stable typed IDs
//! (spec'd as `scheme://uuid` URIs) and the core error type they parse into.

pub mod error;
pub mod id;

pub use error::CoreError;
pub use id::{AnnotationId, AssetId, ObjectId, PageId, ProjectId, RegionId};

/// The version of `draft-core` itself, exposed so other layers (the MCP
/// server, the desktop shell's about screen) can report it without each
/// crate re-deriving it from `CARGO_PKG_VERSION` independently.
pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");
