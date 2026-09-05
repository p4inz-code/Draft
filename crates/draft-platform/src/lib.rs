//! A trait-based OS abstraction so `draft-project`/`draft-media` never call
//! platform APIs directly. Spec §5/§17 rule out DRAFT becoming permanently
//! desktop-API-locked, so this boundary exists now even though only one
//! implementation (native OS, via the `dirs` crate) exists yet — a
//! browser/WASM implementation is reserved for the Session 3 web push,
//! and the desktop app also just uses `NativePlatform` (it does not need a
//! Tauri-specific implementation of *this* trait; Tauri-specific concerns
//! like native file dialogs live in the desktop app itself, not here).

use std::path::PathBuf;

pub trait PlatformPaths {
    /// Per-user application data directory (settings, recent-projects list).
    fn app_data_dir(&self) -> Option<PathBuf>;
    /// The user's documents directory, used as the default save location.
    fn documents_dir(&self) -> Option<PathBuf>;
}

/// The native desktop implementation, backed by the `dirs` crate. Used by
/// both the Tauri app and the headless `draft-mcp` CLI binary.
#[derive(Debug, Default, Clone, Copy)]
pub struct NativePlatform;

impl PlatformPaths for NativePlatform {
    fn app_data_dir(&self) -> Option<PathBuf> {
        dirs::data_dir().map(|dir| dir.join("DRAFT"))
    }

    fn documents_dir(&self) -> Option<PathBuf> {
        dirs::document_dir()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_app_data_dir_is_namespaced_under_draft() {
        let platform = NativePlatform;
        if let Some(dir) = platform.app_data_dir() {
            assert_eq!(dir.file_name().unwrap(), "DRAFT");
        }
    }
}
