# Architecture Decision Records (ADRs)

Short records of **important** decisions, so humans and coding agents can apply them without re-arguing the debate. Same conventions as the optimizer repo (`../wuthering-waves-optimizer/docs/adr/README.md`).

For **current behaviour**, read [../architecture.md](../architecture.md) and `../screens/*.md`. ADRs capture *why*.

## How to use

1. Skim the index for anything your change touches.
2. Read the **Decision** and **Guidance** sections.
3. To reverse a decision, don't rewrite the ADR. Add a new one that supersedes it, set the old one's `status: superseded`, and fill in `supersedes` / `superseded_by` on both. If only part of an old ADR goes stale, add an inline `**Superseded YYYY-MM-DD:** see ADR NNNN` note under the stale bullet in the same PR.

## When to write one

Write one when a choice is **hard to reverse**, **cross-cutting**, **security-relevant**, or **keeps getting re-asked**. In this repo that always includes:

- a new dependency that touches the OS or network
- a new Tauri permission
- a new outbound host
- a schema change
- a change to what auto mode is allowed to do

Skip ADRs for local refactors and bug fixes.

## Format

Files: `NNNN-kebab-title.md` (monotonic numbers). YAML frontmatter (`status`, `date`, `tags`, optional `supersedes` / `superseded_by`) and these sections: **Context** · **Decision** · **Consequences** · **Guidance** · **Related**.

Statuses: `proposed` · `accepted` · `deprecated` · `superseded`.

## Index

| ADR | Title | Status | Superseded by | Tags |
|---|---|---|---|---|
| [0001](./0001-record-architecture-decisions.md) | Record architecture decisions as ADRs | accepted | | process |
| [0002](./0002-tauri-over-electron-and-dotnet.md) | Tauri 2 (Rust + webview) over Electron and .NET | accepted | | platform, distribution |
| [0003](./0003-rust-adapters-ts-brain-split.md) | Rust = thin OS adapters, TypeScript = scanning brain | accepted | | architecture, ipc |
| [0004](./0004-native-os-ocr-with-tesseract-fallback.md) | Native OS OCR, tesseract.js as fallback | accepted | | ocr, performance |
| [0005](./0005-window-capture-wgc-and-screencapturekit.md) | Window-only capture via Windows.Graphics.Capture and ScreenCaptureKit | accepted | 0018 (macOS crate choice) | capture, security |
| [0006](./0006-watch-and-auto-modes-and-fair-play-risk.md) | Watch mode by default, auto mode opt-in, and the Fair Play risk | accepted | 0023 (Windows elevation) | input, security, product |
| [0007](./0007-shared-scanner-core-package.md) | Share scanning logic with the web app via `@wuthering-tools/scanner-core` | accepted | 0019 (name, data injection) | architecture, reuse |
| [0008](./0008-scan-json-schema-v1.md) | `WutheringToolsScan` JSON schema v1 | accepted | | schema, interop |
| [0009](./0009-handoff-via-file-and-clipboard-no-server.md) | Hand off via file or clipboard, never a server | accepted | | interop, privacy |
| [0010](./0010-no-telemetry-network-allowlist.md) | No telemetry, explicit network allow-list | accepted | 0020 (game-data host) | privacy, network |
| [0011](./0011-signing-provenance-and-updater.md) | Signed builds, provenance attestations, signed updater | accepted | | distribution, supply-chain |
| [0012](./0012-echoes-first-release-strategy.md) | Ship echoes first, then characters and weapons | accepted | | product, roadmap |
| [0013](./0013-user-id-masking.md) | Never read the User ID, and mask it in any saved frame | accepted | | privacy |
| [0014](./0014-gpl-3-license.md) | License under GPL-3.0-or-later | accepted | | legal |
| [0015](./0015-rust-code-standards.md) | Rust code standards for a non-Rust maintainer | accepted | | rust, process, testing |
| [0016](./0016-diagnostics-screen-and-capture-commands.md) | Diagnostics screen, capture/OCR commands, and window matching without touching the game | accepted | | capture, ocr, privacy, testing |
| [0017](./0017-input-spike-and-auto-mode-commands.md) | Input spike: auto-mode commands, Windows `SendInput`, and verifying clicks by their effect | accepted | 0023 (elevation advice) | input, security, testing |
| [0018](./0018-macos-adapters.md) | macOS adapters: ScreenCaptureKit (via objc2), Vision, Core Graphics events, and a type-check probe | accepted | | capture, ocr, input, macos, testing |
| [0019](./0019-consume-scanner-core-with-injected-data.md) | Consume `@wutheringtools/scanner-core` from npm, with game data supplied by Wavescan | accepted | | architecture, reuse, data |
| [0020](./0020-game-data-snapshot-and-source.md) | Bundle a game-data snapshot; refresh it from wutheringtools.com | accepted | | data, network, privacy |
| [0021](./0021-batched-region-reads-with-pinned-frames.md) | Batched region reads with pinned frames | accepted | | capture, ocr, ipc |
| [0022](./0022-set-icon-matching-with-bundled-references.md) | Set-icon matching against bundled reference icons | accepted | | data, ocr, accuracy |
| [0023](./0023-auto-mode-requires-administrator-on-windows.md) | Auto mode on Windows needs Wavescan to run as administrator | accepted | | input, security, product, windows |
