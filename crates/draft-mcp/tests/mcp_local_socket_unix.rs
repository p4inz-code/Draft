//! Unix-only: confirms the local-socket file is actually locked down to the
//! owner (0600), not left at whatever the umask happens to produce. Can't be
//! exercised on this project's Windows dev machine — verified by CI's
//! Linux/macOS legs instead (see .github/workflows/ci.yml).

#![cfg(unix)]

use std::{os::unix::fs::PermissionsExt, sync::Arc, time::Duration};

use draft_core::ObjectId;
use draft_graph::Graph;
use draft_mcp::live::LiveState;
use draft_security::AgentMode;

#[tokio::test]
async fn the_socket_file_is_owner_only() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(format!(
        "draft-mcp-test-{}.sock",
        ObjectId::new().as_uuid().simple()
    ));

    let state = Arc::new(LiveState::new(Graph::new(), AgentMode::Manual));
    let server_path = path.clone();
    tokio::spawn(async move {
        let _ = draft_mcp::local_socket::serve_forever_on(state, &server_path).await;
    });

    // The accept loop creates the file synchronously before its first
    // `.accept().await`, but give it a moment in case the task hasn't been
    // scheduled yet.
    for _ in 0..50 {
        if path.exists() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(path.exists(), "socket file was never created");

    let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600, "socket file should be owner-read-write-only");
}
