---
status: accepted
date: 2026-10-07
tags: [input, security, product, windows]
---

# 23. Auto mode on Windows needs Wavescan to run as administrator

## Context

Windows drops synthetic input from a normal app into an app that runs as administrator (UIPI), and `SendInput` still reports success ([ADR 0017](./0017-input-spike-and-auto-mode-commands.md)). Wuthering Waves usually runs as administrator. Wavescan can't check whether it does without opening the game's process, which we avoid ([ADR 0016](./0016-diagnostics-screen-and-capture-commands.md)).

[ADR 0006](./0006-watch-and-auto-modes-and-fair-play-risk.md) planned to offer an elevated restart *if the game is elevated*, and the roadmap asked for the click test to be verified both with and without elevation. On 2026-10-07 the click test passed on the live game (Boot Camp, 2880×1800) with Wavescan as administrator.

We looked at ways to click without administrator rights and rejected them for now:

- **`uiAccess` manifest:** lets an accessibility tool send input to elevated windows. Its only purpose here would be to get past UIPI and into a game protected by anti-cheat, which goes against the spirit of CLAUDE.md's rule against working around automation limits. It also needs a signed install under Program Files.
- **A separate elevated helper for input:** less code runs as administrator, but it still needs the UAC prompt, so it doesn't remove the requirement. It adds a second process and an IPC channel.
- **Telling people to run the game without administrator:** that's a question about the game and its anti-cheat, so it isn't ours to recommend.

## Decision

- **On Windows, auto mode (and the click test) needs Wavescan to run as administrator.** We say so plainly and don't call it "usually" or try to guess what the game does.
- Wavescan doesn't elevate itself. The user starts it with **Run as administrator**. When the auto mode UI is built, it shows this requirement before arming whenever Wavescan isn't elevated.
- Watch mode never needs administrator rights. On macOS nothing changes: auto mode needs the Accessibility permission, never administrator rights.
- Running *without* administrator isn't tested or supported for auto mode. It may work when the game itself isn't elevated, but we don't promise it.
- We revisit this if testers push back on running as administrator. The elevated input-only helper is the first option to look at.

## Consequences

- Pros:
  - One clear instruction instead of "it depends", and the silent-drop failure goes away for anyone who follows it.
  - No new mechanism for getting past UIPI, and nothing new to sign or install.
- Cons:
  - Users who want auto mode have to run the whole app elevated, which is more privilege than clicking needs. Watch mode stays the default, and it needs none.
  - Some users who could click without administrator rights are asked for them anyway.

## Guidance

- **Do** word every Windows auto-mode and click-test message as "needs administrator", not "usually".
- **Don't** add `uiAccess`, self-elevation or any other way to get past UIPI without a new ADR.
- **Don't** ask for administrator rights for anything but auto mode and the click test.

## Related

- Partly supersedes [ADR 0006](./0006-watch-and-auto-modes-and-fair-play-risk.md) (the Windows elevation bullet) and [ADR 0017](./0017-input-spike-and-auto-mode-commands.md) ("the advice is a best guess")
- `src/diagnostics/report.ts`, `src/diagnostics/inputTest.ts`, `src-tauri/src/platform/windows/process.rs`, README "Auto mode"
