---
status: accepted
date: 2026-10-05
tags: [input, security, product]
---

# 6. Watch mode by default, auto mode opt-in, and the Fair Play risk

## Context

Users want a fully hands-off scan. Inventory Kamera (Genshin) clicks through the game with `SendInput` and requires admin, and HoYoverse has publicly said read-only tools like it are tolerated.

**Kuro Games has made no such statement.** Its [Fair Play Policy](https://wutheringwaves.kurogames.com/en/main/news/detail/742) prohibits third-party tools and "macro commands", with penalties up to a permanent ban, and the game ships anti-cheat. Comparable WuWa projects split on this: ok-wuthering-waves warns of bans, and wuwa-ocr deliberately ships a passive "watch" mode first.

- Reading pixels from a window is indistinguishable from screen recording or streaming, which is near-zero risk.
- Synthetic input is the part that could be classed as a macro.

The product requirement is both modes on day one.

## Decision

Ship **two modes on one pipeline**:

- **Watch mode (default):** no input is ever sent. The user clicks, and the scanner reads every stable, novel frame. It needs no admin and no Accessibility permission.
- **Auto mode (opt-in):**
  - It's enabled in Settings after a plain-language warning that names the Fair Play risk, with a typed `I understand` confirmation. It's re-armed every session.
  - Every input goes through the auto-mode guard (`safety::AutoMode`): armed, game focused, target inside the client rect, and a per-session action cap.
  - It aborts instantly on physical mouse movement (cursor drift between our clicks), the F8 hotkey, or the game losing focus. Everything read so far is kept.
  - Waits are driven by frame changes (wait until the stats fingerprint is stable for 2 frames), never fixed sleeps.
  - Windows: if the game is elevated, offer to restart the scanner elevated, for auto mode only. macOS: request Accessibility only when the user first arms auto mode.
    **Superseded 2026-10-07 (Windows part):** see ADR 0023. Auto mode always needs Wavescan to run as administrator, and the user starts it that way.
- **Never:** memory reading, DLL injection, game file access, packet inspection.

## Consequences

- Pros:
  - Users choose their own risk level with accurate information.
  - Watch mode alone already beats the browser scanner (native capture + OCR, no screen-share dialog).
  - The same extractors serve both modes.
- Cons:
  - Auto mode carries residual account risk that we can't remove.
  - If Phase 0 finds that anti-cheat blocks synthetic input, auto mode needs rethinking. That's an explicit Phase 0 exit criterion.

## Guidance

- **Do** keep the warning text in the app and the README in sync.
- **Do** test every abort path ([ADR 0015](./0015-rust-code-standards.md)).
- **Don't** add randomised delays, "humanised" mouse paths, or anything intended to evade anti-cheat detection. If Kuro objects, we comply; we don't hide.
- **Don't** let auto mode start without the typed confirmation, or persist "armed" across restarts.
- **If Kuro publishes guidance**, revisit this ADR immediately, either to drop auto mode or to relax the warning.

## Related

- [architecture.md](../architecture.md) §3, §7 · README "Auto mode"
