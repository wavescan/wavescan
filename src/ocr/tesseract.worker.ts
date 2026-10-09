/// <reference lib="webworker" />
import type { RegionText } from "@/ipc/types";
import { createTesseractReader, startTesseractWorkers, type CropRead, type TesseractReader } from "./tesseract";

// A web worker that hosts the Tesseract reader (ADR 0027), so preparing crops (enlarging
// them 3×) and talking to Tesseract never block the UI. tesseract.js starts its own
// workers from here. The page talks to this through `tesseractClient.ts`.

/** Page → worker: read these crops (their pixel buffers are transferred, not copied). */
export interface ReadRequest {
  id: number;
  crops: CropRead[];
}

/** Worker → page: the text per crop, or why reading failed. */
export type ReadResponse = { id: number; regions: RegionText[] } | { id: number; error: string };

declare const self: DedicatedWorkerGlobalScope;

// Everything comes from the app itself. tesseract.js starts its workers from inside this
// worker, where a path like "/tesseract/…" doesn't resolve, so the URLs are absolute.
// (Resolved against this script's URL: `location.origin` is "null" for custom schemes like
// macOS Tauri's tauri://localhost.)
const assets = new URL("/tesseract", self.location.href).href;

let reader: Promise<TesseractReader> | null = null;

/** Starts the pool on first use. A failed start is retried on the next read. */
function getReader(): Promise<TesseractReader> {
  reader ??= startTesseractWorkers({
    workerPath: `${assets}/worker.min.js`,
    corePath: `${assets}/tesseract-core-simd-lstm.js`,
    langPath: assets,
    // Load the worker script directly; a blob: URL would need a looser CSP.
    workerBlobURL: false,
  })
    .then((workers) => createTesseractReader(workers, { sparseRetryIds: ["name"] }))
    .catch((error: unknown) => {
      reader = null;
      throw error;
    });
  return reader;
}

self.addEventListener("message", (event: MessageEvent<ReadRequest>) => {
  const { id, crops } = event.data;
  void getReader()
    .then((r) => r.read(crops))
    .then(
      (regions) => self.postMessage({ id, regions } satisfies ReadResponse),
      (error: unknown) =>
        self.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies ReadResponse),
    );
});
