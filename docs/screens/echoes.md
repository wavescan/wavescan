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
- **Grid:** **6 columns**, about 4.5 rows visible. On the 16:10 reference, column centres are x ≈ 0.130, 0.222, … (pitch ≈ 0.092) and the first row's cells span y 0.115–0.265 (centre 0.19). The diagnostics click test clicks the first two cells, since that row is the only one guaranteed to exist on a small inventory. Each cell shows:
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
| level | OCR of `+NN` in **`LEVEL_ROW`** (`src/session/echoRegions.ts`: x 0.69, y 0.16, w 0.0355, h 0.035 on the 16:10 reference) | Measured text span x 0.696–0.721, y 0.168–0.187 on every fixture at 2880×1800 and 2800×1752; ends before `SET_ICON_BOX`. Values 0–25, otherwise null + low confidence |
| set | Taken from the echo when it can only belong to one set; otherwise set-icon matching *(planned, PR D)* | Until then multi-set echoes export `echoSet: null` + `lowConfidence: ["echoSet"]` |
| cost | OCR `COST n`, cross-checked with `inferCostFromSecondaryStat` | The secondary value is level-dependent, so only use the inference at +25 |
| main stat | OCR label → `normalizeStatLabel`. OCR lines are put in reading order first (`src/session/ocrText.ts`). The main and secondary rows are OCR'd with 0.005 extra height above and below (`padStatRow` in `src/session/echoRegions.ts`): scanner-core's rows are cut tight to the text, and Windows OCR misread a +0 "3.7%" touching the crop edge as "S. IYO", which dropped the main stat (2026-10-07 report) | Windows OCR can return a row's value before its label ("2.8%", "HP"), which scanner-core can't parse (2026-10-06 report) | The value is level-dependent. Store the key, and let the app compute the value from cost/rank/level |
| substats | Label column + value column paired by line y (`parseSubstatColumns`) | 0–5 rows, wrapped labels, snap to `subStatsTable` |
| equippedBy | Search the lower panel for the `Equipped by` anchor, then OCR the rest of that line → match against `allCharactersList` + aliases | Variant names like "Yangyang: Xuanling" need an alias map. A missing line means `null` |
| rank (rarity) | Worked out from the numbers: the secondary stat at the read level, cross-checked with the main stat (`src/session/echoRank.ts`, see [Rarity](#rarity)) | Needs the level. Main-stat-only matches and disagreements export low confidence, and anything ambiguous exports `rank: null` |

## Rarity

There's no rarity text on the panel. The bundled data has each main stat's value **at max level** per rank (`statsTable`, `flatBonusesByRankByType`). Two facts give the value at any level:

- **Level cap per rank:** rank 2 → +10, rank 3 → +15, rank 4 → +20, rank 5 → +25.
- **Growth:** +16% of the +0 value per level, so `value(L) = max × (1 + 0.16·L) / (1 + 0.16·cap)`.

This reproduces both ends of every in-game main stat range (e.g. cost 1 flat HP at +0: 114 / 152 / 228 / 456 for ranks 2–5; cost 3 Electro DMG at +0: 3.7% / 4.0% / 4.5% / 6.0%). Checked on a rank 2 test account (Whiff Whaff: HP 2.8% + HP 114 at +0). The table is pinned in `tests/echoRank.spec.ts`.

- **Secondary stat** (flat HP on cost 1, flat ATK on cost 3/4) is the main signal. Neighbouring ranks differ by ≥ 33%, and it's a whole number.
- **Main stat** is a cross-check. Ranks 2 and 3 differ by only ~8% (cost 1 HP%: 2.8% vs 3.0% at +0).
- **Still to verify:** that growth is linear *between* the endpoints. Capture an echo at a mid level (e.g. +7) for a fixture.
- One known disagreement: a community table lists 4-cost DEF% rank 5 as 8.3%–41.5%, while WT's data says 41.8% max. The tolerance accepts both. Check in game before changing WT's data.

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
