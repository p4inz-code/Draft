use std::path::Path;

/// Returns `true` only if `candidate` resolves to a location inside `base`.
///
/// Both paths are canonicalized before comparison so `..` segments, symlinks,
/// and relative components can't be used to escape the project directory —
/// this is the check `draft-project` and `draft-media` must run before ever
/// reading or writing a path that originated from project data or an agent
/// request (project files are portable/shareable, so their contents are not
/// trusted input).
///
/// Returns `false` (not an error) if either path doesn't exist yet or can't
/// be canonicalized — callers should treat "can't prove it's safe" the same
/// as "unsafe".
pub fn is_path_within_project(base: &Path, candidate: &Path) -> bool {
    let (Ok(base), Ok(candidate)) = (base.canonicalize(), candidate.canonicalize()) else {
        return false;
    };
    candidate.starts_with(base)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn accepts_a_real_nested_path() {
        let project = tempfile::tempdir().unwrap();
        let nested = project.path().join("assets").join("image.png");
        fs::create_dir_all(nested.parent().unwrap()).unwrap();
        fs::write(&nested, b"fake image bytes").unwrap();

        assert!(is_path_within_project(project.path(), &nested));
    }

    #[test]
    fn rejects_traversal_outside_the_project() {
        let project = tempfile::tempdir().unwrap();
        let outsider = tempfile::tempdir().unwrap();
        let escape_target = outsider.path().join("secret.txt");
        fs::write(&escape_target, b"not part of the project").unwrap();

        // A `..`-laden path that lexically starts under `project` but
        // resolves outside it once canonicalized.
        let traversal_attempt = project
            .path()
            .join("assets")
            .join("..")
            .join("..")
            .join(outsider.path().file_name().unwrap())
            .join("secret.txt");

        assert!(!is_path_within_project(project.path(), &traversal_attempt));
        assert!(!is_path_within_project(project.path(), &escape_target));
    }

    #[test]
    fn rejects_nonexistent_paths_rather_than_assuming_safety() {
        let project = tempfile::tempdir().unwrap();
        let missing = project.path().join("does-not-exist.png");
        assert!(!is_path_within_project(project.path(), &missing));
    }
}
