---
status: accepted
date: 2026-10-12
tags: [ocr, accuracy, input, security]
---

# 31. Classify the screen from the bag header, and check it before auto mode arms

## Context

Until now, every settled frame was read as an echo, whatever the game showed. On another screen (another Bag tab, a character, a menu), watch mode spent a full OCR pass and added a junk "unknown echo" to the list for the user to remove. Nothing told them they were on the wrong screen.

Auto mode was partly covered: the navigator stops with `grid-not-found` when it can't see the echo grid. But it finds out only after auto mode is armed and the game is focused, and a menu or popup over the bag can leave the grid visible, so a click could land in the menu.

`architecture.md` has always shown a `classifyScreen` step between the stability check and the extractor. v0.1 needs two answers: `bag.echoes` or `unknown`.

## Decision

- **The bag header decides the screen.** The header reads "Echoes  2969/3000" at the top left of Bag → Echoes. A new region, `HEADER_ROW` (`src/session/echoRegions.ts`), is part of every echo read, so the screen is classified from the same pinned frame the extractor reads, with no second request. `classifyScreen` (`src/session/classifyScreen.ts`) is `bag.echoes` when a word in it is within one edit of "echoes" (letters only, a "0" taken as "o"), otherwise `unknown`.
- **Text, not pixels.** A check on the header text is easy to test against fixtures and to explain in a report. The region is one small crop, read in parallel with the rest (14 of Rust's 16-region limit).
- **Watch mode drops `unknown` frames and counts them** (`SessionStats.wrongScreen`), and the Scan screen says "Can't see Bag → Echoes in the game". It doesn't drop frames whose panel doesn't read: an echo the bundled data doesn't know yet (a new patch) is still on this screen, and the user can fix its name in review, as before.
- **Auto mode checks before arming** (`checkScreenForAuto`, run by `createAutoScan` before `arm`). It needs the Echoes header **and** a panel that reads as an echo (scanner-core's `readsAsPanel`: a known name, or a secondary stat that gives a cost). If either fails, the scan doesn't start, nothing is armed, and nothing is clicked. The navigator's `grid-not-found` stays as the second line of defence.
- **Diagnostics shows the classified screen**, and the echo-read check warns when it isn't `bag.echoes`.

## Consequences

- Pros:
  - No junk candidates from other screens, and the user is told why nothing is being read.
  - Auto mode can't start on the wrong screen or with a menu open, which is the safety gain.
  - Every fixture is checked: the replays (Tesseract and Vision) fail if a real Bag → Echoes capture classifies as `unknown`, or if a capture of another screen doesn't.
- Cons:
  - A game in another language reads as `unknown` everywhere. That's accepted: the name tables are English-only anyway, and a clear message beats misreads.
  - If a patch renames or moves the header, every frame is `unknown` and watch mode reads nothing. The notice on the Scan screen and the Diagnostics check make that visible straight away rather than silent.
  - Auto mode won't start when the selected echo is an unknown echo below +25 (neither the name nor the secondary stat identifies it). Selecting another echo works around it.
  - The negative side is covered by four captures (`fixtures/screens/unknown/`: Bag → Weapons, the Data Bank's Echo Gallery, a character's echo screen, an item popup over Bag → Echoes). The game blurs the bag behind a popup, so the header check catches it; no capture reaches the `no-echo` path, which is only unit-tested and stays as a backstop.

## Guidance

- Classify from the same `readRegions` result the extractor uses. Don't add a second read of the frame for it.
- Never let a wrong `unknown` pass silently: keep `wrongScreen` visible, and keep the fixture replays asserting `bag.echoes` on every echo capture.
- When the characters screen arrives (v0.2), add its anchor here as a new `ScreenKind`, with fixtures for both sides.

## Related

- [ADR 0006](0006-watch-and-auto-modes-and-fair-play-risk.md): what auto mode may do
- [ADR 0012](0012-echoes-first-release-strategy.md): the `classifyScreen` step in the pipeline
- [ADR 0021](0021-batched-region-reads-with-pinned-frames.md): pinned frames and the region limit
- `docs/screens/echoes.md`: the header measurements
