---
status: accepted
date: 2026-10-15
tags: [input, security, product, windows]
---

# 32. No virtual game controller for auto mode (tried, and deliberately dropped)

## Context

On Windows, auto mode needs Wavescan to run as administrator ([ADR 0023](./0023-auto-mode-requires-administrator-on-windows.md)). Wuthering Waves usually runs as administrator, and Windows drops mouse input (`SendInput`) from a normal app into an elevated one (UIPI).

The idea: a game controller doesn't reach the game as window messages, so UIPI doesn't filter it. If Wavescan could press a virtual controller's D-pad, it could walk Bag → Echoes without administrator rights. We built a proof of concept on 2026-10-15 to find out (never merged; the code was thrown away):

- **Input:** `InputDriver::press_pad` limited to the four D-pad directions, using Windows' built-in `Windows.UI.Input.Preview.Injection.InputInjector` (`InitializeGamepadInjection`, `InjectGamepadInput`). It needed only two more feature flags on the `windows` crate: no new crate and no driver. Every press went through `AutoMode`, with the same checks as a click. The first press noted the cursor position, so moving the mouse still stopped auto mode.
- **Walk:** a snake (right along a row, down, left along the next, down…), so every press lands on an unread card and no grid geometry or scrolling is needed. The minimum-level stop finished a right-to-left row before stopping, because its remaining cards come earlier in the sorted list. The end of the list was a "down" that left the panel unchanged, double-checked by stepping sideways so an exact copy below couldn't end the scan early. All of this passed its tests against the pretend grid.

### What happened

The first D-pad press on the live game (Windows 10, Wavescan **not** elevated) failed before the game was involved:

> The virtual controller didn't work: Windows didn't create the controller (Access is denied. (0x80070005))

The same two calls from a plain PowerShell window, with no Wavescan and no game, gave the same result: `InputInjector.TryCreate()` succeeds, `InitializeGamepadInjection()` returns `E_ACCESSDENIED`. Windows only lets an app create a virtual controller if it has **package identity** (MSIX) and declares the restricted capability `inputInjectionBrokered`. Wavescan is an ordinary desktop app (NSIS/MSI installer), so Windows refuses.

### The other ways to get a virtual controller

- **Ship Wavescan as MSIX, or register a sparse identity package declaring `inputInjectionBrokered`.** This is a big distribution change: Tauri doesn't produce MSIX, and the package has to be signed. Even then, we'd still not know whether Wuthering Waves (which reads XInput) sees a controller made this way. Microsoft doesn't document that, and we couldn't test it without doing all of the packaging work first.
- **ViGEmBus** (the kernel driver behind DS4Windows, x360ce 4.x and others). It's known to work with games, but installing a kernel driver needs administrator rights and asks far more trust of the user than running Wavescan elevated. The project was also retired in 2023.
- **x360ce 3.x style: a stand-in `xinput1_3.dll` in the game's folder.** This needs no admin rights because the game loads it into its own process. That breaks two hard rules (never inject into the game, never modify game install files), and it's exactly what the game's anti-cheat looks for. It's out of the question. (x360ce also only maps a real controller to an Xbox one; it doesn't let a program press buttons on its own.)

## Decision

- **Wavescan doesn't use a virtual game controller, in any form.** ADR 0023 stands: on Windows, auto mode needs Wavescan to run as administrator.
- The proof-of-concept code was removed and not merged. This ADR is the record of it.
- If running as administrator becomes a real problem for testers, the next option is still the one ADR 0023 names: a small **elevated input-only helper**. Wavescan would stay a normal app, and only a tiny clicking program would run as administrator, behind a UAC prompt when an auto scan starts. It reduces what runs elevated, but doesn't remove the prompt.

## Consequences

- Pros:
  - No driver, no new packaging or signing path, nothing loaded into the game, and nothing new to explain to users.
  - The answer is on record, so the idea doesn't have to be tested again, and "use a controller instead" has a ready reply.
- Cons:
  - Windows users still have to run Wavescan as administrator for auto mode.

## Guidance

- **Don't** retry `InputInjector` gamepad injection from the unpackaged app: Windows denies it (`E_ACCESSDENIED`), whatever the game does.
- **Don't** install, bundle or recommend ViGEmBus or any other virtual-controller driver.
- **Don't** put DLLs (x360ce or anything else) in the game's folder, or recommend that users do.
- **Do** revisit only with new information, such as Microsoft allowing gamepad injection without package identity, or Wavescan moving to MSIX for other reasons. Even then, confirm the game sees the controller before building on it.
- What the walk would need (the snake order, the minimum-level rule for right-to-left rows, the exact-copy check at the end of the list) is described above in case it's ever needed again.

## Related

- [ADR 0006](./0006-watch-and-auto-modes-and-fair-play-risk.md), [ADR 0017](./0017-input-spike-and-auto-mode-commands.md), [ADR 0023](./0023-auto-mode-requires-administrator-on-windows.md)
- Microsoft: [`InputInjector.InjectGamepadInput`](https://learn.microsoft.com/en-us/uwp/api/windows.ui.input.preview.injection.inputinjector.injectgamepadinput) (requires the `inputInjectionBrokered` restricted capability)
