---
status: accepted
date: 2026-10-08
tags: [ocr, accuracy, windows, security, dependencies]
supersedes: [4]
---

# 27. Tesseract (tesseract.js) reads echo text on Windows

Supersedes the Windows half of [ADR 0004](./0004-native-os-ocr-with-tesseract-fallback.md). macOS keeps Vision.

## Context

ADR 0004 chose each OS's built-in OCR for speed. On macOS, Vision is accurate. On Windows, `Windows.Media.Ocr` is not accurate enough on the echo panel:

- A 36-echo manual scan on Windows (2026-10-08) lost the main stat on 24 echoes ("44.0%" read as "44.00/0") and couldn't identify 11 (an empty "Hecate", "Thousand-puppe", "Threncxlian - QStruct"). It also dropped substat rows whose label is a short word on its own ("HP", "ATK"), and on one echo the remaining values slid onto the wrong labels.
- Wuthering Tools' browser scanner reads the same echoes almost perfectly. It uses the same parsing (`@wutheringtools/scanner-core`), so the difference is the OCR engine.

Measured on the 27 echo fixtures (`fixtures/screens/echoes`, 272 compared fields):

| Engine | Fields correct | Notes |
|---|---|---|
| Windows OCR, crops as captured | 86.0% | CI `windows-latest` |
| Windows OCR + Wuthering Tools' prep (grey, contrast ×1.5, 3× enlargement) | 85.3% | The contrast step turned every "44.0%" into "44.00/0" |
| Windows OCR + grey and 3× only | 86.8% | Each variant fixed some fields and broke others |
| macOS Vision | 99.3% | CI `macos-14` |
| tesseract.js 6, set up like Wuthering Tools | 97.4% | |
| …plus the per-row substat fallback | **97.8%** | Only miss: one name that block/line segmentation returns empty (see Decision) |

Further measurements with the same prepared crops:

- **Model size doesn't change accuracy, only speed.** Tesseract's `best` (15 MB, what Wuthering Tools ships), `best_int` and `fast` (4 MB uncompressed, 2 MB gzipped) English models all scored 97.8%. Per crop, with 4 workers on an M-series Mac: ~500 ms, ~260 ms and ~200 ms.
- **Native Tesseract isn't much faster.** Tesseract 5.3 (the C++ library that Rust crates like `leptess` and `tesseract-rs` wrap) read the same crops with near-identical text, and only ~10–20% faster than tesseract.js. Most of the time goes into the model, not the WebAssembly.

The measuring tool is `tests/tesseractReplay.tesseract.ts` (branch `test/tesseract-accuracy`); it becomes part of the fixture replay with the implementation.

## Decision

- **On Windows, echo text is read by tesseract.js in the webview**, set up like Wuthering Tools (`echoScanner.worker.ts` in the optimizer):
  - each crop is made grey, contrast ×1.5 around mid-grey, and enlarged 3× with smoothing;
  - the same character whitelist, and page segmentation mode 6 ("single block");
  - a small pool of workers (start with 3, like Wuthering Tools);
  - **the `fast` English model** (`tesseract-ocr/tessdata_fast`), for the same accuracy at about 2.5× the speed of `best`;
  - when the name comes back empty, it is read again in mode 11 ("sparse text"). Modes 6 and 7 return nothing for one clean Whiff Whaff name crop that mode 11 reads.
- **macOS keeps Vision** (ADR 0004, 0018). The prep above is part of the Tesseract reader only.
- **Rust hands over crops instead of text.** A new command returns full-size crops of a pinned frame (ADR 0021, 0025) as raw pixels. Every crop goes through `safety::crop_outside_user_id` exactly like OCR crops do today, so the User ID is never cropped, and crops live in memory only (ADR 0013). The prep runs in the worker, so the code matches Wuthering Tools'.
- **Everything is bundled. Nothing is downloaded.** The tesseract.js worker script, the `tesseract.js-core` SIMD-LSTM WebAssembly and the model ship in the app and load from the app's own origin. `workerPath`, `corePath` and `langPath` all point there, and `workerBlobURL: false` loads the worker script directly instead of through a `blob:` URL. tesseract.js's default CDN is never used, and the CSP below blocks it anyway. No new outbound host, so the README "internet connections" table doesn't change.
- **CSP changes** (`src-tauri/tauri.conf.json`), the minimum for WebAssembly in a worker:
  - `script-src 'self' 'wasm-unsafe-eval'`: allows compiling WebAssembly. It does **not** allow JavaScript `eval`.
  - `worker-src 'self'`.
  - `connect-src` adds `'self'`, so the worker can fetch the bundled `.wasm` and model.
- **Dependencies:** `tesseract.js` (Apache-2.0) becomes a runtime dependency, pinned exactly; `tesseract.js-core` (Apache-2.0) comes with it. The model is committed with its SHA-256 recorded next to it, from `tessdata_fast` (Apache-2.0). All are compatible with GPL-3.0 (ADR 0014).
- **Windows OCR stays for now** as the Diagnostics "Read text" check, but not for echoes. Removing the Rust adapter is a later cleanup.
- **The fixture replay runs the Tesseract reader** on every OS, including the Linux Docker check. It's the same engine everywhere, so accuracy can be checked before pushing. The 99% release gate applies to it.
- **Not chosen now: a Rust Tesseract crate.** It would sit behind the `OcrEngine` trait, but it needs Tesseract and Leptonica built for each target (C++ and CMake, or vcpkg on Windows) and shipped with the app, for a ~10–20% speed gain. Revisit if reading speed becomes the bottleneck.

## Consequences

- **Pros**
  - Accuracy on the fixtures goes from ~86% to ~98% on Windows, with no silent misreads.
  - One engine for Windows and the tests, so any machine can reproduce a Windows reading problem.
  - The same engine and settings as Wuthering Tools, so a fix found in one app applies to the other.
- **Cons**
  - **Slower.** About 200 ms per crop instead of tens of milliseconds, so roughly 0.3–0.6 s of reading per echo on 3–4 workers. Watch mode won't notice, because people click slower than that. Auto mode over 1,000 echoes takes about 5–10 minutes instead of 2–3.
  - **Bigger app**, by about 5 MB (WebAssembly ~3 MB, model ~2 MB, worker script).
  - **A looser CSP:** `'wasm-unsafe-eval'` lets the page compile WebAssembly. Scripts still come only from the app itself.
  - **Not yet checked on live frames.** The fixtures are desktop screenshots, and the 2026-10-08 live scan misread "44.0%" where the screenshot of the same echo didn't. Frames saved with "Save debug frames" on Windows go into the fixtures before release.

## Guidance

- **Do** keep the Tesseract settings (prep, whitelist, page segmentation) in one module, and change them only with a fixture replay run before and after.
- **Do** keep reporting per-crop OCR times in Diagnostics.
- **Do** load every Tesseract asset from the app. **Don't** let tesseract.js fall back to its CDN, and don't widen `connect-src` beyond `'self'` for it.
- **Don't** put the Wuthering Tools prep back in front of Windows OCR: it measured worse.
- **Don't** add a cloud OCR service. Ever ([ADR 0010](./0010-no-telemetry-network-allowlist.md)).

## Related

- [ADR 0004](./0004-native-os-ocr-with-tesseract-fallback.md) (superseded for Windows), [0013](./0013-user-id-masking.md), [0021](./0021-batched-region-reads-with-pinned-frames.md), [0025](./0025-keep-recent-frames-pinned-so-reads-overlap-clicks.md)
- Optimizer: `src/workers/echoScanner.worker.ts`, `docs/scanner.md`
- `docs/screens/echoes.md` (fixtures), `docs/fixtures.md` (fixture replay)
