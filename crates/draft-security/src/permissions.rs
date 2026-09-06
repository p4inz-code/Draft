use serde::{Deserialize, Serialize};

/// The five agent modes from spec §13. Every DRAFT project starts in
/// `Manual` — an agent gets no access until the user explicitly changes
/// this, and moving to `Build` (the only mode that allows writes) is always
/// a deliberate, visible action, never a default.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentMode {
    /// Agent has no access at all.
    #[default]
    Manual,
    /// Agent may read the workspace only when the user explicitly asks it to.
    Ask,
    /// Agent may observe user changes as they happen.
    Watch,
    /// Agent observes and may offer suggestions, but cannot write.
    Assist,
    /// Agent may write to the project, subject to per-action permission checks.
    Build,
}

impl AgentMode {
    /// Whether this mode permits the agent to mutate the project at all.
    /// Only `Build` does — every other mode is read-only by construction.
    pub fn allows_write(self) -> bool {
        matches!(self, AgentMode::Build)
    }

    /// Whether this mode permits the agent to read the workspace at all.
    /// Only `Manual` denies it — every mode above that is at least
    /// read-capable (spec §13's `Ask` nuance — read "only when the user
    /// explicitly asks" — is a UI-level distinction this crate doesn't
    /// enforce; once in `Ask` mode or above, MCP tools may read).
    pub fn allows_read(self) -> bool {
        !matches!(self, AgentMode::Manual)
    }
}

/// A recorded grant of agent access, visible to the user and revocable at
/// any time (spec §16). Foundation-stage shape only — scoping to specific
/// pages/objects is Session 3 work.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PermissionGrant {
    pub mode: AgentMode,
    /// Unix timestamp (seconds) the grant was made, for display/audit.
    pub granted_at_unix: i64,
}

/// The outcome of checking a requested action against the current grant.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionDecision {
    Allow,
    Deny,
}

impl PermissionGrant {
    /// Decides whether a write action is permitted under this grant.
    pub fn check_write(&self) -> PermissionDecision {
        if self.mode.allows_write() {
            PermissionDecision::Allow
        } else {
            PermissionDecision::Deny
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_is_the_default_and_denies_writes() {
        assert_eq!(AgentMode::default(), AgentMode::Manual);
        assert!(!AgentMode::Manual.allows_write());
    }

    #[test]
    fn only_build_mode_allows_writes() {
        for mode in [
            AgentMode::Manual,
            AgentMode::Ask,
            AgentMode::Watch,
            AgentMode::Assist,
        ] {
            assert!(!mode.allows_write(), "{mode:?} must not allow writes");
        }
        assert!(AgentMode::Build.allows_write());
    }

    #[test]
    fn only_manual_denies_reads() {
        assert!(!AgentMode::Manual.allows_read());
        for mode in [
            AgentMode::Ask,
            AgentMode::Watch,
            AgentMode::Assist,
            AgentMode::Build,
        ] {
            assert!(mode.allows_read(), "{mode:?} must allow reads");
        }
    }

    #[test]
    fn grant_check_write_matches_mode() {
        let grant = PermissionGrant {
            mode: AgentMode::Watch,
            granted_at_unix: 0,
        };
        assert_eq!(grant.check_write(), PermissionDecision::Deny);

        let grant = PermissionGrant {
            mode: AgentMode::Build,
            granted_at_unix: 0,
        };
        assert_eq!(grant.check_write(), PermissionDecision::Allow);
    }
}
