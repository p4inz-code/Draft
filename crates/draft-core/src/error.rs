use std::fmt;

/// Errors shared by the low-level primitives in this crate (currently just
/// ID parsing). Higher-level crates define their own error types and wrap
/// this one where relevant rather than everything funneling through a single
/// project-wide enum.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("invalid {kind} id `{value}`: expected `{kind}://<uuid>`")]
    InvalidId { kind: &'static str, value: String },
}

impl CoreError {
    pub(crate) fn invalid_id(kind: &'static str, value: impl fmt::Display) -> Self {
        Self::InvalidId {
            kind,
            value: value.to_string(),
        }
    }
}
