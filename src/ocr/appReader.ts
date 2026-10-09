import { cropRegions, getAppInfo, readRegions } from "@/ipc/commands";
import type { RegionRead, RegionText } from "@/ipc/types";
import { createRegionReader, readEngineFor, readEngineLabel } from "./regionReader";
import { createTesseractClient } from "./tesseractClient";

// The app's echo-text reader: the engine for this OS (`regionReader.ts`) wired to the real
// Rust commands and the Tesseract web worker. Views pass `readEchoRegions` wherever a
// `readRegions` function is expected.

const tesseract = createTesseractClient(
  () => new Worker(new URL("./tesseract.worker.ts", import.meta.url), { type: "module" }),
);

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
