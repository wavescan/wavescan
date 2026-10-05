---
status: accepted
date: 2026-10-05
tags: [capture, ocr, privacy, testing]
---

# 16. Diagnostics screen, capture/OCR commands, and window matching without touching the game

## Context

Phase 0 has to prove that capture and OCR work on real machines (see the [roadmap](../roadmap.md)). We have one Windows test machine (Boot Camp) and no Apple Silicon Mac, so Mac testing relies on Discord volunteers. Testers need a self-serve way to check their setup and send back useful results, and that path must not leak anything private.

This milestone also adds the first commands that expose capture and OCR to the UI, which CLAUDE.md treats as new permissions.

## Decision

- **New commands**, each listed in `build.rs` and granted in `capabilities/default.json`:
  - `find_game_window`, `window_candidates`
  - `start_capture`, `stop_capture`, `capture_status`, `capture_preview`
  - `ocr_region`

  No input commands; those come with the input spike.
- **Window matching uses only the window class and title** (`UnrealWindow` + `Wuthering Waves`). We never open the game process (no `OpenProcess`, no reading its executable path), to stay as far from the game as possible ([ADR 0006](./0006-watch-and-auto-modes-and-fair-play-risk.md)).
- **`window_candidates`** lists only visible windows whose title contains "Wuthering". It helps debug "game not found" without collecting the names of other apps' windows.
- **`capture_preview`** returns a downscaled RGBA image with the User ID already blacked out in Rust ([ADR 0013](./0013-user-id-masking.md)). The raw full-resolution frame never reaches the webview.
- **`ocr_region`** crops through `safety::crop_outside_user_id`, so the User ID can't be OCR'd even by a buggy region.
- **The Diagnostics report** (copied as JSON by the tester) contains:
  - app version and user agent
  - window size, scale and focus
  - matching window titles and classes
  - capture frame rate and frame size
  - OCR text and timing for two echo-panel regions

  It contains **no images**. A unit test asserts no image data appears in the report.
- **Windows capture** uses `buffer_without_title_bar` so windowed-mode frames match the client area. The Diagnostics "captured area matches the game" check flags any mismatch, which tells us whether more cropping is needed.

## Consequences

- Pros:
  - Testers can verify a setup in about a minute.
  - Reports are safe to paste publicly.
  - The capture/OCR path the scanner will use is exercised on real machines early.
- Cons:
  - Matching on the window class means a game update that changes it would break detection. The candidates list makes that quick to diagnose.
  - The preview downscales on the CPU (fine for occasional diagnostics, not for live video).

## Guidance

- **Do** keep the report free of images and of any non-Wuthering window titles.
- **Don't** add process inspection to window matching without superseding this ADR.

## Related

- `src-tauri/src/commands.rs`, `src-tauri/src/platform/windows/`, `src/views/DiagnosticsView.vue`, `src/diagnostics/report.ts`
