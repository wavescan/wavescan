---
status: accepted
date: 2026-10-05
tags: [ocr, performance]
superseded_by: [27]
---

# 4. Native OS OCR, tesseract.js as fallback

## Context

The optimizer's browser scanner uses tesseract.js (SIMD-LSTM WASM, a pool of 3 workers, 3x upscale), which costs on the order of 100–300 ms per crop. Auto mode targets ≤150 ms per echo, and each echo needs about 8–10 crops. Both target OSes ship good OCR engines that run on the GPU/NPU, need no model download, and support many languages:

- Windows: `Windows.Media.Ocr` (WinRT).
- macOS: Vision `VNRecognizeTextRequest`.

Some WuWa tools already use WinRT OCR at about 20 ms per echo panel.

## Decision

`OcrEngine` has two production implementations:

- **Windows:** `Windows.Media.Ocr` via the `windows` crate (`Media_Ocr` feature).
  - **Superseded 2026-10-08:** see [ADR 0027](./0027-tesseract-reads-echo-text-on-windows.md). Windows OCR measured ~86% of fields correct on the echo fixtures, so echo text on Windows is read by tesseract.js.
- **macOS:** Vision via `objc2-vision`, `.accurate` recognition level, `en-US`.

The **fallback** is tesseract.js running in the webview, reusing the optimizer's self-hosted assets. It's used when the native engine is unavailable (e.g. the Windows English OCR language pack is missing) or when the user picks it in Settings. In that case the UI says reading will be slower.

**Superseded 2026-10-08:** see [ADR 0027](./0027-tesseract-reads-echo-text-on-windows.md). On Windows tesseract.js is the main reader, not a fallback, with its assets bundled in Wavescan.

Numbers are still snapped to legal values (`subStatsTable`) in `scanner-core`, so OCR errors in a digit become low-confidence flags rather than silent wrong values.

## Consequences

- Pros: fast, no model files to ship or update, and a path to other languages later.
- Cons:
  - The two engines behave slightly differently, so fixtures must pass on **both** CI runners.
  - Windows needs the English OCR capability (present on English Windows installs; the app checks and explains how to add it).

## Guidance

- **Do** keep engine-specific preprocessing (upscale, threshold) inside each impl, and keep parsing identical across engines.
  - **Superseded 2026-10-08:** see [ADR 0027](./0027-tesseract-reads-echo-text-on-windows.md). Wuthering Tools' prep measured worse in front of Windows OCR; it's used only by the Tesseract reader.
- **Do** report per-crop OCR latency in the debug panel (like the optimizer's `EchoScannerTimings.vue`).
- **Don't** add a cloud OCR service. Ever ([ADR 0010](./0010-no-telemetry-network-allowlist.md)).

## Related

- Optimizer: `src/workers/echoScanner.worker.ts`, `docs/scanner.md`
