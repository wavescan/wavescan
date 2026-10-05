---
status: accepted
date: 2026-10-05
tags: [capture, security]
---

# 5. Window-only capture via Windows.Graphics.Capture and ScreenCaptureKit

## Context

Inventory Kamera captures with GDI `CopyFromScreen`. That needs the game in the foreground and uncovered, it grabs whatever is on screen at those pixels, and it struggles with HDR. Users must also trust that we capture *only* the game. Modern OS APIs can capture a single window directly:

- **Windows.Graphics.Capture (WGC):** works for occluded windows. The yellow border can be turned off on Windows 11. The cursor is excluded by default.
- **ScreenCaptureKit (SCK), macOS 12.3+:** an `SCContentFilter` scoped to one window. It requires the Screen Recording permission.

## Decision

- Windows: the `windows-capture` crate (WGC), with `cursor_capture: off` and the border off where supported.
- macOS: the `screencapturekit` crate, with a single-window `SCContentFilter`, `showsCursor = false` and BGRA output.
- `FrameSource` only accepts a window handle from `WindowFinder`. **There is no API for capturing the desktop or a display.**
- Frames go into a single-slot "latest frame" buffer and are never queued or written to disk ([ADR 0013](./0013-user-id-masking.md) covers debug frames).

## Consequences

- Pros:
  - Captures exactly one window, so the user's other apps are never seen.
  - Works while other windows overlap the game (useful in watch mode on one monitor).
  - Lower overhead than GDI.
- Cons:
  - WGC needs Windows 10 1903+. Exclusive fullscreen might not be capturable; the spike verifies this, and if so we tell users to use borderless.
  - SCK needs macOS 13+ in practice, and the permission prompt requires an app restart.
  - HDR still alters colours, so we tell users to turn HDR off.

## Guidance

- **Do** verify in Phase 0 that both APIs capture the live game (DX12 on Windows, Metal on macOS) at full resolution and ≥30 fps.
- **Don't** add a full-screen or display capture path, even "for debugging".

## Related

- [architecture.md](../architecture.md) §4, §7
