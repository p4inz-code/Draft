# Development

For setup and the day-to-day contribution workflow, see [CONTRIBUTING.md](../CONTRIBUTING.md)
— this doc only covers repo-specific conventions that don't belong in a contributor-facing
file.

## Adding a new Rust crate

1. Create `crates/<name>/{Cargo.toml,src/lib.rs}`.
2. Add it to the root `Cargo.toml`'s `[workspace] members` list and, if other crates need to
   depend on it, to `[workspace.dependencies]` (path dependency), so every crate references
   the same version consistently.
3. Give it real content from the start — the product spec explicitly forbids
   placeholder-only crates that exist just to make the tree look complete (see
   `crates/draft-security`/`draft-platform` for what "minimal but real" looks like).
4. Add at least one test that exercises real behavior, not just "it compiles."

## Adding a new TS package

1. Create `packages/<name>/{package.json,tsconfig.json,src/index.ts}`, naming it
   `@draft/<name>`.
2. `tsconfig.json` should extend `/tsconfig.base.json`.
3. If it's consumed by `apps/desktop` or `apps/web`, add it as a `"workspace:*"` dependency
   there and run `pnpm install` to link it.

## Why operations cross the IPC boundary as JSON, not something else

Tauri's `invoke` already serializes through JSON; `serde`'s `#[serde(tag = "type", rename_all
= "snake_case")]` on `draft_events::Operation` produces exactly the discriminated-union shape
`@draft/shared`'s hand-written TS `Operation` type expects. There's no schema-generation step
today — if you add or change a Rust operation variant, update `packages/shared/src/operations.ts`
to match in the same change. Revisit codegen (e.g. via `ts-rs` or `specta`) if this drifts
enough to cause real bugs.

## Where a design decision belongs

- A one-off implementation choice: a code comment, if the *why* isn't obvious from reading
  it.
- A decision that's significant, hard to reverse, or cross-cutting: an ADR
  ([docs/decisions/](decisions/)).
- Anything else about how a system works: the relevant `docs/*.md` file, linked from
  [/ARCHITECTURE.md](../ARCHITECTURE.md) if it's not already.
