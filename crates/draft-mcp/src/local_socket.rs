//! The loopback-only local socket transport from ADR-007: named pipe on
//! Windows, Unix domain socket elsewhere. Both accept loops do the same
//! thing — accept a connection, spawn a task to serve [`LiveMcpServer`] on
//! it, keep accepting — so one slow or misbehaving agent connection can't
//! block new ones from connecting.
//!
//! **Security note:** "loopback-only" describes a TCP socket's binding, not
//! a Unix-socket-file's or named-pipe's ACL — those need access control set
//! explicitly, which is what the platform-specific security setup below
//! does. Without it, the OS defaults are more permissive than "just this
//! user" (a Unix socket in the shared temp directory inherits the creating
//! process's umask and is commonly group/world-accessible; an unsecured
//! Windows named pipe's default DACL grants read access to the `Everyone`
//! group per `CreateNamedPipe`'s own documentation) — on a shared/multi-user
//! machine, another local account could otherwise observe or interact with
//! a live DRAFT session once the user has granted an agent any access.

use std::sync::Arc;

use crate::live::{LiveMcpServer, LiveState};

/// Increments `LiveState.connections` on creation and decrements it on
/// drop — guarantees the count comes back down even if the served
/// connection's task exits early or panics, without duplicating the
/// decrement at every return point in the accept loops below.
struct ConnectionGuard {
    state: Arc<LiveState>,
}

impl ConnectionGuard {
    fn new(state: Arc<LiveState>) -> Self {
        state.connections.send_modify(|n| *n += 1);
        Self { state }
    }
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        self.state
            .connections
            .send_modify(|n| *n = n.saturating_sub(1));
    }
}

#[cfg(windows)]
pub const WINDOWS_PIPE_NAME: &str = r"\\.\pipe\draft-mcp";

/// Runs the accept loop against the default, well-known pipe name the
/// desktop app uses. Tests use [`serve_forever_on`] with a unique name
/// instead, so parallel test runs (and a real running app) don't collide.
#[cfg(windows)]
pub async fn serve_forever(state: Arc<LiveState>) -> std::io::Result<()> {
    serve_forever_on(state, WINDOWS_PIPE_NAME).await
}

/// Creates one owner-only-secured pipe instance. Fully synchronous and
/// self-contained on purpose: the security descriptor it builds internally
/// holds a raw, `!Send` pointer, and if any part of that lived inside an
/// `async fn`'s body across an `.await` point, the whole future would
/// become non-`Send` (breaking `tokio::spawn`). A plain function call's
/// locals never leak into the caller's async state machine — only the
/// returned, fully-`Send` `NamedPipeServer` does.
#[cfg(windows)]
fn create_secured_pipe_instance(
    pipe_name: &str,
) -> std::io::Result<tokio::net::windows::named_pipe::NamedPipeServer> {
    use tokio::net::windows::named_pipe::ServerOptions;

    let mut security_attributes = windows_security::owner_only_security_attributes()?;
    // Safety: `security_attributes` is a valid, fully-initialized
    // `SECURITY_ATTRIBUTES` (see `windows_security` below) that outlives
    // this call — `create_with_security_attributes_raw` reads it
    // synchronously inside `CreateNamedPipeW` and does not retain the
    // pointer afterward, so it's fine for `security_attributes` to be
    // dropped when this function returns.
    unsafe {
        ServerOptions::new()
            .first_pipe_instance(false)
            .create_with_security_attributes_raw(
                pipe_name,
                security_attributes.as_mut_ptr() as *mut _,
            )
    }
}

#[cfg(windows)]
pub async fn serve_forever_on(state: Arc<LiveState>, pipe_name: &str) -> std::io::Result<()> {
    use rmcp::ServiceExt;

    loop {
        let pipe = create_secured_pipe_instance(pipe_name)?;
        pipe.connect().await?;

        let state = Arc::clone(&state);
        tokio::spawn(async move {
            let guard = ConnectionGuard::new(Arc::clone(&state));
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
            drop(guard);
        });
    }
}

/// Builds a Windows security descriptor restricting the named pipe to its
/// creator (owner) only — see this module's doc comment for why the OS
/// default isn't good enough here.
#[cfg(windows)]
mod windows_security {
    use std::io;

    use windows_sys::Win32::Security::Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW;
    use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;

    /// Owns a `SECURITY_DESCRIPTOR` allocated by
    /// `ConvertStringSecurityDescriptorToSecurityDescriptorW` (must be freed
    /// with `LocalFree`) and the `SECURITY_ATTRIBUTES` that points at it.
    pub struct OwnerOnlySecurityAttributes {
        attrs: SECURITY_ATTRIBUTES,
        descriptor: windows_sys::Win32::Foundation::HLOCAL,
    }

    impl OwnerOnlySecurityAttributes {
        pub fn as_mut_ptr(&mut self) -> *mut SECURITY_ATTRIBUTES {
            &mut self.attrs
        }
    }

    impl Drop for OwnerOnlySecurityAttributes {
        fn drop(&mut self) {
            // Safety: `descriptor` was allocated by
            // ConvertStringSecurityDescriptorToSecurityDescriptorW, which
            // documents LocalFree as the correct way to release it.
            unsafe {
                windows_sys::Win32::Foundation::LocalFree(self.descriptor);
            }
        }
    }

    /// `D:P(A;;GA;;;OW)` — a protected DACL granting Generic All to the
    /// Owner only (no inheritance, nothing granted to Everyone/Authenticated
    /// Users/etc.). This is what makes the pipe inaccessible to other local
    /// user accounts.
    pub fn owner_only_security_attributes() -> io::Result<OwnerOnlySecurityAttributes> {
        const SDDL: &str = "D:P(A;;GA;;;OW)";
        let wide: Vec<u16> = SDDL.encode_utf16().chain(std::iter::once(0)).collect();
        let mut descriptor: windows_sys::Win32::Foundation::HLOCAL = std::ptr::null_mut();

        // Safety: `wide` is a valid, NUL-terminated UTF-16 string for the
        // duration of this call; `descriptor` is a valid out-pointer.
        let ok = unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                wide.as_ptr(),
                1, // SDDL_REVISION_1
                &mut descriptor,
                std::ptr::null_mut(),
            )
        };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }

        Ok(OwnerOnlySecurityAttributes {
            attrs: SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: descriptor as *mut _,
                bInheritHandle: 0,
            },
            descriptor,
        })
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn builds_a_valid_non_null_security_descriptor() {
            let mut attrs = owner_only_security_attributes().unwrap();
            let ptr = attrs.as_mut_ptr();
            assert!(!ptr.is_null());
            // Safety: `ptr` was just returned from a live `OwnerOnlySecurityAttributes`.
            let lp_descriptor = unsafe { (*ptr).lpSecurityDescriptor };
            assert!(!lp_descriptor.is_null());
        }
    }
}

/// Directory the Unix socket lives in — the user's own runtime/data dir via
/// `draft-platform`, not the shared temp directory (which every local user
/// can traverse), so the socket file's parent alone is already narrower
/// than `/tmp`. The file itself is additionally chmod'd to owner-only below.
#[cfg(unix)]
pub fn socket_path() -> std::path::PathBuf {
    use draft_platform::PlatformPaths;
    let dir = draft_platform::NativePlatform
        .app_data_dir()
        .unwrap_or_else(std::env::temp_dir);
    let _ = std::fs::create_dir_all(&dir);
    dir.join("draft-mcp.sock")
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
    use std::os::unix::fs::PermissionsExt;

    use rmcp::ServiceExt;
    use tokio::net::UnixListener;

    // A stale socket file from a previous crashed run would otherwise make
    // `bind` fail with "address in use" even though nothing is listening.
    let _ = std::fs::remove_file(path);
    let listener = UnixListener::bind(path)?;
    // `bind` creates the socket file honoring the process umask, which on
    // many systems leaves it group/world-accessible — narrow it to the
    // owner explicitly rather than trusting the umask.
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;

    loop {
        let (stream, _addr) = listener.accept().await?;
        let state = Arc::clone(&state);
        tokio::spawn(async move {
            let guard = ConnectionGuard::new(Arc::clone(&state));
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
            drop(guard);
        });
    }
}
