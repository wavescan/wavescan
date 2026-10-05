# Screen: Bag → Echoes (`bag.echoes`)

Measured notes for the echo inventory screen. Fixtures live in `fixtures/screens/echoes/`. Keep this file current whenever the extractor or ROIs change.

## Captures examined (2026-10-05)

| Source | Size | Aspect | Notes |
|---|---|---|---|
| 12 PNGs (Windows via Boot Camp, Xbox Game Bar captures, fullscreen) | 2880×1800 | 16:10 | Top / mid-scroll / low-level end of list, plus one Graphics settings screen |
| 1 JPG (another account, Android tablet naming) | 2800×1752 | 16:10 | Different account, so the layout holds across accounts |
| Video A (`2880x1800/…22-18-18.mp4`, Game Bar) | 2304×1440 @ 60 fps, 49 s | 16:10 | Manual click-through |
| Video B (`…09-15-58 - Copy.mp4`) | 2304×1440 @ 120 fps, 69 s | 16:10 | Manual click-through + scroll |

**Still needed:** 16:9 captures (1920×1080, 2560×1440, 3840×2160) and any **macOS (Apple Silicon)** capture.

## Layout

- **Left rail:** bag category icons.
- **Header:** `Echoes  2969/3000`. This gives the **total count**, so auto mode knows when it's done and can show progress.
- **Grid:** **6 columns**, about 4.5 rows visible. Each cell shows:
  - an equipped-character avatar (top-left)
  - a lock icon
  - cost (`4`/`3`/`1`, right)
  - the set icon (bottom-left)
  - `+level` (bottom-right)
- **Footer:** filter, `Sort by Level`, sort-direction toggle, `Batch Manage`, `Upgrade`.
- **Detail panel (right),** top to bottom:
  1. **Name.** The font shrinks for long names, e.g. "Reminiscence: Threnodian - Voidborne Construct" and "Reminiscence - Nightmare: Adam Smasher".
  2. `+level` followed by the **set icon**. There is **no set-name text**, so the set comes from icon template matching (`matchSetFirst`).
  3. `COST n`.
  4. Lock / discard tag icons.
  5. **Main stat row** (highlighted background).
  6. **Secondary row** (highlighted): ATK 150 (cost 4) / ATK 100 (cost 3) / HP 2280 (cost 1) at +25, and **lower below +25** (e.g. ATK 68, ATK 102).
  7. **Substats.** Only the revealed ones are shown, and a long label can wrap to two lines ("Resonance Skill DMG / Bonus").
  8. `Echo Skill` + description (truncated).
  9. `Equipped by <Name>`. **Plain text**, and its **y-position varies** with substat count and description length.
- **User ID:** bottom-right, about x ≥ 88%, y ≥ 98% of the frame. **Never read; always masked** ([ADR 0013](../adr/0013-user-id-masking.md)).

These match the optimizer's 16:10 `layout.ts` ROIs (measured from the same account's captures), so they carry over unchanged.

## Extraction notes

| Field | Method | Gotchas |
|---|---|---|
| name | OCR → `matchEchoName` (Levenshtein, threshold 0.68) | Collab/"Reminiscence" names must be in the name list. Narrow by set + cost first |
| level | OCR of `+NN`, digits whitelist | Values 0–25 |
| set | Set-icon template match | No text fallback exists. Low match score → `lowConfidence: ["echoSet"]` |
| cost | OCR `COST n`, cross-checked with `inferCostFromSecondaryStat` | The secondary value is level-dependent, so only use the inference at +25 |
| main stat | OCR label → `normalizeStatLabel` | The value is level-dependent. Store the key, and let the app compute the value from cost/rank/level |
| substats | Label column + value column paired by line y (`parseSubstatColumns`) | 0–5 rows, wrapped labels, snap to `subStatsTable` |
| equippedBy | Search the lower panel for the `Equipped by` anchor, then OCR the rest of that line → match against `allCharactersList` + aliases | Variant names like "Yangyang: Xuanling" need an alias map. A missing line means `null` |
| rank (rarity) | Name-plate colour (the name text colour is gold for 5★) | Verify on 4★/3★/2★ fixtures, which are still needed |

## Timing (measured from Video A)

- Clicking a cell redraws the stats panel in **one frame**. The portrait art animates, but the stat text doesn't. So the loop is: click → wait for 2 identical stats fingerprints (~35 ms @ 60 fps) → queue the crops → next click.
- A row scroll settles in about **0.7 s**.
- Manual click cadence in the videos was **one echo every 2–3 s**, so watch mode is never capture-bound.
- **Auto target:** ≤150 ms per echo, i.e. about 7–8 min for 3,000 echoes, or 2–3 min for "+25 only" (stop early once the level-sorted list drops below the minimum).

## Overlays and edge cases

- **Tutorial toast** ("Echo Batch Management is now upgraded with Smart Discard function") covers the bottom grid row. Detect it via text anchor. In auto mode, skip that row until it disappears; never click the toast.
- **Hover outline:** the hovered cell gets a highlight similar to the selected cell. Identify the selection by panel change, not cell borders.
- **Cursor:** excluded from capture. In auto mode, park it between clicks so it doesn't occlude the panel.
- **Partially visible rows** at the top and bottom of the grid: only click fully visible cells, and scroll for the rest.
