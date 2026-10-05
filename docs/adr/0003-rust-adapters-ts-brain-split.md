---
status: accepted
date: 2026-10-05
tags: [architecture, ipc]
---

# 3. Rust = thin OS adapters, TypeScript = scanning brain

## Context

Scanning has two very different kinds of work:

1. **Talking to the OS:** find a window, grab frames, crop, OCR, send input. This needs native APIs, is performance-sensitive, and is different on each OS.
2. **Understanding the game:** which screen this is, where the stats are, what "Crit. DMG 15.0%" maps to, whether this echo was already seen. This logic already exists and is tested in TypeScript in the optimizer (`parse.ts`, `layout.ts`, `stability.ts`, `dedupe.ts`, set-icon matching), and changes every game patch.

The maintainer is fluent in TS, not Rust.

## Decision

- **Rust** implements four narrow traits: `WindowFinder`, `FrameSource`, `OcrEngine`, `InputDriver`. It also implements `crop` + fingerprint helpers and the `safety` gate. It has no knowledge of echoes, stats or screens.
- **TypeScript** owns screen classification, extraction, matching, navigation decisions, confidence, dedupe and export, mostly via the shared `scanner-core` package ([ADR 0007](./0007-shared-scanner-core-package.md)).
- **IPC carries small things only:** fingerprints, ROI fractions, cropped regions (as raw bytes via `tauri::ipc::Response`), and OCR text + boxes. Full frames never cross IPC.

## Consequences

- Pros:
  - Game-patch fixes happen in TS, where the maintainer works and where the web app shares them.
  - The Rust surface stays small, reviewable and easy to fake in tests.
  - Per-OS code is isolated.
- Cons:
  - An IPC round-trip per crop batch. This is mitigated by batching all of one screen's ROIs into one `crop_regions` call.
  - Types must be mirrored in Rust and TS (`src/ipc/types.ts`).

## Guidance

- **Do** add game knowledge in TS / `scanner-core`, never in Rust.
- **Do** batch crops per frame.
- **Don't** send full frames to the webview, except the opt-in debug preview, which is downscaled and masked.

## Related

- [architecture.md](../architecture.md) §1–§5
