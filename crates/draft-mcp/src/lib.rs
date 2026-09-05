//! Foundation-stage skeleton for DRAFT's MCP server. ADR-007 settles the
//! shape (official `rmcp` SDK; the running desktop app hosts the server on
//! a loopback-only local socket for live-session access, with a separate
//! `draft-mcp` CLI binary keeping stdio transport for headless/on-disk use)
//! but the actual `rmcp` integration, resources, and tools are Session 2
//! scope — wiring them up now, before there's a real Project Graph to
//! expose, would just be a fake server. What's real here: the transport
//! and connection-permission types every later piece will be built against,
//! so Session 2 starts from an agreed shape instead of guessing again.

use draft_security::AgentMode;
use serde::{Deserialize, Serialize};

/// How an agent is connected to a running DRAFT instance.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Transport {
    /// A loopback-only local socket (named pipe on Windows, Unix domain
    /// socket elsewhere) hosted by the running desktop app — gives an agent
    /// access to the live, human-editing session.
    LocalSocket,
    /// Standard MCP stdio transport, used by the headless `draft-mcp` CLI
    /// binary operating directly on a project directory with no running
    /// desktop instance required.
    Stdio,
}

/// The state of one agent connection, surfaced to the user as a visible
/// "Agent connected" indicator (spec §13/§16 — every connection is explicit
/// and revocable, regardless of transport).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentConnection {
    pub transport: Transport,
    pub mode: AgentMode,
}

impl AgentConnection {
    /// A freshly accepted connection always starts in `Manual` — accepting
    /// the socket/stdio handshake is not the same as granting any access.
    pub fn new(transport: Transport) -> Self {
        Self {
            transport,
            mode: AgentMode::Manual,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_connections_start_with_no_access() {
        let conn = AgentConnection::new(Transport::LocalSocket);
        assert_eq!(conn.mode, AgentMode::Manual);
        assert!(!conn.mode.allows_write());
    }
}
