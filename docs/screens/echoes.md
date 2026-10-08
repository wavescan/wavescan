# Screen: Bag → Echoes (`bag.echoes`)

Measured notes for the echo inventory screen. Fixtures live in `fixtures/screens/echoes/`. Keep this file current whenever the extractor or ROIs change.

## Captures examined (2026-10-05)

| Source | Size | Aspect | Notes |
|---|---|---|---|
| 12 PNGs (Windows via Boot Camp, Xbox Game Bar captures, fullscreen) | 2880×1800 | 16:10 | Top / mid-scroll / low-level end of list, plus one Graphics settings screen |
| 1 JPG (another account, Android tablet naming) | 2800×1752 | 16:10 | Different account, so the layout holds across accounts |
| Video A (`2880x1800/…22-18-18.mp4`, Game Bar) | 2304×1440 @ 60 fps, 49 s | 16:10 | Manual click-through |
| Video B (`…09-15-58 - Copy.mp4`) | 2304×1440 @ 120 fps, 69 s | 16:10 | Manual click-through + scroll |

| 7 PNGs (Windows, **windowed** 1920×1080 on a 1920×1080 desktop, 2026-10-07) | 1920×1080 game area | 16:9 | Top of list, two mid-scrolls, +5/+15/+20/+25 echoes. Desktop screenshots, so they include the title bar (58 px) and the left border (2 px), and the window ran 58 px off the bottom and 2 px off the right of the screen. The fixtures are the game area rebuilt from them: crop x ≥ 2, y ≥ 58, paste at (0, 0) on a black 1920×1080 frame. The bottom 58 rows (footer edge and the **User ID**) are black |

**Still needed:** 16:9 at 2560×1440 / 3840×2160, and any **macOS (Apple Silicon)** capture.

## 16:9 vs 16:10

Checked on the 1920×1080 captures (2026-10-07). The game scales its UI with the **width**, so:

- **x** fractions are the same at both shapes (name x 0.6935, grid column 1 x 0.129, Upgrade x 0.876 all match).
- Everything in the top part of the screen (header, detail panel, grid top) is **top-anchored**: in 1920-wide pixels it sits at the same y. As a fraction, y₁₆:₉ = y₁₆:₁₀ × 1.111. scanner-core's `regionForFrame` already does this, and every read region lands on its text at 1920×1080.
- The footer (Sort by Level, Upgrade) is **bottom-anchored**: the same distance from the bottom in 1920-wide pixels (Upgrade: 90 px at both shapes). The grid's scrolling area ends above the footer, so its bottom edge is bottom-anchored too.
- The extra height at 16:10 (120 px at 1920 wide) goes between the two, which is why the 16:10 grid shows about half a row more.
- **User ID:** bottom-anchored like the footer. The windowed captures had it off screen; a fullscreen 1920×1080 recording (`fixtures/scrollwheel.mp4`, local only) shows the text at x 0.887–0.972, y 0.983–0.996, inside `USER_ID_REGION` (y ≥ 0.975). Pinned by a test in `safety.rs`.

## Layout

- **Left rail:** bag category icons.
- **Header:** `Echoes  2969/3000`. This gives the **total count**, so auto mode knows when it's done and can show progress.
- **Grid:** **6 columns**, about 4.5 rows visible. On the 16:10 reference, column centres are x ≈ 0.130, 0.222, … (pitch ≈ 0.092) and the first row's cells span y 0.115–0.265 (centre 0.19). The diagnostics click test clicks the second cell, then the first, since that row is the only one guaranteed to exist on a small inventory. The first echo is usually selected when the screen opens, so this order makes both clicks visibly change the selection. Each cell shows:
  - an equipped-character avatar (top-left)
  - a lock icon
  - cost (`4`/`3`/`1`, right)
  - the set icon (bottom-left)
  - `+level` (bottom-right)
- **Footer:** filter, `Sort by Level`, sort-direction toggle, `Batch Manage`, `Upgrade`.
- **Detail panel (right),** top to bottom:
  1. **Name.** The font shrinks for long names, e.g. "Reminiscence: Threnodian - Voidborne Construct" and "Reminiscence - Nightmare: Adam Smasher".
  2. `+level` followed by the **set icon**. There is **no set-name text**, so the set comes from matching the icon against bundled reference icons (`src/session/setIcon.ts`, ADR 0022).
  3. `COST n`.
  4. Lock / discard tag icons.
  5. **Main stat row** (highlighted background).
  6. **Secondary row** (highlighted): ATK 150 (cost 4) / ATK 100 (cost 3) / HP 2280 (cost 1) at +25, and **lower below +25** (e.g. ATK 68, ATK 102).
  7. **Substats.** Only the revealed ones are shown, and a long label can wrap to two lines ("Resonance Skill DMG / Bonus").
  8. `Echo Skill` + description (truncated).
  9. `Equipped by <Name>`. **Plain text**, and its **y-position varies** with substat count and description length.
- **User ID:** bottom-right, about x ≥ 88%, y ≥ 98% of the frame (text x 0.886–0.972, y 0.985–0.996 at 16:10; y 0.983–0.996 at 16:9, measured on a fullscreen 1920×1080 recording). **Never read; always masked** ([ADR 0013](../adr/0013-user-id-masking.md)).

These match the optimizer's 16:10 `layout.ts` ROIs (measured from the same account's captures), so they carry over unchanged.

## Extraction notes

| Field | Method | Gotchas |
|---|---|---|
| name | OCR → `matchEchoName` (Levenshtein, threshold 0.68) | Collab/"Reminiscence" names must be in the name list. Narrow by set + cost first |
| level | OCR of `+NN` in **`LEVEL_ROW`** (`src/session/echoRegions.ts`: x 0.69, y 0.16, w 0.0355, h 0.035 on the 16:10 reference) | Measured text span x 0.696–0.721, y 0.168–0.187 on every fixture at 2880×1800 and 2800×1752; ends before `SET_ICON_BOX`. Values 0–25, otherwise null + low confidence |
| set | Taken from the echo when it can only belong to one set. Otherwise the icon is matched against the echo's 2–3 possible sets only (`matchSetIcon`): search area = `SET_ICON_BOX` padded 25% per side, plus 60% of its width more on the left. Icon measured at x 0.7273, y 0.1661, 0.0146 wide after a two-digit level on the 2880×1800 fixtures (about 0.53 of the padded box's width; ~10% bigger on the Android-looking 2800×1752 capture). **The icon follows the level text**, so after a one-digit level ("+0") it starts at x 0.7188, about 0.0085 further left: the padded box alone cut it in half and every +0 multi-set echo came out with no set (2026-10-07 report, a rank 2 account: Stonewall Bracer's Rejuvenating Glow scored 0.02 before and about 0.94 after, in a local probe). Accepted at score ≥ 0.7 and ≥ 0.15 ahead of the runner-up; the fixtures scored 0.78–0.90 right vs ≤ 0.60 wrong | Two shield icons (Pact of Neonlight Leap vs Halo of Starry Radiance) are the closest pair. No clear winner → `echoSet: null` + `lowConfidence` |
| cost | OCR `COST n`, cross-checked with `inferCostFromSecondaryStat` | The secondary value is level-dependent, so only use the inference at +25 |
| main stat | OCR label → `normalizeStatLabel`. OCR lines are put in reading order first (`src/session/ocrText.ts`). The main and secondary rows are OCR'd with 0.005 extra height above and below (`padStatRow` in `src/session/echoRegions.ts`): scanner-core's rows are cut tight to the text, and Windows OCR misread a +0 "3.7%" touching the crop edge as "S. IYO", which dropped the main stat (2026-10-07 report). **When only the value is read** (Windows OCR never reads a lone "HP" label, fixture replay 2026-10-07), the label is first checked for the shape of "HP" (`matchHpLabel` in `src/session/hpLabel.ts`, sampled from `mainStatLabelRegion`: the row's first 0.07 of the width). It cuts out the first word by brightness, stretches it to a 24×10 grid and correlates it with an "HP" template made from the fixtures. Measured on every fixture's main and secondary rows at 1920×1080, 2800×1752 and 2880×1800: "HP" scores 0.94–1.00 and is 1.70–1.84 times as wide as tall, and every other label scores ≤ 0.20 and is ≥ 2.58 wide (ATK, DEF); the cut-offs are 0.8 and 1.4–2.2. An "HP" match is high confidence when the value fits HP at the read rarity and level, low otherwise (2026-10-08 report: every +0 HP echo was flagged, and a cost 3 one had no main stat). Failing that, the stat is worked out from value + cost + rarity + level (`inferMainStatKey` in `src/session/echoRank.ts`) and exported flagged; cost 1 ATK%/DEF% share a table, so those stay unknown | Windows OCR can return a row's value before its label ("2.8%", "HP"), which scanner-core can't parse (2026-10-06 report) | The value is level-dependent. Store the key, and let the app compute the value from cost/rank/level |
| substats | Label column + value column paired by line y (`parseSubstatColumns`). The export flags `substats` when the count isn't ⌊level/5⌋ (`expectedSubstatCount` in `src/session/exportScan.ts`) | 0–5 rows, wrapped labels, snap to `subStatsTable`. **Windows OCR drops a lone "HP" label** (every HP / flat-HP row in the 2026-10-07 fixture replay), so that row is lost; the count check flags it instead of exporting a shorter echo. Since scanner-core 0.1.2 a label-less value that only flat HP can roll (320–580) is kept as flat HP and flagged; HP% can't be told from other percent stats and is still lost |
| equippedBy | Search the lower panel for the `Equipped by` anchor, then OCR the rest of that line → match against `allCharactersList` + aliases | Variant names like "Yangyang: Xuanling" need an alias map. A missing line means `null` |
| rank (rarity) | Worked out from the numbers: the secondary stat (read by its number alone, since its type is fixed by cost and Windows may drop the "HP" label) at the read level, cross-checked with the main stat (`src/session/echoRank.ts`, see [Rarity](#rarity)) | Needs the level. Main-stat-only matches and disagreements export low confidence, and anything ambiguous exports `rank: null` |

## Rarity

There's no rarity text on the panel. The bundled data has each main stat's value **at max level** per rank (`statsTable`, `flatBonusesByRankByType`). Two facts give the value at any level:

- **Level cap per rank:** rank 2 → +10, rank 3 → +15, rank 4 → +20, rank 5 → +25.
- **Growth:** +16% of the +0 value per level, so `value(L) = max × (1 + 0.16·L) / (1 + 0.16·cap)`.

This reproduces both ends of every in-game main stat range (e.g. cost 1 flat HP at +0: 114 / 152 / 228 / 456 for ranks 2–5; cost 3 Electro DMG at +0: 3.7% / 4.0% / 4.5% / 6.0%). Checked on a rank 2 test account (Whiff Whaff: HP 2.8% + HP 114 at +0). The table is pinned in `tests/echoRank.spec.ts`.

- **Secondary stat** (flat HP on cost 1, flat ATK on cost 3/4) is the main signal. Neighbouring ranks differ by ≥ 33%, and it's a whole number.
- **Main stat** is a cross-check. Ranks 2 and 3 differ by only ~8% (cost 1 HP%: 2.8% vs 3.0% at +0).
- **Still to verify:** that growth is linear *between* the endpoints. Capture an echo at a mid level (e.g. +7) for a fixture.
- One known disagreement: a community table lists 4-cost DEF% rank 5 as 8.3%–41.5%, while WT's data says 41.8% max. The tolerance accepts both. Check in game before changing WT's data.

## Grid (auto mode)

Measured 2026-10-07 on the 2880×1800 fixtures and a 2304×1440 scrolling recording (both 16:10), as fractions of the game area, then checked at 16:9 on the 1920×1080 captures. `src/auto/grid.ts` holds the numbers (`gridLayout`). Values below are 16:10. **At 16:9** every height is × 1.111 and the strip's bottom keeps its distance from the frame's bottom: strip y 0.1167–0.8389, row pitch 0.1967 (measured 211–212 px at 1080, i.e. 0.1954–0.1963), card art 0.131. Other shapes are refused.

- **Columns** never move: 6 cards, centres at x = 0.130 + k × 0.092 (k = 0–5), each about 0.077 wide.
- **Rows** scroll smoothly, so they can sit at any height. Each card is art (≈ 0.118 tall), then a bright gold line, then the dark level bar with "+25" (≈ 0.04). Row pitch 0.1753–0.1786.
- **Finding rows:** sample the grid strip (x 0.09–0.61, y 0.105–0.855) at 256 px wide and average each line's brightness. A drop of ≥ 55 (to ≤ 110) between neighbouring lines is a gold line → level bar edge (gold ≈ 180–215, bar ≈ 55–85). It was found in every frame checked.
- **Edges in the card art:** a row of Kernel Puppets has a bright crossbar across every card, about 0.05 above the gold line (16:9 fixture `kernel-puppet-joy-plus25`). In the 256-px sample it makes a drop of 50, just under the threshold, so a row of six identical crossbars could pass it. The gold line is always a card's lowest edge, so a drop with another one less than 0.6 of a row below it is ignored. The remaining edges must also be whole row pitches apart. If they disagree, the largest group that does is kept, and a tie gives no rows.
- **Fully visible:** card top (edge − 0.118) ≥ 0.105 and bar bottom (edge + 0.04) ≤ 0.855, with 0.005 slack. Partly hidden rows are skipped and picked up after the next scroll.
- **Click target:** column centre, half-way up the card art.
- **Empty slots** (end of the list) can't be told from cards by the level bar: the grid fades out towards its bottom edge, which lightens the bars. The navigator checks that a click selected something instead.
- **How far a scroll moved:** 4×4 brightness thumbnails of each card in a row. The same row after a scroll differs by 0–12 (12 with the cursor over a card), different rows by ≥ 20; threshold 16. The rows before and after are lined up as a sequence, and identical rows that fit more than one way return "unknown" rather than a guess.
- The selected card has a bright gold frame (useful to confirm a click landed).

## Scrolling (measured 2026-10-07)

From a fullscreen 1920×1080 recording of mouse-wheel scrolling (`fixtures/scrollwheel.mp4`, local only, git-ignored):

- One wheel notch moves the grid **about 26 px = 1/8 of a row** (row pitch 211 px). One notch moved only 13 px, so notches aren't perfectly regular.
- Each notch lands in **one frame**: no smooth scrolling animation between notches.
- Not measured yet: whether one wheel event carrying several notches moves the same as that many separate notches, and the notch size at 16:10. The navigator calibrates from what it sees, so neither is assumed.

## Auto mode navigator

`src/auto/navigator.ts`, tested against a pretend grid in `tests/navigator.spec.ts`.

1. Refuse anything but 16:10 and 16:9 (`gridLayout`). Scroll to the top (37 notches at a time, not a multiple of 8, so a move of whole rows can't look like "didn't move"; the row thumbnails are compared too).
2. Mark the echo that's already selected as seen, so a stale panel is never read for the first card. If the first click leaves the panel unchanged, that echo is the first card (the game selects it when the screen opens) and is read after all.
3. For each fully visible row not read yet, click the six cards left to right. After each click, wait for scanner-core's stability detector: a settled **new** panel is read from that exact frame. The read runs while the next card is clicked (at most two at once, reported in list order; ADR 0025). A panel that stays on the previous card's echo for 0.7 s counts as **unchanged** (an empty slot, mostly). Each panel is compared only with the one before it (`historySize: 0`), not with every echo read: the same echo and main stat at +0 in another set differs only by its small set icon, and used to be skipped as "seen" (2026-10-08 report). **Known gap:** two *neighbouring* cards with matching panels (the second is identical, or differs only in the set icon) still count as unchanged, so the second is missed. A set-icon check can't fix this yet: the echo's 3D model reaches into the set-icon search area and animates. Stop at the first echo below the minimum level, without reporting it.
4. Scroll down in steps of at most 0.4 of a row (3 notches at 1/8 of a row each; never sized below 1/8 a notch, so one small notch can't inflate the next step). Measure the move from the row edges: every edge pair's difference wrapped into one row pitch, then the median. Because the step is under half a row, only one move fits, even when every row looks the same. Each row then has a fixed number counted from the top of the list.
5. Check the rows on screen against their thumbnails from before the scroll. A mismatch, a move over 0.45 of a row, or no grid at all stops the run as **lost track** rather than risk skipping echoes.
6. Keep scrolling until the first fully visible row is one not read yet, then go back to 3. Two scrolls in a row that don't move the grid mean the **end of the list**; whatever is left on screen (a last row that only now fits) is read first.

About 2.7 scrolls per row, so a full 3,000-echo inventory is about 4,300 guarded actions, under auto mode's cap of 5,000 per session (`safety.rs`).

**Partly filled last row:** two cards out of six don't make a big enough drop in the strip-wide brightness profile (16:9 fixture `end-of-list`: the last row isn't found that way). `findPartialRow` checks each column for its own edge one row pitch below the last row. Every row still gets all six click targets, because an empty slot can't be told from a card reliably, and clicking one only counts as "unchanged".

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
