---
status: accepted
date: 2026-10-07
tags: [input, security, dependencies]
---

# 24. F8 stop key via the global-shortcut plugin, and the `auto_scroll` command

## Context

[ADR 0006](./0006-watch-and-auto-modes-and-fair-play-risk.md) says auto mode stops instantly on physical mouse movement, focus loss, **or the F8 hotkey**. [ADR 0017](./0017-input-spike-and-auto-mode-commands.md) left F8 out of the input spike, because a key that works while the game is in front needs a global shortcut, which needs a new OS-touching dependency and its own ADR. The README already tells users to press F8.

The auto-mode navigator (`src/auto/navigator.ts`) also needs to scroll the echo grid. `safety::AutoMode::scroll` and both input drivers already support wheel scrolls, but no command exposes them (ADR 0017: "add scroll/key commands only when a feature needs them").

Options for the stop key:

- **Tauri's official global-shortcut plugin** (`tauri-plugin-global-shortcut`, built on `global-hotkey`, both maintained by the Tauri team, MIT/Apache-2.0). It uses `RegisterHotKey` on Windows and Carbon's `RegisterEventHotKey` on macOS. We checked the 0.8 source: neither path installs a keyboard hook, and the macOS event tap is used only for media keys.
- **Our own `RegisterHotKey` / Carbon FFI in `platform/`.** It needs the same OS calls plus a message-loop window and a Carbon binding (objc2 has none), and more `unsafe` for a non-Rust maintainer to review.
- **A low-level keyboard hook** (`SetWindowsHookEx(WH_KEYBOARD_LL)` / a `CGEventTap`). It sees every key the user presses, and on macOS needs Input Monitoring permission. That's far more access than one key needs.

## Decision

- **Add `tauri-plugin-global-shortcut` 2** and register its handler from Rust (`src-tauri/src/hotkey.rs`).
  - **F8 with no modifiers** is the stop key. Pressing it calls `AppState::stop_from_hotkey`, which runs `AutoMode::abort(AbortReason::Hotkey)`. Auto mode must then be re-armed, the same as after any other abort.
  - **F8 is claimed only while auto mode is armed.** `arm_auto_mode` claims it, and `disarm_auto_mode` gives it back. So does any action that leaves auto mode stopped (abort, cap, focus loss), and so does F8 itself. The rest of the time Wavescan holds no key, so F8 keeps working normally in the game and other apps.
  - **If another app already holds F8**, arming still succeeds, and `AutoModeStatus.stop_key_active` is false. The UI then says that moving the mouse is the way to stop. The mouse-movement and focus-loss aborts don't depend on the key.
  - **The webview gets no global-shortcut permission.** Nothing is added to `capabilities/default.json` for the plugin, so the UI can't register keys; only Rust can.
  - Claiming and releasing the key wait for the main thread. `arm_auto_mode` and `disarm_auto_mode` became **async commands** (worker threads) for that reason. The F8 handler and the click/scroll/focus commands release the key from a background task.
- **New command `auto_scroll(target, ticks)`**, listed in `build.rs` and granted as `allow-auto-scroll`. It goes through `AutoMode::scroll`, which runs the same checks as a click: armed, game focused, target inside the window, cursor not moved, action cap. On top of those, a scroll of **0 or more than `MAX_SCROLL_TICKS` (40) notches** either way is refused with `InvalidScroll` and stops auto mode, like an out-of-window click. The navigator sends at most 37 notches (back to the top) and 8 while reading.
- `hotkey.rs` lives outside `platform/` because it calls no OS API itself: the plugin does. Synthetic input stays in `platform/*/input.rs` only.

## Consequences

- Pros:
  - All three abort paths in ADR 0006 now exist (mouse movement, focus loss, F8), and each one has tests (`hotkey::tests`, `commands::tests::the_stop_key_*`, `safety::tests`).
  - No keyboard hook, no new macOS permission, and no `unsafe` code of our own.
  - The navigator can scroll, through the same guard as clicks.
- Cons:
  - New crates: `tauri-plugin-global-shortcut`, `global-hotkey` and `keyboard-types` on every OS, plus X11 crates that only build on Linux (the Docker check). They pass `cargo deny`.
  - While auto mode is armed, F8 doesn't reach the game or other apps. We don't know of a default WuWa binding on F8; a player who bound something to it gets it back as soon as auto mode stops.
  - It's unverified whether `RegisterHotKey` fires while WuWa is focused in exclusive fullscreen. It's expected to (the OS handles it before the game sees the key), but that needs a check on real machines once the auto mode screen exists (add it to `docs/testing-guide.md` then). Moving the mouse works either way.

## Guidance

- **Do** keep F8 claimed only while armed. Don't register it at startup.
- **Don't** grant `global-shortcut:*` permissions to the webview, and don't add more global keys without a new ADR.
- **Don't** raise `MAX_SCROLL_TICKS` to make scrolling faster. The navigator scrolls in small steps on purpose, to keep track of the grid (`docs/screens/echoes.md` "Auto mode navigator").

## Related

- `src-tauri/src/hotkey.rs`, `src-tauri/src/commands.rs` (`auto_scroll`, `stop_from_hotkey`), `src-tauri/src/safety.rs` (`MAX_SCROLL_TICKS`), `src/ipc/commands.ts` (`autoScroll`)
- [ADR 0006](./0006-watch-and-auto-modes-and-fair-play-risk.md), [ADR 0017](./0017-input-spike-and-auto-mode-commands.md), [ADR 0023](./0023-auto-mode-requires-administrator-on-windows.md)
