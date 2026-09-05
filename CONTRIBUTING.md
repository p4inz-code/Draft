# Contributing to DRAFT

Thanks for taking a look. DRAFT's source is available for review and contribution under the
terms in [LICENSE.md](LICENSE.md) — please read Section 4 (Contributions) before submitting
a pull request.

## Before you start

For anything beyond a small fix, read [ARCHITECTURE.md](ARCHITECTURE.md) and the relevant
docs in [docs/](docs/) first — DRAFT has one architectural rule that most design questions
come back to (the canvas is not the source of truth; the Project Graph is), and a change
that fights that will get pushback in review. If you're proposing a new significant
technical decision, check [docs/decisions/](docs/decisions/) to see if it's already been
made and why.

For anything larger than a small fix, open an issue to discuss the approach before writing
code.

## Development setup

Prerequisites: Rust (stable, via [rustup](https://rustup.rs)), Node 22.13+,
[pnpm](https://pnpm.io).

```bash
pnpm install
cargo build --workspace
```

## Workflow

1. Fork and branch from `main`.
2. Make your change. Keep it scoped — a bug fix doesn't need an accompanying refactor.
3. Add or update tests. See [docs/testing.md](docs/testing.md) for what's expected at each
   layer (Rust crate, TS package, integration).
4. Before opening a PR, run everything CI runs:

   ```bash
   cargo fmt --all
   cargo clippy --workspace --all-targets
   cargo test --workspace
   pnpm lint
   pnpm test
   pnpm build
   ```

5. Write a commit message that explains *why*, not just what changed.
6. Open a PR against `main`. Describe what changed and why; link any related issue.

## Code style

- Rust: `rustfmt` + `clippy` are enforced in CI — run them locally first.
- TypeScript: Biome is enforced in CI (`pnpm lint`).
- No new ADR is needed for routine implementation choices — see
  [docs/decisions/](docs/decisions/) for what counts as ADR-worthy (significant,
  hard-to-reverse, cross-cutting decisions only).

## Reporting bugs

Open a GitHub issue with steps to reproduce, what you expected, and what happened instead.
For security issues, see [SECURITY.md](SECURITY.md) instead of opening a public issue.
