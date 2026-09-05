//! Imported media becomes an addressable workspace asset (spec §10):
//! content-hashed so the same file imported twice is recognized as the same
//! asset, and carrying just enough metadata for the Project Graph/MCP layer
//! to reference it without needing to read the raw bytes. Format-specific
//! handling (video timestamps, PSD layers, etc.) is later-session scope —
//! this crate only establishes the identity/metadata primitive.

use std::{
    io::{self, Read},
    path::Path,
};

use draft_core::AssetId;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    Image,
    Video,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetMetadata {
    pub id: AssetId,
    pub kind: AssetKind,
    pub original_filename: String,
    /// Hex-encoded SHA-256 of the file's contents, used to de-duplicate
    /// re-imports of the same file.
    pub content_hash: String,
    pub size_bytes: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum MediaError {
    #[error("failed to read asset file: {0}")]
    Io(#[from] io::Error),
}

/// Hashes a file's contents with SHA-256, streaming so large video files
/// don't need to be loaded into memory at once.
pub fn hash_file(path: &Path) -> Result<String, MediaError> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

impl AssetMetadata {
    /// Builds metadata for a newly imported file by hashing and stat-ing it.
    pub fn from_file(path: &Path, kind: AssetKind) -> Result<Self, MediaError> {
        let content_hash = hash_file(path)?;
        let size_bytes = std::fs::metadata(path)?.len();
        let original_filename = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();

        Ok(Self {
            id: AssetId::new(),
            kind,
            original_filename,
            content_hash,
            size_bytes,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn hashing_the_same_content_twice_is_deterministic() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ref.png");
        fs::write(&path, b"same bytes").unwrap();

        let first = hash_file(&path).unwrap();
        let second = hash_file(&path).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn different_content_hashes_differently() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.png");
        let b = dir.path().join("b.png");
        fs::write(&a, b"content a").unwrap();
        fs::write(&b, b"content b").unwrap();

        assert_ne!(hash_file(&a).unwrap(), hash_file(&b).unwrap());
    }

    #[test]
    fn from_file_captures_filename_and_size() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("reference.png");
        fs::write(&path, b"12345").unwrap();

        let meta = AssetMetadata::from_file(&path, AssetKind::Image).unwrap();
        assert_eq!(meta.original_filename, "reference.png");
        assert_eq!(meta.size_bytes, 5);
        assert_eq!(meta.kind, AssetKind::Image);
    }
}
