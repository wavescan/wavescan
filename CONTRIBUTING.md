# Contributing

Thanks for helping! Please read [CLAUDE.md](CLAUDE.md) first. Its rules apply to humans too, especially the **security** and **Rust** sections.

## Setup

Full instructions are in [docs/development.md](docs/development.md). In short:

- **Checks only:** install Docker, then run `docker compose run --rm check` (or `npm run check`). No Rust install needed.
- **Running the app:** you need Windows or an Apple Silicon Mac with Node 24, Rust and the Tauri prerequisites. Then `npm ci && npm run tauri dev`.

To test against the real game you need Windows or an **Apple Silicon** Mac, since the Mac version of Wuthering Waves doesn't run on Intel Macs. Most tests run without the game, using `fixtures/`.

## Before opening a PR

```bash
npm run check        # Docker: runs everything CI runs (except the Windows/macOS-only code)
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
