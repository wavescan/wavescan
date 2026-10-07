# Fixtures

Real game captures are the ground truth for this project. ROIs are measured from them, and extractors are tested against them.

## Layout

```
fixtures/
  screens/<screen>/<WxH>/<name>.png    full-size capture, User ID masked, one folder per resolution
  screens/<screen>/<WxH>/<name>.json   golden: what the image really shows (same basename)
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
4. Run `npm run test:fixtures` on Windows or macOS, or push and let CI run it.

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

- `echoSet: null` means **not confirmed yet**, so it isn't compared. The game shows the set only as an icon, so fill it in only when you're sure (one-set echoes, or checked in game).
- `equippedBy` is the character key, or `null` when the panel has no "Equipped by" line.
- Rarity: gold name = 5, purple = 4, blue = 3, green = 2.

## Fixture replay (`npm run test:fixtures`)

`tests/fixtureReplay.fixtures.ts` runs every screenshot that has a golden through the app's real pipeline:

```
echoReadRegions (TS) → regions::read + this OS's OCR (Rust tool) → extractEcho → toScanEcho → compare with golden
```

Each field gets one outcome (`tests/support/fixtureCompare.ts`):

| Outcome | Meaning | Fails the test? |
|---|---|---|
| correct | matches the golden | no |
| flagged | wrong or missing, but in `lowConfidence`, so the web app asks the user | no |
| missing | exported as `null` ("couldn't read it", ADR 0008) | no |
| wrong | a different value, or a dropped or extra substat, not flagged: a **silent misread** | **yes** |
| skipped | golden not confirmed, or a field the scanner doesn't read yet (`equippedBy`, until "Equipped by" reading lands) | no |

Substats are matched by type and value, not position, so one dropped row doesn't make the rows after it look wrong. The run ends with an accuracy line (`correct / compared`). The release gate is **≥ 99%** (CLAUDE.md). When a fixture has problems, the test prints the raw OCR text of every region, which is usually enough to see what went wrong.

It runs on CI's Windows and macOS runners after `cargo nextest`, so every change is checked against both OCR engines. It isn't part of `npm test`, because Linux (the Docker check) has no OS OCR. The Rust tool refuses any screenshot whose User ID area isn't masked, so an unmasked capture fails CI.

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
| Bag → Echoes | 16:10, Windows: 11 at 2880×1800 (5★ +15/+20/+25, one 4★, cost 1/3/4, wrapped labels, collab and "Reminiscence" names, an equipped echo, a toast over the grid), 1 at 2800×1752 (from a JPEG). Not in the repo yet: 2304×1440 | 16:9 at 1920×1080 / 2560×1440 / 3840×2160 · macOS · 3★/2★ echoes · +0/+5/+10 echoes · grid end-of-list |
| Characters (v0.2) | none | see the roadmap checklist |
| Weapons (v0.3) | none | see the roadmap checklist |
