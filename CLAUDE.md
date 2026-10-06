# CLAUDE.md — Wavescan

Desktop app (Tauri 2: Rust core + Vue 3/TS UI) that reads the *Wuthering Waves* game window and exports a `WutheringToolsScan` JSON file for [Wuthering Tools](../wuthering-waves-optimizer) (sibling repo `wuthering-waves-optimizer`). Windows + macOS. v0.1 scans **echoes only**. Characters and weapons come later ([ADR 0012](docs/adr/0012-echoes-first-release-strategy.md)).

## Priorities (non-negotiable order)

1. **User safety & trust.** Never put the user's account, machine or data at risk. Transparency beats convenience.
2. **Accuracy.** A wrong substat silently imported is worse than a slow scan. Low-confidence fields get flagged, never guessed.
3. **Speed.** Frame-change-driven waits, async OCR. No fixed sleeps.
4. **Maintainability.** The maintainer is a TypeScript developer who doesn't write Rust, so code (especially Rust) must be readable, documented and tested.

Mental model: [docs/architecture.md](docs/architecture.md). Decisions: [docs/adr/](docs/adr/). New to Rust: [docs/rust-primer.md](docs/rust-primer.md).

## Commands

```bash
npm run check              # Docker: every CI check in a Linux container (docs/development.md)
npm ci                     # install JS deps
npm run tauri dev          # run the app (Vite + Rust, hot reload)
npm run test               # Vitest (TS: session, extractors, auto navigator)
npm run lint               # eslint + vue-tsc -b
npm run tauri build        # release bundle for the current OS

cd src-tauri
cargo fmt --check          # formatting
cargo clippy --all-targets -- -D warnings   # lints (pedantic on, see Cargo.toml [lints])
cargo nextest run          # Rust tests (or: cargo test)
cargo deny check           # licences, advisories, banned crates
```

CI runs all of the above on `windows-latest` and `macos-14`. Nothing merges red.

## Layout (where to look)

| Path | Role |
|---|---|
| `src-tauri/src/platform/{windows,macos}/` | **Only** place with OS APIs: `window.rs`, `capture.rs`, `ocr.rs`, `input.rs` (+ `macos/app.rs`) |
| `src-tauri/src/platform/helpers.rs` | OS-independent helpers for the adapters (unit-tested everywhere) |
| `scripts/macos-probe/` | Type-checks all macOS adapters from Linux (ADR 0018); keep its deps in sync |
| `src-tauri/src/traits.rs` | `WindowFinder`, `FrameSource`, `OcrEngine`, `InputDriver`: the seams everything is tested through |
| `src-tauri/src/commands.rs` | Tauri IPC commands (thin: validate → call trait → map error) |
| `src-tauri/src/safety.rs` | `AutoMode` input guard (arming, bounds, abort detection, action cap), User ID mask + crop guard |
| `src-tauri/src/frame.rs`, `geometry.rs` | Captured images (crop/fill) and pixel ↔ fraction geometry |
| `src-tauri/src/testing.rs` | Fakes for the four traits (test-only) |
| `src-tauri/capabilities/` | Tauri permission allow-list (keep minimal) |
| `src/diagnostics/` | Diagnostics checks + report builder (no images; ADR 0016) |
| `src/ipc/` | Typed wrappers for every Rust command + mirrored types |
| `src/session/` | `ScanSession`, `classifyScreen`, per-screen `extractors/` (TS "brain") *(planned)* |
| `src/auto/` | Auto-mode navigator state machine, grid walking |
| `src/views/` | Vue UI |
| `schema/scan.v1.json` | Output contract with the web app ([ADR 0008](docs/adr/0008-scan-json-schema-v1.md)) |
| `fixtures/` | Real captures + golden JSON ([docs/fixtures.md](docs/fixtures.md)) |
| `docs/screens/` | Measured layout notes per game screen |

Parsing, fuzzy matching and ROI layouts come from **`@wutheringtools/scanner-core`** (npm, pinned exact), whose source lives in WT's `packages/scanner-core/` ([ADR 0019](docs/adr/0019-consume-scanner-core-with-injected-data.md)). Wavescan supplies the game data with `setScannerGameData()`. Don't fork that logic here; fix it in WT, release, then bump the version.

## Hard rules

### Security (hard constraints: never relax without a new ADR)
- **Never** read or write game process memory, inject DLLs or hooks into the game, read or modify game install files, or capture network traffic.
- **Capture the game window only.** Never the full desktop or other windows.
- **No telemetry, analytics or crash reporting services.** No new outbound host without an ADR **and** an update to the README "internet connections" table and `docs/architecture.md#network`.
- **Never OCR, log or persist the User ID region** (bottom-right). OCR crops go through `safety::crop_outside_user_id`, and debug frames and bug-report exports pass through `safety::mask_user_id` ([ADR 0013](docs/adr/0013-user-id-masking.md)).
- Frames live in memory only. Writing frames to disk happens only behind the user-enabled "Save debug frames" setting.
- Tauri capabilities stay least-privilege. No `shell:allow-execute`, no broad `fs` scopes, a strict CSP and no remote scripts. Adding a permission needs an ADR.
- Dependencies: a new crate or npm runtime package needs a one-line justification in the PR, and must pass `cargo deny` / `npm audit`. A crate that touches the OS or network needs an ADR.

### Synthetic input (auto mode)
- Input APIs (`SendInput`, `CGEventPost`) appear **only** in `platform/*/input.rs`, behind the `InputDriver` trait.
- Every input call goes through `safety::AutoMode` (`click` / `scroll` / `press`), which checks that auto mode is armed, the game window is focused, the point is inside the client rect, and the click cap isn't exceeded.
- Abort on physical user input, focus loss or hotkey. These paths **must** have tests.
- Don't add randomised timing, "humanisation" or anything meant to hide automation from anti-cheat. Waits exist for correctness (frame settled), not stealth.

### Rust rules
- `cargo fmt` + `cargo clippy --all-targets -- -D warnings` with `clippy::pedantic` enabled in `Cargo.toml [lints]`. Allow a specific lint only locally, with `#[allow(clippy::x, reason = "...")]`.
- **No `unwrap()` / `expect()` / `panic!` / `todo!` outside `#[cfg(test)]`.** Return `Result<T, Error>`. Errors are `thiserror` enums per module that serialize to the UI as `{ kind, message }`.
- **`unsafe` only in `platform/`** FFI wrappers. Every block has a `// SAFETY:` comment explaining why it's sound, and it's wrapped in a safe function that has a test.
- Keep platform files thin. Logic (geometry, timing, state, parsing) lives in OS-independent modules that are unit-tested with fake trait implementations.
- **Every `pub` item has a `///` doc comment in plain English**: what it does, why it exists, and when it returns an error. Assume the reader knows TypeScript, not Rust.
- Prefer clear over clever: no macros of our own, minimal generics/lifetimes, no `async` unless the API forces it.
- Tests: `#[cfg(test)] mod tests` in each module, plus integration tests in `src-tauri/tests/` that run against saved frames in `fixtures/`. OS-specific tests use `#[cfg(target_os = ...)]` and run on that CI runner.
- `Cargo.lock` is committed. Use only well-maintained crates (`windows`, `objc2-*`, `windows-capture`, `thiserror`, `serde`, `image`).

### TypeScript rules
- Strict TS (`strict: true`, no `any` without a comment). Composition API / `<script setup>`. DaisyUI + Tailwind like the optimizer.
- Plain modules and factory functions, no classes for domain logic (same as the optimizer, see its ADR 0006).
- Every extractor and navigator change gets a Vitest test against fixtures. Golden JSON updates are reviewed by eye, never blindly re-recorded.
- Rust ↔ TS IPC types are defined once (Rust `serde` structs, mirrored in `src/ipc/types.ts`). Change both together.

### Testing
- A bug fix ships with a fixture or test that reproduces it.
- Fixture accuracy gate: ≥ 99% of fields correct across `fixtures/` before a release.

### Docs (part of "done", not follow-up)
- Architecture change, new dependency, new permission, new network call, or schema change → **ADR + `docs/architecture.md` update in the same change.** Follow [docs/adr/README.md](docs/adr/README.md). Supersede ADRs, don't rewrite them.
- New or changed game-screen handling → update `docs/screens/<screen>.md` with measurements.
- Anything user-visible → update `README.md` (plain language, no jargon).

## When changing X, also check Y

| Change | Also check |
|---|---|
| `schema/scan.v1.json` | Bump version per ADR 0008. Update the web app's import mapper in the optimizer repo. Update the golden JSON |
| ROI / layout | `docs/screens/*.md`, fixtures at **every** resolution, the User ID mask region |
| Input / navigator | Abort tests, click clamp tests, the README auto-mode section |
| Network / updater | README connections table, `docs/architecture.md#network`, CSP, capabilities |
| Tauri capabilities | ADR + the README "What it does" list |
| Game data (new echoes/characters) | Fix it in `scanner-core` / the assets repo, not here |

## Git workflow
- Never commit to `main`. Use a branch → PR → squash merge. Branch, commit and PR naming are in [docs/conventions.md](docs/conventions.md).
- One concern per PR (Phase 0 uses milestone PRs, see conventions), including its tests and docs. CI must be green on Windows and macOS.

## Reference
- Plan of record: [docs/roadmap.md](docs/roadmap.md)
- Prior art: [Inventory Kamera](https://github.com/Andrewthe13th/Inventory_Kamera) (Genshin, C#), and the optimizer's browser scanner (`../wuthering-waves-optimizer/docs/scanner.md`, its ADR 0032)
