import { cropRegions, getAppInfo, readRegions } from "@/ipc/commands";
import type { RegionRead, RegionText } from "@/ipc/types";
import { createRegionReader, readEngineFor, readEngineLabel } from "./regionReader";
import { createBundledTesseract } from "./tesseract";

// The app's echo-text reader: the engine for this OS (`regionReader.ts`) wired to the real
// Rust commands and the bundled Tesseract. Views pass `readEchoRegions` wherever a
// `readRegions` function is expected.

// Everything comes from the app itself. The URL is absolute because tesseract.js's workers
// fetch the core and model from inside the worker, where "/tesseract" would resolve
// against the worker script instead.
const tesseract = createBundledTesseract(new URL("/tesseract", location.href).href);

let engine: Promise<{ read: ReturnType<typeof createRegionReader>; label: string }> | null = null;

function current() {
  engine ??= getAppInfo().then(({ platform }) => {
    const choice = readEngineFor(platform);
    const read = createRegionReader(choice, { readRegions, cropRegions, readCrops: tesseract.read });
    return { read, label: readEngineLabel(choice, platform) };
  });
  return engine;
}

/** Reads `regions` of the pinned frame `seq` with this OS's echo-text engine. */
export async function readEchoRegions(seq: number, regions: RegionRead[]): Promise<RegionText[]> {
  return (await current()).read(seq, regions);
}

/** Which engine reads echo text, e.g. "Tesseract" (for Diagnostics). */
export async function readEngineName(): Promise<string> {
  return (await current()).label;
}
