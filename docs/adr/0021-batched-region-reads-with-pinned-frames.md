---
status: accepted
date: 2026-10-06
tags: [capture, ocr, ipc]
---

# 21. Batched region reads with pinned frames

## Context

The echo session (watch mode) has to do two things repeatedly:
- notice when the echo panel has settled on a new echo, using scanner-core's fingerprints and stability detector
- then read about eight regions of *that* frame: name, main stat, secondary stat, substat label and value columns, and so on

Calling `ocr_region` once per region from TypeScript would be slow, because each call is a separate round-trip. It could also read different frames: in watch mode the player may click the next echo between "settled" and "read", which would mix one echo's name with another's stats.

## Decision

- **`sample_regions(regions, maxWidth)`** returns small downscaled RGBA images of the requested regions as one binary payload, and **pins** that frame. TypeScript computes fingerprints with scanner-core's `computeFingerprint` (no duplicate algorithm in Rust).
- **`read_regions(seq, regions)`** crops and OCRs the regions of the **pinned frame `seq`**, one thread per region, in request order. If `seq` isn't the pinned frame it returns `FrameExpired` rather than silently reading a newer one.
- Both cap a request at 16 regions, and crop through `safety::crop_outside_user_id`. A request that touches the User ID fails before any OCR runs.
- Both are listed in `build.rs` and granted in `capabilities/default.json`.

## Consequences

- Pros:
  - One round-trip per stage.
  - OCR runs in parallel.
  - Text always comes from the frame that was judged stable.
  - Fingerprints come from scanner-core, the same code WT's browser scanner uses.
- Cons:
  - Only the most recently sampled frame is pinned (one frame of memory). A caller that samples again before reading gets `FrameExpired` and must retry. That's the intended behaviour, because the newer frame is what's on screen.

## Related

- `src-tauri/src/regions.rs`, `src/session/samples.ts`, [ADR 0003](./0003-rust-adapters-ts-brain-split.md), [ADR 0013](./0013-user-id-masking.md)
