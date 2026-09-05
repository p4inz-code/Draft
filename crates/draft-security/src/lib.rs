//! DRAFT's permission model (spec §13/§16: agent editing defaults to OFF,
//! grants are explicit/visible/revocable) and the filesystem safety helpers
//! every crate that touches user-supplied paths (`draft-project`,
//! `draft-media`) is expected to route through.

pub mod path_safety;
pub mod permissions;

pub use path_safety::is_path_within_project;
pub use permissions::{AgentMode, PermissionDecision, PermissionGrant};
