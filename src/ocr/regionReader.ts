import type { AppInfo, FracRect, RegionRead, RegionText } from "@/ipc/types";
import { decodeCrops } from "@/session/samples";
import type { CropRead } from "./tesseract";

// Which OCR engine reads echo text (ADR 0027): Tesseract on Windows, where the built-in
// reader measured ~86% of fields correct; the built-in Vision reader on macOS (~99%).
// Either way the scanner gets the same `readRegions(seq, regions)` function, so watch mode,
// auto mode and Diagnostics don't care which engine is behind it.

export type ReadEngine = "tesseract" | "native";

/** The engine for echo text on this OS. */
export function readEngineFor(platform: AppInfo["platform"]): ReadEngine {
  return platform === "windows" ? "tesseract" : "native";
}

/** Human-readable engine name for Diagnostics. */
export function readEngineLabel(engine: ReadEngine, platform: AppInfo["platform"]): string {
  if (engine === "tesseract") return "Tesseract";
  return platform === "macos" ? "macOS Vision" : "Windows OCR";
}

export interface RegionReaderDeps {
  /** OS OCR in Rust (`read_regions`). */
  readRegions(seq: number, regions: RegionRead[]): Promise<RegionText[]>;
  /** Full-size crops from Rust (`crop_regions`). */
  cropRegions(seq: number, regions: FracRect[]): Promise<ArrayBuffer>;
  /** The Tesseract reader (in its web worker in the app). */
  readCrops(crops: CropRead[]): Promise<RegionText[]>;
}

/** `readRegions(seq, regions)` backed by `engine`. */
export function createRegionReader(engine: ReadEngine, deps: RegionReaderDeps) {
  if (engine === "native") return deps.readRegions;
  return async (seq: number, regions: RegionRead[]): Promise<RegionText[]> => {
    const crops = decodeCrops(await deps.cropRegions(seq, regions.map((r) => r.region)));
    if (crops.length !== regions.length) {
      throw new Error(`asked for ${regions.length} crops but got ${crops.length}`);
    }
    return deps.readCrops(regions.map((r, i) => ({ id: r.id, crop: crops[i]! })));
  };
}
