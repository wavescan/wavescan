# Fixtures

Real game captures are the ground truth for this project. ROIs are measured from them, and extractors are tested against them.

## Layout

```
fixtures/
  screens/<screen>/<WxH>/          raw full-frame captures (PNG), one folder per resolution
  screens/<screen>/<WxH>/*.json    golden output for the matching PNG (same basename)
  raw/                             ignored by git: originals, videos, unmasked captures
```

`<screen>` matches the classifier id in kebab form: `echoes`, later `resonator-list`, `character-forte`, and so on.

## Rules

1. **Mask the User ID before committing.** Run the mask script *(planned: `npm run fixtures:mask`)*. It applies the same `mask_user_id` region the app uses ([ADR 0013](adr/0013-user-id-masking.md)).
2. **No videos in git.** `.mp4`/`.mov` files are git-ignored. Keep them in `fixtures/raw/` locally, or attach them to a GitHub Release named `fixtures-YYYY-MM-DD` and record the link in the relevant `docs/screens/*.md`.
3. **Golden JSON is hand-checked** against the image. Never bulk re-record goldens to make a test pass.
4. Name files by what they show, e.g. `echo-plus15-3-substats.png`, not by timestamp.
5. Every bug report with a misread gets its (masked) frame added here, with a golden.

## Coverage wanted

| Screen | Have | Still needed |
|---|---|---|
| Bag → Echoes | 16:10 at 2880×1800, 2800×1752, 2304×1440 (Windows) | 16:9 at 1920×1080 / 2560×1440 / 3840×2160 · macOS · 4★/3★/2★ echoes · an unequipped +25 · grid end-of-list |
| Characters (v0.2) | none | see the roadmap checklist |
| Weapons (v0.3) | none | see the roadmap checklist |
