---
status: accepted
date: 2026-10-05
tags: [privacy]
---

# 13. Never read the User ID, and mask it in any saved frame

## Context

Every game screen in the fixtures prints `User ID: <number>` in the bottom-right corner (for example at about x ≥ 88%, y ≥ 97% of a 16:10 frame). It's the one account identifier visible during a scan. Users sharing screenshots for bug reports often forget it's there.

## Decision

- **No ROI ever overlaps the User ID region.** Rust enforces it: OCR crops go through `safety::crop_outside_user_id`, which refuses any region overlapping `USER_ID_REGION`. `layoutCheck` also asserts it for every layout in tests.
- `safety::mask_user_id(frame)` fills the region with black before **any** frame or crop leaves memory: debug frames, bug-report exports, and the in-app preview.
- The mask region is defined per aspect ratio, relative to the detected content rect, with generous padding. Tests run it against every fixture and check that OCR of the masked area returns no digits.
- The scan JSON never contains the User ID or any account identifier ([ADR 0008](./0008-scan-json-schema-v1.md)).

## Consequences

- Pros: bug reports are safe to share by default, and there's one less thing for users to worry about.
- Cons: if Kuro moves the label, the mask must move too. The fixture test catches this when new screenshots are added.

## Guidance

- **Do** route every disk write of image data through `mask_user_id`.
- **Don't** add an ROI in the bottom-right without checking the mask test.

## Related

- [screens/echoes.md](../screens/echoes.md)
