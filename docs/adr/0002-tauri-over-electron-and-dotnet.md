---
status: accepted
date: 2026-10-05
tags: [platform, distribution]
---

# 2. Tauri 2 (Rust + webview) over Electron and .NET

## Context

The scanner must run on Windows and macOS (Apple Silicon, where the Mac version of Wuthering Waves runs) from v0.1. It also has to be small and quick to download, easy to trust, and fast at capture and OCR. The maintainer works in Vue/TypeScript, and the existing scanning logic (`../wuthering-waves-optimizer/src/scanner/`) is TypeScript.

Options considered:

- **Electron:** familiar, but ~150 MB installers and a full Chromium + Node runtime (a bigger attack surface). Native capture, OCR and input would still need native addons.
- **C# / .NET (like Inventory Kamera):** mature on Windows, but WinForms/WPF is Windows-only and a Mac port would be a rewrite.
- **Python + PyInstaller (like several WuWa tools):** quick to prototype, but large bundles, antivirus false positives are common, and it's slow without native extensions.
- **Tauri 2:** a Rust core plus the OS webview (WebView2 / WKWebView). Installers are around 10 MB. It has a capability-based permission model and built-in bundling, code signing and a signed updater.

## Decision

Use **Tauri 2**:

- The UI is Vue 3 + TypeScript + DaisyUI/Tailwind, matching the optimizer.
- OS integration is in Rust.
- Bundles: NSIS `.exe` + MSI on Windows, `.dmg` on macOS.

## Consequences

- Pros:
  - Small signed installers on both OSes.
  - The TS scanning code is reused directly.
  - Rust gives safe, fast access to Windows.Graphics.Capture, ScreenCaptureKit, native OCR and input APIs.
  - Tauri capabilities give a reviewable allow-list of what the UI can do.
- Cons:
  - Two languages. The maintainer doesn't know Rust, which is mitigated by [ADR 0015](./0015-rust-code-standards.md) and [rust-primer.md](../rust-primer.md).
  - Webview differences between Windows and macOS: we test both in CI.
  - WebView2 must be present on Windows. The NSIS installer bootstraps it.

## Guidance

- **Do** keep Rust confined to OS adapters ([ADR 0003](./0003-rust-adapters-ts-brain-split.md)).
- **Don't** add Node/Electron-style escape hatches: no shell plugin, no arbitrary fs access.

## Related

- [architecture.md](../architecture.md) §1, §10
