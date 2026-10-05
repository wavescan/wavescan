---
status: accepted
date: 2026-10-05
tags: [capture, ocr, input, macos, testing]
---

# 18. macOS adapters: ScreenCaptureKit, Vision, Core Graphics events, and a type-check probe

## Context

v0.1 ships on macOS (Apple Silicon) as well as Windows. The maintainer has no Apple Silicon Mac: the dev machine is an Intel Mac, which can't run Wuthering Waves, so real-game testing relies on Discord volunteers and the Diagnostics screen ([ADR 0016](./0016-diagnostics-screen-and-capture-commands.md)). We still want macOS compile errors caught before CI where possible.

## Decision

- **Window finding and capture use `screencapturekit` (v11).**
  - The crate wraps `ScreenCaptureKit` and builds a small Swift bridge, which needs Xcode / Command Line Tools on macOS. It's a macOS-only dependency, so Windows and Linux builds are unaffected.
  - Windows are matched by owning app name or title "Wuthering Waves" (normal window level; prefer on-screen, then largest), using its window-list snapshot.
  - Capture uses a single-window `SCContentFilter`, BGRA, cursor hidden, at full pixel resolution (points × `point_pixel_scale`).
  - Listing window titles needs **Screen Recording**, so a missing permission surfaces at "find window" with step-by-step instructions.
- **Text uses Apple Vision** (`VNRecognizeTextRequest`): accurate level, `en-US`, language correction off (game names and numbers aren't dictionary words). It runs inside an autorelease pool, because it executes on worker threads.
- **Input uses Core Graphics events** posted to the HID event tap. The keys are the closed `Key` list as macOS key codes.
  - **Accessibility** is checked before every action, because macOS silently drops events from untrusted apps. The first failure shows the macOS prompt and returns instructions.
  - Bringing the game forward uses `NSRunningApplication::activateWithOptions`. `GameWindow` gained an optional `process_id`, which macOS reports with the window list. It's used only for activation, never to open or inspect the process.
- **Coordinate space:**
  - On macOS, `GameWindow::client_rect` is the whole window in **points** (the input coordinate space). Captured frames cover the same window in pixels. Click targets are fractions, so the two always line up.
  - On Windows, `client_rect` remains the client area in physical pixels.
- **`scripts/macos-probe/`** is a tiny crate that compiles the real `macos/ocr.rs`, `macos/input.rs` and `macos/app.rs` (via `#[path]`) for `aarch64-apple-darwin` from Linux. It doesn't need Apple's SDK, because those files use pure-Rust `objc2` bindings. `npm run check` lints it with the same strict rules. The `ScreenCaptureKit` files are compiled only on CI's macOS runner.

## Consequences

- Pros:
  - Same feature set as Windows, built from well-maintained bindings.
  - Most macOS code is type-checked locally.
  - Permission problems come with clear instructions.
- Cons:
  - The Swift bridge adds a build-time requirement on macOS.
  - Windowed mode includes the title bar in both capture and click space. That's consistent for clicking, but layouts must tolerate it; the Diagnostics frame-size check reports it.
  - The probe's `objc2` features must be kept in sync with `src-tauri/Cargo.toml` by hand (both files say so).

## Guidance

- **Do** add new macOS code that doesn't need `ScreenCaptureKit` to the probe so it's checked locally.
- **Don't** read process details beyond the pid that the window list already reports.

## Related

- `src-tauri/src/platform/macos/`, `scripts/macos-probe/`, [ADR 0004](./0004-native-os-ocr-with-tesseract-fallback.md), [ADR 0005](./0005-window-capture-wgc-and-screencapturekit.md), [ADR 0017](./0017-input-spike-and-auto-mode-commands.md)
