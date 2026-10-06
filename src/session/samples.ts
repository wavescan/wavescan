import type { OcrLine as CoreOcrLine } from "@wutheringtools/scanner-core";
import type { OcrLine } from "@/ipc/types";

/** One small RGBA image from `sample_regions`, ready for `new ImageData(...)`. */
export interface Sample {
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

export interface Samples {
  /** Sequence number of the frame these came from (pass to `readRegions`). */
  seq: number;
  images: Sample[];
}

/**
 * Decodes `sample_regions` output (see `src-tauri/src/regions.rs`):
 * `[seq u64][count u32]` then per region `[width u32][height u32][RGBA…]`, little-endian.
 * Throws on truncated or inconsistent data.
 */
export function decodeSamples(buffer: ArrayBuffer): Samples {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) throw new Error("samples payload is too short");
  const seq = Number(view.getBigUint64(0, true));
  const count = view.getUint32(8, true);
  const images: Sample[] = [];
  let offset = 12;
  for (let i = 0; i < count; i++) {
    if (offset + 8 > buffer.byteLength) throw new Error("samples payload is truncated");
    const width = view.getUint32(offset, true);
    const height = view.getUint32(offset + 4, true);
    const length = width * height * 4;
    offset += 8;
    if (offset + length > buffer.byteLength) throw new Error("samples payload is truncated");
    images.push({ width, height, rgba: new Uint8ClampedArray(buffer, offset, length) });
    offset += length;
  }
  if (offset !== buffer.byteLength) throw new Error("samples payload has trailing bytes");
  return { seq, images };
}

/** Converts Wavescan OCR lines (pixel bounds) to scanner-core's `{ text, y0, y1 }` lines. */
export function toCoreLines(lines: OcrLine[]): CoreOcrLine[] {
  return lines.map((line) => ({
    text: line.text,
    y0: line.bounds.y,
    y1: line.bounds.y + line.bounds.height,
  }));
}
