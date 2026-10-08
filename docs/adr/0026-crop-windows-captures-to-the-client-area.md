---
status: accepted
date: 2026-10-08
tags: [capture, windows, accuracy]
---

# 26. Crop Windows captures to the game area ourselves

## Context

Windows.Graphics.Capture records the whole visible window: in windowed mode that includes the title bar and the borders. [ADR 0016](./0016-diagnostics-screen-and-capture-commands.md) relied on `windows-capture`'s `buffer_without_title_bar` to remove them.

That function works out the title bar's height as "window height − client height × DPI / 96". Wavescan is DPI-aware (Tauri), so the client height it reads is already in physical pixels, and the formula only works at 100% scaling. Above that, the result is negative, gets clamped to 0, and nothing is cropped. It never crops the side or bottom borders either.

2026-10-08 report: a windowed 1920×1080 game at 200% scaling came through as 1924×1140. Every read region was about 60 px too high, so watch mode read no echo name, level or main stat. The Diagnostics "captured area matches the game" check flagged it.

## Decision

- **Each Windows frame is cropped to the window's client area, worked out by Wavescan.** The capture covers the window's visible bounds (`DWMWA_EXTENDED_FRAME_BOUNDS`). The client area's offset is its screen position (`ClientToScreen`) minus those bounds, and its size comes from `GetClientRect`. Both are in physical pixels.
- The arithmetic is in `platform::helpers::client_area_in_frame` (OS-independent, unit-tested). The Win32 query is in `platform/windows/window.rs`, and it runs on every frame, so moving or resizing the window is picked up straight away.
- The crop is clipped to the frame, because the frame can trail a resize by a frame or two. If the window has no client area (it's closing), the whole frame is kept.
- Frames now match the click space: auto-mode clicks were always placed by the client rect.

## Consequences

- Pros:
  - Windowed mode works at any display scaling, and the borders are gone too.
  - The User ID mask and every read region line up with the game again in windowed mode (they're fractions of the game area).
- Cons:
  - Three cheap Win32 calls per frame, on the capture thread.
  - One more `windows` crate feature (`Win32_Graphics_Dwm`, same crate, no new dependency).

## Guidance

- **Don't** go back to `buffer_without_title_bar` unless a newer `windows-capture` fixes its scaling and crops the borders too.
- Keep the Diagnostics frame-size check: it's how a mismatch shows up in reports.

## Related

- [ADR 0005](./0005-window-capture-wgc-and-screencapturekit.md): window-only capture.
- [ADR 0016](./0016-diagnostics-screen-and-capture-commands.md): partly superseded (its title-bar bullet).
- [ADR 0013](./0013-user-id-masking.md): the mask assumes frames are the game area.
