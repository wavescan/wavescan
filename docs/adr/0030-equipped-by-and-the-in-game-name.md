---
status: accepted
date: 2026-10-10
tags: [schema, interop, privacy, ocr]
---

# 30. "Equipped by": the "Rover" key and the player's in-game name

## Context

The echo panel ends with "Equipped by <name>" when a character has the echo equipped. The scan file has had an `equippedBy` field since v1 ([ADR 0008](0008-scan-json-schema-v1.md)): a character key or `null`. Until now Wavescan always exported `null`.

Two things make the main character different from everyone else:

- **The panel shows the name the player chose, not "Rover"** ("Equipped by Clover"). Nothing on the panel says it's the main character, and the name could be anything, including another character's name.
- **Wuthering Tools has 8 Rover entries** (Aero, Electro, Havoc and Spectro, female and male). The panel gives no element (only a portrait too small to use) and no gender. But Rover only has one build at a time, so the importing app doesn't need either: it knows which Rover entries the user has.

Which echo is in a character's first ("main") slot matters for some buffs, but it isn't on this screen. It's on the character's echo screen, which Wavescan doesn't scan yet.

## Decision

- **Matching lives in scanner-core** (`matchEquippedBy`, 0.2.0, [ADR 0019](0019-consume-scanner-core-with-injected-data.md)). It finds the line, tolerates OCR slips ("quipped by", "Equippedby", "QGingxiao"), matches the name against every character and the player's name, and returns `none`, `character`, `player` or `unknown`. Rover's entries are never matched by name. A near tie (a player named after a character) is `unknown`.
- **`equippedBy: "Rover"` means "the player's main character".** It isn't a registry key; the importing app maps it to its own Rover entry. Character keys and `null` mean what they did. The schema stays v1: `"Rover"` already fits the key pattern, and readers that don't know it can treat it as an unknown key. Only the field's description changes.
- **An unclear name is flagged, not guessed:** `equippedBy: null` plus `"equippedBy"` in `lowConfidence`, and the review screen asks who it is (any character, "You (main character)" or "Not equipped").
- **The player gives their in-game name** in a "Your in-game name" field on the Scan screen (and in the fixer when it would help). Without it, echoes on the main character are flagged.
  - It's stored in the webview's `localStorage` (`wavescan.playerName`) on this PC only. It is never exported: the file says `"Rover"`.
  - Each echo keeps the line's raw OCR text (in the saved scan too, [ADR 0028](0028-browser-links-mini-window-and-saved-scan.md)), and who it is gets worked out again whenever it's needed. So entering or correcting the name later fixes echoes already read.
  - **Diagnostics reports and bug reports hide it** (`redactPlayerName` in `src/session/equippedBy.ts`): every copy of the name, and any name after "Equipped by" that isn't a character's (an OCR slip of the name, or a name that was never entered), becomes `<player name>` / `<name not recognised>`. Characters' names stay so their misreads can be reported.
- **The main slot isn't Wavescan's job.** The scan says who has each echo; the importing app decides which one is the main echo (for Wuthering Tools: keep the user's current main if it's still equipped, otherwise the only cost 4 echo with a prompt to confirm, otherwise ask). A future character-screen scan can add the slot as an optional field.
- **Where the line is read:** a fixed box under the Echo Skill text (`EQUIPPED_BY_ROW` in `src/session/echoRegions.ts`). Measured on every fixture: the line doesn't move with the number of substats or the length of the skill text. See `docs/screens/echoes.md`.

## Consequences

- Pros:
  - Imports can restore who has what equipped, including the main character, without Wavescan guessing an element or gender.
  - The player's name never leaves the PC in a scan file or a report.
  - One extra crop per echo (about 12 instead of 11), read in parallel with the rest.
- Cons:
  - Users must type their in-game name once, or review every echo on their main character.
  - Two copies of an identical echo equipped by different characters still dedupe to one: the dedupe signature doesn't include who it's equipped by, because the line's OCR text can differ slightly between reads of the same echo.
  - The fixtures only have one main-character echo so far.

## Guidance

- Never put `raw.equippedBy` (or anything holding OCR text from the panel) in a report or log without `redactPlayerName` / `redactDeep`.
- Don't export a Rover element or gender: the importing app decides.
- When a new character can't be matched, refresh the game data (`npm run data:update`), don't add aliases here: name matching belongs in scanner-core.

## Related

- [ADR 0008](0008-scan-json-schema-v1.md): the schema the field belongs to
- [ADR 0013](0013-user-id-masking.md): the other piece of account information Wavescan keeps out of reports
- [ADR 0019](0019-consume-scanner-core-with-injected-data.md): matching lives in scanner-core
- [ADR 0028](0028-browser-links-mini-window-and-saved-scan.md): the saved scan and bug reports
