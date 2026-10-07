---
status: accepted
date: 2026-10-07
tags: [capture, ocr, ipc, performance]
---

# 25. Keep the last few sampled frames pinned, so auto mode reads one echo while clicking the next

## Context

[ADR 0021](./0021-batched-region-reads-with-pinned-frames.md) pins only the most recently sampled frame: `read_regions(seq)` fails with `FrameExpired` once a newer `sample_regions` call has pinned another one. Watch mode is fine with that, because it reads before it samples again.

The auto-mode navigator isn't. To meet the ≤150 ms-per-echo target ([architecture.md](../architecture.md) §3), it has to click and watch the next echo's panel while the last one is still being read. Watching means sampling, and each new sample would unpin the frame the read needs.

`read_regions` already takes its frame (an `Arc<Frame>`) before OCR starts, and holds it until done. So a frame only has to stay pinned for the moment between the UI asking for a read and Rust picking the frame up. It doesn't have to last the whole OCR.

## Decision

- **Rust keeps the last `PINNED_FRAMES` (4) distinct sampled frames readable** (`regions::PinnedFrames`). Sampling the same frame again doesn't use a slot. `read_regions(seq)` reads any of them, and `FrameExpired` now means "more than four newer frames were sampled since".
- **The navigator starts each read as soon as the panel settles, without waiting for it,** and clicks the next card while it runs.
  - At most `MAX_READS_IN_FLIGHT` (2) reads run at once. When both are busy, the next click waits for the older one.
  - Results are reported in list order.
  - A read that finds an echo below the minimum level ends the run at the next check, and nothing read after it is reported.
  - A read that fails counts as an error, and the run goes on.
- The IPC commands and their arguments don't change. Watch mode and Diagnostics behave as before.

## Consequences

- Pros:
  - Reading no longer adds to the time per echo, unless OCR is slower than clicking and settling (then the cap of two makes the clicks wait).
  - Text still always comes from the exact frame that was judged stable.
- Cons:
  - Up to three extra frames stay in memory: about 20 MB each at 2880×1800, 33 MB at 3840×2160. That's still memory only; nothing is written to disk.
  - Results arrive slightly after their click, so the progress count trails the clicking by up to two echoes.

## Guidance

- **Do** start a read right after its sample, not later: a frame only stays readable for four newer samples.
- **Don't** raise `PINNED_FRAMES` to make up for reads that start late. Start them on time instead.
- **Don't** raise `MAX_READS_IN_FLIGHT` without measuring. Each read already OCRs its regions in parallel, one thread per region.

## Related

- `src-tauri/src/regions.rs` (`PinnedFrames`), `src-tauri/src/commands.rs`, `src/auto/navigator.ts` (`startRead`, `MAX_READS_IN_FLIGHT`)
- [ADR 0021](./0021-batched-region-reads-with-pinned-frames.md)
