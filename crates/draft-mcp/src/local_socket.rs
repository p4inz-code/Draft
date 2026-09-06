//! The loopback-only local socket transport from ADR-007: named pipe on
//! Windows, Unix domain socket elsewhere. Both accept loops do the same
//! thing — accept a connection, spawn a task to serve [`LiveMcpServer`] on
//! it, keep accepting — so one slow or misbehaving agent connection can't
//! block new ones from connecting.

use std::sync::Arc;

use crate::live::{LiveMcpServer, LiveState};

#[cfg(windows)]
pub const WINDOWS_PIPE_NAME: &str = r"\\.\pipe\draft-mcp";

/// Runs the accept loop against the default, well-known pipe name the
/// desktop app uses. Tests use [`serve_forever_on`] with a unique name
/// instead, so parallel test runs (and a real running app) don't collide.
#[cfg(windows)]
pub async fn serve_forever(state: Arc<LiveState>) -> std::io::Result<()> {
    serve_forever_on(state, WINDOWS_PIPE_NAME).await
}

#[cfg(windows)]
pub async fn serve_forever_on(state: Arc<LiveState>, pipe_name: &str) -> std::io::Result<()> {
    use rmcp::ServiceExt;
    use tokio::net::windows::named_pipe::ServerOptions;

    loop {
        let pipe = ServerOptions::new()
            .first_pipe_instance(false)
            .create(pipe_name)?;
        pipe.connect().await?;

        let state = Arc::clone(&state);
        tokio::spawn(async move {
            match LiveMcpServer::new(state).serve(pipe).await {
                Ok(service) => {
                    if let Err(err) = service.waiting().await {
                        eprintln!("draft-mcp: local-socket connection ended with error: {err}");
                    }
                }
                Err(err) => {
                    eprintln!("draft-mcp: local-socket connection failed to start: {err}");
                }
            }
        });
    }
}

#[cfg(unix)]
pub fn socket_path() -> std::path::PathBuf {
    std::env::temp_dir().join("draft-mcp.sock")
}

/// Runs the accept loop against the default, well-known socket path the
/// desktop app uses. Tests use [`serve_forever_on`] with a unique path
/// instead, so parallel test runs (and a real running app) don't collide.
#[cfg(unix)]
pub async fn serve_forever(state: Arc<LiveState>) -> std::io::Result<()> {
    serve_forever_on(state, &socket_path()).await
}

#[cfg(unix)]
pub async fn serve_forever_on(
    state: Arc<LiveState>,
    path: &std::path::Path,
) -> std::io::Result<()> {
    use rmcp::ServiceExt;
    use tokio::net::UnixListener;

    // A stale socket file from a previous crashed run would otherwise make
    // `bind` fail with "address in use" even though nothing is listening.
    let _ = std::fs::remove_file(path);
    let listener = UnixListener::bind(path)?;

    loop {
        let (stream, _addr) = listener.accept().await?;
        let state = Arc::clone(&state);
        tokio::spawn(async move {
            match LiveMcpServer::new(state).serve(stream).await {
                Ok(service) => {
                    if let Err(err) = service.waiting().await {
                        eprintln!("draft-mcp: local-socket connection ended with error: {err}");
                    }
                }
                Err(err) => {
                    eprintln!("draft-mcp: local-socket connection failed to start: {err}");
                }
            }
        });
    }
}
