# Fixtures

Real game captures are the ground truth for this project. ROIs are measured from them, and extractors are tested against them.

## Layout

```
fixtures/
  screens/<screen>/<WxH>/<name>.png    full-size capture, User ID masked, one folder per resolution
  screens/<screen>/<WxH>/<name>.json   golden: what the image really shows (same basename)
  screens/echoes-grid/<WxH>/<name>.png  grid frames for auto mode (masked), goldens in screens/echoes-grid/grid.json
  raw/                                 ignored by git: originals, videos, unmasked captures
```

`<screen>` matches the classifier id in kebab form: `echoes`, later `resonator-list`, `character-forte`, and so on.

## Adding a fixture

1. Put the original capture in `fixtures/raw/` (convert JPEG to PNG first).
2. Mask it into place:

   ```bash
   npm run fixtures:mask -- "fixtures/raw/<original>.png" fixtures/screens/echoes/2880x1800/<name>.png
   ```

   This is `src-tauri/examples/fixtures.rs`, which calls the app's own `safety::mask_user_id` ([ADR 0013](adr/0013-user-id-masking.md)). It needs Rust, so on a Mac without it run it in the Docker shell (`docker compose run --rm shell`). The output is an RGB PNG with no metadata. Xbox Game Bar screenshots carry `Microsoft.GameDVR.*` text (including an author field), and this drops it.
3. Write `<name>.json` by reading the image (see [Goldens](#goldens)).
4. Run `npm run test:fixtures:tesseract` (any OS, or `npm run check`), or `npm run test:fixtures` on macOS for Vision too, or push and let CI run it.

## Goldens

One JSON per echo screenshot, using the scan file's keys ([`schema/scan.v1.json`](../schema/scan.v1.json)):

```json
{
  "echo": "SabercatProwler",
  "echoSet": null,
  "cost": 3,
  "rank": 5,
  "level": 25,
  "stat": "Fusion",
  "substats": [{ "type": "CritDMG", "value": 17.4 }, { "type": "ATK_FLAT", "value": 40 }],
  "equippedBy": null,
  "notes": "What's special about this capture"
}
```

- `echoSet: null` means **not confirmed yet**, so it isn't compared. The game shows the set only as an icon: compare it with the reference icons (the `icon` URLs in `src/data/scanner-data.json` → `echoSets`) or check in game.
- `equippedBy` is the character key, or `null` when the panel has no "Equipped by" line.
- Rarity: gold name = 5, purple = 4, blue = 3, green = 2.

## Fixture replay (`npm run test:fixtures`)

Every screenshot that has a golden goes through the app's real pipeline, once per engine that reads echoes:

| Replay | Engine (where the app uses it) | Pipeline | Runs on |
|---|---|---|---|
| `tests/tesseractReplay.fixtures.ts` | Tesseract (Windows, [ADR 0027](adr/0027-tesseract-reads-echo-text-on-windows.md)) | `echoReadRegions` → full-size crops → `src/ocr/tesseract.ts` (the app's prep, settings and pool, with the bundled model) → `extractEcho` → `toScanEcho` → compare | Any OS, no Rust needed: `npm run test:fixtures:tesseract`. Part of `npm run check` |
| `tests/fixtureReplay.fixtures.ts` | Vision (macOS) | `echoReadRegions` → `regions::read` + Vision (Rust tool) → `extractEcho` → `toScanEcho` → compare | macOS only |

The set icon and main-stat label samples come from the Rust tool in the Vision replay, and from `tests/support/pngSample.ts` (the same crop-and-average) in the Tesseract one.

Each field gets one outcome (`tests/support/fixtureCompare.ts`):

| Outcome | Meaning | Fails the test? |
|---|---|---|
| correct | matches the golden | no |
| flagged | wrong or missing, but in `lowConfidence`, so the web app asks the user | no |
| missing | exported as `null` ("couldn't read it", ADR 0008) | no |
| wrong | a different value, or a dropped or extra substat, not flagged: a **silent misread** | **yes** |
| skipped | golden not confirmed, or a field the scanner doesn't read yet (`equippedBy`, until "Equipped by" reading lands) | no |

Substats are matched by type and value, not position, so one dropped row doesn't make the rows after it look wrong. The run ends with an accuracy line (`correct / compared`). The release gate is **≥ 99%** (CLAUDE.md). When a fixture has problems, the test prints the raw OCR text of every region, which is usually enough to see what went wrong.

`tests/gridReplay.fixtures.ts` does the same for the grid (auto mode): it samples `GRID_STRIP` through the Rust tool and checks the fully visible rows and scroll shifts in `screens/echoes-grid/grid.json`. It needs no OCR, so it also runs in the Docker container (`npx vitest run --config vitest.fixtures.config.ts tests/gridReplay.fixtures.ts` in `docker compose run --rm shell`).

`npm run test:fixtures` runs every replay this OS supports. CI runs it on the Windows and macOS runners after `cargo nextest`, so every change is checked against both engines. It isn't part of `npm test` because it takes a minute or so. Both replays refuse a screenshot whose User ID area isn't masked, so an unmasked capture fails `npm run check` and CI.

Change a Tesseract setting (`src/ocr/tesseract.ts`) only with a replay run before and after. Measured 2026-10-08: 100% of 272 fields on the 27 fixtures, about 150 ms per crop on an M-series Mac.

## Rules

1. **Mask the User ID before committing** (`npm run fixtures:mask`, above). `.gitignore` only lets PNG and JSON into `fixtures/screens/`, and the replay refuses unmasked images.
2. **No videos in git.** `.mp4`/`.mov` files are git-ignored. Keep them in `fixtures/raw/` locally, or attach them to a GitHub Release named `fixtures-YYYY-MM-DD` and record the link in the relevant `docs/screens/*.md`.
3. **Golden JSON is hand-checked** against the image. Never bulk re-record goldens to make a test pass.
4. Name files by what they show, e.g. `viridblaze-saurian-plus15.png`, not by timestamp.
5. Every bug report with a misread gets its (masked) frame added here, with a golden.
6. Size: full-size PNGs are about 3.5 MB each and stay in git history forever, so add a capture only when it shows something the existing ones don't.

## Coverage

| Screen | Have | Still needed |
|---|---|---|
| Bag → Echoes grid | 16:10: 4 frames of a manual scroll at 2304×1440 (two before/after pairs), plus the echo fixtures' grids. 16:9: 3 frames at 1920×1080 (a stacked echo selected, a half-cut last row, the end of the list with a last row of 2 cards), plus the 1920×1080 echo fixtures' grids (one-row scroll pairs) | 16:9 at 2560×1440 / 3840×2160 · a scroll by the scanner itself |
| Bag → Echoes | 16:10, Windows: 11 at 2880×1800 (5★ +15/+20/+25, one 4★, cost 1/3/4, wrapped labels, collab and "Reminiscence" names, an equipped echo, a toast over the grid), 1 at 2800×1752 (from a JPEG), two 2★ +0 (one with an HP main stat). 16:9, Windows: 5 at 1920×1080 (+5/+15/+20/+25, cost 1/3/4, wrapped labels, flat HP), rebuilt from windowed desktop screenshots (see [`docs/screens/echoes.md`](screens/echoes.md)). Not in the repo yet: 2304×1440 | 16:9 at 2560×1440 / 3840×2160 and fullscreen · macOS · 3★ echoes · +10 echoes |
| Characters (v0.2) | none | see the roadmap checklist |
| Weapons (v0.3) | none | see the roadmap checklist |
