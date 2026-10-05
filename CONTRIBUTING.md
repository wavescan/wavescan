# Contributing

Thanks for helping! Please read [CLAUDE.md](CLAUDE.md) first. Its rules apply to humans too, especially the **security** and **Rust** sections.

## Setup

| Tool | Install |
|---|---|
| Node 24 + npm | <https://nodejs.org> (or `nvm use`) |
| Rust (stable) | <https://rustup.rs> |
| Tauri prerequisites | <https://v2.tauri.app/start/prerequisites/> (Windows: MSVC Build Tools + WebView2; macOS: Xcode Command Line Tools) |
| Test/lint helpers | `cargo install cargo-nextest cargo-deny --locked` |

```bash
npm i
npm run tauri dev
```

To test against the real game you need Windows or an **Apple Silicon** Mac, since the Mac version of Wuthering Waves doesn't run on Intel Macs. Most tests run without the game, using `fixtures/`.

## Before opening a PR

```bash
npm run lint && npm run test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo nextest run && cargo deny check
```

- Branch from `main`, open a PR, and squash-merge. Naming rules are in [docs/conventions.md](docs/conventions.md).
- Keep PRs small and focused.
- Add or update tests. Bug fixes include a fixture or test that reproduces the bug.
- Update docs in the same PR: an ADR for lasting decisions ([docs/adr/README.md](docs/adr/README.md)), `docs/architecture.md` for structure, `docs/screens/*.md` for layout changes, and `README.md` for anything users see.
- Changes to `src-tauri/capabilities/`, `safety.rs`, `platform/*/input.rs`, network code or dependencies get extra review. Explain *why* in the PR description.

## Fixtures

See [docs/fixtures.md](docs/fixtures.md). **Mask the User ID** before committing any screenshot.

## Licence

By contributing you agree your contributions are licensed under GPL-3.0-or-later ([LICENSE](LICENSE)).
