---
status: accepted
date: 2026-10-05
tags: [input, security, testing]
---

# 17. Input spike: auto-mode commands, Windows `SendInput`, and verifying clicks by their effect

## Context

[ADR 0006](./0006-watch-and-auto-modes-and-fair-play-risk.md) makes auto mode opt-in and guarded. Phase 0 must answer the riskiest open question: **does synthetic input reach Wuthering Waves at all?** Anti-cheat or Windows privilege rules could block it.

Two Windows facts shape the design:

- **UIPI:** if the game runs as administrator and Wavescan doesn't, Windows drops our input *silently*. `SendInput` still reports success, so the API can't tell us.
- **Foreground rules:** only the app the user is currently using may bring another window to the front. Wavescan is that app at the moment the user clicks its button, which is why the test starts from a button press.

## Decision

- **New commands**, each listed in `build.rs` and granted in `capabilities/default.json`:
  - `auto_mode_status`
  - `arm_auto_mode` (needs the typed phrase)
  - `disarm_auto_mode`
  - `auto_focus_game`
  - `auto_click`

  Every action goes through `safety::AutoMode`.
- **`focus_game`** is a guarded action like the others. It needs auto mode armed and the window present and not minimised. Unlike the other actions it doesn't need the game focused (bringing it into focus is the point). It counts against the action cap.
- **The Windows driver (`platform/windows/input.rs`):**
  - It moves the cursor with `SetCursorPos`. Wavescan is per-monitor DPI aware, so coordinates are physical pixels.
  - It clicks and scrolls with `SendInput`.
  - It presses keys as **hardware scancodes** (`KEYEVENTF_SCANCODE`), because games usually read raw input.
  - Keys are limited to the closed `Key` list.
- **Clicks are verified by their effect, not the API result.** The Diagnostics **click test**:
  - It's opt-in, behind the Fair Play warning and the typed phrase.
  - It arms auto mode, focuses the game, reads the echo panel, clicks two grid cells, and reads the panel after each click. It passes if the panel text changed, then always disarms.
  - Clicking a grid cell only selects an echo, so the test can't change the user's inventory.
  - A "no change" result tells the user the likely fix: run Wavescan as administrator if the game is.
- **Not in this spike:**
  - The F8 stop hotkey. It needs a global-shortcut plugin, which gets its own ADR. Until then, moving the mouse and focus loss are the abort paths, and both are tested.
    **Done 2026-10-07:** see [ADR 0024](./0024-f8-stop-key-and-auto-scroll.md).
  - Scroll and key commands. The driver supports them, but no command exposes them until the scanner needs them.
    **Scroll added 2026-10-07** (`auto_scroll`, ADR 0024). Key commands still aren't exposed.

## Consequences

- Pros:
  - We learn on real machines whether auto mode is viable before building the navigator.
  - The test is harmless and verifies the effect.
  - The input surface exposed to the UI is minimal (focus + click).
- Cons:
  - The effect check depends on OCR and on being on Bag → Echoes with at least two different echoes visible.
  - Elevation can't be detected without opening the game process, which we avoid ([ADR 0016](./0016-diagnostics-screen-and-capture-commands.md)), so the advice is a best guess.
    **Superseded 2026-10-07:** see [ADR 0023](./0023-auto-mode-requires-administrator-on-windows.md). We no longer guess: auto mode on Windows needs administrator.

## Guidance

- **Do** keep new input commands narrow and routed through `AutoMode`. Add scroll/key commands only when a feature needs them.
- **Don't** treat a successful `SendInput` return as proof the game received input.
- **If the click test fails on real machines even when elevated**, revisit ADR 0006 before building the auto navigator.

## Related

- `src-tauri/src/safety.rs`, `src-tauri/src/platform/windows/input.rs`, `src/diagnostics/inputTest.ts`, `src/views/DiagnosticsView.vue`
